import { describe, it, expect } from 'vitest'
import { parseIcs } from './ics-parser'

// Fixed window for deterministic RRULE expansion. All test events anchor
// in 2026-04 so this window contains them but is generous on the right
// to confirm RRULE expansion respects bounds.
const WIN = {
  windowStart: '2026-04-01T00:00:00.000Z',
  windowEnd: '2026-06-30T23:59:59.000Z',
}

function ical(...parts: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...parts, 'END:VCALENDAR'].join('\r\n')
}

function vevent(props: Record<string, string | string[]>): string {
  const out: string[] = ['BEGIN:VEVENT']
  for (const [k, v] of Object.entries(props)) {
    if (Array.isArray(v)) {
      for (const item of v) out.push(`${k}:${item}`)
    } else {
      out.push(`${k}:${v}`)
    }
  }
  out.push('END:VEVENT')
  return out.join('\r\n')
}

describe('parseIcs — basic', () => {
  it('parses a simple UTC event', () => {
    const ics = ical(vevent({
      UID: 'evt-1',
      SUMMARY: 'Lab meeting',
      DTSTART: '20260415T140000Z',
      DTEND: '20260415T150000Z',
    }))
    const out = parseIcs(ics, WIN)
    expect(out).toHaveLength(1)
    expect(out[0].uid).toBe('evt-1')
    expect(out[0].summary).toBe('Lab meeting')
    expect(out[0].startAt).toBe('2026-04-15T14:00:00.000Z')
    expect(out[0].endAt).toBe('2026-04-15T15:00:00.000Z')
    expect(out[0].isAllDay).toBe(false)
  })

  it('parses an all-day event', () => {
    const ics = ical(vevent({
      UID: 'allday-1',
      SUMMARY: 'Conference day',
      'DTSTART;VALUE=DATE': '20260420',
    }))
    const out = parseIcs(ics, WIN)
    expect(out).toHaveLength(1)
    expect(out[0].isAllDay).toBe(true)
    expect(out[0].startAt).toBe('2026-04-20T00:00:00.000Z')
  })

  it('drops cancelled events', () => {
    const ics = ical(
      vevent({ UID: 'a', SUMMARY: 'Active', DTSTART: '20260415T140000Z' }),
      vevent({ UID: 'b', SUMMARY: 'Cancelled', DTSTART: '20260416T140000Z', STATUS: 'CANCELLED' }),
    )
    const out = parseIcs(ics, WIN)
    expect(out.map((e) => e.uid)).toEqual(['a'])
  })

  it('drops events the owner declined', () => {
    const ics = ical(
      vevent({
        UID: 'declined-1',
        SUMMARY: 'Recruiter pitch',
        DTSTART: '20260415T140000Z',
        ATTENDEE: ['CN=Nick;PARTSTAT=DECLINED:mailto:ingra107@umn.edu'],
      }),
      vevent({
        UID: 'accepted-1',
        SUMMARY: 'Lab',
        DTSTART: '20260416T140000Z',
        ATTENDEE: ['CN=Nick;PARTSTAT=ACCEPTED:mailto:ingra107@umn.edu'],
      }),
    )
    const out = parseIcs(ics, { ...WIN, ownerEmail: 'ingra107@umn.edu' })
    expect(out.map((e) => e.uid)).toEqual(['accepted-1'])
  })

  it('keeps declined events when no ownerEmail provided', () => {
    const ics = ical(vevent({
      UID: 'declined-1',
      SUMMARY: 'Recruiter pitch',
      DTSTART: '20260415T140000Z',
      ATTENDEE: ['CN=Nick;PARTSTAT=DECLINED:mailto:ingra107@umn.edu'],
    }))
    const out = parseIcs(ics, WIN)
    expect(out).toHaveLength(1)
  })

  it('dedups by (summary, startAt)', () => {
    const ics = ical(
      vevent({ UID: 'dup-1', SUMMARY: 'Same', DTSTART: '20260415T140000Z' }),
      vevent({ UID: 'dup-2', SUMMARY: 'Same', DTSTART: '20260415T140000Z' }),
    )
    const out = parseIcs(ics, WIN)
    expect(out).toHaveLength(1)
  })
})

describe('parseIcs — line unfolding', () => {
  it('joins continuation lines per RFC 5545', () => {
    // RFC 5545 §3.1: CRLF + leading space/tab marks a continuation. The
    // marker is stripped; the remaining content is concatenated with no
    // inserted space. To preserve a space at the wrap point, the original
    // line must include the space before the wrap.
    const ics = ical(['BEGIN:VEVENT',
      'UID:fold-1',
      'SUMMARY:This is a really long meeting ',
      ' name continued',
      'DTSTART:20260415T140000Z',
      'END:VEVENT'].join('\r\n'))
    const out = parseIcs(ics, WIN)
    expect(out[0].summary).toBe('This is a really long meeting name continued')
  })
})

