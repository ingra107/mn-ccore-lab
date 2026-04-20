import { useState, useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  useStats,
  useTasks,
  useProjects,
  useActivity,
  useProjectHealth,
  usePublications,
  useTeam,
} from '../hooks/useApiData'
import { useGrantTimeline } from '../hooks/useGrantTimeline'
import { isProjectActive } from '../lib/taskConstants'
import { formatBrandName } from '../components/BrandName'
import HeartbeatLine from '../components/HeartbeatLine'
import PulseScene from '../components/pulse/PulseScene'
import PulseMetric from '../components/pulse/PulseMetric'
import PulseSparkline from '../components/pulse/PulseSparkline'
import type { SparkPoint } from '../components/pulse/PulseSparkline'

/**
 * Lab Pulse — cinematic ambient kiosk for the lab TV / 4K wall display.
 *
 * The Hub's "wow visitors" surface. Auto-rotates between hero scenes every
 * 8s. Each scene is a single big idea: one chart, one metric block, one
 * pulse line — no chrome, no nav. Slow Ken Burns + 1.6s crossfades make
 * it watchable rather than navigable.
 *
 * Design rules in here (kiosk-only — does NOT inherit portal styles):
 *   - Dark-first deep-neutral background (#0b1017), NOT --ink (which is
 *     blue-tinted). Text floor #e2e8f0, with #f5efe2 reserved for hero
 *     numbers (cream-warm to pair with the gold ECG line).
 *   - Display weight Fraunces for everything > 40px. DM Sans for body
 *     and labels. NO mono.
 *   - Heartbeat-line motif (favicon-derived) appears in three places:
 *       1. Background ambient line at bottom (slow trace, 60bpm)
 *       2. Eyebrow divider above each scene title (slow variant)
 *       3. Scene transition pulse — fires on scene change
 *   - Respects prefers-reduced-motion: scenes still rotate (you need the
 *     cycle to function as a kiosk), but Ken Burns + ECG draws pause.
 */

const ROTATE_INTERVAL = 8000

