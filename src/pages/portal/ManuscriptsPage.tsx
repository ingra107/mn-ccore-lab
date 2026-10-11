import { useState, useMemo } from 'react'
import { portalTitle } from '../../constants/pageLabels'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FileText, Plus, List, GitBranch, BookOpen, ExternalLink } from 'lucide-react'
import {
  DndContext,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { InputSafeKeyboardSensor, InputSafePointerSensor } from '../../lib/dndSensors'
import DataPage from '../../components/DataPage'
import Avatar from '../../components/Avatar'
import CreateProjectModal from '../../components/CreateProjectModal'
import { useProjects, useTasks, useManuscriptsAttention, useAllProjectPublications } from '../../hooks/useApiData'
import { useCreateProject, useUpdateProjectFields } from '../../hooks/useMutations'
import InlineSelect from '../../components/InlineSelect'
import CategoryIcon from '../../components/CategoryIcon'
import { useUndoToast } from '../../components/UndoToast'
import { getPersonInfo } from '../../data/team'
import { displayName } from '../../lib/nameUtils'
import type { Project } from '../../data/types'
import NeedsAttentionDashboard, { type AttentionFilter } from '../../components/NeedsAttentionDashboard'
import ActiveSubmissionsWidget from '../../components/ActiveSubmissionsWidget'
import type { SleekSort } from '../../components/table/SleekRows'
import { ManuscriptsList } from './ManuscriptsList'
import EmptyState from '../../components/EmptyState'

import { usePageMeta } from '../../hooks/usePageMeta'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import { useLabPrefs } from '../../hooks/useLabPrefs'
import { toApiStage, stageIndex } from '../../lib/stageNormalize'
import { PATHS } from '../../constants/paths'
import { parseDbUtc } from '../../lib/time'
import { parseDateOnlyOrTimestamp } from '../../lib/dateUtils'
import { ICON_PROPS } from '../../lib/iconProps'

// S4 (Nick, 2026-06-09): a manuscript = a project whose canonical stage is
// >= writing (writing / submitted / revisions / accepted / published). The
// old filter `p.status !== 'published' || p.stage === 'published'` was a
// tautology — `status` is active/waiting_external/blocked/done, never
// 'published' — so it admitted ALL projects. stageIndex() normalizes legacy
// + API stage strings; writing is index 3 on the canonical ladder.
const WRITING_STAGE_INDEX = stageIndex('writing')
function isManuscriptStage(stage: string | null | undefined): boolean {
  const idx = stageIndex(stage)
  return idx >= 0 && idx >= WRITING_STAGE_INDEX
}

// Values are D1 lowercase canonical; labels are sentence case for display.
const STAGES = ['idea', 'data_collection', 'analysis', 'writing', 'review', 'revisions', 'published'] as const
const STAGE_LABELS: Record<typeof STAGES[number], string> = {
  idea: 'Idea',
  data_collection: 'Data collection',
  analysis: 'Analysis',
  writing: 'Writing',
  review: 'Review',
  revisions: 'Revisions',
  published: 'Published',
}
// The edit menu keeps its colored swatches; the row shows the quiet pill.
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: 'var(--green)' },
  { value: 'waiting_external', label: 'Waiting', color: 'var(--gold)' },
  { value: 'blocked', label: 'Blocked', color: 'var(--maroon)' },
  { value: 'done', label: 'Done', color: 'var(--slate)' },
]
const STAGE_ORDER: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s, i]))