describe('parseIcs — TZID resolution', () => {
  it('converts America/Chicago wall-clock to correct UTC (CDT)', () => {
    // CDT (April) is UTC-5. 14:00 local = 19:00 UTC.
    const ics = ical(vevent({
      UID: 'tz-1',
      SUMMARY: 'TZ test',
      'DTSTART;TZID=America/Chicago': '20260415T140000',
    }))
    const out = parseIcs(ics, WIN)
    expect(out[0].startAt).toBe('2026-04-15T19:00:00.000Z')
  })

  it('converts America/Chicago wall-clock to correct UTC (CST)', () => {
    // CST (January) is UTC-6. 14:00 local = 20:00 UTC.
    // Window expanded to include January.
    const ics = ical(vevent({
      UID: 'tz-2',
      SUMMARY: 'TZ winter',
      'DTSTART;TZID=America/Chicago': '20260115T140000',
    }))
    const out = parseIcs(ics, { windowStart: '2026-01-01T00:00:00.000Z', windowEnd: '2026-12-31T23:59:59.000Z' })
    expect(out[0].startAt).toBe('2026-01-15T20:00:00.000Z')
  })

  it('falls back to UTC for unknown TZID', () => {
    const ics = ical(vevent({
      UID: 'tz-bad',
      SUMMARY: 'Unknown tz',
      'DTSTART;TZID=Mars/Olympus': '20260415T140000',
    }))
    const out = parseIcs(ics, WIN)
    expect(out[0].startAt).toBe('2026-04-15T14:00:00.000Z')
  })
})

describe('parseIcs — RRULE expansion', () => {
  it('expands FREQ=WEEKLY with BYDAY', () => {
    // Tuesday Apr 7 2026; expand 4 weeks of Tuesday + Thursday.
    const ics = ical(vevent({
      UID: 'rec-1',
      SUMMARY: 'Office hours',
      DTSTART: '20260407T140000Z',
      DTEND: '20260407T150000Z',
      RRULE: 'FREQ=WEEKLY;BYDAY=TU,TH;COUNT=8',
    }))
    const out = parseIcs(ics, WIN)
    // 8 occurrences total
    expect(out).toHaveLength(8)
    // First 4 starts (chronological, dedup'd by parseIcs sort)
    const dates = out.map((e) => e.startAt.slice(0, 10))
    expect(dates.slice(0, 4)).toEqual(['2026-04-07', '2026-04-09', '2026-04-14', '2026-04-16'])
  })

  it('expands FREQ=WEEKLY;INTERVAL=2 (biweekly)', () => {
    const ics = ical(vevent({
      UID: 'biw-1',
      SUMMARY: '1:1',
      DTSTART: '20260406T160000Z',  // Monday
      RRULE: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;COUNT=4',
    }))
    const out = parseIcs(ics, WIN)
    expect(out).toHaveLength(4)
    expect(out.map((e) => e.startAt.slice(0, 10))).toEqual(['2026-04-06', '2026-04-20', '2026-05-04', '2026-05-18'])
  })

  it('expands FREQ=MONTHLY with BYDAY=1MO (first Monday)', () => {
    const ics = ical(vevent({
      UID: 'mon-1',
      SUMMARY: 'Faculty meeting',
      DTSTART: '20260406T180000Z',  // Apr 6 = first Monday
      RRULE: 'FREQ=MONTHLY;BYDAY=1MO;COUNT=3',
    }))
    const out = parseIcs(ics, WIN)
    expect(out).toHaveLength(3)
    expect(out.map((e) => e.startAt.slice(0, 10))).toEqual(['2026-04-06', '2026-05-04', '2026-06-01'])
  })

  it('honors UNTIL', () => {
    const ics = ical(vevent({
      UID: 'until-1',
      SUMMARY: 'Daily standup',
      DTSTART: '20260413T140000Z',
      RRULE: 'FREQ=DAILY;UNTIL=20260417T140000Z',
    }))
    const out = parseIcs(ics, WIN)
    expect(out.map((e) => e.startAt.slice(0, 10))).toEqual([
      '2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17',
    ])
  })

  it('skips EXDATE-excluded instances', () => {
    const ics = ical(vevent({
      UID: 'exd-1',
      SUMMARY: 'Weekly',
      DTSTART: '20260406T140000Z',
      RRULE: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
      EXDATE: '20260420T140000Z',
    }))
    const out = parseIcs(ics, WIN)
    expect(out).toHaveLength(3)
    expect(out.map((e) => e.startAt.slice(0, 10))).not.toContain('2026-04-20')
  })

  it('honors RECURRENCE-ID overrides', () => {
    const ics = ical(
      vevent({
        UID: 'over-1',
        SUMMARY: 'Standup',
        DTSTART: '20260406T140000Z',
        RRULE: 'FREQ=WEEKLY;BYDAY=MO;COUNT=3',
      }),
      vevent({
        UID: 'over-1',
        SUMMARY: 'Standup (rescheduled)',
        DTSTART: '20260413T160000Z',
        'RECURRENCE-ID': '20260413T140000Z',
      }),
    )
    const out = parseIcs(ics, WIN)
    expect(out).toHaveLength(3)
    const moved = out.find((e) => e.summary === 'Standup (rescheduled)')
    expect(moved).toBeDefined()
    expect(moved!.startAt).toBe('2026-04-13T16:00:00.000Z')
    // Original 14:00 instance should be gone
    expect(out.filter((e) => e.startAt === '2026-04-13T14:00:00.000Z')).toHaveLength(0)
  })

  it('cancelled RECURRENCE-ID drops just that instance', () => {
    const ics = ical(
      vevent({
        UID: 'can-1',
        SUMMARY: 'Standup',
        DTSTART: '20260406T140000Z',
        RRULE: 'FREQ=WEEKLY;BYDAY=MO;COUNT=3',
      }),
      vevent({
        UID: 'can-1',
        SUMMARY: 'Standup',
        DTSTART: '20260413T140000Z',
        'RECURRENCE-ID': '20260413T140000Z',
        STATUS: 'CANCELLED',
      }),
    )
    const out = parseIcs(ics, WIN)
    expect(out).toHaveLength(2)
    expect(out.map((e) => e.startAt.slice(0, 10))).toEqual(['2026-04-06', '2026-04-20'])
  })
})

