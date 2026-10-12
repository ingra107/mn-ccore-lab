import { useState, useMemo, useCallback } from 'react'
import { portalTitle } from '../constants/pageLabels'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GitBranch, Plus, List, LayoutGrid } from 'lucide-react'
import { stageLabel } from '../lib/stageNormalize'
import { pipelineOffNote, pipelinePlaceOf } from '../lib/pipelinePlace'
import { usePageMeta } from '../hooks/usePageMeta'
import { useProjects, useDependencies, useProjectHealth, useTasks, useAllProjectLinks, useAllProjectPublications } from '../hooks/useApiData'
import { useLabPrefs } from '../hooks/useLabPrefs'
import { daysSince } from '../lib/taskGrouping'
import { parseDbUtc } from '../lib/time'
import { useCreateProject, useUpdateProjectFields } from '../hooks/useMutations'
import { isProjectActive, isProjectDone, isProjectFinished, isStalledProject } from '../lib/taskConstants'
import ProjectCard from '../components/ProjectCard'
import ProjectDependencyMap from '../components/ProjectDependencyMap'
import CreateProjectModal from '../components/CreateProjectModal'
import DataPage from '../components/DataPage'
import { TableSkeleton } from '../components/LoadingSkeleton'
import type { Project } from '../data/types'
import { staggerContainer, staggerItem } from '../lib/animations'
import { ICON_PROPS } from '../lib/iconProps'
import { AllProjectsBanner, AllProjectsSwitch } from '../components/AllProjectsControls'
import { useAllProjectsOn } from '../lib/allProjects'
import { useAuth } from '../hooks/useAuth'
import { useProjectPins } from '../hooks/useProjectPins'
import { mutedCategoryOptions, isPoorHealth, projectRowName } from '../lib/projectListOptions'
import { useAllProjectProducts } from '../hooks/useProjectProducts'
import { homeOf, type ProductRow, type ProductsByProject } from '../lib/products'
import ProjectSleekList from '../components/project/ProjectSleekList'
import type { SleekSort } from '../components/table/SleekRows'

// Values are D1 lowercase canonical; labels are Title Case for display.
const STAGES = ['idea', 'data_collection', 'analysis', 'writing', 'review', 'revisions', 'published'] as const
type Stage = (typeof STAGES)[number]

// Stage 4 #12-followup (2026-05-08): 3-bucket canonical categories.
// 'stale' is a pseudo-filter (P2-9: stale-by-shared-threshold OR health < 50),
// not a real category value.
const CATEGORY_FILTERS = [
  { key: 'all', label: 'All groups' },
  { key: 'MNCCORE', label: 'MN-CCORE' },
  { key: 'CLIF', label: 'CLIF' },
  { key: 'Peripheral Brain', label: 'Peripheral Brain' },
  { key: 'stale', label: 'Needs Attention' },
] as const

// F8 (2026-10-09): the API never returns a 'Peripheral Brain' project to a
// non-PI, so for a member that filter pill could never match, and choosing it
// in the inline category picker would be refused by the server. Both are
// shown to a PI only. Display only -- the visibility rule lives in the API.
const PB_CATEGORY = 'Peripheral Brain'
const CATEGORY_OPTIONS = [
  { value: 'MNCCORE', label: 'MN-CCORE', color: 'var(--sk-t3)' },
  { value: 'CLIF', label: 'CLIF', color: 'var(--sk-t3)' },
  { value: PB_CATEGORY, label: 'Peripheral Brain', color: 'var(--slate)' },
]

// #123 (Nick 2026-09-08): the page had no way to hide finished projects — 11 of
// 92 rows in prod were status='done'. 'open' is every project not finished
// (active, blocked, waiting_external). #130 (Nick 2026-09-16) added 'active'
// between it and 'all': status='active' only, the same isProjectActive()
// predicate the health widgets use, so waiting and blocked rows drop out.
// 'all' is the escape hatch. 'done' (Nick, same day) = finished work: status
// done OR stage published, so a published project still marked active shows
// up where he goes looking for its paper.
const STATUS_FILTERS = [
  { key: 'open', label: 'Open', title: 'Active, blocked and waiting — everything not finished' },
  { key: 'active', label: 'Active', title: 'Active only — no waiting or blocked' },
  { key: 'all', label: 'Any status', title: 'Every project, including finished ones' },
  { key: 'done', label: 'Done', title: 'Finished — status done or stage published' },
] as const

