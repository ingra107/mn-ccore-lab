import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderKanban, GitBranch, Plus, List, LayoutGrid, Star } from 'lucide-react'
import { stageIndex, toApiStage, normalizeStage, stageLabel } from '../lib/stageNormalize'
import { usePageMeta } from '../hooks/usePageMeta'
import { useProjects, useDependencies, useProjectHealth, useTasks } from '../hooks/useApiData'
import { useLabPrefs } from '../hooks/useLabPrefs'
import { PANEL_BG, daysSince, withAlpha } from '../lib/taskGrouping'
import { parseDbUtc } from '../lib/time'
import { useCreateProject } from '../hooks/useMutations'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateProject } from '../lib/api'
import InlineSelect from '../components/InlineSelect'
import { useUndoToast } from '../components/UndoToast'
import { PROJECT_STATUS_OPTIONS, normalizeProjectStatus, isProjectActive } from '../lib/taskConstants'
import ProjectCard from '../components/ProjectCard'
import ProjectDependencyMap from '../components/ProjectDependencyMap'
import CreateProjectModal from '../components/CreateProjectModal'
import DataPage from '../components/DataPage'
import { ColumnHeader, TableContainer } from '../components/table'
import { directors } from '../data/team'
import { displayName } from '../lib/nameUtils'
import type { Project } from '../data/types'
import { useProjectKeyboardNav } from '../hooks/useProjectKeyboardNav'
import { staggerContainer, staggerItem } from '../lib/animations'
import { stripConsortiumPrefix } from '../lib/textUtils'
import { PATHS } from '../constants/paths'
import { ICON_PROPS } from '../lib/iconProps'
import { useAllProjectLinks } from '../hooks/useApiData'
import type { StoredLink } from '../hooks/useApiData'
import { iconForType } from '../lib/linkIcon'
import { classifyUrl } from '../lib/urlClassify'
import { displayRank } from '../lib/pbLinkDisplayOrder.generated'
import { useProtocolLaunch } from '../hooks/useProtocolLaunch'
import WorkOnActions from '../components/WorkOnActions'

// Values are D1 lowercase canonical; labels are Title Case for display.
const STAGES = ['idea', 'data_collection', 'analysis', 'writing', 'review', 'revisions', 'published'] as const
type Stage = (typeof STAGES)[number]
const STAGE_LABELS: Record<Stage, string> = {
  idea: 'Idea',
  data_collection: 'Data Collection',
  analysis: 'Analysis',
  writing: 'Writing',
  review: 'Review',
  revisions: 'Revisions',
  published: 'Published',
}

// Stage 4 #12-followup (2026-05-08): 3-bucket canonical categories.
// 'stale' is a pseudo-filter (P2-9: stale-by-shared-threshold OR health < 50),
// not a real category value.
const CATEGORY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'MNCCORE', label: 'MN-CCORE' },
  { key: 'CLIF', label: 'CLIF' },
  { key: 'Peripheral Brain', label: 'Peripheral Brain' },
  { key: 'stale', label: 'Needs Attention' },
] as const

const CATEGORY_DOT: Record<string, string> = {
  // Canonical 3-bucket
  MNCCORE: 'var(--teal)',
  CLIF: 'var(--maroon)',
  'Peripheral Brain': 'var(--slate)',
  // Legacy fallbacks for soft-deleted rows
  clif: 'var(--maroon)',
  lab: 'var(--teal)',
  nate: 'var(--orange)',
  mentee: 'var(--gold)',
}

const STAGE_ORDER: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s, i]))

// Mode-B icon-only link bar for a project row.
// Max 4 icons shown inline; overflow shown as "+N" label.
// Borderless glyph (Nick 2026-06-17 rule): no outline, sharp, hover tooltip.
// Non-http links open via useProtocolLaunch (mnccore:// handler + clipboard backup).
const LINKS_OVERFLOW_THRESHOLD = 4
function ProjectLinksCell({ links }: { links: StoredLink[] }) {
  const { launch } = useProtocolLaunch()
  if (links.length === 0) return null
  // Sort: type-priority (displayRank) primary, existing sort_order as tiebreaker.
  // Stable sort mirrors PB sections.py render order so both surfaces agree.
  const sorted = [...links].sort(
    (a, b) => displayRank(a.type) - displayRank(b.type) || a.sort_order - b.sort_order
  )
  const visible = sorted.slice(0, LINKS_OVERFLOW_THRESHOLD)
  const overflow = links.length - visible.length
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexWrap: 'nowrap' }}
      onClick={(e) => e.preventDefault()}
    >
      {visible.map((link) => {
        const { Icon, color } = iconForType(link.type)
        // classifyUrl resolves [[wikilink]] canonical_urls to the correct
        // mnccore://obsidian/<target> launch URI. isHttp is authoritative here.
        const { href: launchUri, isHttp } = classifyUrl(link.canonical_url)
        const tooltip = `${link.type} · ${link.short_title || link.canonical_url}`
        return (
          <a
            key={link.id}
            href={isHttp ? link.canonical_url : '#'}
            target={isHttp ? '_blank' : undefined}
            rel={isHttp ? 'noopener noreferrer' : undefined}
            title={tooltip}
            aria-label={tooltip}
            onClick={(e) => {
              e.stopPropagation()
              if (!isHttp) {
                e.preventDefault()
                void launch(launchUri, {
                  copyText: link.canonical_url,
                  successMessage: `Opening ${link.type}… (path copied as backup)`,
                })
              }
            }}
            style={{
              width: 16,
              height: 16,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color,
              textDecoration: 'none',
              transition: 'opacity 150ms',
              opacity: 0.85,
              flexShrink: 0,
            }}
          >
            <Icon {...ICON_PROPS} size={14} aria-hidden="true" />
          </a>
        )
      })}
      {overflow > 0 && (
        <span
          style={{
            fontSize: '10px',
            color: 'var(--slate)',
            opacity: 0.7,
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          +{overflow}
        </span>
      )}
    </span>
  )
}

