// The Projects list as sleek rows (components/table/SleekRows; Nick's
// 2026-10-10 mock, rules-ui-design 19). One line per project: pin star, the
// short name with its tags, Status / Stage / Group / PI as inline editors that
// read as plain text (caret on hover), the moved-ago slot, then links and the
// folder + Work on slots.
//
// What changed from the ruled 7-column grid (every-page evaluation items 6, 7,
// 22, 24): no gridlines and no outer box; "Active" is not printed (the default
// says nothing, Waiting / Blocked / Done keep their words and colors); the PI
// is a photo face in a fixed slot; the stage dots are gone (Stage says it);
// the health bar shows only when health is poor (the same score the "Needs
// Attention" filter uses, isPoorHealth). The short name leads, one line (Nick
// 2026-07-21: the title cell is ONE line); the full title is the hover tip.
//
// Nothing lost: header sort on Title / Status / Stage / Group / PI (cleared =
// most recent activity), stage group headers when sorted by stage, j/k and
// arrows, Enter opens, p pins, Esc clears (useProjectKeyboardNav), the pin
// star, grant-mechanism tag, open-task count, published chip, "Nd ago", links,
// folder, Work on, the count footer. Ctrl/cmd-click opens in a new tab.

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { SleekTable, SleekRow, type SleekColumn, type SleekSort } from '../table/SleekRows'
import InlineSelect from '../InlineSelect'
import WorkOnActions from '../WorkOnActions'
import { Face } from '../today/skin'
import { PATHS } from '../../constants/paths'
import { ICON_PROPS } from '../../lib/iconProps'
import { stageLabel } from '../../lib/stageNormalize'
import { parseDbUtc } from '../../lib/time'
import { normalizeProjectStatus, isProjectFinished } from '../../lib/taskConstants'
import { STATUS_LIST_OPTIONS, LIST_T2, isPoorHealth, cleanProjectTitle, projectRowName, type ProjectHealth } from '../../lib/projectListOptions'
import { isGrantProjectType } from '../../lib/textUtils'
import { projectShortLabel } from '../../lib/displayNames'
import { linkTintForType, iconForType } from '../../lib/linkIcon'
import { classifyUrl } from '../../lib/urlClassify'
import { displayRank } from '../../lib/pbLinkDisplayOrder.generated'
import { useProtocolLaunch } from '../../hooks/useProtocolLaunch'
import { useProjectKeyboardNav } from '../../hooks/useProjectKeyboardNav'
import { directors } from '../../data/team'
import { displayName } from '../../lib/nameUtils'
import { staggerContainer, staggerItem } from '../../lib/animations'
import type { Project } from '../../data/types'
import type { StoredLink, ProjectPublicationLink } from '../../hooks/useApiData'

// Only Critical keeps a status color on the bar; the tooltip says the word.
const healthColor = (status: string): string => (status === 'Critical' ? 'var(--maroon)' : 'var(--sk-ac)')

// A stage as a header or footer names it; an empty stage sorts last and says so.
const stageName = (stage: string | null | undefined): string => stageLabel(stage || '') || 'No stage'

// S19: directors are the canonical PI choices; a non-director current value
// (legacy "nick", an email) is prepended so the menu names it cleanly.
function piOptions(currentPi?: string | null): { value: string; label: string; color: string }[] {
  const base = directors.map((d) => ({ value: d.slug, label: displayName(d.slug, 'display'), color: LIST_T2 }))
  const pi = (currentPi || '').trim()
  if (pi && !base.some((o) => o.value === pi)) return [{ value: pi, label: displayName(pi, 'display'), color: LIST_T2 }, ...base]
  return base
}

