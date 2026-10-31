// overnightWindow -- where the Overnight card's window starts.
//
// The start is the most recent 18:00 America/Chicago at or before `now`
// (evening to evening: last night's runs, plus anything since). If Nick has
// tapped "Seen" since then, the later of the two wins: that high-water mark
// (the `until` he posted) is stored per browser and read once when the card
// mounts, so tapping Seen does not make the card vanish under his hand.

const TZ = 'America/Chicago'
const EVENING_HOUR = 18

/** Minutes the Chicago wall clock is ahead of UTC at `instant` (negative: CST -360, CDT -300). */
function chicagoOffsetMin(instant: Date): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(instant)
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value)
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'))
  return Math.round((asUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000)
}

/** The instant a Chicago civil date + hour happens (two passes settle the DST edge). */
function chicagoInstant(y: number, m: number, d: number, hour: number): Date {
  const civil = Date.UTC(y, m - 1, d, hour)
  let guess = new Date(civil - chicagoOffsetMin(new Date(civil)) * 60000)
  guess = new Date(civil - chicagoOffsetMin(guess) * 60000)
  return guess
}

/** The previous 18:00 America/Chicago, as an ISO string. */
export function previousEveningIso(now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric',
  }).formatToParts(now)
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value)
  let y = n('year'), m = n('month'), d = n('day')
  if (n('hour') < EVENING_HOUR) {
    const prev = new Date(Date.UTC(y, m - 1, d - 1))
    y = prev.getUTCFullYear(); m = prev.getUTCMonth() + 1; d = prev.getUTCDate()
  }
  return chicagoInstant(y, m, d, EVENING_HOUR).toISOString()
}

/** The window start: the previous 18:00 Chicago. Seen is not a window
 * edge: the server keeps it per line (receipt_lines vs receipt_runs.seen_at),
 * so it reads the same on every device and nothing lives in this browser. */
export function overnightSince(now: Date = new Date()): string {
  return previousEveningIso(now)
}
