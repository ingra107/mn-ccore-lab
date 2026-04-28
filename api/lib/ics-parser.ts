// iCalendar (RFC 5545) parser. Pure JS, no deps — runs in Cloudflare
// Workers without Node polyfills.
//
// This parser is the Workers-side port of Peripheral Brain's
// `scripts/fetch_calendar.py`, which has been refined for ~6 months
// against Nick's UMN Google Calendar feed. The refinements are not
// optional; they are what make the data usable on TODAY.md.
//
// Capabilities:
//   - VEVENT blocks (other components ignored)
//   - DTSTART / DTEND with TZID= (resolved via Intl.DateTimeFormat) or
//     VALUE=DATE (all-day) or floating UTC (Z suffix)
//   - SUMMARY, UID, LOCATION, DESCRIPTION
//   - Line unfolding (RFC 5545 §3.1)
//   - Backslash escapes (\\n, \\,, \\;, \\\\)
//   - RRULE expansion: FREQ DAILY|WEEKLY|MONTHLY|YEARLY with INTERVAL,
//     BYDAY, BYMONTHDAY, BYMONTH, COUNT, UNTIL — bounded by caller-provided
//     window (today-7..today+90 by default).
//   - EXDATE exclusions (multi-occurrence accumulated)
//   - RECURRENCE-ID overrides
//   - STATUS=CANCELLED filtering
//   - PARTSTAT=DECLINED filtering (per-user email)
//   - Meeting URL extraction from DESCRIPTION (Zoom / Teams / Google Meet)
//   - Google redirect URL cleanup (`&sa=D`, `&amp;`, percent-encoding)
//   - Dedup by (summary, startAt)
//   - UNTIL with early UTC time → "ended previous day" heuristic

export interface IcsEvent {
  uid: string
  summary: string
  description: string | null
  location: string | null
  startAt: string  // ISO-8601 UTC
  endAt: string | null
  isAllDay: boolean
}

export interface ParseOptions {
  /** ISO date — events ending before this are dropped. Default: 7 days ago. */
  windowStart?: string
  /** ISO date — events starting after this are dropped. Default: 90 days ahead. */
  windowEnd?: string
  /** Owner's email — events with PARTSTAT=DECLINED for this attendee are dropped.
   *  Without this, declined events surface and clutter Today's timeline. */
  ownerEmail?: string
}