// #129: a Done/Published project's own paper. The project_publications
// junction (primary link) wins over the static journal/publication_date.
function PublishedChip({ project, links, onOpen }: { project: Project; links: ProjectPublicationLink[] | undefined; onOpen: () => void }) {
  if (!isProjectFinished(project)) return null
  const primary = links?.[0]
  const journal = primary?.journal || project.journal
  const year = primary?.year || (project.publication_date ? project.publication_date.slice(0, 4) : undefined)
  if (!journal && !year) return null
  return (
    <button type="button" className="tk-tag tk-n tip" data-tip={primary?.title || cleanProjectTitle(project)} onClick={onOpen} style={{ border: 'none', cursor: 'pointer', flexShrink: 0 }}>
      {journal || 'Published'}{year ? ` · ${year}` : ''}
    </button>
  )
}

// Link icons: up to four in fixed 24px slots with the Today card's muted brand
// tints, a fifth slot for "+N". The project's own folder is the Open-folder
// icon in the Work-on slot, so it is not repeated here. Non-http links open
// through useProtocolLaunch (mnccore:// handler + clipboard backup).
const LINKS_SHOWN = 4
const SLOT = 24
const WORK_ON_SLOT = 48
function ProjectLinksCell({ links: all, primaryFolder, shown = LINKS_SHOWN, width }: { links: StoredLink[]; primaryFolder?: string | null; shown?: number; width?: number }) {
  const { launch } = useProtocolLaunch()
  const norm = (p: string) => p.split(String.fromCharCode(92)).join('/').split('/').filter(Boolean).join('/').toLowerCase()
  const links = primaryFolder ? all.filter((l) => !(l.type === 'local_folder' && norm(l.canonical_url) === norm(primaryFolder))) : all
  const sorted = [...links].sort((a, b) => displayRank(a.type) - displayRank(b.type) || a.sort_order - b.sort_order)
  const visible = sorted.slice(0, shown)
  const overflow = links.length - visible.length
  if (!links.length && width === undefined) return null
  return (
    <span className="pj-lks" style={width !== undefined ? { width } : undefined}>
      {visible.map((link) => {
        const { Icon } = iconForType(link.type)
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
            className="tk-lkicon pj-lk"
            data-lk={linkTintForType(link.type) ?? undefined}
            onClick={(e) => {
              if (!isHttp) {
                e.preventDefault()
                void launch(launchUri, { copyText: link.canonical_url, successMessage: `Opening ${link.type}… (path copied as backup)` })
              }
            }}
          >
            <Icon {...ICON_PROPS} size={14} aria-hidden="true" />
          </a>
        )
      })}
      {overflow > 0 && <span className="pj-more">+{overflow}</span>}
    </span>
  )
}

const STATUS_BY_VALUE = new Map(STATUS_LIST_OPTIONS.map((o) => [o.value, o]))

/** Status as the row reads it: nothing for Active (the default), the word in
 *  its color otherwise (Waiting keeps its orange, Blocked its coral). */
function StatusText({ status }: { status: string }) {
  const value = normalizeProjectStatus(status)
  if (value === 'active') return <span className="sr-only">Active</span>
  const opt = STATUS_BY_VALUE.get(value)
  return <span className="sr-m" style={{ color: opt?.color }}>{opt?.label ?? value}</span>
}

const daysSinceActivity = (p: Project): number =>
  p.lastActivity ? Math.floor((Date.now() - parseDbUtc(p.lastActivity).getTime()) / 86400000) : 0

export interface ProjectSleekListProps {
  projects: Project[]
  sort: SleekSort
  onSort: (next: SleekSort) => void
  focusedIndex: number
  setFocusedIndex: (index: number | ((prev: number) => number)) => void
  keyboardEnabled: boolean
  healthBySlug: Map<string, ProjectHealth>
  taskCountByProject: Map<string, number>
  linksByProjectId: Record<string, StoredLink[]>
  publicationsBySlug?: Map<string, ProjectPublicationLink[]>
  pinnedSlugs: Set<string>
  togglePin: (slug: string) => void
  stageOptions: { value: string; label: string; color?: string }[]
  categoryOptions: { value: string; label: string; color?: string }[]
  onFieldChange: (slug: string, fields: Record<string, string>) => void
  onStageChange: (slug: string, next: string, prev: string | null | undefined) => void
  emptyLabel?: string
}

