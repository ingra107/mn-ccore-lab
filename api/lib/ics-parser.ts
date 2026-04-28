// Minimal iCalendar (RFC 5545) VEVENT parser. Pure JS, no deps — runs in
// Cloudflare Workers without Node polyfills. Handles the subset Google /
// Outlook / iCloud actually emit:
//   - VEVENT blocks (ignores VTODO, VJOURNAL, VTIMEZONE, etc.)
//   - DTSTART / DTEND with optional TZID= or VALUE=DATE (all-day)
//   - SUMMARY, UID, LOCATION, DESCRIPTION
//   - Line unfolding (RFC 5545 §3.1: CRLF + space/tab continues prior line)
//   - Basic backslash escapes (\\n, \\,, \\;, \\\\)
//   - RRULE expansion: NOT supported. Recurring events surface only their
//     master DTSTART; recurrences within the polling window are missed.
//     This is acceptable for a 15-min cache feeding a "today timeline" —
//     fix when someone reports a missing weekly meeting. (TODO #45-followup)
//
// TZID handling: Workers have no IANA timezone DB. We treat TZID values as
// hints and parse the local time as wall-clock; output is the wall-clock
// converted naively to UTC. Practical impact: all-day events render
// correctly; timed events drift by the user's UTC offset only when the
// server-side conversion matters (e.g., today-vs-tomorrow at midnight
// boundaries). Acceptable for v1; document limitation.

export interface IcsEvent {
  uid: string
  summary: string
  description: string | null
  location: string | null
  startAt: string  // ISO-8601, UTC if known, else wall-clock + 'Z'
  endAt: string | null
  isAllDay: boolean
}

export function parseIcs(raw: string): IcsEvent[] {
  const unfolded = unfoldLines(raw)
  const events: IcsEvent[] = []
  let current: Partial<IcsEvent> | null = null
  let inEvent = false

  for (const line of unfolded) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true
      current = {}
      continue
    }
    if (line === 'END:VEVENT') {
      if (current && current.uid && current.startAt) {
        events.push({
          uid: current.uid,
          summary: current.summary ?? '(no title)',
          description: current.description ?? null,
          location: current.location ?? null,
          startAt: current.startAt,
          endAt: current.endAt ?? null,
          isAllDay: current.isAllDay ?? false,
        })
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
    // Property name may carry params: DTSTART;TZID=America/Chicago:...
    const semi = rawKey.indexOf(';')
    const name = (semi === -1 ? rawKey : rawKey.slice(0, semi)).toUpperCase()
    const params = semi === -1 ? '' : rawKey.slice(semi + 1)

    switch (name) {
      case 'UID':
        current.uid = value.trim()
        break
      case 'SUMMARY':
        current.summary = unescapeText(value)
        break
      case 'DESCRIPTION':
        current.description = unescapeText(value)
        break
      case 'LOCATION':
        current.location = unescapeText(value)
        break
      case 'DTSTART': {
        const parsed = parseIcsDate(value, params)
        current.startAt = parsed.iso
        current.isAllDay = parsed.isAllDay
        break
      }
      case 'DTEND': {
        const parsed = parseIcsDate(value, params)
        current.endAt = parsed.iso
        break
      }
    }
  }
  return events
}

// RFC 5545 §3.1 — a CRLF followed by a single linear-white-space char
// (space or tab) is a continuation of the prior line.
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

interface ParsedDate { iso: string; isAllDay: boolean }

// DTSTART value forms:
//   20260427T143000Z        — UTC instant
//   20260427T143000         — floating local (with TZID param)
//   20260427                — date-only (all-day, requires VALUE=DATE param)
function parseIcsDate(value: string, params: string): ParsedDate {
  const v = value.trim()
  const isAllDay = /VALUE=DATE(?!-TIME)/i.test(params) || /^\d{8}$/.test(v)

  if (isAllDay && /^\d{8}$/.test(v)) {
    const y = v.slice(0, 4), m = v.slice(4, 6), d = v.slice(6, 8)
    return { iso: `${y}-${m}-${d}T00:00:00.000Z`, isAllDay: true }
  }

  const utc = /^(\d{8})T(\d{6})Z$/.exec(v)
  if (utc) {
    const [_, ymd, hms] = utc
    return { iso: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hms.slice(0, 2)}:${hms.slice(2, 4)}:${hms.slice(4, 6)}.000Z`, isAllDay: false }
  }

  const local = /^(\d{8})T(\d{6})$/.exec(v)
  if (local) {
    // Floating local — without IANA tz data we treat as UTC wall-clock.
    // See module header for tradeoff.
    const [_, ymd, hms] = local
    return { iso: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hms.slice(0, 2)}:${hms.slice(2, 4)}:${hms.slice(4, 6)}.000Z`, isAllDay: false }
  }

  // Fallback: leave as-is so caller can see and discard
  return { iso: v, isAllDay: false }
}