function statusScope(status: string, projects: Project[]): Project[] {
  if (status === 'all') return projects
  if (status === 'active') return projects.filter((p) => isProjectActive(p.status))
  if (status === 'done') return projects.filter(isProjectFinished)
  return projects.filter((p) => !isProjectDone(p.status))
}

const STAGE_ORDER: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s, i]))

/** The stage a list row is sorted, grouped and counted under: its home
 *  product's (or only product's) stage. A project with 2+ products and no home
 *  groups as "Several products"; one with no product (before Backfill A)
 *  keeps its own project stage. Keys are kind-qualified, so a manuscript's
 *  "Submitted" and a grant application's "Submitted" are separate groups. */
function listStageOf(p: Project, products: ProductRow[] | undefined): { key: string; label: string; order: number } {
  const home = homeOf(products)
  if (home) {
    return {
      key: `${home.kind}:${home.stage}`,
      label: home.kind === 'manuscript' ? home.stage_label : `${home.kind_label} · ${home.stage_label}`,
      order: (home.kind_sort ?? 0) * 1000 + home.stage_ordinal,
    }
  }
  if (products && products.length > 1) return { key: '_several', label: 'Several products', order: 900_000 }
  return { key: `_project:${p.stage ?? ''}`, label: stageLabel(p.stage || '') || 'No stage', order: 950_000 + (STAGE_ORDER[p.stage || ''] ?? 99) }
}

// One definition serves both filter axes (#123): a .tk-flt link, so the second
// group cannot drift from the first. Render inside a .tk-flt wrapper.
function FilterPill({ label, active, onClick, title }: { label: string; active: boolean; onClick: () => void; title?: string }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={active}>
      {label}
    </button>
  )
}

function getStageProjects(stage: Stage, filtered: Project[], productsByProject: ProductsByProject['byProject']): Project[] {
  return filtered.filter((p) => {
    const place = pipelinePlaceOf(p, productsByProject[p.id ?? ''], STAGES)
    return 'stage' in place && place.stage === stage
  })
}

// "Most recent activity" sort key. lastActivity already IS the newer of the
// activity rollup and last_meaningful_movement -- the API merges them once
// (api/lib/project-recency.ts, PB #8236), so the chip, the Today page and this
// sort all read one value. (Until 2026-10-05 this function did the merge itself
// and was the only consumer that did; a project worked only through PB field
// writes sorted fresh here and read "140d ago" on the chip beside it.) Fall
// back to updated_at ONLY when lastActivity is absent -- updated_at is a
// row-touch stamp any sync write bumps, so it must never promote a project on
// its own. parseDbUtc (not Date.parse): bare D1 stamps are UTC and native
// parsing would read them as local.
function projectRecencyMs(p: Project): number {
  const ms = (v: string | null | undefined): number => {
    const t = parseDbUtc(v).getTime()
    return Number.isNaN(t) ? 0 : t
  }
  return ms(p.lastActivity) || ms(p.updated_at)
}