export default function ProjectSleekList({
  projects, sort, onSort, focusedIndex, setFocusedIndex, keyboardEnabled, healthBySlug, taskCountByProject,
  linksByProjectId, publicationsBySlug, pinnedSlugs, togglePin, stageOptions, categoryOptions, onFieldChange,
  onStageChange, emptyLabel = 'No projects in this category',
}: ProjectSleekListProps) {
  const navigate = useNavigate()
  const slugs = useMemo(() => projects.map((p) => p.slug), [projects])
  useProjectKeyboardNav({ projectCount: projects.length, focusedIndex, setFocusedIndex, slugs, enabled: keyboardEnabled, togglePin })

  // Keyboard cursor only: mouse clicks navigate away, so no viewport jerk.
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => {
    const el = focusedIndex >= 0 ? rowRefs.current[focusedIndex] : null
    el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [focusedIndex])

  const indexOf = useMemo(() => new Map(projects.map((p, i) => [p.slug, i])), [projects])

  // Column widths follow the rows on screen, so the title gets every pixel the
  // other columns do not use (evaluation item 7): Status is narrow unless a row
  // says "Waiting (External)"; the link slots are as many as the busiest row
  // needs (+N past four); the Work-on slot only when some row has a folder; no
  // column at all when no row has a link or a folder.
  const widths = useMemo(() => {
    const statuses = new Set(projects.map((p) => normalizeProjectStatus(p.status)))
    // Active is the default and prints nothing, so a list where every row is
    // Active gets no Status column at all: no header over an empty track
    // (prod check 2026-10-10: 82 of 90 rows Active, the column read blank).
    const status = [...statuses].every((s) => s === 'active') ? 0
      : statuses.has('waiting_external') ? 124 : statuses.has('blocked') || statuses.has('done') ? 76 : 52
    const maxLinks = projects.reduce((m, p) => Math.max(m, linksByProjectId[p.id ?? '']?.length ?? 0), 0)
    const linkSlots = maxLinks > LINKS_SHOWN ? LINKS_SHOWN + 1 : maxLinks
    const workOn = projects.some((p) => p.primary_folder) ? WORK_ON_SLOT : 0
    return { status, links: linkSlots * SLOT, workOn }
  }, [projects, linksByProjectId])

  const columns = useMemo<SleekColumn<Project>[]>(() => [
    {
      key: 'pin', width: '20px', interactive: true, phone: 'lead',
      render: (p) => {
        const pinned = pinnedSlugs.has(p.slug)
        return (
          <button
            type="button"
            className={`pj-pin tip${pinned ? ' pj-pinned' : ''}`}
            onClick={() => togglePin(p.slug)}
            data-tip={pinned ? 'Unpin project' : 'Pin to top'}
            aria-label={pinned ? 'Unpin project' : 'Pin to top'}
            aria-pressed={pinned}
          >
            <Star {...ICON_PROPS} size={12} fill={pinned ? 'var(--sk-gold)' : 'none'} />
          </button>
        )
      },
    },
    {
      key: 'title', label: 'Title', width: 'minmax(0,1fr)', sortable: true, interactive: true, phone: 'title',
      render: (p) => {
        const name = projectRowName(p)
        const full = cleanProjectTitle(p) || name
        const tc = taskCountByProject.get(p.slug) || 0
        const health = healthBySlug.get(p.slug)
        return (
          <div className="sr-tt">
            <Link
              to={PATHS.project(p.slug)}
              className="sr-x sr-open pj-name tip"
              data-tip={full}
              onClick={() => setFocusedIndex(indexOf.get(p.slug) ?? -1)}
            >
              {name}
            </Link>
            {/* With no Status column, screen readers still hear the status. */}
            {widths.status === 0 && <span className="sr-only">Active</span>}
            {isGrantProjectType(p.type) && <span className="tk-tag tk-n tip" data-tip={`Grant mechanism: ${p.type}`}>{p.type}</span>}
            {tc > 0 && <span className="sr-m tip" data-tip={`${tc} open task${tc !== 1 ? 's' : ''}`} aria-label={`${tc} open task${tc !== 1 ? 's' : ''}`}>{tc}</span>}
            <PublishedChip project={p} links={publicationsBySlug?.get(p.slug)} onOpen={() => navigate(`${PATHS.project(p.slug)}?tab=literature`)} />
            {isPoorHealth(health) && (
              <span className="pj-health tip" data-tip={`Health: ${health.score}/100 — ${health.status}`} aria-label={`Health: ${health.score}/100 — ${health.status}`}>
                <span style={{ width: `${Math.min(health.score, 100)}%`, background: healthColor(health.status) }} />
              </span>
            )}
          </div>
        )
      },
    },
    ...(widths.status > 0 ? [{
      key: 'status', label: 'Status', width: `${widths.status}px`, sortable: true, interactive: true, phone: 'line' as const,
      render: (p: Project) => (
        <InlineSelect
          value={normalizeProjectStatus(p.status)}
          options={STATUS_LIST_OPTIONS}
          onChange={(val) => onFieldChange(p.slug, { status: val })}
          display={<StatusText status={p.status} />}
        />
      ),
      // The phone line prints nothing for Active (and leaves no empty tap
      // target); Waiting / Blocked / Done stay editable there.
      renderPhone: (p: Project) => (normalizeProjectStatus(p.status) === 'active' ? null : (
        <InlineSelect
          value={normalizeProjectStatus(p.status)}
          options={STATUS_LIST_OPTIONS}
          onChange={(val) => onFieldChange(p.slug, { status: val })}
          display={<StatusText status={p.status} />}
        />
      )),
    }] : []),
    {
      key: 'stage', label: 'Stage', width: '112px', sortable: true, interactive: true, phone: 'line',
      render: (p) => (
        <InlineSelect
          value={p.stage || ''}
          options={stageOptions}
          onChange={(val) => onStageChange(p.slug, val, p.stage)}
          display={<span className="sr-m sr-hi">{stageLabel(p.stage || '') || '—'}</span>}
        />
      ),
    },
    {
      key: 'category', label: 'Group', width: '104px', sortable: true, interactive: true, minTableWidth: 880, phone: 'line',
      render: (p) => (
        <InlineSelect
          value={p.category || ''}
          options={categoryOptions}
          onChange={(val) => onFieldChange(p.slug, { category: val })}
          display={<span className="tk-cs">{categoryOptions.find((o) => o.value === p.category)?.label || p.category || '—'}</span>}
        />
      ),
    },
    {
      key: 'pi', label: 'PI', width: '40px', sortable: true, interactive: true, phone: 'trail',
      render: (p) => (
        <InlineSelect
          value={p.pi || ''}
          options={piOptions(p.pi)}
          onChange={(val) => onFieldChange(p.slug, { pi: val })}
          display={p.pi ? <Face slug={p.pi} /> : <span className="sr-m">—</span>}
        />
      ),
      renderPhone: (p) => (
        <InlineSelect
          value={p.pi || ''}
          options={piOptions(p.pi)}
          onChange={(val) => onFieldChange(p.slug, { pi: val })}
          display={p.pi ? <Face slug={p.pi} lg /> : <span className="sr-m">—</span>}
        />
      ),
    },
    {
      // A fixed slot, empty when recent, so the column lines up (rules-ui-design 14).
      key: 'moved', width: '52px', align: 'end', minTableWidth: 760, phone: 'line',
      render: (p) => {
        const days = daysSinceActivity(p)
        return days >= 7
          ? <span className="sr-m tip" data-tip={`Last activity ${days} days ago`} aria-label={`Last activity ${days} days ago`}>{days}d ago</span>
          : null
      },
    },
    // No minTableWidth: links, folder and Work on stay at every desktop width,
    // and the phone line carries them below that.
    ...(widths.links + widths.workOn > 0 ? [{
      key: 'links', label: 'Links', width: `${Math.max(widths.links + widths.workOn, 40)}px`, interactive: true, phone: 'line' as const,
      render: (p: Project) => (
        <span className="sr-slots pj-slots">
          {widths.links > 0 && <ProjectLinksCell links={linksByProjectId[p.id ?? ''] ?? []} primaryFolder={p.primary_folder} width={widths.links} />}
          {widths.workOn > 0 && (
            <span className="sr-wk sr-hv">
              {p.primary_folder && <WorkOnActions primaryFolder={p.primary_folder} projectLabel={projectShortLabel(p)} variant="slot" />}
            </span>
          )}
        </span>
      ),
      // Phone: two link slots then +N, then the folder + Work on when there is one.
      renderPhone: (p: Project) => {
        const links = linksByProjectId[p.id ?? ''] ?? []
        if (!links.length && !p.primary_folder) return null
        return (
          <span className="sr-slots pj-slots">
            <ProjectLinksCell links={links} primaryFolder={p.primary_folder} shown={2} />
            {p.primary_folder && <span className="sr-wk"><WorkOnActions primaryFolder={p.primary_folder} projectLabel={projectShortLabel(p)} variant="slot" /></span>}
          </span>
        )
      },
    }] : []),
  ], [pinnedSlugs, togglePin, taskCountByProject, healthBySlug, publicationsBySlug, navigate, setFocusedIndex, indexOf, stageOptions, categoryOptions, onFieldChange, onStageChange, linksByProjectId, widths])

  const onRowClick = useCallback((index: number, slug: string, e: React.MouseEvent) => {
    const path = PATHS.project(slug)
    if (e.metaKey || e.ctrlKey) { window.open(path, '_blank', 'noopener'); return }
    setFocusedIndex(index)
    navigate(path)
  }, [navigate, setFocusedIndex])

  const byStage = sort?.key === 'stage'
  const stageCounts = useMemo(() => {
    const acc = new Map<string, number>()
    for (const p of projects) acc.set(p.stage || '', (acc.get(p.stage || '') ?? 0) + 1)
    return acc
  }, [projects])
  // A stage header opens each run of one stage, only when sorted by stage.
  const startsStage = useMemo(
    () => projects.map((p, i) => byStage && (i === 0 || (projects[i - 1].stage || '') !== (p.stage || ''))),
    [projects, byStage],
  )

  return (
    <>
      <SleekTable columns={columns} sort={sort} onSort={onSort} defaultSortLabel="Recent activity" className="pj-list">
        {projects.length === 0 && <div className="pj-empty">{emptyLabel}</div>}
        {projects.length > 0 && (
          <motion.div variants={staggerContainer} initial="hidden" animate="visible">
            {projects.map((p, index) => {
              const stage = p.stage || ''
              const header = startsStage[index]
              return (
                <motion.div key={p.slug} variants={staggerItem} ref={(el: HTMLDivElement | null) => { rowRefs.current[index] = el }}>
                  {header && (
                    <div className="pj-stage-h">
                      <span>{stageName(stage)}</span>
                      <span className="sr-m">{stageCounts.get(stage) ?? 0}</span>
                      <i aria-hidden="true" />
                    </div>
                  )}
                  <SleekRow
                    row={p}
                    data={{ 'project-slug': p.slug }}
                    cursor={index === focusedIndex}
                    onClick={(e) => onRowClick(index, p.slug, e)}
                  />
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </SleekTable>
      {projects.length > 0 && (
        <div className="pj-foot">
          {[
            { label: 'Count', value: projects.length },
            ...Array.from(stageCounts.entries()).map(([stage, count]) => ({ label: stageName(stage), value: count })),
          ].map((s) => (
            <span key={s.label}>{s.label} <b>{s.value}</b></span>
          ))}
        </div>
      )}
    </>
  )
}
