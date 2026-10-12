// LabPulseSection -- "Lab pulse" on PI Analytics (Nick, 2026-10-11): three
// tiles, each one hero number with the trend behind it.
//
//   Trainee pubs a year     mean of the last three full years; a bar per year
//   Days to done            median task age at completion; a bar per month,
//                           and by priority
//   Active this month       members with any action in 30 days, against the
//                           30 before; who they are
//
// Colors follow principle 21 (rules-ui-design.md): data bars run the teal ramp
// (more = brighter, lib/tealRamp.ts), orange only for something slipping or
// gone quiet, everything else gray. The card is the shared card material
// (.sk-mat). Every number here comes from a PI-only route; the per-person list
// and the score never reach a member (api/routes/pi-dashboard.ts).

import SectionHead from '../ui/SectionHead'
import { useId } from 'react'
import { rampBar, BAR_TRACK } from '../../lib/tealRamp'
import { todayCivil } from '../../lib/time'
import { getPersonInfo } from '../../data/team'
import { usePubsPulse, useSpeedPulse, useEngagementPulse } from '../../hooks/useLabPulse'
import { ARROW, formatDays, daysHero, pubsBetter, speedBetter, activeBetter, type Better } from '../../lib/labPulse'

/** The static roster's name when it knows the slug, else the name the API holds. */
function nameOf(m: { slug: string; name: string }): string {
  const n = getPersonInfo(m.slug).name
  return n && n !== m.slug ? n : m.name
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthLabel(ym: string): string {
  const m = Number(ym.slice(5, 7))
  return MONTHS[m - 1] ?? ''
}

/** A bar that is neither good nor bad by length: the one color for "how long". */
const NEUTRAL_BAR = { background: 'color-mix(in srgb, var(--slate) 45%, transparent)' }

/** An arrow in the job color: orange when slipping, gray otherwise. */
function Mark({ better, hint, children }: { better: Better; hint: string; children?: React.ReactNode }) {
  if (better === 'flat') return null
  return (
    <span
      title={hint}
      role="img"
      aria-label={hint}
      style={{ color: better === 'worse' ? 'var(--job-stale)' : 'var(--sk-t2)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}
    >
      {ARROW[better]}{children}
    </span>
  )
}

function Tile({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="sk-mat rounded-xl p-5 flex flex-col gap-4" style={{ minWidth: 0 }}>
      <div>
        <h4 className="text-[13px] font-semibold" style={{ color: 'var(--sk-t1)' }}>{title}</h4>
        {note && <p className="text-[11px] mt-0.5" style={{ color: 'var(--sk-t3)' }}>{note}</p>}
      </div>
      {children}
    </div>
  )
}

function Hero({ value, unit, mark, caption }: { value: string; unit?: string; mark?: React.ReactNode; caption?: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span
          className="tabular-nums"
          style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(40px, 6vw, 52px)', fontWeight: 500, lineHeight: 1, color: 'var(--sk-t1)', letterSpacing: '-0.01em' }}
        >
          {value}
        </span>
        {unit && <span className="text-sm" style={{ color: 'var(--sk-t3)' }}>{unit}</span>}
        {mark}
      </div>
      {caption && <p className="text-xs mt-1.5" style={{ color: 'var(--sk-t3)' }}>{caption}</p>}
    </div>
  )
}

/**
 * Vertical bars. Default: the teal ramp, tallest = bright end (right where more
 * is better). `neutral`: every bar gray and only the item marked `now` in teal,
 * for a figure where taller is worse (days to done): the brightest bar must
 * never mark the worst value (principle 21, rules-ui-design.md).
 */
function Bars({ items, height = 56, neutral = false }: { items: Array<{ label: string; value: number; title: string; now?: boolean }>; height?: number; neutral?: boolean }) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="flex items-end gap-1.5" style={{ height: height + 28 }} role="img" aria-label={items.map((i) => i.title).join('; ')}>
      {items.map((i) => (
        <div key={i.label + i.title} className="flex-1 flex flex-col items-center justify-end gap-1" style={{ minWidth: 0 }} title={i.title}>
          <span className="text-[10px] tabular-nums" style={{ color: 'var(--sk-t3)' }}>{i.value || ''}</span>
          <div className="w-full rounded-t" style={{ height: Math.max((i.value / max) * height, i.value > 0 ? 3 : 1), ...(i.value <= 0 ? { background: BAR_TRACK } : neutral ? (i.now ? rampBar(1) : NEUTRAL_BAR) : rampBar(i.value / max)) }} />
          <span className="text-[10px]" style={{ color: i.now ? 'var(--sk-t1)' : 'var(--sk-t3)', fontWeight: i.now ? 600 : 400 }}>{i.label}</span>
        </div>
      ))}
    </div>
  )
}

/** One labeled horizontal bar with its number beside it. */
function RowBar({ label, value, max, text, title, stale, neutral = false }: { label: string; value: number; max: number; text: string; title?: string; stale?: boolean; neutral?: boolean }) {
  const t = max > 0 ? value / max : 0
  return (
    <div className="flex items-center gap-2.5" title={title}>
      <span className="text-xs w-24 truncate" style={{ color: stale ? 'var(--job-stale)' : 'var(--sk-t1)' }}>{label}</span>
      <div className="flex-1 h-3.5 rounded overflow-hidden" style={{ backgroundColor: BAR_TRACK }}>
        {value > 0 && <div className="h-full rounded" style={{ width: `${Math.max(t * 100, 4)}%`, transition: 'width 0.6s ease', ...(neutral ? NEUTRAL_BAR : rampBar(t)) }} />}
      </div>
      <span className="text-[11px] w-14 text-right tabular-nums" style={{ color: stale ? 'var(--job-stale)' : 'var(--sk-t2)' }}>{text}</span>
    </div>
  )
}

const Unavailable = () => <p className="text-sm" style={{ color: 'var(--sk-t3)' }}>Not available right now.</p>
const Loading = () => <p className="text-sm" style={{ color: 'var(--sk-t3)' }}>Loading</p>

function PubsTile() {
  const q = usePubsPulse()
  const d = q.data
  return (
    <Tile title="Trainee pubs per year" note="Papers with a trainee author, mean of the last three full years">
      {q.isError ? <Unavailable /> : !d ? <Loading /> : (
        <>
          <Hero
            value={String(d.pace.per_year)}
            unit="pubs / yr"
            mark={<Mark better={pubsBetter(d)} hint={`Last year beat the two before it: ${d.pace.last_year} against ${d.pace.earlier_per_year} a year`} />}
            caption={`${d.pace.last_year} last year, ${d.pace.earlier_per_year} a year before that, across ${d.mentees.length} trainee${d.mentees.length === 1 ? '' : 's'}`}
          />
          <Bars items={d.perYear.map((y) => ({
            label: `'${String(y.year).slice(2)}${y.partial ? ' so far' : ''}`,
            value: y.count,
            title: `${y.year}${y.partial ? ' so far' : ''}: ${y.count} paper${y.count === 1 ? '' : 's'}`,
          }))} />
        </>
      )}
    </Tile>
  )
}

function SpeedTile() {
  const q = useSpeedPulse()
  const d = q.data
  const prio = d ? d.byPriority.filter((p) => p.count > 0) : []
  const maxPrio = Math.max(...prio.map((p) => p.median_days), 0)
  const thisMonth = todayCivil().slice(0, 7)
  return (
    <Tile title="Days to done, team tasks" note="Median time from a task made to it done, for tasks assigned to someone other than Nick, left out if closed within a day">
      {q.isError ? <Unavailable /> : !d ? <Loading /> : d.summary.completed === 0 ? (
        <p className="text-sm" style={{ color: 'var(--sk-t3)' }}>No team tasks finished in the last 90 days.</p>
      ) : (
        <>
          <Hero
            value={daysHero(d.summary.median_days).value}
            unit={daysHero(d.summary.median_days).unit}
            mark={<Mark better={speedBetter(d)} hint={`${d.summary.trend === 'faster' ? 'Faster' : 'Slower'} than the 90 days before`} />}
            caption={d.summary.prior_completed > 0
              ? `${d.summary.completed} done in 90 days; ${formatDays(d.summary.prior_median_days)} the 90 days before${d.summary.small_sample ? ' · small sample' : ''}`
              : `${d.summary.completed} done in the last 90 days${d.summary.small_sample ? ' · small sample' : ''}`}
          />
          <Bars neutral items={d.monthly.map((m) => ({
            label: monthLabel(m.month),
            value: m.median_days,
            now: m.month === thisMonth,
            title: `${m.month}: ${formatDays(m.median_days)} median, ${m.completed} done`,
          }))} />
          {prio.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-3" style={{ borderTop: '1px solid var(--sk-line)' }}>
              <span className="text-[11px]" style={{ color: 'var(--sk-t3)' }}>By priority, last 6 months</span>
              {prio.map((p) => (
                <RowBar neutral key={p.priority} label={p.priority} value={p.median_days} max={maxPrio} text={p.median_days < 1 ? '<1d' : formatDays(p.median_days).replace(' days', 'd').replace(' day', 'd')} title={`${p.count} done`} />
              ))}
            </div>
          )}
        </>
      )}
    </Tile>
  )
}