export default function Pulse() {
  const [activeIndex, setActiveIndex] = useState(0)
  // P3-01: persisted pause toggle so the kiosk can be parked on one slide
  // for a presentation without restarting the rotation each time.
  const [paused, setPaused] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('pulse-paused') === 'true'
  })

  const { data: stats } = useStats()
  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: activity = [] } = useActivity(8)
  const { data: healthData } = useProjectHealth()
  const { data: grants = [] } = useGrantTimeline()
  const { data: publications = [] } = usePublications()
  const { data: team = [] } = useTeam()

  const pendingTasks = tasks.filter((t) => !t.completed)
  const overdueTasks = pendingTasks.filter(
    (t) => t.due_date && new Date(t.due_date + 'T23:59:59') < new Date(),
  )
  const activeProjects = projects.filter((p) => isProjectActive(p.status)).length
  const completedThisWeek = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    return tasks.filter(
      (t) => t.completed && t.updated_at && new Date(t.updated_at) > cutoff,
    ).length
  }, [tasks])
  const health = healthData?.summary

  // Publications by year (last 8 yrs) for the sparkline scene.
  const pubsByYear: SparkPoint[] = useMemo(() => {
    if (!publications.length) return []
    const counts = new Map<number, number>()
    publications.forEach((p) => {
      if (!p.year) return
      counts.set(p.year, (counts.get(p.year) || 0) + 1)
    })
    const years = [...counts.keys()].sort((a, b) => a - b)
    if (!years.length) return []
    const start = Math.max(years[0], new Date().getFullYear() - 7)
    const end = new Date().getFullYear()
    const out: SparkPoint[] = []
    for (let y = start; y <= end; y++) {
      out.push({
        label: String(y),
        value: counts.get(y) || 0,
        emphasis: y === end,
      })
    }
    return out
  }, [publications])

  // Build the scene array. Each scene is a self-contained <PulseScene/>.
  const scenes = useMemo(() => {
    const list: { key: string; render: () => React.ReactNode }[] = []

    // Scene 1 — HERO: at-a-glance metrics, big and quiet.
    list.push({
      key: 'hero',
      render: () => (
        <PulseScene
          eyebrow={`${formatBrandName('MN-CCORE')} · Live`}
          title="The lab, right now."
          subtitle={`${pendingTasks.length} active tasks, ${activeProjects} active projects, ${team.length || stats?.teamSize || 18} people moving the work.`}
        >
          <div className="grid grid-cols-3 gap-x-20 gap-y-12">
            <PulseMetric value={pendingTasks.length} label="Active tasks" />
            <PulseMetric value={activeProjects} label="Active projects" />
            <PulseMetric
              value={team.length || stats?.teamSize || 18}
              label="Lab members"
            />
          </div>
        </PulseScene>
      ),
    })

    // Scene 2 — Publications by year, chart-as-art.
    if (pubsByYear.length) {
      const total = pubsByYear.reduce((a, b) => a + b.value, 0)
      const thisYear = pubsByYear[pubsByYear.length - 1]?.value || 0
      list.push({
        key: 'pubs',
        render: () => (
          <PulseScene
            eyebrow="Publications"
            title="Eight years of output."
            subtitle={`${stats?.publicationCount ?? publications.length} papers across the lab. ${thisYear} so far this year.`}
            staticFrame
          >
            <PulseSparkline data={pubsByYear} height={420} />
            <div className="mt-10 flex items-center gap-12">
              <PulseMetric
                value={stats?.publicationCount ?? publications.length}
                label="Total publications"
                size="lg"
              />
              <PulseMetric value="2,626+" label="Citations" size="lg" />
              <PulseMetric value={thisYear} label={`In ${new Date().getFullYear()}`} size="lg" />
              <span className="ml-auto opacity-60">
                <HeartbeatLine width={220} height={48} variant="slow" />
              </span>
            </div>
            {/* eslint-disable-next-line @typescript-eslint/no-unused-expressions */}
            {void total}
          </PulseScene>
        ),
      })
    }

    // Scene 3 — Throughput: this week's velocity.
    list.push({
      key: 'throughput',
      render: () => (
        <PulseScene
          eyebrow="This week"
          title="Things shipped."
          subtitle="Tasks the team has finished in the last seven days."
        >
          <div className="flex items-end gap-20">
            <PulseMetric value={completedThisWeek} label="Completed this week" />
            <div className="flex flex-col gap-8 mb-8">
              <PulseMetric
                value={pendingTasks.length}
                label="In flight"
                size="md"
                color="#5cbcb4"
              />
              <PulseMetric
                value={overdueTasks.length}
                label="Overdue"
                size="md"
                color={overdueTasks.length > 0 ? '#f0737e' : 'rgba(245,239,226,0.55)'}
              />
            </div>
          </div>
        </PulseScene>
      ),
    })

    // Scene 4 — Project health constellation.
    if (health) {
      const total = health.healthy + health.needs_attention + health.at_risk + health.critical
      list.push({
        key: 'health',
        render: () => (
          <PulseScene
            eyebrow="Project health"
            title={`${total} active projects, traced.`}
            subtitle="Live signal from the project-health algorithm — activity, velocity, overdue work, milestones."
            staticFrame
          >
            <div className="grid grid-cols-4 gap-12">
              <HealthOrb color="#16a34a" label="Healthy" count={health.healthy} />
              <HealthOrb color="#dcb355" label="Attention" count={health.needs_attention} />
              <HealthOrb color="#f08a5b" label="At risk" count={health.at_risk} />
              <HealthOrb color="#f0737e" label="Critical" count={health.critical} />
            </div>
          </PulseScene>
        ),
      })
    }

    // Scene 5 — Grant portfolio (active mechanisms).
    if (grants.length) {
      const active = grants.filter((g) => !g.proposed)
      const pending = grants.filter((g) => g.proposed)
      list.push({
        key: 'grants',
        render: () => (
          <PulseScene
            eyebrow="Funding portfolio"
            title="What's keeping the lights on."
            subtitle={`${active.length} active grants, ${pending.length} proposals in flight.`}
          >
            <div className="grid grid-cols-2 gap-x-16 gap-y-8 max-w-[1400px]">
              {grants.slice(0, 6).map((g) => (
                <div key={g.id} className="flex items-baseline gap-6">
                  <span
                    className="tabular-nums"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 500,
                      fontSize: 'clamp(40px, 4vw, 56px)',
                      letterSpacing: '-0.03em',
                      color: g.proposed ? '#dcb355' : '#5cbcb4',
                      lineHeight: 1,
                      minWidth: 120,
                    }}
                  >
                    {g.mechanism}
                  </span>
                  <div className="flex flex-col">
                    <span
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 'clamp(18px, 1.4vw, 24px)',
                        color: '#f5efe2',
                        fontWeight: 400,
                        lineHeight: 1.2,
                      }}
                    >
                      {formatBrandName(g.title)}
                    </span>
                    <span
                      className="uppercase mt-1"
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 12,
                        letterSpacing: '0.18em',
                        color: g.proposed ? '#dcb355' : '#5cbcb4',
                        fontWeight: 500,
                      }}
                    >
                      {g.proposed ? 'In preparation' : 'Active'} · {g.agency}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </PulseScene>
        ),
      })
    }

    // Scene 6 — Live activity feed, but cinematic.
    if (activity.length) {
      list.push({
        key: 'activity',
        render: () => (
          <PulseScene
            eyebrow="Live"
            title="What just happened."
            subtitle="The most recent moves across the lab."
          >
            <ul className="flex flex-col gap-5 max-w-[1400px]">
              {activity.slice(0, 6).map((a, i) => (
                <motion.li
                  key={a.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 1, delay: 0.5 + i * 0.1 }}
                  className="flex items-baseline gap-6"
                >
                  <span
                    className="w-2 h-2 rounded-full mt-2"
                    style={{ background: '#dcb355', flexShrink: 0 }}
                    aria-hidden
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 400,
                      fontSize: 'clamp(22px, 2vw, 32px)',
                      color: '#f5efe2',
                      letterSpacing: '-0.01em',
                      lineHeight: 1.3,
                    }}
                  >
                    {formatBrandName(a.description)}
                  </span>
                </motion.li>
              ))}
            </ul>
          </PulseScene>
        ),
      })
    }

    return list
  }, [
    stats,
    pendingTasks.length,
    overdueTasks.length,
    activeProjects,
    completedThisWeek,
    team.length,
    publications.length,
    pubsByYear,
    health,
    grants,
    activity,
  ])

  // Auto-rotate. Loop is essential — kiosk has no input. Pause halts.
  useEffect(() => {
    if (scenes.length <= 1 || paused) return
    const t = setInterval(() => {
      setActiveIndex((i) => (i + 1) % scenes.length)
    }, ROTATE_INTERVAL)
    return () => clearInterval(t)
  }, [scenes.length, paused])

  // Spacebar toggles pause — works on the kiosk via wireless presenter remote.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault()
        setPaused((p) => {
          const next = !p
          if (typeof window !== 'undefined') {
            if (next) window.localStorage.setItem('pulse-paused', 'true')
            else window.localStorage.removeItem('pulse-paused')
          }
          return next
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const scene = scenes[activeIndex] || scenes[0]
  const sceneKey = scene?.key ?? 'empty'

  return (
    <div
      data-testid="pulse-kiosk"
      className="fixed inset-0 overflow-hidden"
      style={{
        // Deep neutral per the Hub design ethos — NOT --ink (blue-tinted).
        background:
          'radial-gradient(ellipse at 30% 20%, #0f1620 0%, #0b1017 55%, #07090d 100%)',
        color: '#e2e8f0',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* ── Ambient backdrop layer ───────────────────────────────
          A faint heartbeat line traces continuously along the lower
          third — it's the "monitor" of the kiosk. */}
      <div
        aria-hidden
        className="absolute left-0 right-0"
        style={{
          bottom: 'calc(8% - 32px)',
          opacity: 0.18,
          pointerEvents: 'none',
        }}
      >
        <HeartbeatLine
          width="100%"
          height={120}
          strokeWidth={1.25}
          variant="slow"
          color="#dcb355"
          glow
        />
      </div>

      {/* Subtle vignette + grain feel via radial overlay */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, transparent 60%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      {/* ── Header ──────────────────────────────────────────── */}
      <header className="absolute top-0 left-0 right-0 flex items-center justify-between px-16 py-10 z-10">
        <div className="flex items-center gap-5">
          <img
            src="/logos/mnccore-logo-mark.svg"
            alt=""
            width={44}
            height={44}
            style={{ filter: 'invert(1) brightness(1.4)' }}
          />
          <div className="flex flex-col">
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
                fontSize: 22,
                color: '#f5efe2',
                letterSpacing: '-0.01em',
                lineHeight: 1,
              }}
            >
              {formatBrandName('MN-CCORE')}
            </span>
            <span
              className="uppercase mt-1"
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: 11,
                letterSpacing: '0.32em',
                color: '#dcb355',
              }}
            >
              Lab Pulse
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span
            className="w-2 h-2 rounded-full"
            style={{
              background: '#5cbcb4',
              boxShadow: '0 0 12px #5cbcb4',
              animation: 'pulse-live 2s ease-in-out infinite',
            }}
            aria-hidden
          />
          <span
            className="uppercase"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 11,
              letterSpacing: '0.32em',
              color: '#5cbcb4',
              fontWeight: 500,
            }}
          >
            Live
          </span>
        </div>
      </header>

      {/* ── Scene canvas (1.6s crossfade) ───────────────────── */}
      <div className="absolute inset-0 flex items-center justify-center">
        <AnimatePresence mode="wait">
          <div key={sceneKey} className="absolute inset-0">
            {scene?.render()}
          </div>
        </AnimatePresence>
      </div>

      {/* ── Footer: scene markers + clock ───────────────────── */}
      <footer className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-16 py-10 z-10">
        <div className="flex items-center gap-3">
          {scenes.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setActiveIndex(i)}
              aria-label={`Scene ${i + 1} of ${scenes.length}`}
              aria-current={i === activeIndex ? 'true' : undefined}
              style={{
                width: i === activeIndex ? 36 : 8,
                height: 4,
                borderRadius: 2,
                background:
                  i === activeIndex ? '#dcb355' : 'rgba(220,179,85,0.22)',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                transition: 'all 600ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />
          ))}
        </div>
        <Clock />
      </footer>

      <style>{`
        @keyframes pulse-live {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(0.85); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="pulse-live"] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}

// ── Subcomponents ──────────────────────────────────────────────

function HealthOrb({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div
        className="rounded-full relative"
        style={{
          width: 'clamp(96px, 9vw, 140px)',
          height: 'clamp(96px, 9vw, 140px)',
          background: `radial-gradient(circle at 35% 35%, ${color}, ${color}55 60%, transparent 100%)`,
          boxShadow: `0 0 60px ${color}55`,
        }}
        aria-hidden
      />
      <div
        className="tabular-nums"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          fontSize: 'clamp(56px, 6vw, 84px)',
          color: '#f5efe2',
          letterSpacing: '-0.03em',
          lineHeight: 1,
        }}
      >
        {count}
      </div>
      <div
        className="uppercase"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          letterSpacing: '0.24em',
          color: '#dcb355',
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    </div>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  const time = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  const date = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  return (
    <div className="flex items-baseline gap-4">
      <span
        className="tabular-nums"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          fontSize: 22,
          color: '#f5efe2',
          letterSpacing: '-0.01em',
        }}
      >
        {time}
      </span>
      <span
        className="uppercase"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 11,
          letterSpacing: '0.24em',
          color: 'rgba(226,232,240,0.55)',
          fontWeight: 500,
        }}
      >
        {date}
      </span>
    </div>
  )
}