export default function Projects() {
  const allProjectsOn = useAllProjectsOn()
  const isPi = useAuth().user.isPi
  const { data: projects = [], isLoading: projectsLoading } = useProjects()
  // One title writer (D3(a)): this used to race a second raw document.title
  // effect, so the tab read "My projects" or "Projects (N active)" depending
  // on which ran last.
  const activeProjectCount = projects.filter((p) => isProjectActive(p.status)).length
  usePageMeta(
    portalTitle('Projects', `${activeProjectCount} active`),
    isPi
      ? 'Track MN-CCORE research projects from idea to publication across MN-CCORE, CLIF, and Peripheral Brain buckets.'
      : 'Track MN-CCORE research projects from idea to publication across MN-CCORE and CLIF.'
  )
  const categoryFilters = useMemo(
    () => CATEGORY_FILTERS.filter((f) => isPi || f.key !== PB_CATEGORY),
    [isPi],
  )
  const categoryOptions = useMemo(
    () => CATEGORY_OPTIONS.filter((o) => isPi || o.value !== PB_CATEGORY),
    [isPi],
  )
  // The list shows group as muted t3 text, not teal / maroon words. The colored
  // CATEGORY_OPTIONS stay for any surface that wants them.
  const categoryListOptions = useMemo(() => mutedCategoryOptions(categoryOptions), [categoryOptions])

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
  const { data: publicationsBySlug } = useAllProjectPublications()
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
  const inlineUpdate = useUpdateProjectFields()
  const onFieldChange = useCallback((slug: string, fields: Record<string, string>) => {
    inlineUpdate.mutate({ slug, fields })
  }, [inlineUpdate])
  // The Stage column is the project's products (one: a ladder, 2+: chips);
  // a stage is set on a product, never on the project (plan step 8).
  const { data: productData } = useAllProjectProducts()
  const productsByProject = useMemo(() => productData?.byProject ?? {}, [productData])
  const productKinds = useMemo(() => productData?.kinds ?? [], [productData])
  const stageOf = useCallback(
    (p: Project) => listStageOf(p, productsByProject[p.id ?? '']),
    [productsByProject],
  )

  // S10: category is URL-backed so ⌘K "Filter CLIF Projects" (which navigates
  // to PATHS.projects + '?category=CLIF') lands pre-filtered, and saved/shared
  // links round-trip. Same pattern ManuscriptsPage uses. Absent param = 'all'.
  const [searchParams, setSearchParams] = useSearchParams()
  const VALID_CATEGORY_KEYS = useMemo(() => new Set(categoryFilters.map((f) => f.key as string)), [categoryFilters])
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
  // #123: status is URL-backed for the same reason category is — a shared or
  // bookmarked link round-trips. Absent param = 'open' (done rows hidden).
  const VALID_STATUS_KEYS = useMemo(() => new Set(STATUS_FILTERS.map((f) => f.key as string)), [])
  const statusParam = searchParams.get('status')
  const activeStatus = statusParam && VALID_STATUS_KEYS.has(statusParam) ? statusParam : 'open'
  const setActiveStatus = useCallback((next: string) => {
    setSearchParams((prev) => {
      const out = new URLSearchParams(prev)
      if (next && next !== 'open') out.set('status', next)
      else out.delete('status')
      return out
    }, { replace: true })
  }, [setSearchParams])
  // `?filter=stalled` is the Today stat line's "stalled" link (and the rail's
  // "+N more"): active projects with no movement for projectStaleDays, the same predicate Today
  // counts with (isStalledProject). URL-backed like category and status.
  const stalledOnly = searchParams.get('filter') === 'stalled'
  const setStalledOnly = useCallback((on: boolean) => {
    setSearchParams((prev) => {
      const out = new URLSearchParams(prev)
      if (on) out.set('filter', 'stalled')
      else out.delete('filter')
      return out
    }, { replace: true })
  }, [setSearchParams])
  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('list')
  const [showDeps, setShowDeps] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  // Nick 2026-06-24: the list opens ordered by MOST RECENT ACTIVITY (newest
  // first) — the "what's moving" view. A header click sorts asc, then desc,
  // then clears back to recent activity (the sleek row's cycle).
  const [sort, setSort] = useState<SleekSort>(null)
  const sortKey = sort?.key ?? 'activity'
  const sortAsc = sort ? sort.dir === 'asc' : true
  // Pins are per person on the server (2026-10-09); the sidebar's "My
  // projects" list reads the same set. The old localStorage pins import once.
  const { pinnedSlugs, togglePin } = useProjectPins()

  // #123: the status gate runs FIRST so every downstream consumer — the three
  // category branches, the summary counts, the pipeline columns — sees one
  // consistent population. A count over `projects` while the list renders
  // `filtered` is the badge-dishonesty class (Rule 73).
  const statusScoped = useMemo(() => statusScope(activeStatus, projects), [projects, activeStatus])

  const filtered = useMemo(() => {
    let base: typeof statusScoped
    if (activeCategory === 'all') base = statusScoped
    else if (activeCategory === 'stale') {
      base = statusScoped.filter(p => {
        if (!isProjectActive(p.status)) return false
        // P2-9: ONE staleness basis = days-since-meaningful-movement, gated by
        // the shared projectStaleDays pref (Settings → Lab Preferences). Falls
        // back to updated_at when last_meaningful_movement isn't populated.
        const movedAt = p.last_meaningful_movement || p.updated_at
        const isStale = daysSince(movedAt) >= prefs.projectStaleDays
        // Health score keeps its other inputs, but staleness is reconciled to
        // the shared threshold above — a project needs attention if it's stale
        // OR its overall health is low.
        return isStale || isPoorHealth(healthBySlug.get(p.slug))
      })
    }
    else base = statusScoped.filter((p) => p.category === activeCategory)
    if (stalledOnly) base = base.filter((p) => isStalledProject(p, prefs.projectStaleDays))
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
        // The visible name (short name, else the cleaned title), so the order follows the text.
        case 'title': cmp = projectRowName(a).localeCompare(projectRowName(b)); break
        case 'status': cmp = (a.status || '').localeCompare(b.status || ''); break
        case 'stage': {
          // #91-class fix, now structural (Hub #361a): project.stage is
          // normalized at ingress (rowToProject), so raw legacy Title-Case
          // values can no longer reach this comparison — no per-read
          // normalize() call needed to avoid the "multiple idea sections" bug.
          cmp = stageOf(a).order - stageOf(b).order
          if (cmp === 0) cmp = pinCmp
          break
        }
        case 'pi': cmp = (a.pi || '').localeCompare(b.pi || ''); break
        case 'category': cmp = (a.category || '').localeCompare(b.category || ''); break
        case 'activity': {
          // Most recent real movement first — lastActivity (already the
          // newer of the rollup and last_meaningful_movement, merged by the
          // API), updated_at only as a last resort. See projectRecencyMs.
          const tA = projectRecencyMs(a)
          const tB = projectRecencyMs(b)
          cmp = tB - tA
          break
        }
      }
      if (cmp === 0) cmp = a.title.localeCompare(b.title)
      return sortAsc ? cmp : -cmp
    })
  }, [activeCategory, statusScoped, sortKey, sortAsc, pinnedSlugs, healthBySlug, prefs.projectStaleDays, stalledOnly, stageOf])

  // Reset focus when filter/view changes. Adjusted during render (React's
  // "adjusting state based on a prop change" pattern:
  // https://react.dev/learn/you-might-not-need-an-effect) instead of an
  // effect, avoiding an extra commit-then-effect cascade.
  const focusResetKey = `${activeCategory}|${activeStatus}|${viewMode}|${stalledOnly}`
  const [prevFocusResetKey, setPrevFocusResetKey] = useState(focusResetKey)
  if (focusResetKey !== prevFocusResetKey) {
    setPrevFocusResetKey(focusResetKey)
    setFocusedIndex(-1)
  }

  // Summary stats — 3-bucket canonical (Stage 4 #12-followup, 2026-05-08).
  // #123: counted over statusScoped, not `projects` — the strip must describe
  // the population the page is actually showing.
  const totalCount = statusScoped.length
  const mncoreCount = statusScoped.filter((p) => p.category === 'MNCCORE').length
  const clifCount = statusScoped.filter((p) => p.category === 'CLIF').length
  const pbCount = statusScoped.filter((p) => p.category === 'Peripheral Brain').length
  // No guard on activeStatus: the 'all' branch makes statusScoped === projects,
  // so the difference is already 0 there. Under 'active' the hidden rows are
  // waiting/blocked as well as done, so the label says "hidden", not "done".
  const hiddenCount = projects.length - statusScoped.length
  const hiddenLabel = activeStatus === 'open' ? 'done hidden' : 'hidden'


  return (
    <>
    <DataPage
      title={allProjectsOn ? 'All projects' : 'My projects'}
      // The page's one telling number (color-back pick 2): how many projects
      // this list holds. Static: the list it counts is right below.
      hero={projectsLoading && projects.length === 0 ? undefined : { value: totalCount, label: totalCount === 1 ? 'project' : 'projects' }}
      actions={
        <>
        <AllProjectsSwitch />
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg new-project-btn"
          style={{
            background: 'transparent',
            color: 'var(--job-accent)',
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
        </>
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
          {/* Phone: one nowrap row that scrolls sideways (.tk-flt-scroll), so the
              status axis never splits across wrapped lines. From md up the
              links wrap as before. TableControls (shared) is untouched. */}
          <div className="tk-flt tk-flt-scroll">
          {categoryFilters.map((f) => (
            <FilterPill
              key={f.key}
              label={f.label}
              active={activeCategory === f.key}
              onClick={() => setActiveCategory(f.key)}
            />
          ))}
          {/* #123: status is a SECOND, orthogonal axis (category answers "whose
              work", status answers "is it still open"), so it gets its own pill
              group behind a hairline rather than being folded into the category
              row where "Active" would read as a fourth category. */}
          <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', margin: '0 2px', background: 'var(--border-subtle)' }} />
          {STATUS_FILTERS.map((f) => (
            <FilterPill
              key={f.key}
              label={f.label}
              active={activeStatus === f.key}
              onClick={() => setActiveStatus(f.key)}
              title={f.title}
            />
          ))}
          <FilterPill
            label="Stalled"
            active={stalledOnly}
            onClick={() => setStalledOnly(!stalledOnly)}
            title="Active projects with no movement in the stale window (Settings, Lab Preferences)"
          />
          </div>
        </>
      }
      rightExtra={
        <>
          {/* "0 projects" while the list is still loading is a false claim. */}
          {!(projectsLoading && projects.length === 0) && <span
            className="text-xs"
            style={{
              color: 'var(--slate)',
              whiteSpace: 'nowrap',
            }}
          >
              {mncoreCount} MN-CCORE &middot; {clifCount} CLIF{pbCount > 0 ? ` \u00b7 ${pbCount} PB` : ''}{hiddenCount > 0 ? ` · ${hiddenCount} ${hiddenLabel}` : ''}
          </span>}
          {viewMode === 'pipeline' && (
            <button
              type="button"
              onClick={() => setShowDeps(!showDeps)}
              className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
              style={{
                fontSize: 'var(--label-size)',
                fontWeight: showDeps ? 600 : ('var(--label-weight)' as React.CSSProperties['fontWeight']),
                background: showDeps ? 'color-mix(in srgb, var(--job-accent) 10%, transparent)' : 'transparent',
                color: 'var(--job-accent)',
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
        <>
        <AllProjectsBanner />
        {/* Dependency map (collapsible, pipeline only) */}
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
        </>
      }
    >
        {/* ─── LIST VIEW ─── */}
        {projectsLoading && projects.length === 0 && (
          <div role="status" aria-label="Loading projects" className="tk">
            <TableSkeleton rows={10} cols={6} />
          </div>
        )}
        {!(projectsLoading && projects.length === 0) && viewMode === 'list' && (
          <ProjectSleekList
            projects={filtered}
            sort={sort}
            onSort={setSort}
            focusedIndex={focusedIndex}
            setFocusedIndex={setFocusedIndex}
            keyboardEnabled={!showCreate}
            healthBySlug={healthBySlug}
            taskCountByProject={taskCountByProject}
            linksByProjectId={allProjectLinks}
            publicationsBySlug={publicationsBySlug}
            pinnedSlugs={pinnedSlugs}
            togglePin={togglePin}
            categoryOptions={categoryListOptions}
            onFieldChange={onFieldChange}
            productsByProject={productsByProject}
            kinds={productKinds}
            stageOf={stageOf}
          />
        )}

        {/* ─── PIPELINE VIEW ─── */}
        {!(projectsLoading && projects.length === 0) && viewMode === 'pipeline' && (
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
                  background: 'linear-gradient(to right, transparent, var(--sk-line2), transparent)',
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
                    background: 'var(--sk-t3)',
                    border: '2px solid var(--cream)',
                  }}
                />
              ))}
            </div>

            {(() => {
              const counts = { other_ladder: 0, no_stage: 0, off_board: 0 }
              for (const p of filtered) {
                const place = pipelinePlaceOf(p, productsByProject[p.id ?? ''], STAGES)
                if ('off' in place) counts[place.off] += 1
              }
              const note = pipelineOffNote(counts)
              return note ? (
                <p data-testid="pipeline-off-ladder" style={{ fontSize: 12, color: 'var(--task-ink-muted)', margin: '0 0 var(--sp-md)' }}>
                  {note}
                </p>
              ) : null
            })()}

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
                const stageProjects = getStageProjects(stage, filtered, productsByProject)
                return (
                  <div
                    key={stage}
                    className="pipeline-column"
                    style={{
                      background: 'var(--ice)',
                      borderRadius: 'var(--radius-xl)',
                      borderTop: '2px solid var(--sk-line2)',
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
          scrollbar-color: var(--sk-line2) transparent;
        }
        .pipeline-board::-webkit-scrollbar {
          height: 6px;
        }
        .pipeline-board::-webkit-scrollbar-track {
          background: transparent;
        }
        .pipeline-board::-webkit-scrollbar-thumb {
          background: var(--sk-line2);
          border-radius: 3px;
        }

        .new-project-btn:hover {
          background: color-mix(in srgb, var(--job-accent) 6%, transparent) !important;
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
      `}</style>
    </>
  )
}