describe('parseIcs — meeting URL extraction', () => {
  it('extracts Zoom URL from DESCRIPTION when LOCATION is empty', () => {
    const ics = ical(vevent({
      UID: 'zoom-1',
      SUMMARY: 'Lab',
      DTSTART: '20260415T140000Z',
      DESCRIPTION: 'Join here: https://umn.zoom.us/j/1234567890?pwd=abc Some other text',
    }))
    const out = parseIcs(ics, WIN)
    expect(out[0].location).toBe('https://umn.zoom.us/j/1234567890?pwd=abc')
  })

  it('extracts Google Meet URL', () => {
    const ics = ical(vevent({
      UID: 'meet-1',
      SUMMARY: 'Lab',
      DTSTART: '20260415T140000Z',
      DESCRIPTION: 'https://meet.google.com/abc-defg-hij',
    }))
    const out = parseIcs(ics, WIN)
    expect(out[0].location).toBe('https://meet.google.com/abc-defg-hij')
  })

  it('strips Google redirect tracking from URLs', () => {
    const ics = ical(vevent({
      UID: 'gtrack-1',
      SUMMARY: 'Lab',
      DTSTART: '20260415T140000Z',
      LOCATION: 'https://umn.zoom.us/j/1234567890&sa=D&source=calendar',
    }))
    const out = parseIcs(ics, WIN)
    expect(out[0].location).toBe('https://umn.zoom.us/j/1234567890')
  })

  it('keeps non-URL location as-is', () => {
    const ics = ical(vevent({
      UID: 'room-1',
      SUMMARY: 'Lab',
      DTSTART: '20260415T140000Z',
      LOCATION: 'PWB 14-152',
    }))
    const out = parseIcs(ics, WIN)
    expect(out[0].location).toBe('PWB 14-152')
  })
})

describe('parseIcs — window bounds', () => {
  it('drops events before windowStart', () => {
    const ics = ical(vevent({
      UID: 'old',
      SUMMARY: 'Old',
      DTSTART: '20251215T140000Z',  // way before window
    }))
    const out = parseIcs(ics, WIN)
    expect(out).toHaveLength(0)
  })

  it('drops events after windowEnd', () => {
    const ics = ical(vevent({
      UID: 'far',
      SUMMARY: 'Far future',
      DTSTART: '20271215T140000Z',
    }))
    const out = parseIcs(ics, WIN)
    expect(out).toHaveLength(0)
  })

  it('caps RRULE expansion at hard maximum', () => {
    // FREQ=DAILY with no UNTIL/COUNT — would run for years without the cap.
    const ics = ical(vevent({
      UID: 'forever',
      SUMMARY: 'Eternal',
      DTSTART: '20260401T140000Z',
      RRULE: 'FREQ=DAILY',
    }))
    const out = parseIcs(ics, WIN)
    // Window is Apr 1 .. Jun 30 = 91 days max; should be 91 instances.
    expect(out.length).toBeLessThanOrEqual(91)
    expect(out.length).toBeGreaterThan(80)
  })
})