function daysInStage(project: Project): number {
  const dateStr = project.stage_entered_at || project.updated_at || project.lastActivity
  if (!dateStr) return 0
  // D1 bare `YYYY-MM-DD HH:MM:SS` has no zone suffix; new Date() would read it
  // as LOCAL wall-clock — off by the viewer's UTC offset (~5-6h CDT). Route
  // through parseDateOnlyOrTimestamp which appends 'Z' so elapsed-ms is correct.
  const ms = Date.now() - parseDateOnlyOrTimestamp(dateStr).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

const CATEGORY_DOT: Record<string, string> = {
  // Canonical 3-bucket (Stage 4 #12-followup, 2026-05-08)
  'MNCCORE': 'var(--teal)',
  'CLIF': 'var(--maroon)',
  'Peripheral Brain': 'var(--gold)',
  // Legacy fallbacks for soft-deleted rows with pre-migration values
  clif: 'var(--maroon)',
  lab: 'var(--teal)',
  nate: 'var(--gold)',
  mentee: 'var(--slate)',
}

const CATEGORY_LABEL: Record<string, string> = {
  // Canonical 3-bucket (Stage 4 #12-followup, 2026-05-08)
  'MNCCORE': 'MNCCORE',
  'CLIF': 'CLIF',
  'Peripheral Brain': 'PB',
  // Legacy fallbacks for soft-deleted rows with pre-migration values
  clif: 'CLIF',
  lab: 'Lab',
  nate: 'Mesfin',
  'nate-mesfin': 'Mesfin',
  mentee: 'Mentee',
}

// S19: one PI resolver + one avatar fallback style. displayName() canonicalizes
// any slug (legacy "nick", bare email, non-director member) to a clean name +
// initials; getPersonInfo supplies the curated photo. Avatar always derives its
// fallback initials from the same displayName source — no mixed styles.
function piDisplay(slug: string | null | undefined): { name: string; initials: string; photoUrl: string | undefined } {
  if (!slug) return { name: 'Unassigned', initials: '—', photoUrl: undefined }
  return {
    name: displayName(slug, 'display'),
    initials: displayName(slug, 'initials'),
    photoUrl: getPersonInfo(slug).photoUrl,
  }
}

// Canonical options only — drives category filter pills and InlineSelect
// inline editor. Users cannot re-assign projects to legacy values.
const CANONICAL_CATEGORY_KEYS = ['MNCCORE', 'CLIF', 'Peripheral Brain'] as const

const CATEGORY_OPTIONS = CANONICAL_CATEGORY_KEYS.map((value) => ({
  value,
  label: CATEGORY_LABEL[value],
  color: CATEGORY_DOT[value],
}))

export default function ManuscriptsPage() {
  // P3-03: 'trophy' = cover-style grid for Published manuscripts.
  const [view, setView] = useState<'list' | 'pipeline' | 'trophy'>('list')
  const [filterPI, setFilterPI] = useState<string>('')
  const [searchParams, setSearchParams] = useSearchParams()
  const filterCategory = searchParams.get('category') ?? ''
  const setFilterCategory = (next: string) => {
    setSearchParams((prev) => {
      const out = new URLSearchParams(prev)
      if (next) out.set('category', next)
      else out.delete('category')
      return out
    }, { replace: true })
  }
  const [filterStalled, setFilterStalled] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  // null = stage order (with stage headers); a header click cycles asc -> desc -> cleared.
  const [sort, setSort] = useState<SleekSort>(null)
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>(null)
  useScrollReveal<HTMLDivElement>()

  const { data: projects = [], isLoading } = useProjects()
  const { data: tasks = [] } = useTasks()
  const { data: publicationsBySlug } = useAllProjectPublications()
  const { data: attentionData } = useManuscriptsAttention()
  // M-04: stalled threshold now flows from useLabPrefs (same source as
  // NeedsAttentionDashboard). Previously a hardcoded 30 in this file
  // produced two parallel staleness models the user couldn't reconcile.
  const { prefs: labPrefs } = useLabPrefs()
  const stalledThresholdDays = labPrefs.manuscriptsStaleDays
  const createProject = useCreateProject()
  const { showUndo } = useUndoToast()
  const inlineUpdate = useUpdateProjectFields()

  const handleFieldChange = (slug: string, field: string, value: unknown, prev: unknown) => {
    inlineUpdate.mutate({ slug, fields: { [field]: value } })
    showUndo(`${field} → ${value}`, () => inlineUpdate.mutate({ slug, fields: { [field]: prev } }))
  }

  // S17: stage editing is instant + undo, identical to Projects.tsx and the
  // pipeline drag path below. The UI 6-stage value MUST map through toApiStage()
  // to the 7-value API canonical (Rule 35) — handleFieldChange passed the raw UI
  // value, which the API 400s, surfacing as a silent optimistic revert. This
  // single chokepoint removes that drift for the list views.
  const handleStageChange = (slug: string, nextStage: string, prevStage: string | null | undefined) => {
    if (nextStage === prevStage) return
    inlineUpdate.mutate({ slug, fields: { stage: toApiStage(nextStage) } })
    showUndo(
      `Stage → ${STAGE_LABELS[nextStage as typeof STAGES[number]] ?? nextStage}`,
      () => inlineUpdate.mutate({ slug, fields: { stage: toApiStage(prevStage || 'idea') } }),
    )
  }

  const manuscripts = useMemo(() => {
    // S4: a manuscript is a project at stage >= writing. Earlier-stage
    // projects (idea / data collection / analysis) live only on Projects.
    let filtered = projects.filter((p) => isManuscriptStage(p.stage))
    if (filterPI) filtered = filtered.filter((p) => p.pi === filterPI)
    if (filterCategory) filtered = filtered.filter((p) => p.category === filterCategory)
    if (filterStalled) filtered = filtered.filter((p) => p.stage !== 'published' && daysInStage(p) > stalledThresholdDays)
    if (attentionFilter && attentionData) {
      const allow = new Set<string>()
      if (attentionFilter === 'revisions-overdue') {
        attentionData.data.revisions_overdue.forEach((r) => {
          const s = r.project_slug || r.project_id
          if (s) allow.add(s)
        })
      } else if (attentionFilter === 'awaiting-review') {
        attentionData.data.awaiting_review.forEach((r) => {
          const s = r.project_slug || r.project_id
          if (s) allow.add(s)
        })
      } else if (attentionFilter === 'stale-drafts') {
        // Stale drafts are publications-scoped, not project-scoped; match by title fallback.
        attentionData.data.stale_drafts.forEach((r) => { if (r.title) allow.add(r.title) })
        filtered = filtered.filter((p) => allow.has(p.title))
      }
      if (attentionFilter !== 'stale-drafts') {
        filtered = filtered.filter((p) => allow.has(p.slug))
      }
    }
    const sortKey = sort?.key ?? 'stage'
    const sortAsc = sort ? sort.dir === 'asc' : true
    return [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'stage': cmp = (STAGE_ORDER[a.stage ?? ''] ?? 99) - (STAGE_ORDER[b.stage ?? ''] ?? 99); break
        case 'title': cmp = a.title.localeCompare(b.title); break
        case 'status': cmp = (a.status || '').localeCompare(b.status || ''); break
        case 'pi': cmp = (a.pi || '').localeCompare(b.pi || ''); break
        case 'category': cmp = (a.category || '').localeCompare(b.category || ''); break
        case 'days_in_stage': cmp = daysInStage(b) - daysInStage(a); break
      }
      if (cmp === 0) cmp = a.title.localeCompare(b.title)
      return sortAsc ? cmp : -cmp
    })
  }, [projects, filterPI, filterCategory, filterStalled, sort, attentionFilter, attentionData, stalledThresholdDays])


  const taskCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) {
      if (t.project_id && !t.completed) {
        map.set(t.project_id, (map.get(t.project_id) || 0) + 1)
      }
    }
    return map
  }, [tasks])

  const byStage = useMemo(() => {
    const map: Record<string, Project[]> = {}
    for (const s of STAGES) map[s] = []
    for (const p of manuscripts) {
      const stage = p.stage || 'idea'
      if (map[stage]) map[stage].push(p)
      else map['idea'].push(p)
    }
    return map
  }, [manuscripts])

  const activeCount = manuscripts.filter((p) => p.stage !== 'published').length
  const writingCount = manuscripts.filter((p) => p.stage === 'writing').length

  // S4: stalled count scoped to the manuscript subset (stage >= writing, not
  // yet published), so the pill count matches the page's own taxonomy.
  const stalledCount = useMemo(() =>
    projects.filter(p => isManuscriptStage(p.stage) && p.stage !== 'published' && daysInStage(p) > stalledThresholdDays).length
  , [projects, stalledThresholdDays])

  // M-14: derive PI options from data instead of hardcoding nick + nate.
  // New PIs (mentees taking over a manuscript, visiting faculty) auto-appear.
  // S19: labels render via displayName() so a legacy slug ("nick") resolves to
  // a clean name ("Nick Ingraham"), not the raw slug.
  const piOptions = useMemo(() => {
    const slugs = [...new Set(projects.map((p) => p.pi).filter(Boolean) as string[])]
    return slugs
      .map((slug) => ({ value: slug, label: displayName(slug, 'display') }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [projects])

  // M-05: dynamic title flows through usePageMeta so the OG tags + meta
  // description stay in sync. Previously a competing useEffect overwrote
  // document.title, racing usePageMeta and making it dead code.
  const pageTitle = portalTitle('Manuscripts', writingCount > 0 ? `${writingCount} writing` : `${activeCount}`)
  usePageMeta(
    pageTitle,
    'Track MN-CCORE manuscripts from idea to publication.'
  )

  const manuscriptCategoryPills = (
    /* GH #39: category quick-filter pills. URL-synced so saved views capture state. */
    <div
      role="tablist"
      aria-label="Filter manuscripts by category"
      className="flex flex-wrap items-center"
      style={{ gap: '6px', padding: 'var(--sp-sm) 0 var(--sp-md)' }}
    >
      {[
        { value: '', label: 'All' },
        ...CATEGORY_OPTIONS.map(({ value, label }) => ({ value, label })),
      ].map((opt) => {
        const active = filterCategory === opt.value
        return (
          <button
            key={opt.value || 'all'}
            role="tab"
            aria-selected={active}
            aria-controls="manuscripts-table"
            onClick={() => setFilterCategory(opt.value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              // N1b de-box: resting hairline -> transparent (borderless until
              // active); 1px kept transparent so the active border adds no shift.
              border: active ? '1px solid var(--teal)' : '1px solid transparent',
              background: active ? 'var(--teal-active)' : 'transparent',
              color: active ? 'var(--teal)' : 'var(--slate)',
              fontSize: '12px',
              fontWeight: active ? 600 : 400,
              cursor: 'pointer',
              transition: 'all var(--duration-fast) ease-out',
              opacity: active ? 1 : 0.85,
            }}
          >
            {opt.value && (
              <CategoryIcon category={opt.value} size={12} />
            )}
            {opt.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <>
      <DataPage
        icon={<FileText {...ICON_PROPS} size={20} />}
        title="Manuscripts"
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
              transition: 'background var(--duration-fast) ease-out',
            }}
          >
            <Plus {...ICON_PROPS} size={14} />
            New Manuscript
          </button>
        }
        views={[
          { key: 'list', icon: <List {...ICON_PROPS} size={14} />, label: 'List' },
          { key: 'pipeline', icon: <GitBranch {...ICON_PROPS} size={14} />, label: 'Pipeline' },
          { key: 'trophy', icon: <BookOpen {...ICON_PROPS} size={14} />, label: 'Trophy' },
        ]}
        activeView={view}
        onViewChange={(v) => setView(v as 'list' | 'pipeline' | 'trophy')}
        filters={
          <>
            <InlineSelect
              value={filterPI}
              options={[
                { value: '', label: 'All PIs' },
                ...piOptions,
              ]}
              onChange={setFilterPI}
              alwaysShowChevron
            />
            {/* Stalled filter pill */}
            <button
              onClick={() => setFilterStalled(!filterStalled)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                // N1b de-box: resting hairline -> transparent (borderless until active).
                border: filterStalled ? '1px solid var(--orange)' : '1px solid transparent',
                background: filterStalled ? 'var(--orange-hover)' : 'transparent',
                color: filterStalled ? 'var(--orange)' : 'var(--slate)',
                fontSize: '12px',
                fontWeight: filterStalled ? 600 : 400,
                cursor: 'pointer',
                transition: 'all var(--duration-fast) ease-out',
                opacity: filterStalled ? 1 : 0.85,
              }}
              title={`Manuscripts stalled in stage for more than ${stalledThresholdDays} days`}
            >
              Stalled
              {stalledCount > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '16px',
                    height: '16px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--orange)',
                    color: 'white',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '0 4px',
                  }}
                >
                  {stalledCount}
                </span>
              )}
            </button>
          </>
        }
        // The rows on screen, published included, so the header and the
        // footer's Total read one number (prod check 2026-10-10: 28 vs 31).
        // Trophy shows only the published ones, so it counts those.
        controlsCount={view === 'trophy' ? manuscripts.length - activeCount : manuscripts.length}
        controlsCountLabel={view === 'trophy' ? 'published' : 'manuscripts'}
        isLoading={isLoading}
        skeletonRows={6}
        skeletonCols={5}
        beforeBody={
          <>
            {/* T-29: Needs your attention — three-subgroup triage. */}
            {!isLoading && (
              <NeedsAttentionDashboard filter={attentionFilter} onFilterChange={setAttentionFilter} />
            )}
            {/* M-12 (D25): Active submissions — list view only. */}
            {!isLoading && view === 'list' && <ActiveSubmissionsWidget />}
            {manuscriptCategoryPills}
          </>
        }
      >
        {/* ─── LIST VIEW ─── the shared sleek row (evaluation item 39) */}
        {view === 'list' && (
          <div id="manuscripts-table">
            {manuscripts.length > 0 ? (
              <ManuscriptsList
                // A filter change remounts the list, which clears the j/k row
                // (no reset effect). Leaving the List view unmounts it too.
                key={`${filterPI}|${filterCategory}|${filterStalled}|${attentionFilter ?? ''}`}
                manuscripts={manuscripts}
                sort={sort}
                onSort={setSort}
                stages={STAGES}
                stageLabels={STAGE_LABELS}
                statusOptions={STATUS_OPTIONS}
                piOptions={piOptions}
                categoryOptions={CATEGORY_OPTIONS}
                categoryLabel={CATEGORY_LABEL}
                taskCounts={taskCounts}
                daysInStage={daysInStage}
                stalledThresholdDays={stalledThresholdDays}
                onFieldChange={handleFieldChange}
                onStageChange={handleStageChange}
                keyboardDisabled={showCreate}
              />
            ) : (
              <EmptyState
                icon={<FileText size={40} />}
                title="The shelf is empty"
                subtitle="Manuscripts in the pipeline show up here, grouped by stage — from first draft to published."
              />
            )}

            {/* The stage tally under the rows */}
            {manuscripts.length > 0 && (() => {
              const stageCounts = manuscripts.reduce<Record<string, number>>((acc, p) => {
                const stage = p.stage || 'idea'
                acc[stage] = (acc[stage] || 0) + 1
                return acc
              }, {})
              const publishedCount = stageCounts['published'] || 0
              const stats = [
                { label: 'Total', value: manuscripts.length },
                ...STAGES.filter(s => s !== 'published' && stageCounts[s]).map(s => ({
                  label: STAGE_LABELS[s],
                  value: stageCounts[s],
                })),
                ...(publishedCount > 0 ? [{ label: 'Published', value: publishedCount }] : []),
              ]
              return (
                <div className="sr-foot" style={{ flexWrap: 'wrap', padding: '10px 10px 4px', marginTop: 8, boxShadow: '0 -1px 0 var(--sk-line)' }}>
                  {stats.map(s => (
                    <span key={s.label}>
                      {s.label}{' '}
                      <b style={{ fontWeight: 600, color: 'var(--sk-t2)' }}>{s.value}</b>
                    </span>
                  ))}
                  {stalledCount > 0 && (
                    <span style={{ color: 'var(--sk-urg)', marginLeft: 'auto' }}>
                      {stalledCount} stalled
                    </span>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* ─── PIPELINE VIEW ─── M-13: drag-and-drop between stages */}
        {view === 'pipeline' && (
          <PipelineBoard
            byStage={byStage}
            onStageChange={(slug, prevStage, nextStage) => {
              const apiStage = toApiStage(nextStage)
              inlineUpdate.mutate({ slug, fields: { stage: apiStage } })
              showUndo(`stage → ${nextStage}`, () =>
                inlineUpdate.mutate({ slug, fields: { stage: prevStage } })
              )
            }}
          />
        )}

        {/* ─── TROPHY VIEW (P3-03) ─── cover-style cards for Published manuscripts */}
        {view === 'trophy' && (() => {
          const published = manuscripts.filter((p) => p.stage === 'published')
          if (published.length === 0) {
            return (
              <div className="text-center py-12" style={{ color: 'var(--slate)' }}>
                <BookOpen size={32} style={{ opacity: 0.4, margin: '0 auto var(--sp-sm)' }} />
                <p className="text-sm" style={{ opacity: 'var(--ink-label)' }}>
                  No published manuscripts yet. Trophy view shows them here once they ship.
                </p>
              </div>
            )
          }
          return (
            <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {published.map((p) => {
                // #812: read the REAL schema-v71 columns (journal,
                // publication_date, doi) — the former M-11 names
                // (journal_name/published_year) never had a backing column,
                // so this card rendered blank fields forever. created_at
                // still backfills the year when publication_date is unset.
                // #129: prefer the project's own linked publication (the
                // PI-curated project_publications junction) over the static
                // v71 journal/publication_date columns — those are blank on
                // most rows.
                const primaryPub = publicationsBySlug?.get(p.slug)?.[0]
                const journal = primaryPub?.journal || p.journal || ''
                const year = primaryPub?.year
                  || (p.publication_date
                    ? p.publication_date.slice(0, 4)
                    : (p.created_at ? parseDbUtc(p.created_at).getFullYear() : ''))
                const doi = primaryPub?.doi || p.doi
                const pubTitle = primaryPub?.title
                return (
                  <div
                    key={p.slug}
                    className="rounded-lg border flex flex-col overflow-hidden"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      background: 'var(--surface-1)',
                      minHeight: '220px',
                    }}
                  >
                    <div
                      className="px-4 pt-4 pb-3"
                      style={{
                        background: 'linear-gradient(135deg, var(--teal-active), var(--gold-active))',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div
                        className={pubTitle ? 'tip' : undefined}
                        data-tip={pubTitle}
                        style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '11px', color: 'var(--ink-bright, #fff)', opacity: 0.85, letterSpacing: '0.04em' }}
                      >
                        {journal || 'Journal'} {year ? `· ${year}` : ''}
                      </div>
                      <h3
                        className="mt-2"
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontWeight: 500,
                          fontSize: '15px',
                          color: 'var(--ink-bright, #fff)',
                          lineHeight: 1.25,
                          minHeight: '3em',
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical' as const,
                        }}
                      >
                        {p.title}
                      </h3>
                    </div>
                    <div className="flex-1 p-3 flex flex-col justify-between">
                      <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--slate)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', background: 'var(--green)' }} />
                        Published
                      </div>
                      {doi && (
                        <a
                          href={doi.startsWith('http') ? doi : `https://doi.org/${doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] mt-2"
                          style={{ color: 'var(--teal)', textDecoration: 'none' }}
                        >
                          <ExternalLink {...ICON_PROPS} size={11} />
                          DOI
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </DataPage>

      <CreateProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={(input) => createProject.mutate(input)}
      />

      <style>{`
        .new-project-btn:hover {
          background: var(--teal-hover) !important;
        }
      `}</style>
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────
// M-13: Pipeline drag-and-drop. PipelineBoard wraps the kanban in
// DndContext + per-column droppable + per-card draggable. Drag a card
// onto a different stage column → fires onStageChange. Optimistic update
// + 5s undo handled in parent.
// ───────────────────────────────────────────────────────────────────────

type StageKey = typeof STAGES[number]

function PipelineCard({ project, dragging }: { project: Project; dragging?: boolean }) {
  const pi = piDisplay(project.pi)
  return (
    <div
      className="project-card"
      style={{
        // Recipe A: .project-card has no base lift, so cream == the dark page
        // bg rendered flat. --surface-2 lifts it; the shadow-card below is the edge.
        background: 'var(--surface-2)',
        borderRadius: 'var(--radius-lg)',
        padding: '14px',
        boxShadow: dragging ? 'var(--shadow-elevated)' : 'var(--shadow-card)',
        opacity: dragging ? 0.92 : 1,
        cursor: dragging ? 'grabbing' : 'grab',
        transition: 'box-shadow 0.15s ease',
        userSelect: 'none',
      }}
    >
      <div className="flex items-start gap-2">
        <CategoryIcon category={project.category} size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4, margin: 0 }}>
          {project.title}
        </p>
      </div>
      <div className="flex items-center gap-1.5" style={{ marginTop: '6px', marginLeft: '14px' }}>
        <div style={{ width: 16, height: 16, flexShrink: 0 }}>
          <Avatar name={pi.name} initials={pi.initials} photoUrl={pi.photoUrl} size="2xs" variant="ice" />
        </div>
        <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.75 }}>
          {project.pi ? displayName(project.pi, 'short') : pi.name}
        </span>
        {/* S19: avatar + label both resolve through piDisplay/displayName — one
            consistent fallback style. */}
      </div>
    </div>
  )
}

function DraggableCard({ project, isAnyDragging }: { project: Project; isAnyDragging: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: project.slug,
    data: { stage: project.stage },
  })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}>
      {/* Click navigates only when no drag in progress. */}
      <Link
        to={PATHS.project(project.slug)}
        onClick={(e) => { if (isAnyDragging) e.preventDefault() }}
        style={{ textDecoration: 'none', display: 'block' }}
        draggable={false}
      >
        <motion.div
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: isDragging ? 0 : 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
        >
          <PipelineCard project={project} />
        </motion.div>
      </Link>
    </div>
  )
}

function DroppableColumn({
  stage,
  children,
}: {
  stage: StageKey
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `pipeline-col-${stage}`,
    data: { stage },
  })
  return (
    <div
      ref={setNodeRef}
      style={{
        background: isOver ? 'var(--teal-hover)' : 'var(--ice)',
        borderRadius: 'var(--radius-xl)',
        borderTop: isOver ? '2px solid var(--gold)' : '2px solid var(--teal)',
        padding: 'var(--sp-lg)',
        minHeight: '200px',
        transition: 'background var(--duration-fast) ease-out, border-color var(--duration-fast) ease-out',
      }}
    >
      {children}
    </div>
  )
}

function PipelineBoard({
  byStage,
  onStageChange,
}: {
  byStage: Record<string, Project[]>
  onStageChange: (slug: string, prevStage: string, nextStage: StageKey) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(InputSafePointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(InputSafeKeyboardSensor),
  )

  const allProjects = useMemo(() => {
    const out: Project[] = []
    for (const s of STAGES) for (const p of byStage[s] || []) out.push(p)
    return out
  }, [byStage])

  const activeProject = activeId ? allProjects.find((p) => p.slug === activeId) ?? null : null

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const draggedSlug = String(active.id)
    const sourceStage = String((active.data.current as { stage?: string } | undefined)?.stage ?? '')
    const targetStage = (over.data.current as { stage?: StageKey } | undefined)?.stage
    if (!targetStage || sourceStage === targetStage) return
    onStageChange(draggedSlug, sourceStage, targetStage)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${STAGES.length}, minmax(180px, 1fr))`,
          gap: '20px',
          overflowX: 'auto',
          paddingBottom: '1rem',
        }}
      >
        {STAGES.map((stage) => {
          const stageProjects = byStage[stage] || []
          return (
            <DroppableColumn key={stage} stage={stage}>
              <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
                <h3 style={{ fontWeight: 500, fontSize: '13px', color: 'var(--ink)', margin: 0 }}>
                  {STAGE_LABELS[stage]}
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.75, fontWeight: 500 }}>
                  {stageProjects.length}
                </span>
              </div>

              <div className="flex flex-col" style={{ gap: '10px' }}>
                <AnimatePresence mode="popLayout">
                  {stageProjects.map((p) => (
                    <DraggableCard key={p.slug} project={p} isAnyDragging={activeId !== null} />
                  ))}
                </AnimatePresence>
                {stageProjects.length === 0 && (
                  <div style={{ padding: 'var(--sp-xl) var(--sp-sm)', textAlign: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.75 }}>
                      Drop here
                    </span>
                  </div>
                )}
              </div>
            </DroppableColumn>
          )
        })}
      </div>

      <DragOverlay>
        {activeProject ? <PipelineCard project={activeProject} dragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}