export function parseIcs(raw: string, opts: ParseOptions = {}): IcsEvent[] {
  const windowStart = opts.windowStart ?? new Date(Date.now() - 7 * 86400000).toISOString()
  const windowEnd = opts.windowEnd ?? new Date(Date.now() + 90 * 86400000).toISOString()
  const ownerEmail = opts.ownerEmail?.toLowerCase()

  const unfolded = unfoldLines(raw)
  const masters: ParsedVEvent[] = []
  // RECURRENCE-ID overrides: keyed by `${uid}|${recurrence-id-iso}`.
  const overrides = new Map<string, ParsedVEvent>()

  let current: Partial<ParsedVEvent> | null = null
  let inEvent = false

  for (const line of unfolded) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true
      current = { exdates: [], attendees: [] }
      continue
    }
    if (line === 'END:VEVENT') {
      if (current && current.uid && current.startAt) {
        const ev = current as ParsedVEvent
        // Skip events the owner declined (applies to both masters and overrides).
        const declined = ownerEmail && (ev.attendees ?? []).some((a) =>
          a.toLowerCase().includes(ownerEmail) && /PARTSTAT=DECLINED/i.test(a)
        )
        if (declined) {
          current = null; inEvent = false; continue
        }
        // Cancelled events: if it's a RECURRENCE-ID override, keep the
        // record so expansion can drop just that instance. Otherwise (a
        // master cancellation) skip entirely.
        if (ev.status === 'CANCELLED' && !ev.recurrenceId) {
          current = null; inEvent = false; continue
        }
        // Enrich location from DESCRIPTION if it doesn't already carry a URL.
        ev.location = enrichLocation(ev.location ?? null, ev.description ?? null)
        if (ev.recurrenceId) {
          overrides.set(`${ev.uid}|${ev.recurrenceId}`, ev)
        } else {
          masters.push(ev)
        }
      }
      current = null
      inEvent = false
      continue
    }
    if (!inEvent || !current) continue

    const colon = line.indexOf(':')
    if (colon === -1) continue
    const rawKey = line.slice(0, colon)
    const value = line.slice(colon + 1)
    const semi = rawKey.indexOf(';')
    const name = (semi === -1 ? rawKey : rawKey.slice(0, semi)).toUpperCase()
    const params = semi === -1 ? '' : rawKey.slice(semi + 1)

    switch (name) {
      case 'UID':
        current.uid = value.trim(); break
      case 'SUMMARY':
        current.summary = unescapeText(value); break
      case 'DESCRIPTION':
        current.description = unescapeText(value); break
      case 'LOCATION':
        // Strip CR/LF artifacts before unescape (line-folding bleed-through).
        current.location = unescapeText(value.replace(/[\r\n]+/g, ' ').trim()); break
      case 'STATUS':
        current.status = value.trim().toUpperCase() as ParsedVEvent['status']; break
      case 'ATTENDEE':
        // Keep the full property line (including PARTSTAT params) so the
        // declined-filter above can read it.
        current.attendees!.push(`${rawKey}:${value}`); break
      case 'DTSTART': {
        const parsed = parseIcsDate(value, params)
        current.startAt = parsed.iso
        current.isAllDay = parsed.isAllDay
        current.startTzid = parsed.tzid
        break
      }
      case 'DTEND': {
        const parsed = parseIcsDate(value, params)
        current.endAt = parsed.iso
        break
      }
      case 'RRULE':
        current.rrule = parseRRule(value); break
      case 'EXDATE': {
        // EXDATE may appear multiple times AND carry comma-separated values.
        for (const part of value.split(',')) {
          const parsed = parseIcsDate(part, params)
          current.exdates!.push(parsed.iso)
        }
        break
      }
      case 'RECURRENCE-ID': {
        const parsed = parseIcsDate(value, params)
        current.recurrenceId = parsed.iso
        break
      }
    }
  }

  // Materialize masters → concrete IcsEvents within the window.
  const collected: IcsEvent[] = []
  for (const m of masters) {
    if (!m.rrule) {
      if (m.startAt > windowEnd) continue
      // Use endAt if present, else fall back to startAt (event without DTEND
      // is treated as a point in time, not "open until end of universe").
      const effectiveEnd = m.endAt ?? m.startAt
      if (effectiveEnd < windowStart) continue
      collected.push(toIcsEvent(m))
      continue
    }
    const instances = expandRrule(m, windowStart, windowEnd)
    for (const inst of instances) {
      const overrideKey = `${m.uid}|${inst.startAt}`
      const override = overrides.get(overrideKey)
      if (override) {
        if (override.status === 'CANCELLED') continue  // override cancelled this instance
        if (override.startAt > windowEnd) continue
        collected.push(toIcsEvent(override))
      } else {
        collected.push(toIcsEvent(inst))
      }
    }
  }

  // Dedup by (summary, startAt). Some calendars emit the same event under
  // multiple UIDs (e.g. a recurring meeting copied between two calendars
  // both subscribed to). Keep first occurrence.
  const seen = new Set<string>()
  const out: IcsEvent[] = []
  for (const ev of collected) {
    const key = `${ev.summary}|${ev.startAt}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ev)
  }
  // Sort chronologically.
  out.sort((a, b) => a.startAt.localeCompare(b.startAt))
  return out
}

interface ParsedVEvent {
  uid: string
  summary?: string
  description?: string | null
  location?: string | null
  startAt: string
  endAt?: string | null
  isAllDay: boolean
  startTzid?: string  // for duration math when expanding RRULE
  rrule?: RRule | null
  exdates?: string[]
  recurrenceId?: string
  status?: 'CONFIRMED' | 'CANCELLED' | 'TENTATIVE'
  attendees?: string[]  // raw ATTENDEE property lines for PARTSTAT inspection
}

function toIcsEvent(p: ParsedVEvent): IcsEvent {
  return {
    uid: p.uid,
    summary: p.summary ?? '(no title)',
    description: p.description ?? null,
    location: p.location ?? null,
    startAt: p.startAt,
    endAt: p.endAt ?? null,
    isAllDay: p.isAllDay,
  }
}

// ─── Line handling ──────────────────────────────────────────────────────

function unfoldLines(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (const line of lines) {
    if (line.length === 0) continue
    if ((line[0] === ' ' || line[0] === '\t') && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

// Match the longest URL for each provider. Picks the longest because
// ICS line-folding can leave shorter truncated copies in the description.
const MEETING_URL_PATTERNS: RegExp[] = [
  /https:\/\/[a-zA-Z0-9.-]*zoom\.us\/j\/[^\s<>"'\\]+/g,
  /https:\/\/teams\.microsoft\.com\/[^\s<>"'\\]+/g,
  /https:\/\/meet\.google\.com\/[^\s<>"'\\]+/g,
]

function enrichLocation(location: string | null, description: string | null): string | null {
  // If LOCATION already has a URL, just clean it.
  if (location && /^https?:\/\//i.test(location)) {
    return cleanMeetingUrl(location)
  }
  // Otherwise look for a meeting URL in the description.
  if (description) {
    for (const pattern of MEETING_URL_PATTERNS) {
      const matches = description.match(pattern)
      if (matches && matches.length > 0) {
        // Pick the longest (avoids truncated copies from line-folding).
        const longest = matches.reduce((a, b) => a.length >= b.length ? a : b)
        return cleanMeetingUrl(longest.replace(/[.,;:\\]+$/, ''))
      }
    }
  }
  return location
}

// Strip Google Calendar redirect tracking + percent-encoding artifacts.
// Mirrors Peripheral Brain's fetch_calendar.py:495-514.
function cleanMeetingUrl(url: string): string {
  let u = url
    .replace(/\\;/g, ';')
    .replace(/&amp;/g, '&')
    .replace(/&amp/g, '&')
  for (const marker of ['&sa=D', ';sa=D', '%26sa%3DD']) {
    const idx = u.indexOf(marker)
    if (idx > 0) u = u.slice(0, idx)
  }
  // Decode percent-encoded query string.
  if (u.includes('?')) {
    const [base, qs] = u.split('?', 2)
    try { u = `${base}?${decodeURIComponent(qs)}` } catch { /* leave encoded */ }
  }
  return u.replace(/[&;,\s]+$/, '')
}

// ─── Date parsing ───────────────────────────────────────────────────────

interface ParsedDate { iso: string; isAllDay: boolean; tzid?: string }

function parseIcsDate(value: string, params: string): ParsedDate {
  const v = value.trim()
  const isAllDay = /VALUE=DATE(?!-TIME)/i.test(params) || /^\d{8}$/.test(v)

  if (isAllDay && /^\d{8}$/.test(v)) {
    const y = v.slice(0, 4), m = v.slice(4, 6), d = v.slice(6, 8)
    return { iso: `${y}-${m}-${d}T00:00:00.000Z`, isAllDay: true }
  }

  // UTC instant — has Z suffix.
  const utc = /^(\d{8})T(\d{6})Z$/.exec(v)
  if (utc) {
    const [, ymd, hms] = utc
    return { iso: composeIso(ymd, hms, 0), isAllDay: false }
  }

  // Floating local — may have TZID param.
  const local = /^(\d{8})T(\d{6})$/.exec(v)
  if (local) {
    const [, ymd, hms] = local
    const tzidMatch = /TZID=([^;:]+)/i.exec(params)
    const tzid = tzidMatch ? tzidMatch[1] : undefined
    if (tzid) {
      const offsetMin = tzOffsetMinutes(tzid, ymd, hms)
      return { iso: composeIso(ymd, hms, offsetMin), isAllDay: false, tzid }
    }
    // True floating (no TZID) — treat as UTC, RFC 5545 leaves this to the
    // calendar consumer's local time. We can't know the user's tz on the
    // server, so UTC is the only deterministic choice.
    return { iso: composeIso(ymd, hms, 0), isAllDay: false }
  }

  return { iso: v, isAllDay: false }
}

// Build a UTC ISO string from local YYYYMMDD + HHMMSS + offsetMinutes
// (offset is target-tz minus UTC, e.g. America/Chicago in DST = -300).
// We add the offset to the local wall-clock to get UTC.
function composeIso(ymd: string, hms: string, offsetMin: number): string {
  const y = +ymd.slice(0, 4), mo = +ymd.slice(4, 6), d = +ymd.slice(6, 8)
  const h = +hms.slice(0, 2), mi = +hms.slice(2, 4), s = +hms.slice(4, 6)
  // Date.UTC interprets args as UTC. Adding offsetMin minutes flips
  // wall-clock-in-tzid to actual UTC instant.
  const ms = Date.UTC(y, mo - 1, d, h, mi, s) - offsetMin * 60_000
  return new Date(ms).toISOString()
}

// Resolve the UTC offset of an IANA timezone at a given wall-clock instant.
// Workers ship with tz data via Intl.DateTimeFormat. Returns minutes
// (negative for west of UTC, e.g. America/Chicago CST = -360, CDT = -300).
//
// Cached because parsing one calendar usually involves hundreds of
// lookups against the same TZID + nearby dates, and Intl construction is
// the slow step.
const tzOffsetCache = new Map<string, number>()

function tzOffsetMinutes(tzid: string, ymd: string, hms: string): number {
  const cacheKey = `${tzid}|${ymd}|${hms.slice(0, 4)}`  // hour granularity is enough
  const cached = tzOffsetCache.get(cacheKey)
  if (cached !== undefined) return cached

  try {
    const y = +ymd.slice(0, 4), mo = +ymd.slice(4, 6), d = +ymd.slice(6, 8)
    const h = +hms.slice(0, 2), mi = +hms.slice(2, 4)
    // Probe instant: treat the wall-clock as UTC, then ask Intl what the
    // target tz says it is. The difference is the offset.
    const probeUtc = Date.UTC(y, mo - 1, d, h, mi, 0)
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tzid,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(new Date(probeUtc))
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0'
    const py = +get('year'), pmo = +get('month'), pd = +get('day')
    const ph = +get('hour') === 24 ? 0 : +get('hour')  // some locales return 24
    const pmi = +get('minute'), ps = +get('second')
    const tzWall = Date.UTC(py, pmo - 1, pd, ph, pmi, ps)
    // tzWall - probeUtc = how much the target tz is ahead of UTC.
    const offsetMin = Math.round((tzWall - probeUtc) / 60_000)
    tzOffsetCache.set(cacheKey, offsetMin)
    return offsetMin
  } catch {
    // Unknown TZID (e.g. Outlook's "Eastern Standard Time" rather than
    // IANA "America/New_York"). Fall back to UTC — better than throwing.
    tzOffsetCache.set(cacheKey, 0)
    return 0
  }
}

// ─── RRULE ──────────────────────────────────────────────────────────────

interface RRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  count?: number
  until?: string  // ISO
  byDay?: string[]  // MO, TU, WE, ... possibly prefixed e.g. "1MO" (first Monday)
  byMonthDay?: number[]
  byMonth?: number[]
  bySetPos?: number[]
  weekStart?: 'MO' | 'SU'
}

function parseRRule(value: string): RRule | null {
  const parts = value.split(';')
  const out: Partial<RRule> = { interval: 1, weekStart: 'MO' }
  for (const p of parts) {
    const eq = p.indexOf('=')
    if (eq === -1) continue
    const k = p.slice(0, eq).toUpperCase()
    const v = p.slice(eq + 1)
    switch (k) {
      case 'FREQ':
        if (v === 'DAILY' || v === 'WEEKLY' || v === 'MONTHLY' || v === 'YEARLY') out.freq = v
        break
      case 'INTERVAL':
        out.interval = Math.max(1, parseInt(v, 10) || 1); break
      case 'COUNT':
        out.count = parseInt(v, 10); break
      case 'UNTIL': {
        // UNTIL is either a date or UTC instant. Common pattern from Google:
        // UNTIL=YYYYMMDDT055959Z = "ends previous day 11:59 PM Central". The
        // Python TODAY.md generator handles this by treating early-UTC UNTIL
        // as previous-day end. Replicate that heuristic.
        const utc = /^(\d{8})T(\d{6})Z$/.exec(v)
        if (utc) {
          const [, ymd, hms] = utc
          const hour = parseInt(hms.slice(0, 2), 10)
          if (hour < 12) {
            // Roll back to end of previous day in UTC.
            const prev = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)) - 1)
            out.until = prev.toISOString()
          } else {
            out.until = composeIso(ymd, hms, 0)
          }
        } else if (/^\d{8}$/.test(v)) {
          out.until = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T23:59:59.000Z`
        }
        break
      }
      case 'BYDAY':
        out.byDay = v.split(',').map((s) => s.trim().toUpperCase()); break
      case 'BYMONTHDAY':
        out.byMonthDay = v.split(',').map((s) => parseInt(s, 10)).filter((n) => !isNaN(n)); break
      case 'BYMONTH':
        out.byMonth = v.split(',').map((s) => parseInt(s, 10)).filter((n) => !isNaN(n)); break
      case 'BYSETPOS':
        out.bySetPos = v.split(',').map((s) => parseInt(s, 10)).filter((n) => !isNaN(n)); break
      case 'WKST':
        out.weekStart = (v === 'SU' ? 'SU' : 'MO'); break
    }
  }
  if (!out.freq) return null
  return out as RRule
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