function ActiveTile() {
  const q = useEngagementPulse()
  const d = q.data
  const maxTotal = d ? Math.max(...d.members.map((m) => m.total), 1) : 1
  const delta = d ? Math.abs(d.active - d.prior_active) : 0
  return (
    <Tile title="Active members this month" note="A task assigned to them finished, a comment or update written, or something opened in the Hub, in the last 30 days, against the 30 before">
      {q.isError ? <Unavailable /> : !d ? <Loading /> : (
        <>
          <Hero
            value={String(d.active)}
            unit={`of ${d.of}`}
            mark={<Mark better={activeBetter(d)} hint={`${d.active > d.prior_active ? 'More' : 'Fewer'} members active than in the 30 days before`}>{delta}</Mark>}
            caption={`${d.prior_active} were active in the 30 days before`}
          />
          <div className="flex flex-col gap-1.5 pt-3" style={{ borderTop: '1px solid var(--sk-line)' }} data-testid="lab-pulse-people">
            {d.members.map((m) => {
              const quiet = !m.active && m.prior_active
              return (
                <RowBar
                  key={m.slug}
                  label={nameOf(m)}
                  value={m.total}
                  max={maxTotal}
                  text={quiet ? 'quiet' : m.total === 0 && m.opened ? 'opened' : String(m.total)}
                  stale={quiet}
                  title={`${m.total} actions in 30 days (${m.prior_total} before) · score ${m.score}`}
                />
              )
            })}
          </div>
        </>
      )}
    </Tile>
  )
}

export default function LabPulseSection() {
  const headId = useId()
  return (
    <section id="lab-pulse" aria-labelledby={headId} className="mt-6" data-testid="lab-pulse">
      <SectionHead id={headId} title="Lab pulse" count="Only you see this" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <PubsTile />
        <SpeedTile />
        <ActiveTile />
      </div>
    </section>
  )
}