// S19: PI dropdown options. Directors are the canonical choices; if the current
// PI value is a non-director slug (legacy "nick", a bare email, a non-director
// member), prepend a resolved option so InlineSelect renders a clean display
// name instead of the raw slug.
function piOptions(currentPi?: string | null): { value: string; label: string }[] {
  const base = directors.map((d) => ({ value: d.slug, label: displayName(d.slug, 'display') }))
  const pi = (currentPi || '').trim()
  if (pi && !base.some((o) => o.value === pi)) {
    return [{ value: pi, label: displayName(pi, 'display') }, ...base]
  }
  return base
}

const HEALTH_STATUS_COLOR: Record<string, string> = {
  'Healthy': 'var(--green)',
  'Needs Attention': 'var(--gold)',
  'At Risk': 'var(--orange)',
  'Critical': 'var(--maroon)',
}

function getStageProjects(stage: Stage, filtered: Project[]): Project[] {
  // #91-class fix, now structural (Hub #361a): rowToProject() normalizes
  // stage at ingress, so every project.stage here is already canonical —
  // a legacy-cased raw value ("Idea"/"Submitted") can no longer reach this
  // comparison at all, so no per-read normalize() call is needed.
  return filtered.filter((p) => p.stage === stage)
}

// "Most recent activity" sort key. Take the NEWEST of the two real movement
// signals — the derived activity rollup (lastActivity, #95) and the curated
// last_meaningful_movement — instead of the first truthy one. A stale-but-
// present lastActivity (it freezes when a project is worked through PB Hub-first
// field writes, which post no activity_entries row) was shadowing a fresher
// last_meaningful_movement and sinking actively-worked projects to the bottom
// (e.g. the LPV R01: activity frozen 2026-03-12, real movement 2026-07). Fall
// back to updated_at ONLY when both movement signals are absent — updated_at is
// a row-touch stamp any sync write bumps (api/routes/projects.ts:277), so it
// must never promote a project on its own. parseDbUtc (not Date.parse): bare D1
// stamps are UTC and native parsing would read them as local.
function projectRecencyMs(p: Project): number {
  const ms = (v: string | null | undefined): number => {
    const t = parseDbUtc(v).getTime()
    return Number.isNaN(t) ? 0 : t
  }
  const move = Math.max(ms(p.lastActivity), ms(p.last_meaningful_movement))
  return move || ms(p.updated_at)
}