function expandRrule(master: ParsedVEvent, windowStart: string, windowEnd: string): ParsedVEvent[] {
  const r = master.rrule!
  const out: ParsedVEvent[] = []
  const exdates = new Set(master.exdates ?? [])
  const startMs = new Date(master.startAt).getTime()
  const endMs = master.endAt ? new Date(master.endAt).getTime() : null
  const durationMs = endMs ? endMs - startMs : null

  // Hard caps so a malformed RRULE can't run forever.
  const HARD_MAX_INSTANCES = 1000
  const windowEndMs = new Date(windowEnd).getTime()
  const windowStartMs = new Date(windowStart).getTime()
  const untilMs = r.until ? new Date(r.until).getTime() : null

  let count = 0
  let cursor = new Date(startMs)

  while (true) {
    if (count >= HARD_MAX_INSTANCES) break
    if (r.count !== undefined && count >= r.count) break
    if (untilMs !== null && cursor.getTime() > untilMs) break
    if (cursor.getTime() > windowEndMs) break

    // Generate the candidate instances at this cursor position. For
    // DAILY/WEEKLY this is typically 1 instance; for MONTHLY/YEARLY with
    // BYDAY+BYSETPOS it's the matching weekday(s) within the period.
    const candidates = generateCandidates(cursor, r)

    for (const candMs of candidates) {
      if (untilMs !== null && candMs > untilMs) break
      if (candMs > windowEndMs) break
      if (candMs < windowStartMs && (durationMs === null || candMs + durationMs < windowStartMs)) {
        // Before the window. Still counts toward COUNT.
        if (r.count !== undefined && ++count >= r.count) return out
        continue
      }
      const startIso = new Date(candMs).toISOString()
      if (exdates.has(startIso)) {
        if (r.count !== undefined && ++count >= r.count) return out
        continue
      }
      const endIso = durationMs !== null ? new Date(candMs + durationMs).toISOString() : null
      out.push({
        uid: master.uid,
        summary: master.summary,
        description: master.description,
        location: master.location,
        startAt: startIso,
        endAt: endIso,
        isAllDay: master.isAllDay,
      })
      count++
      if (r.count !== undefined && count >= r.count) return out
    }

    cursor = advanceCursor(cursor, r)
  }
  return out
}

