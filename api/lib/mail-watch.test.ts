// mail-watch.test.ts -- shared/mailWatch.ts: the one schedule, freshness derived
// at read time, the inbound classifier, and the ball/alert rule (schema-v151).

import { describe, it, expect } from 'vitest'
import {
  MAIL_WATCH_SCHEDULE, slotFor, slotsBetween, dueSlots, alertAllowed, pingHoursOpen, watchFreshness,
  classifyParty, threadPings, ballOf, threadIdFromUrl, localHm,
  type RunRow, type ThreadReceipt, type MessageFacts, type StoredMessage,
} from '../../shared/mailWatch'

const T = (s: string) => Date.parse(s)
const ISO = (ms: number) => new Date(ms).toISOString()

describe('the schedule: 06:00, 10:00-16:00 hourly, 18:00 Chicago, weekdays', () => {
  it('is the nine slots Nick named, and nothing else', () => {
    expect([...MAIL_WATCH_SCHEDULE.slotHours]).toEqual([6, 10, 11, 12, 13, 14, 15, 16, 18])
    expect(MAIL_WATCH_SCHEDULE.timeZone).toBe('America/Chicago')
    // Wed 2026-10-28 (CDT, UTC-5): every slot of the day.
    const day = slotsBetween(T('2026-10-28T05:00:00Z'), T('2026-10-29T04:59:00Z'))
    expect(day.map((s) => localHm(s))).toEqual(['06:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '18:00'])
  })

  it('a fire inside a slot hour is served by that slot; 17:xx, night and 07:00-09:59 are not', () => {
    expect(slotFor(T('2026-10-28T11:42:00Z'))).toBe(T('2026-10-28T11:00:00Z')) // 06:42 CDT
    expect(slotFor(T('2026-10-28T15:59:00Z'))).toBe(T('2026-10-28T15:00:00Z')) // 10:59
    expect(slotFor(T('2026-10-28T12:30:00Z'))).toBeNull() // 07:30
    expect(slotFor(T('2026-10-28T22:10:00Z'))).toBeNull() // 17:10
    expect(slotFor(T('2026-10-28T23:10:00Z'))).toBe(T('2026-10-28T23:00:00Z')) // 18:10
    expect(slotFor(T('2026-10-29T03:00:00Z'))).toBeNull() // 22:00
  })

  it('weekends have no slot', () => {
    expect(slotFor(T('2026-10-31T16:00:00Z'))).toBeNull() // Sat 11:00 CDT
    expect(slotFor(T('2026-11-01T17:00:00Z'))).toBeNull() // Sun 11:00 CST
  })

  it('DST end (Sun 2026-11-01): Monday 06:00 CST is 12:00 UTC, not 11:00', () => {
    expect(slotFor(T('2026-11-02T12:05:00Z'))).toBe(T('2026-11-02T12:00:00Z'))
    expect(slotFor(T('2026-11-02T11:30:00Z'))).toBeNull() // 05:30 CST
    expect(localHm(T('2026-11-02T12:00:00Z'))).toBe('06:00')
  })

  it('an alert may go out only within 70 minutes of its slot start', () => {
    const slot = T('2026-10-28T15:00:00Z')
    expect(alertAllowed(slot + 5 * 60_000, slot)).toBe(true)
    expect(alertAllowed(slot + 69 * 60_000, slot)).toBe(true)
    expect(alertAllowed(slot + 71 * 60_000, slot)).toBe(false)
  })

  it('ping hours span 06:00-18:59 on weekdays only', () => {
    expect(pingHoursOpen(T('2026-10-28T11:00:00Z'))).toBe(true) // 06:00
    expect(pingHoursOpen(T('2026-10-28T23:59:00Z'))).toBe(true) // 18:59
    expect(pingHoursOpen(T('2026-10-29T00:00:00Z'))).toBe(false) // 19:00
    expect(pingHoursOpen(T('2026-10-28T10:59:00Z'))).toBe(false) // 05:59
    expect(pingHoursOpen(T('2026-10-31T16:00:00Z'))).toBe(false) // Saturday
  })
})

function run(slotIso: string, outcome: 'complete' | 'partial' | null = 'complete', closeAfterMin = 4): RunRow {
  const slot = T(slotIso)
  return {
    id: `wr_${slot}`, slot_at: ISO(slot), opened_at: ISO(slot + 60_000),
    closed_at: outcome ? ISO(slot + closeAfterMin * 60_000) : null, outcome,
  }
}

describe('watchFreshness is derived, never stored', () => {
  const receipt = (tid: string, at: string | null): ThreadReceipt => ({ thread_id: tid, observed_at: at })

  it('never: no run has closed', () => {
    const f = watchFreshness(T('2026-10-28T17:00:00Z'), [], [receipt('a', null)])
    expect(f.state).toBe('never')
    expect(f.last_checked_at).toBeNull()
  })

  it('current: the latest due slot has a complete run and every thread a receipt from it', () => {
    const r = run('2026-10-28T16:00:00Z') // 11:00 CDT
    const f = watchFreshness(T('2026-10-28T17:30:00Z'), [r], [receipt('a', r.closed_at)])
    expect(f.state).toBe('current')
    expect(f.threads).toBe(1)
    expect(f.unchecked).toBe(0)
  })

  it('a thread with no receipt reads stale: the run is complete, the state is partial', () => {
    const r = run('2026-10-28T16:00:00Z')
    const f = watchFreshness(T('2026-10-28T17:30:00Z'), [r], [receipt('a', r.closed_at), receipt('b', null)])
    expect(f.state).toBe('partial')
    expect(f.unchecked).toBe(1)
  })

  it('a thread whose only receipt predates the latest due slot reads stale too', () => {
    const old = run('2026-10-28T15:00:00Z')
    const r = run('2026-10-28T16:00:00Z')
    const f = watchFreshness(T('2026-10-28T17:30:00Z'), [old, r], [receipt('a', r.closed_at), receipt('b', old.closed_at)])
    expect(f.state).toBe('partial')
    expect(f.unchecked).toBe(1)
  })

  it('partial: the latest due run closed partial', () => {
    const f = watchFreshness(T('2026-10-28T17:30:00Z'), [run('2026-10-28T16:00:00Z', 'partial')], [])
    expect(f.state).toBe('partial')
  })

  it('a slot still inside its 75-minute grace is not judged yet', () => {
    // 12:00 CDT slot started 17:00Z; at 17:40Z it is not due, 11:00 decides.
    const f = watchFreshness(T('2026-10-28T17:40:00Z'), [run('2026-10-28T16:00:00Z')], [])
    expect(f.state).toBe('current')
  })

  it('late: the latest due slot has no closed run, the one before has', () => {
    const f = watchFreshness(T('2026-10-28T18:20:00Z'), [run('2026-10-28T16:00:00Z')], [])
    expect(f.state).toBe('late')
    expect(f.missed_since).toBe('2026-10-28T17:00:00.000Z')
  })

  it('an open run does not count: a run that never closed is a missed slot', () => {
    const f = watchFreshness(T('2026-10-28T18:20:00Z'), [run('2026-10-28T16:00:00Z'), run('2026-10-28T17:00:00Z', null)], [])
    expect(f.state).toBe('late')
  })

  it('down: two consecutive due slots missed; missed_since is the outage start and stays put', () => {
    const runs = [run('2026-10-28T15:00:00Z')] // 10:00 ok, then nothing
    const at1 = watchFreshness(T('2026-10-28T18:20:00Z'), runs, [])
    expect(at1.state).toBe('down')
    expect(at1.missed_since).toBe('2026-10-28T16:00:00.000Z')
    const at2 = watchFreshness(T('2026-10-28T20:20:00Z'), runs, [])
    expect(at2.state).toBe('down')
    expect(at2.missed_since).toBe(at1.missed_since)
  })

  it('off_hours: current, and the next slot is more than an hour away', () => {
    const r = run('2026-10-28T23:00:00Z') // 18:00 CDT
    const f = watchFreshness(T('2026-10-29T03:00:00Z'), [r], [receipt('a', r.closed_at)])
    expect(f.state).toBe('off_hours')
    expect(f.next_slot_at).toBe('2026-10-29T11:00:00.000Z')
  })

  it('a weekend does not read as down: Monday 07:00 judges Friday 18:00', () => {
    const fri = run('2026-10-30T23:00:00Z') // Fri 18:00 CDT
    const f = watchFreshness(T('2026-11-02T13:00:00Z'), [fri], []) // Mon 07:00 CST, 06:00 not due yet
    expect(f.state).not.toBe('down')
    expect(f.state).not.toBe('late')
  })

  it('dueSlots never returns a slot inside its grace', () => {
    const now = T('2026-10-28T17:40:00Z')
    for (const s of dueSlots(now, 5)) expect(now - s).toBeGreaterThanOrEqual(75 * 60_000)
  })
})

function facts(over: Partial<MessageFacts> & { headers?: Record<string, string> }): MessageFacts {
  return { message_id: 'm', internal_date_ms: 0, label_ids: ['INBOX'], snippet: '', ...over, headers: { from: 'Jane Doe <jane@umn.edu>', subject: 'Re: data', ...(over.headers ?? {}) } }
}
const SELF = new Set(['ingra107@umn.edu'])

describe('classifyParty: inbound mail is classified before any ping', () => {
  it('a colleague writing to Nick is other', () => {
    expect(classifyParty(facts({}), SELF)).toBe('other')
  })
  it('Nick: SENT, no Auto-Submitted, no Sender (the PB HumanSent rule)', () => {
    expect(classifyParty(facts({ label_ids: ['SENT'], headers: { from: 'Nick <ingra107@umn.edu>' } }), SELF)).toBe('nick')
  })
  it('SENT by a service (Sender header) or auto-submitted is machine, not Nick', () => {
    expect(classifyParty(facts({ label_ids: ['SENT'], headers: { sender: 'calendar@google.com' } }), SELF)).toBe('machine')
    expect(classifyParty(facts({ label_ids: ['SENT'], headers: { 'auto-submitted': 'auto-replied' } }), SELF)).toBe('machine')
  })
  it('a forward or an emoji reaction from Nick is unsure: it does not answer anyone', () => {
    expect(classifyParty(facts({ label_ids: ['SENT'], headers: { subject: 'Fwd: data' } }), SELF)).toBe('unsure')
    expect(classifyParty(facts({ label_ids: ['SENT'], snippet: 'Nick Ingraham reacted via Gmail' }), SELF)).toBe('unsure')
  })
  it('drafts are drafts', () => {
    expect(classifyParty(facts({ label_ids: ['DRAFT', 'SENT'] }), SELF)).toBe('draft')
  })
  it('auto-replies, lists, bounces and no-reply senders are machine', () => {
    expect(classifyParty(facts({ headers: { 'auto-submitted': 'auto-replied' } }), SELF)).toBe('machine')
    expect(classifyParty(facts({ headers: { 'auto-submitted': 'no' } }), SELF)).toBe('other')
    expect(classifyParty(facts({ headers: { precedence: 'bulk' } }), SELF)).toBe('machine')
    expect(classifyParty(facts({ headers: { 'list-id': '<clif.lists.example>' } }), SELF)).toBe('machine')
    expect(classifyParty(facts({ headers: { from: 'MAILER-DAEMON@umn.edu' } }), SELF)).toBe('machine')
    expect(classifyParty(facts({ headers: { from: 'Box <noreply@box.com>' } }), SELF)).toBe('machine')
    expect(classifyParty(facts({ headers: { subject: 'Automatic reply: data' } }), SELF)).toBe('machine')
    expect(classifyParty(facts({ headers: { subject: 'Out of Office: back Monday' } }), SELF)).toBe('machine')
  })
  it('mail from Nick\'s own address without SENT, or with no From, is unsure', () => {
    expect(classifyParty(facts({ headers: { from: 'Nick <ingra107@umn.edu>' } }), SELF)).toBe('unsure')
    expect(classifyParty({ message_id: 'm', internal_date_ms: 0, label_ids: ['INBOX'], headers: {}, snippet: '' }, SELF)).toBe('unsure')
  })
})

function msg(id: string, at: string, party: StoredMessage['party'], baseline: 0 | 1 = 0, alerted: string | null = null): StoredMessage {
  return { message_id: id, thread_id: 't', internal_at: at, party, baseline, alerted_at: alerted }
}

describe('the alert rule: ping only when a reply moves the ball to Nick', () => {
  it('Nick wrote last, then a colleague replied: ping', () => {
    expect(threadPings([msg('1', '2026-10-28T10:00:00Z', 'nick', 1, 'x'), msg('2', '2026-10-28T15:00:00Z', 'other')], false)).toBe(true)
  })
  it('two replies in a row from them ping once (one thread, one ping)', () => {
    const list = [msg('1', '2026-10-28T10:00:00Z', 'nick', 1, 'x'), msg('2', '2026-10-28T15:00:00Z', 'other'), msg('3', '2026-10-28T15:10:00Z', 'other')]
    expect(threadPings(list, false)).toBe(true)
  })
  it('a further reply when the ball was already his does not ping, unless the task is waiting', () => {
    const list = [msg('1', '2026-10-28T10:00:00Z', 'other', 1, 'x'), msg('2', '2026-10-28T15:00:00Z', 'other')]
    expect(threadPings(list, false)).toBe(false)
    expect(threadPings(list, true)).toBe(true)
  })
  it('baseline mail (seen on the first read) never pings', () => {
    expect(threadPings([msg('1', '2026-10-28T10:00:00Z', 'nick', 1), msg('2', '2026-10-28T15:00:00Z', 'other', 1)], true)).toBe(false)
  })
  it('machine and unsure mail never ping', () => {
    const list = [msg('1', '2026-10-28T10:00:00Z', 'nick', 1, 'x'), msg('2', '2026-10-28T15:00:00Z', 'machine'), msg('3', '2026-10-28T15:05:00Z', 'unsure')]
    expect(threadPings(list, true)).toBe(false)
  })
  it('a message is evaluated once: alerted_at set means no second ping', () => {
    expect(threadPings([msg('1', '2026-10-28T10:00:00Z', 'nick', 1, 'x'), msg('2', '2026-10-28T15:00:00Z', 'other', 0, 'y')], true)).toBe(false)
  })
  it('the ball: latest human message decides', () => {
    expect(ballOf([msg('1', '2026-10-28T10:00:00Z', 'nick'), msg('2', '2026-10-28T15:00:00Z', 'other')])).toBe('nick')
    expect(ballOf([msg('1', '2026-10-28T10:00:00Z', 'other'), msg('2', '2026-10-28T15:00:00Z', 'nick')])).toBe('them')
    expect(ballOf([msg('1', '2026-10-28T10:00:00Z', 'machine')])).toBe('unknown')
  })
})

describe('thread ids in gmail_thread links', () => {
  it('takes the 16-hex API id off any Gmail URL form, never a 32-char web token', () => {
    expect(threadIdFromUrl('https://mail.google.com/mail/u/1/#all/1a0e5f718220a235')).toBe('1a0e5f718220a235')
    expect(threadIdFromUrl('https://mail.google.com/mail/u/0/#inbox/1A0E5F718220A235/')).toBe('1a0e5f718220a235')
    expect(threadIdFromUrl('https://mail.google.com/mail/u/1/#inbox/FMfcgzQbgRnJxHqPwMsLcKtVfZdNwXbj')).toBeNull()
  })
})