export default function Projects() {
  usePageMeta(
    'Research Pipeline | MN-CCORE',
    'Track MN-CCORE research projects from idea to publication across MN-CCORE, CLIF, and Peripheral Brain buckets.'
  )

  const { data: projects = [] } = useProjects()
  const { data: allTasks = [] } = useTasks()
  // #507 follow-up opt-out: dependencies/healthData/allProjectLinks are all
  // per-row OPTIONAL enrichments (dependency map inside a collapsible toggle,
  // health progress bar, link icons) layered onto the page's real query
  // (useProjects, above -- unaffected). A failure here degrades to "badge/
  // icon/panel just doesn't render" with no false claim, same as "no data
  // yet" -- not worth a page-level error block for a secondary decoration.
  const { data: dependencies = [] } = useDependencies()
  const { data: healthData } = useProjectHealth()
  const { data: allProjectLinks = {} } = useAllProjectLinks()
  // P2-9: shared staleness threshold (days-since-meaningful-movement). The
  // "Needs Attention" filter's STALENESS input reconciles to this single basis
  // (health score may still weight other inputs, but staleness is one truth).
  const { prefs } = useLabPrefs()

  // Task counts per project
  const taskCountByProject = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of allTasks) {
      if (t.project_id && !t.completed) {
        map.set(t.project_id, (map.get(t.project_id) || 0) + 1)
      }
    }
    return map
  }, [allTasks])

  // Build a map of slug -> health data for quick lookup
  const healthBySlug = useMemo(() => {
    const map = new Map<string, { score: number; status: string }>()
    for (const h of healthData?.data ?? []) {
      map.set(h.slug, { score: h.score, status: h.status })
    }
    return map
  }, [healthData])
  const createProject = useCreateProject()
  const queryClient = useQueryClient()
  const inlineUpdate = useMutation({
    mutationFn: ({ slug, fields }: { slug: string; fields: Record<string, unknown> }) =>
      updateProject(slug, fields),
    onMutate: async ({ slug, fields }) => {
      await queryClient.cancelQueries({ queryKey: ['projects'] })
      const prev = queryClient.getQueryData<Project[]>(['projects'])
      if (prev) {
        // Ingress chokepoint (Hub #361a): this optimistic cache merge is a
        // SECOND stage-data entry point that bypasses rowToProject entirely.
        // `fields.stage` here is toApiStage() output (e.g. 'data_analysis' /
        // 'submitted') — the wire shape, needed as-is for the mutationFn PATCH
        // body — but the local `['projects']` cache must hold the UI's
        // canonical value or every read site downstream (now normalize-free)
        // would briefly see a non-canonical stage until onSettled refetches.
        const optimisticFields = 'stage' in fields
          ? { ...fields, stage: normalizeStage(fields.stage as string) || fields.stage }
          : fields
        queryClient.setQueryData<Project[]>(['projects'], prev.map(p => p.slug === slug ? { ...p, ...optimisticFields } : p))
      }
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['projects'], context.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
  const { showUndo } = useUndoToast()

  // S17: stage editing is one grammar everywhere — instant + undo (design Rule 8),
  // matching ManuscriptsPage's handleFieldChange. Captures the prior stage so the
  // toast can restore it; the UI 6-stage value is mapped to the 7-value API
  // canonical via toApiStage() (Rule 35 — the API 400s a non-canonical value,
  // which surfaces as a silent revert).
  const handleStageChange = useCallback((slug: string, nextStage: string, prevStage: string | null | undefined) => {
    if (nextStage === prevStage) return
    inlineUpdate.mutate({ slug, fields: { stage: toApiStage(nextStage) } })
    showUndo(
      `Stage → ${STAGE_LABELS[nextStage as Stage] ?? nextStage}`,
      () => inlineUpdate.mutate({ slug, fields: { stage: toApiStage(prevStage || 'idea') } }),
    )
  }, [inlineUpdate, showUndo])

  // S10: category is URL-backed so ⌘K "Filter CLIF Projects" (which navigates
  // to PATHS.projects + '?category=CLIF') lands pre-filtered, and saved/shared
  // links round-trip. Same pattern ManuscriptsPage uses. Absent param = 'all'.
  const [searchParams, setSearchParams] = useSearchParams()
  const VALID_CATEGORY_KEYS = useMemo(() => new Set(CATEGORY_FILTERS.map((f) => f.key as string)), [])
  const categoryParam = searchParams.get('category')
  const activeCategory = categoryParam && VALID_CATEGORY_KEYS.has(categoryParam) ? categoryParam : 'all'
  const setActiveCategory = useCallback((next: string) => {
    setSearchParams((prev) => {
      const out = new URLSearchParams(prev)
      if (next && next !== 'all') out.set('category', next)
      else out.delete('category')
      return out
    }, { replace: true })
  }, [setSearchParams])
  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('list')
  const [showDeps, setShowDeps] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  type ProjectSortKey = 'title' | 'status' | 'stage' | 'pi' | 'category' | 'activity'
  // Nick 2026-06-24: the list opens ordered by MOST RECENT ACTIVITY (newest
  // first) — the "what's moving" view. Other column headers still re-sort.
  const [sortKey, setSortKey] = useState<ProjectSortKey>('activity')
  const [sortAsc, setSortAsc] = useState(true)
  const [pinnedSlugs, setPinnedSlugs] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('pinned-projects') || '[]')) } catch { return new Set() }
  })
  const togglePin = (slug: string) => {
    setPinnedSlugs(prev => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug); else next.add(slug)
      localStorage.setItem('pinned-projects', JSON.stringify([...next]))
      return next
    })
  }
  const toggleSort = (key: ProjectSortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  const filtered = useMemo(() => {
    let base: typeof projects
    if (activeCategory === 'all') base = projects
    else if (activeCategory === 'stale') {
      base = projects.filter(p => {
        if (!isProjectActive(p.status)) return false
        // P2-9: ONE staleness basis = days-since-meaningful-movement, gated by
        // the shared projectStaleDays pref (Settings → Lab Preferences). Falls
        // back to updated_at when last_meaningful_movement isn't populated.
        const movedAt = p.last_meaningful_movement || p.updated_at
        const isStale = daysSince(movedAt) >= prefs.projectStaleDays
        // Health score keeps its other inputs, but staleness is reconciled to
        // the shared threshold above — a project needs attention if it's stale
        // OR its overall health is low.
        const h = healthBySlug.get(p.slug)
        const lowHealth = !!h && h.score < 50
        return isStale || lowHealth
      })
    }
    else base = projects.filter((p) => p.category === activeCategory)
    return [...base].sort((a, b) => {
      const pinCmp =
        (pinnedSlugs.has(a.slug) ? 0 : 1) - (pinnedSlugs.has(b.slug) ? 0 : 1)
      // Pinned always first — EXCEPT when explicitly grouped by stage (#91):
      // pin-priority there splits same-stage rows into two non-adjacent
      // runs, producing a duplicate stage-group header lower in the list.
      // Stage sort keeps pin only as a within-stage tiebreak below.
      if (sortKey !== 'stage' && pinCmp !== 0) return pinCmp
      let cmp = 0
      switch (sortKey) {
        case 'title': cmp = a.title.localeCompare(b.title); break
        case 'status': cmp = (a.status || '').localeCompare(b.status || ''); break
        case 'stage': {
          // #91-class fix, now structural (Hub #361a): project.stage is
          // normalized at ingress (rowToProject), so raw legacy Title-Case
          // values can no longer reach this comparison — no per-read
          // normalize() call needed to avoid the "multiple idea sections" bug.
          const stageA = STAGE_ORDER[a.stage || ''] ?? 99
          const stageB = STAGE_ORDER[b.stage || ''] ?? 99
          cmp = stageA - stageB
          if (cmp === 0) cmp = pinCmp
          break
        }
        case 'pi': cmp = (a.pi || '').localeCompare(b.pi || ''); break
        case 'category': cmp = (a.category || '').localeCompare(b.category || ''); break
        case 'activity': {
          // Most recent real movement first — newest of {lastActivity,
          // last_meaningful_movement}, updated_at only as a last resort.
          // See projectRecencyMs above for why the old first-truthy chain
          // (a stale lastActivity shadowing fresher movement) buried
          // actively-worked projects.
          const tA = projectRecencyMs(a)
          const tB = projectRecencyMs(b)
          cmp = tB - tA
          break
        }
      }
      if (cmp === 0) cmp = a.title.localeCompare(b.title)
      return sortAsc ? cmp : -cmp
    })
  }, [activeCategory, projects, sortKey, sortAsc, pinnedSlugs, healthBySlug, prefs.projectStaleDays])

  // Project slugs in display order for keyboard nav
  const projectSlugs = useMemo(() => filtered.map((p) => p.slug), [filtered])

  // Reset focus when filter/view changes. Adjusted during render (React's
  // "adjusting state based on a prop change" pattern:
  // https://react.dev/learn/you-might-not-need-an-effect) instead of an
  // effect, avoiding an extra commit-then-effect cascade.
  const focusResetKey = `${activeCategory}|${viewMode}`
  const [prevFocusResetKey, setPrevFocusResetKey] = useState(focusResetKey)
  if (focusResetKey !== prevFocusResetKey) {
    setPrevFocusResetKey(focusResetKey)
    setFocusedIndex(-1)
  }

  // Dynamic page title
  useEffect(() => {
    const active = projects.filter(p => isProjectActive(p.status)).length
    document.title = `Projects (${active} active) | MN-CCORE`
    return () => { document.title = 'MN-CCORE Lab Hub' }
  }, [projects])

  // Keyboard navigation (list view only)
  useProjectKeyboardNav({
    projectCount: filtered.length,
    focusedIndex,
    setFocusedIndex,
    slugs: projectSlugs,
    enabled: viewMode === 'list' && !showCreate,
    togglePin,
  })

  // Scroll focused row into view — KEEP: this is keyboard-cursor nav only.
  // focusedIndex is driven by j/k/ArrowUp/ArrowDown in useProjectKeyboardNav;
  // mouse clicks do NOT change focusedIndex, so no viewport jerk on click.
  // block:'nearest' is correct (only scrolls if row is outside visible area).
  const setRowRef = useCallback((index: number) => (el: HTMLDivElement | null) => {
    rowRefs.current[index] = el
  }, [])

  useEffect(() => {
    if (focusedIndex >= 0 && rowRefs.current[focusedIndex]) {
      rowRefs.current[focusedIndex]!.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [focusedIndex])

  // Summary stats — 3-bucket canonical (Stage 4 #12-followup, 2026-05-08)
  const totalCount = projects.length
  const mncoreCount = projects.filter((p) => p.category === 'MNCCORE').length
  const clifCount = projects.filter((p) => p.category === 'CLIF').length
  const pbCount = projects.filter((p) => p.category === 'Peripheral Brain').length


  return (
    <>
    <DataPage
      icon={<FolderKanban {...ICON_PROPS} size={20} />}
      title="Research Pipeline"
      actions={
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg new-project-btn"
          style={{
            background: 'transparent',
            color: 'var(--teal)',
            fontSize: '13px',
            fontWeight: 600,
            border: '1px solid var(--border-subtle)',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          <Plus {...ICON_PROPS} size={14} />
          New Project
        </button>
      }
      views={[
        { key: 'list', icon: <List {...ICON_PROPS} size={14} />, label: 'List' },
        { key: 'pipeline', icon: <LayoutGrid {...ICON_PROPS} size={14} />, label: 'Pipeline' },
      ]}
      activeView={viewMode}
      onViewChange={(v) => setViewMode(v as 'list' | 'pipeline')}
      /* 2026-06-10b (Nick): the Pipeline kanban is WIDE multi-column content —
         let it grow rightward to fit (anchored left edge, fluid right) instead
         of cramming 7 stages into --col-main and h-scrolling inside the band.
         #91 (Nick 2026-06-24): the List/table now also grows wide ("the whole
         width can likely be longer") — the 3fr Title column absorbs the room. */
      wideBody={true}
      filters={
        <>
          {/* S21: removed the "Try Pipeline view" promo coach-mark — it rendered
              inline in the toolbar and occluded the Pipeline toggle mid-word.
              The Pipeline view toggle (above) is already visible chrome. */}
          {CATEGORY_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveCategory(f.key)}
              className="cursor-pointer inline-flex items-center px-2.5 py-1 text-xs filter-pill"
              // N1b — locked-canon ghost pill: active = teal tint + teal text,
              // never a solid fill block in a toolbar.
              style={{
                fontWeight: activeCategory === f.key ? 600 : ('var(--label-weight)' as React.CSSProperties['fontWeight']),
                fontSize: 'var(--label-size)',
                borderRadius: 'var(--radius-full)',
                background: activeCategory === f.key ? 'var(--teal-active)' : 'transparent',
                color: activeCategory === f.key ? 'var(--teal)' : 'var(--slate)',
                border: '1px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {f.label}
            </button>
          ))}
        </>
      }
      rightExtra={
        <>
          <span
            className="text-xs"
            style={{
              color: 'var(--slate)',
              whiteSpace: 'nowrap',
            }}
          >
              {totalCount} projects &middot; {mncoreCount} MN-CCORE &middot; {clifCount} CLIF{pbCount > 0 ? ` \u00b7 ${pbCount} PB` : ''}
          </span>
          {viewMode === 'pipeline' && (
            <button
              type="button"
              onClick={() => setShowDeps(!showDeps)}
              className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
              style={{
                fontSize: 'var(--label-size)',
                fontWeight: showDeps ? 600 : ('var(--label-weight)' as React.CSSProperties['fontWeight']),
                background: showDeps ? 'var(--teal-active)' : 'transparent',
                color: 'var(--teal)',
                border: '1px solid transparent',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              <GitBranch {...ICON_PROPS} size={12} />
              Dependencies
            </button>
          )}
        </>
      }
      beforeBody={
        /* Dependency map (collapsible, pipeline only) */
        <AnimatePresence>
          {showDeps && viewMode === 'pipeline' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              style={{ overflow: 'hidden', marginBottom: '1.5rem', position: 'relative' }}
            >
              <ProjectDependencyMap projects={filtered} dependencies={dependencies} />
            </motion.div>
          )}
        </AnimatePresence>
      }
    >
        {/* ─── LIST VIEW ─── */}
        {viewMode === 'list' && (
          <TableContainer>

            {/* Table header */}
            <div
              className="hidden md:grid"
              style={{
                /* #91 (Nick 2026-06-24): header grid must match the ROW grid —
                   the row has a trailing 52px Links/Work column the header
                   lacked, so columns drifted out of alignment. */
                gridTemplateColumns: 'minmax(320px, 3fr) 110px 110px 120px 80px 90px 52px',
                padding: 'var(--sp-sm) var(--sp-xl)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              {([['Title', 'title'], ['Status', 'status'], ['Stage', 'stage'], ['PI', 'pi'], ['Group', 'category']] as const).map(([label, key]) => (
                <ColumnHeader
                  key={key}
                  label={label}
                  sortKey={key}
                  currentSort={sortKey}
                  sortAsc={sortAsc}
                  onSort={(k) => toggleSort(k as ProjectSortKey)}
                />
              ))}
              {/* Links column — not sortable; plain label matches ColumnHeader visual style */}
              <span
                style={{
                  fontSize: 'var(--label-size)',
                  fontWeight: 'var(--label-weight)',
                  color: 'var(--slate)',
                  opacity: 'var(--ink-label)',
                  userSelect: 'none',
                }}
              >
                Links
              </span>
            </div>

            {/* Stage-grouped rows with stagger animation */}
            {filtered.length > 0 ? (
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {(() => {
                  let lastStage = ''
                  return filtered.map((project, index) => {
                    const projectHealth = healthBySlug.get(project.slug)
                    // #91-class fix, now structural (Hub #361a): project.stage
                    // is already canonical at ingress, so a legacy-cased value
                    // ("Idea") can no longer diverge from its canonical form
                    // ("idea") here — no per-read normalize() needed to avoid
                    // splitting one group into two identical-looking headers.
                    const normalizedStage = project.stage || ''
                    const showStageHeader = normalizedStage !== lastStage
                    lastStage = normalizedStage
                    const isFocused = focusedIndex === index

                    return (
                      <motion.div key={project.slug} variants={staggerItem} ref={setRowRef(index)}>
                        {/* Stage group divider — minimal, just text */}
                        {showStageHeader && sortKey === 'stage' && (
                          <div
                            className="flex items-center"
                            style={{
                              padding: '20px 16px 8px',
                              gap: 'var(--sp-sm)',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 'var(--label-size)',
                                fontWeight: 'var(--label-weight)',
                                color: 'var(--slate)',
                                opacity: 'var(--ink-label)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                flexShrink: 0,
                              }}
                            >
                              {stageLabel(project.stage)}
                            </span>
                            <span
                              style={{
                                fontSize: 'var(--label-size)',
                                color: 'var(--slate)',
                                opacity: 0.75,
                                flexShrink: 0,
                              }}
                            >
                              {filtered.filter((p) => (p.stage || '') === normalizedStage).length}
                            </span>
                            <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                          </div>
                        )}

                        <Link
                          to={PATHS.project(project.slug)}
                          style={{ textDecoration: 'none', display: 'block' }}
                          onClick={() => setFocusedIndex(index)}
                        >
                          {/* Desktop: 5-column grid */}
                          <div
                            className={`project-list-row${isFocused ? ' project-row-focused' : ''} hidden md:grid`}
                            style={{
                              gridTemplateColumns: 'minmax(320px, 3fr) 110px 110px 120px 80px 90px 52px',
                              padding: `var(--row-padding-y) 24px`,
                              borderBottom: '1px solid var(--border-subtle)',
                              // Plain centering is correct again now that the title
                              // cell is a single line (short_name moved to the hover
                              // tip). Every cell is one line, so they all center on
                              // the same axis — measured identical text centers across
                              // Title/Status/Stage/PI/Group. The earlier align-items:
                              // start was only needed to cope with the two-line title
                              // cell overflowing the fixed row height.
                              alignItems: 'center',
                              cursor: 'pointer',
                              transition: 'background var(--duration-fast) ease-out',
                            }}
                          >
                            {/* Title with pin star, category dot, and health indicator */}
                            <div className="flex items-center gap-2.5" style={{ paddingRight: 'var(--sp-lg)' }}>
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(project.slug) }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: 0,
                                  flexShrink: 0,
                                  color: pinnedSlugs.has(project.slug) ? 'var(--gold)' : 'var(--slate)',
                                  // S21/P1-11: a 0.15 pin star was an invisible
                                  // affordance (especially on touch). Raise the
                                  // resting floor to discoverable-but-quiet.
                                  opacity: pinnedSlugs.has(project.slug) ? 1 : 0.45,
                                  transition: 'opacity 150ms ease, color 150ms ease',
                                  lineHeight: 0,
                                }}
                                onMouseOver={(e) => { if (!pinnedSlugs.has(project.slug)) e.currentTarget.style.opacity = '0.75' }}
                                onMouseOut={(e) => { if (!pinnedSlugs.has(project.slug)) e.currentTarget.style.opacity = '0.45' }}
                                className="tip"
                                data-tip={pinnedSlugs.has(project.slug) ? 'Unpin project' : 'Pin to top'}
                                aria-label={pinnedSlugs.has(project.slug) ? 'Unpin project' : 'Pin to top'}
                              >
                                <Star {...ICON_PROPS} size={12} fill={pinnedSlugs.has(project.slug) ? 'var(--gold)' : 'none'} />
                              </button>
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: 'var(--radius-circle)',
                                  background: CATEGORY_DOT[project.category] ?? 'var(--slate)',
                                  flexShrink: 0,
                                  opacity: 0.85,
                                  marginTop: '-1px',
                                }}
                              />
                              {/* Nick 2026-07-21: the title cell is ONE line, and
                                  short_name moved onto the hover tip. It used to be a
                                  two-line stack, which made the cell ~36px of content
                                  inside a row locked to 44px with 11px padding — a
                                  22px box. The overflow meant the row's border-bottom,
                                  painted at the row edge, cut straight THROUGH the
                                  short_name, and no single-line value column could
                                  ever align with the title (they centered in the gap
                                  between the two lines). One line makes the 44px row
                                  honest: content clears the divider by 12px and plain
                                  align-items:center lands every column on one line. */}
                              {/* data-tip sits on the TITLE TEXT, not this wrapper
                                  (Nick 2026-07-21: "hover should only be if i am ON
                                  the title... not the whole box"). The wrapper is
                                  flex:1 so it spans the rest of the 817px column and
                                  pushes the trailing badges right — putting the tip on
                                  it armed that entire empty run as a hover target.
                                  The old reason for hanging it here is DEAD: it dodged
                                  the CSS `.tip::after`, which the inner span's
                                  overflow:hidden would clip. Tooltips now render
                                  through TooltipLayer — a position:fixed chip in a body
                                  portal that escapes every overflow ancestor — so the
                                  clipping element is a perfectly good trigger.
                                  Wrapper is display:flex so the inner span shrink-wraps
                                  to its TEXT (a flex item sizes to content) instead of
                                  filling the row as a block; minWidth:0 still lets it
                                  shrink so the ellipsis engages. */}
                              <span style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center' }}>
                                <span
                                  className="tip"
                                  data-tip={(() => {
                                    const clean = stripConsortiumPrefix(project.title).clean
                                    // Plenty of projects set short_name to the title
                                    // verbatim; appending it there reads as a stutter
                                    // ("Teaching · Teaching"), so only add it when it
                                    // actually carries something the title doesn't.
                                    const short = project.short_name?.trim()
                                    return short && short !== clean ? `${clean} · ${short}` : clean
                                  })()}
                                  style={{
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: 'var(--ink)',
                                    lineHeight: 1.35,
                                    minWidth: 0,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                  aria-label={stripConsortiumPrefix(project.title).clean}
                                >
                                  {stripConsortiumPrefix(project.title).clean}
                                </span>
                              </span>
                              {/* Task count badge */}
                              {(() => {
                                const tc = taskCountByProject.get(project.slug) || 0
                                return tc > 0 ? (
                                  <span className="tip" style={{ fontSize: '10px', color: 'var(--teal)', flexShrink: 0 }} data-tip={`${tc} open task${tc !== 1 ? 's' : ''}`} aria-label={`${tc} open task${tc !== 1 ? 's' : ''}`}>
                                    {tc}
                                  </span>
                                ) : null
                              })()}
                              {projectHealth && (
                                <span
                                  data-tip={`Health: ${projectHealth.score}/100 — ${projectHealth.status}`}
                                  aria-label={`Health: ${projectHealth.score}/100 — ${projectHealth.status}`}
                                  className="inline-flex items-center gap-1 tip"
                                  style={{ flexShrink: 0, marginLeft: '-2px' }}
                                >
                                  <span style={{
                                    width: 24,
                                    height: 4,
                                    borderRadius: 'var(--radius-sm)',
                                    background: 'var(--border-subtle)',
                                    overflow: 'hidden',
                                    display: 'inline-block',
                                  }}>
                                    <span style={{
                                      display: 'block',
                                      width: `${Math.min(projectHealth.score, 100)}%`,
                                      height: '100%',
                                      borderRadius: 'var(--radius-sm)',
                                      background: HEALTH_STATUS_COLOR[projectHealth.status] ?? 'var(--slate)',
                                      transition: 'width 300ms ease',
                                    }} />
                                  </span>
                                </span>
                              )}
                              {/* Stage progress dots */}
                              <span className="inline-flex items-center gap-0.5 ml-1 tip" data-tip={`Stage: ${project.stage || 'idea'}`} aria-label={`Stage: ${project.stage || 'idea'}`}>
                                {STAGES.map((s, si) => {
                                  // Brain.db granular stages → 6-stage canonical (P2-R2-14)
                                  const currentIdx = stageIndex(project.stage)
                                  return (
                                    <span
                                      key={s}
                                      style={{
                                        width: 4,
                                        height: 4,
                                        borderRadius: 'var(--radius-circle)',
                                        background: si <= currentIdx ? 'var(--teal-solid)' : 'var(--border-subtle)',
                                        opacity: si <= currentIdx ? 0.8 : 0.85,
                                      }}
                                    />
                                  )
                                })}
                              </span>
                              {/* Last activity / staleness indicator */}
                              {project.lastActivity && (() => {
                                const days = Math.floor((Date.now() - parseDbUtc(project.lastActivity).getTime()) / 86400000)
                                if (days < 7) return null
                                return (
                                  <span style={{
                                    fontSize: '10px',
                                    color: days > 30 ? 'var(--maroon)' : days > 14 ? 'var(--orange)' : 'var(--slate)',
                                    opacity: 0.85,
                                    flexShrink: 0,
                                  }} className="tip" data-tip={`Last activity ${days} days ago`} aria-label={`Last activity ${days} days ago`}>
                                    {days}d ago
                                  </span>
                                )
                              })()}
                            </div>

                            {/* Status (inline editable) */}
                            <InlineSelect
                              value={normalizeProjectStatus(project.status)}
                              options={PROJECT_STATUS_OPTIONS}
                              onChange={(val) => inlineUpdate.mutate({ slug: project.slug, fields: { status: val } })}
                            />

                            {/* Stage (inline editable) — S17: instant + undo */}
                            <InlineSelect
                              value={project.stage || 'idea'}
                              options={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
                              onChange={(val) => handleStageChange(project.slug, val, project.stage)}
                            />

                            {/* PI (inline editable) — S19: resolve the current
                                value through displayName so a non-director slug
                                (e.g. "nick") never renders raw in the cell. */}
                            {/* The wrapper exists only to swallow the click so the row
                                Link doesn't navigate — it must not also change layout.
                                As a bare block it left PI/Group as the only two value
                                columns NOT flex-centered, sitting 2px below Status and
                                Stage and visibly breaking the value line. */}
                            <div className="flex items-center" onClick={(e) => e.preventDefault()}>
                              <InlineSelect
                                value={project.pi || ''}
                                options={piOptions(project.pi)}
                                onChange={(val) => inlineUpdate.mutate({ slug: project.slug, fields: { pi: val } })}
                              />
                            </div>

                            {/* Category (inline editable) — 3-bucket canonical */}
                            <div className="flex items-center" onClick={(e) => e.preventDefault()}>
                              <InlineSelect
                                value={project.category || ''}
                                options={[
                                  { value: 'MNCCORE', label: 'MN-CCORE', color: 'var(--teal)' },
                                  { value: 'CLIF', label: 'CLIF', color: 'var(--maroon)' },
                                  { value: 'Peripheral Brain', label: 'Peripheral Brain', color: 'var(--slate)' },
                                ]}
                                onChange={(val) => inlineUpdate.mutate({ slug: project.slug, fields: { category: val } })}
                              />
                            </div>

                            {/* Links — Mode-B icon-only, borderless, stopPropagation handled inside */}
                            <ProjectLinksCell links={allProjectLinks[project.id ?? ''] ?? []} />
                            {/* WorkOnActions compact — only when project has a folder.
                                stopPropagation + preventDefault prevents Link navigation. */}
                            <div
                              onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                              onMouseDown={(e) => e.stopPropagation()}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}
                            >
                              {project.primary_folder && (
                                <WorkOnActions primaryFolder={project.primary_folder} projectLabel={project.short_name || project.title} variant="compact" />
                              )}
                            </div>
                          </div>

                          {/* Mobile: stacked card layout */}
                          <div
                            className={`project-list-row${isFocused ? ' project-row-focused' : ''} md:hidden`}
                            style={{
                              padding: `var(--row-padding-y) 16px`,
                              borderBottom: '1px solid var(--border-subtle)',
                              cursor: 'pointer',
                              transition: 'background var(--duration-fast) ease-out',
                            }}
                          >
                            {/* Title row */}
                            <div className="flex items-start gap-2" style={{ marginBottom: 'var(--sp-sm)' }}>
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: 'var(--radius-circle)',
                                  background: CATEGORY_DOT[project.category] ?? 'var(--slate)',
                                  flexShrink: 0,
                                  opacity: 0.85,
                                  marginTop: '6px',
                                }}
                              />
                              <span
                                style={{
                                  fontSize: '14px',
                                  fontWeight: 500,
                                  color: 'var(--ink)',
                                  lineHeight: 1.35,
                                  flex: 1,
                                }}
                              >
                                {stripConsortiumPrefix(project.title).clean}
                                {project.short_name && (
                                  <span style={{
                                    fontSize: '11px',
                                    color: 'var(--slate)',
                                    opacity: 0.75,
                                    display: 'block',
                                    marginTop: '1px',
                                  }}>
                                    {project.short_name}
                                  </span>
                                )}
                              </span>
                              {projectHealth && (
                                <span
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: 'var(--radius-circle)',
                                    background: HEALTH_STATUS_COLOR[projectHealth.status] ?? 'var(--slate)',
                                    flexShrink: 0,
                                    marginTop: '6px',
                                  }}
                                />
                              )}
                            </div>
                            {/* Metadata row */}
                            <div className="flex items-center gap-3" style={{ paddingLeft: '14px' }}>
                              <InlineSelect
                                value={normalizeProjectStatus(project.status)}
                                options={PROJECT_STATUS_OPTIONS}
                                onChange={(val) => inlineUpdate.mutate({ slug: project.slug, fields: { status: val } })}
                              />
                              <InlineSelect
                                value={project.stage || 'idea'}
                                options={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
                                onChange={(val) => handleStageChange(project.slug, val, project.stage)}
                              />
                              <div onClick={(e) => e.preventDefault()} style={{ marginLeft: 'auto' }}>
                                <InlineSelect
                                  value={project.category || ''}
                                  options={[
                                    { value: 'MNCCORE', label: 'MN-CCORE', color: 'var(--teal)' },
                                    { value: 'CLIF', label: 'CLIF', color: 'var(--maroon)' },
                                    { value: 'Peripheral Brain', label: 'Peripheral Brain', color: 'var(--slate)' },
                                  ]}
                                  onChange={(val) => inlineUpdate.mutate({ slug: project.slug, fields: { category: val } })}
                                />
                              </div>
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    )
                  })
                })()}
              </motion.div>
            ) : (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: '14px',
                    color: 'var(--slate)',
                    opacity: 'var(--ink-label)',
                  }}
                >
                  No projects in this category
                </span>
              </div>
            )}

            {/* Calculations row */}
            {filtered.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--sp-xl)',
                  padding: 'var(--sp-sm) var(--sp-xl)',
                  borderTop: '1px solid var(--border-subtle)',
                  background: 'var(--teal-hover)',
                }}
              >
                {[
                  { label: 'Count', value: filtered.length },
                  // #91-class fix, now structural (Hub #361a): bucket by
                  // project.stage directly — ingress normalization means a
                  // legacy Title-Case alias ("Idea") can no longer fragment
                  // one logical stage into two separate count entries.
                  ...Object.entries(
                    filtered.reduce((acc, p) => {
                      const stage = p.stage || 'Unknown'
                      acc[stage] = (acc[stage] || 0) + 1
                      return acc
                    }, {} as Record<string, number>)
                  ).map(([stage, count]) => ({ label: stageLabel(stage), value: count })),
                ].map(s => (
                  <span key={s.label} style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                    {s.label}{' '}
                    <span style={{ fontWeight: 600, opacity: 1 }}>{s.value}</span>
                  </span>
                ))}
              </div>
            )}
          </TableContainer>
        )}

        {/* ─── PIPELINE VIEW ─── */}
        {viewMode === 'pipeline' && (
          <>
            {/* Stage progression line (desktop) */}
            <div
              className="hidden md:block mb-2"
              style={{ position: 'relative', height: '2px' }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '2%',
                  right: '2%',
                  height: '2px',
                  background: 'linear-gradient(to right, rgba(45,138,138,0.1), var(--teal), rgba(45,138,138,0.1))',
                  borderRadius: 'var(--radius-sm)',
                }}
              />
              {STAGES.map((_, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    top: '-3px',
                    left: `${(i / (STAGES.length - 1)) * 96 + 2}%`,
                    width: '8px',
                    height: '8px',
                    borderRadius: 'var(--radius-circle)',
                    background: 'var(--teal-solid)',
                    border: '2px solid var(--cream)',
                  }}
                />
              ))}
            </div>

            {/* Pipeline columns */}
            <div
              className="pipeline-board"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${STAGES.length}, minmax(160px, 1fr))`,
                gap: 'var(--sp-lg)',
                overflowX: 'auto',
                paddingBottom: '1rem',
                maxWidth: '100%',
              }}
            >
              {STAGES.map((stage) => {
                const stageProjects = getStageProjects(stage, filtered)
                return (
                  <div
                    key={stage}
                    className="pipeline-column"
                    style={{
                      background: 'var(--ice)',
                      borderRadius: 'var(--radius-xl)',
                      borderTop: '2px solid var(--teal)',
                      padding: 'var(--sp-lg)',
                      minHeight: '300px',
                      minWidth: '200px',
                    }}
                  >
                    {/* Column header */}
                    <div style={{ marginBottom: '14px' }}>
                      <div className="flex items-center justify-between">
                        <h3
                          style={{
                            fontWeight: 400,
                            fontSize: '13px',
                            color: 'var(--ink)',
                            margin: 0,
                          }}
                        >
                          {stage}
                        </h3>
                        <span
                          style={{
                            fontSize: 'var(--label-size)',
                            color: 'var(--slate)',
                            opacity: 'var(--ink-label)',
                            fontWeight: 'var(--label-weight)',
                          }}
                        >
                          {stageProjects.length}
                        </span>
                      </div>
                    </div>

                    {/* Cards with stagger animation */}
                    <motion.div
                      className="flex flex-col"
                      style={{ gap: 'var(--sp-md)' }}
                      variants={staggerContainer}
                      initial="hidden"
                      animate="visible"
                    >
                      <AnimatePresence mode="popLayout">
                        {stageProjects.length > 0 ? (
                          stageProjects.map((project) => (
                            <motion.div key={project.slug} variants={staggerItem}>
                              <ProjectCard
                                project={project}
                              />
                            </motion.div>
                          ))
                        ) : (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{
                              padding: 'var(--sp-2xl) var(--sp-md)',
                              textAlign: 'center',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 'var(--label-size)',
                                color: 'var(--slate)',
                                opacity: 'var(--ink-label)',
                              }}
                            >
                              No projects
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </DataPage>

      {/* Create Project Modal */}
      <CreateProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={(input) => createProject.mutate(input)}
      />

      {/* Scoped styles */}
      <style>{`
        .pipeline-board {
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: var(--teal) transparent;
        }
        .pipeline-board::-webkit-scrollbar {
          height: 6px;
        }
        .pipeline-board::-webkit-scrollbar-track {
          background: transparent;
        }
        .pipeline-board::-webkit-scrollbar-thumb {
          background: rgba(45, 138, 138, 0.3);
          border-radius: 3px;
        }

        .project-list-row:hover {
          background: var(--gold-hover) !important;
          transition: background var(--duration-fast) ease-out !important;
        }
        .project-list-row:active {
          background: var(--gold-active) !important;
          transition: background 0.05s ease-out !important;
        }

        .project-row-focused {
          position: relative;
          background: var(--gold-hover) !important;
        }
        .project-row-focused::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 2px;
          background: var(--gold);
          border-radius: 0 1px 1px 0;
        }

        .new-project-btn:hover {
          background: var(--teal-hover) !important;
        }

        .filter-pill:hover {
          background: ${withAlpha(PANEL_BG, 4)};
        }

        /* Dark mode overrides */
        .dark .pipeline-column {
          background-color: var(--cream) !important; background-image: linear-gradient(var(--surface-2), var(--surface-2)) !important;
        }
        .dark .project-card {
          background-color: var(--cream) !important; background-image: linear-gradient(var(--surface-1), var(--surface-1)) !important;
        }
        .dark .project-card:hover {
          background-image: linear-gradient(var(--surface-3), var(--surface-3)) !important;
        }
        .dark .project-row-focused {
          background: var(--gold-hover) !important;
        }
        .dark .project-list-row:hover {
          background: var(--gold-active) !important;
        }
        .dark .project-list-row:active {
          background: var(--gold-emphasis) !important;
        }
      `}</style>
    </>
  )
}