// Generate all candidate instances in the current period defined by cursor.
// Returns ms timestamps.
function generateCandidates(cursor: Date, r: RRule): number[] {
  if (r.freq === 'DAILY') {
    return [cursor.getTime()]
  }
  if (r.freq === 'WEEKLY') {
    if (!r.byDay || r.byDay.length === 0) return [cursor.getTime()]
    // Cursor anchors the week start. Pick the days in r.byDay within
    // 7 days starting at cursor.
    const out: number[] = []
    const baseDow = cursor.getUTCDay()  // 0=Sunday
    for (const code of r.byDay) {
      const dayCode = code.slice(-2)
      const idx = DAY_CODES.indexOf(dayCode as typeof DAY_CODES[number])
      if (idx === -1) continue
      const delta = (idx - baseDow + 7) % 7
      out.push(cursor.getTime() + delta * 86400000)
    }
    return out.sort((a, b) => a - b)
  }
  if (r.freq === 'MONTHLY') {
    return monthlyCandidates(cursor, r)
  }
  if (r.freq === 'YEARLY') {
    // Compose: filter by BYMONTH (if present) then apply MONTHLY-style logic.
    const months = r.byMonth ?? [cursor.getUTCMonth() + 1]
    const out: number[] = []
    for (const m of months) {
      const periodStart = new Date(Date.UTC(cursor.getUTCFullYear(), m - 1, 1, cursor.getUTCHours(), cursor.getUTCMinutes(), cursor.getUTCSeconds()))
      out.push(...monthlyCandidates(periodStart, r))
    }
    return out.sort((a, b) => a - b)
  }
  return []
}

function monthlyCandidates(periodStart: Date, r: RRule): number[] {
  const y = periodStart.getUTCFullYear()
  const mo = periodStart.getUTCMonth()
  const hh = periodStart.getUTCHours()
  const mm = periodStart.getUTCMinutes()
  const ss = periodStart.getUTCSeconds()
  const daysInMonth = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate()

  if (r.byMonthDay && r.byMonthDay.length > 0) {
    return r.byMonthDay
      .map((d) => d > 0 ? d : daysInMonth + d + 1)
      .filter((d) => d >= 1 && d <= daysInMonth)
      .map((d) => Date.UTC(y, mo, d, hh, mm, ss))
      .sort((a, b) => a - b)
  }

  if (r.byDay && r.byDay.length > 0) {
    // BYDAY may carry "1MO" (first Monday), "-1FR" (last Friday), or bare "MO".
    const all: { day: number; dayMs: number }[] = []
    for (const code of r.byDay) {
      const m = /^(-?\d+)?([A-Z]{2})$/.exec(code)
      if (!m) continue
      const ordinal = m[1] ? parseInt(m[1], 10) : null
      const dayCode = m[2]
      const targetDow = DAY_CODES.indexOf(dayCode as typeof DAY_CODES[number])
      if (targetDow === -1) continue
      const matches: number[] = []
      for (let day = 1; day <= daysInMonth; day++) {
        const dt = new Date(Date.UTC(y, mo, day, hh, mm, ss))
        if (dt.getUTCDay() === targetDow) matches.push(day)
      }
      if (ordinal === null) {
        for (const day of matches) all.push({ day, dayMs: Date.UTC(y, mo, day, hh, mm, ss) })
      } else {
        const idx = ordinal > 0 ? ordinal - 1 : matches.length + ordinal
        const day = matches[idx]
        if (day) all.push({ day, dayMs: Date.UTC(y, mo, day, hh, mm, ss) })
      }
    }
    let result = all.map((a) => a.dayMs).sort((a, b) => a - b)
    if (r.bySetPos && r.bySetPos.length > 0) {
      result = r.bySetPos.map((p) => p > 0 ? result[p - 1] : result[result.length + p]).filter((x) => x !== undefined)
    }
    return result
  }

  // No BYMONTHDAY or BYDAY: the master DTSTART day repeats at the same day of month.
  const dom = Math.min(periodStart.getUTCDate(), daysInMonth)
  return [Date.UTC(y, mo, dom, hh, mm, ss)]
}

function advanceCursor(cursor: Date, r: RRule): Date {
  const next = new Date(cursor.getTime())
  switch (r.freq) {
    case 'DAILY':
      next.setUTCDate(next.getUTCDate() + r.interval); break
    case 'WEEKLY':
      next.setUTCDate(next.getUTCDate() + 7 * r.interval); break
    case 'MONTHLY':
      next.setUTCMonth(next.getUTCMonth() + r.interval); break
    case 'YEARLY':
      next.setUTCFullYear(next.getUTCFullYear() + r.interval); break
  }
  return next
}
