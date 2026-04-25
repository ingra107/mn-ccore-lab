import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, LayoutDashboard, User, CheckSquare, ListTodo, Calendar,
  Clock, FolderKanban, FileText, Lightbulb, HelpCircle, BookOpen, DollarSign,
  Users, Plus, ArrowRight, Command, CalendarPlus,
  CheckCircle2, AlertTriangle, Flag, CircleDot, Scale, GitBranch,
  Activity, BarChart3, Settings,
} from 'lucide-react'
import { spring } from '../lib/animations'
import { useTasks, useProjects, useTeam, useMeetingsApi } from '../hooks/useApiData'
import { useAuth } from '../hooks/useAuth'
import { getPersonInfo } from '../data/team'
import { PATHS, PUBLIC_PATHS } from '../constants/paths'
import { emailToSlug } from '../lib/emailSlug'

interface CommandItem {
  id: string
  label: string
  sublabel?: string
  icon: typeof Search
  action: () => void
  category: 'navigation' | 'task' | 'project' | 'person' | 'meeting' | 'action' | 'filter' | 'context' | 'recent'
  shortcut?: string
}

// T-16 sessionStorage key for recent palette visits
const RECENT_KEY = 'mnccore-cmdk-recent'
const RECENT_MAX = 5

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const { data: tasks = [] } = useTasks(undefined, { enabled: open })
  const { data: projects = [] } = useProjects(undefined, { enabled: open })
  const { data: team = [] } = useTeam({ enabled: open })
  const { data: meetings = [] } = useMeetingsApi({ enabled: open })
  const { user } = useAuth()
  const currentUserSlug = emailToSlug(user?.email)

  const [recentRoutes, setRecentRoutes] = useState<string[]>(() => {
    try {
      const raw = sessionStorage.getItem(RECENT_KEY)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch { return [] }
  })
  useEffect(() => {
    const path = location.pathname
    if (!path.startsWith('/portal/')) return
    setRecentRoutes((prev) => {
      if (prev[0] === path) return prev
      return [path, ...prev.filter((p) => p !== path)].slice(0, RECENT_MAX)
    })
  }, [location.pathname])
  useEffect(() => {
    try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(recentRoutes)) } catch {}
  }, [recentRoutes])

  // Global Cmd+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
        setQuery('')
        setSelectedIndex(0)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // Focus input when opening + trap focus within palette
  const paletteRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      // Focus trap: Tab cycles within the palette
      const handler = (e: KeyboardEvent) => {
        if (e.key !== 'Tab' || !paletteRef.current) return
        const focusable = paletteRef.current.querySelectorAll<HTMLElement>(
          'input, button, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
      document.addEventListener('keydown', handler)
      return () => document.removeEventListener('keydown', handler)
    }
  }, [open])

  // Build command items
  const allItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = []

    // T-16 Recent routes (sessionStorage) — top of palette when empty query
    for (const path of recentRoutes) {
      const slug = path.split('/').filter(Boolean).slice(-1)[0] || path
      items.push({
        id: `recent:${path}`,
        label: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        sublabel: path,
        icon: Clock,
        action: () => { navigate(path); setOpen(false) },
        category: 'recent',
      })
    }

    // Navigation commands
    const navItems: { path: string; label: string; icon: typeof Search; shortcut?: string }[] = [
      { path: PATHS.dashboard, label: 'Today', icon: LayoutDashboard, shortcut: 'G D' },
      { path: PATHS.overview, label: 'Lab Overview', icon: LayoutDashboard },
      { path: PATHS.personal, label: 'My Hub', icon: User, shortcut: 'G H' },
      { path: PATHS.tasks, label: 'All Tasks', icon: ListTodo, shortcut: 'G T' },
      { path: PATHS.myTasks, label: 'My Tasks', icon: CheckSquare, shortcut: 'G Y' },
      { path: PATHS.calendar, label: 'Calendar', icon: Calendar, shortcut: 'G C' },
      { path: PATHS.deadlines, label: 'Deadlines', icon: Clock, shortcut: 'G K' },
      { path: PATHS.deadlineCascade, label: 'Deadline Cascade', icon: GitBranch },
      { path: PATHS.projects, label: 'Projects', icon: FolderKanban, shortcut: 'G P' },
      { path: PATHS.manuscripts, label: 'Manuscripts', icon: FileText },
      { path: PATHS.ideas, label: 'Ideas', icon: Lightbulb },
      { path: PATHS.ask, label: 'Ask the Lab', icon: HelpCircle },
      { path: PATHS.decisions, label: 'Decisions', icon: Scale },
      { path: PATHS.digest, label: 'Research Digest', icon: BookOpen, shortcut: 'G L' },
      { path: PATHS.grants, label: 'Grants', icon: DollarSign },
      { path: PATHS.meetings, label: 'Meetings', icon: Users, shortcut: 'G M' },
      { path: PATHS.activity, label: 'Activity', icon: Activity },
      { path: PATHS.analytics, label: 'Analytics', icon: BarChart3 },
      { path: PATHS.piAnalytics, label: 'PI Analytics', icon: BarChart3 },
      { path: PATHS.settings, label: 'Settings', icon: Settings },
      { path: PUBLIC_PATHS.publicTeam, label: 'Team', icon: Users },
      { path: PATHS.search, label: 'Search', icon: Search, shortcut: 'G S' },
      { path: PATHS.sessions, label: 'Session History', icon: Clock },
      { path: PATHS.narratives, label: 'Narratives', icon: BookOpen },
      { path: PATHS.meetingNotes, label: 'Transcripts', icon: FileText },
    ]
    for (const nav of navItems) {
      items.push({
        id: `nav-${nav.path}`,
        label: nav.label,
        sublabel: `Go to ${nav.label}`,
        icon: nav.icon,
        action: () => { navigate(nav.path); setOpen(false) },
        category: 'navigation',
        shortcut: nav.shortcut,
      })
    }

    // Action commands
    items.push({
      id: 'action-create-task',
      label: 'Create Task',
      sublabel: 'Add a new task',
      icon: Plus,
      action: () => { navigate(`${PATHS.myTasks}?create=true`); setOpen(false) },
      category: 'action',
      shortcut: 'C',
    })
    items.push({
      id: 'action-create-idea',
      label: 'Submit Idea',
      sublabel: 'Add a new research idea',
      icon: Lightbulb,
      action: () => { navigate(`${PATHS.ideas}?create=true`); setOpen(false) },
      category: 'action',
    })
    items.push({
      id: 'action-ask-question',
      label: 'Ask the Lab',
      sublabel: 'Post a question for anyone to answer',
      icon: HelpCircle,
      action: () => { navigate(`${PATHS.ask}?create=true`); setOpen(false) },
      category: 'action',
    })
    items.push({
      id: 'action-create-meeting',
      label: 'Schedule Meeting',
      sublabel: 'Create a new meeting',
      icon: CalendarPlus,
      action: () => { navigate(`${PATHS.meetings}?create=true`); setOpen(false) },
      category: 'action',
      shortcut: 'M',
    })
    items.push({
      id: 'action-create-decision',
      label: 'Log Decision',
      sublabel: 'Record a research decision',
      icon: Scale,
      action: () => { navigate(`${PATHS.decisions}?create=true`); setOpen(false) },
      category: 'action',
    })

    // Quick Filters
    items.push({
      id: 'filter-completed',
      label: 'Completed Tasks',
      sublabel: `${tasks.filter(t => t.completed).length} tasks done`,
      icon: CheckCircle2,
      action: () => { navigate(`${PATHS.myTasks}?status=done`); setOpen(false) },
      category: 'filter',
    })
    items.push({
      id: 'filter-in-progress',
      label: 'In Progress Tasks',
      sublabel: `${tasks.filter(t => t.status === 'in_progress').length} tasks active`,
      icon: CircleDot,
      action: () => { navigate(`${PATHS.myTasks}?status=in_progress`); setOpen(false) },
      category: 'filter',
    })
    items.push({
      id: 'filter-high-priority',
      label: 'High Priority',
      sublabel: `${tasks.filter(t => !t.completed && (t.priority === 'high' || t.priority === 'urgent')).length} high/urgent tasks`,
      icon: Flag,
      action: () => { navigate(`${PATHS.myTasks}?priority=high`); setOpen(false) },
      category: 'filter',
    })
    items.push({
      id: 'filter-due-today',
      label: 'Due Today',
      sublabel: `${tasks.filter(t => !t.completed && t.due_date === new Date().toISOString().split('T')[0]).length} tasks due today`,
      icon: Clock,
      action: () => { navigate(PATHS.myTasks); setOpen(false) },
      category: 'filter',
    })
    items.push({
      id: 'filter-overdue',
      label: 'Overdue Tasks',
      sublabel: `${tasks.filter(t => !t.completed && t.due_date && new Date(t.due_date + 'T23:59:59') < new Date()).length} tasks past due`,
      icon: AlertTriangle,
      action: () => { navigate(`${PATHS.myTasks}?status=todo`); setOpen(false) },
      category: 'filter',
    })

    // Contextual actions based on current page
    const currentPath = location.pathname
    if (currentPath === PATHS.tasks || currentPath === PATHS.myTasks) {
      items.push({
        id: 'ctx-tasks-filter-mine',
        label: 'Show My Tasks Only',
        sublabel: `${tasks.filter(t => !t.completed && t.assignee === currentUserSlug).length} tasks assigned to you`,
        icon: User,
        action: () => { navigate(`${PATHS.myTasks}?assignee=${currentUserSlug}`); setOpen(false) },
        category: 'context',
      })
      items.push({
        id: 'ctx-tasks-blocked',
        label: 'Show Blocked Tasks',
        sublabel: `${tasks.filter(t => t.status === 'blocked').length} tasks blocked`,
        icon: AlertTriangle,
        action: () => { navigate(`${PATHS.myTasks}?status=blocked`); setOpen(false) },
        category: 'context',
      })
    }
    if (currentPath === PATHS.projects) {
      items.push({
        id: 'ctx-projects-clif',
        label: 'Filter CLIF Projects',
        icon: FolderKanban,
        action: () => { navigate(`${PATHS.projects}?category=CLIF`); setOpen(false) },
        category: 'context',
      })
      items.push({
        id: 'ctx-projects-lab',
        label: 'Filter Lab Projects',
        icon: FolderKanban,
        action: () => { navigate(`${PATHS.projects}?category=Lab`); setOpen(false) },
        category: 'context',
      })
    }
    if (currentPath.startsWith(PATHS.meetings)) {
      items.push({
        id: 'ctx-meetings-next',
        label: 'Go to Next Meeting',
        sublabel: meetings[0]?.title,
        icon: Calendar,
        action: () => { if (meetings[0]) navigate(PATHS.meeting(meetings[0].id)); setOpen(false) },
        category: 'context',
      })
      items.push({
        id: 'ctx-meetings-prep',
        label: 'Open Meeting Prep View',
        sublabel: 'Facilitator dashboard',
        icon: ListTodo,
        action: () => { if (meetings[0]) navigate(PATHS.meetingPrep(meetings[0].id)); setOpen(false) },
        category: 'context',
      })
    }

    // Tasks (pending only) — include ALL so fuzzy search can find any;
    // final filtered.slice(0, 12) caps the rendered list after user query.
    // T-42: sublabel = project · due date. Airtable pattern. Assignee shown
    // only when ≠ current user.
    const projectById: Record<string, string> = {}
    for (const p of projects) projectById[p.slug] = p.title
    for (const task of tasks.filter((t) => !t.completed)) {
      const pid = (task as any).project_id || (task as any).project_slug
      const projectName = (pid && projectById[pid]) || ''
      const due = task.due_date ? new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
      const bits = [projectName, due].filter(Boolean)
      const isMine = task.assignee === currentUserSlug
      if (!isMine && task.assignee) {
        const person = getPersonInfo(task.assignee)
        if (person?.name) bits.push(person.name)
      }
      items.push({
        id: `task-${task.id}`,
        label: task.title || task.description,
        sublabel: bits.join(' · ') || task.status,
        icon: CheckSquare,
        action: () => { navigate(`${PATHS.myTasks}?open=${task.id}`); setOpen(false) },
        category: 'task',
      })
    }

    // Projects — include ALL so search can find projects beyond the first 15.
    for (const project of projects) {
      items.push({
        id: `project-${project.slug}`,
        label: project.title,
        sublabel: `${project.stage || 'Active'} · ${project.category}`,
        icon: FolderKanban,
        action: () => { navigate(PATHS.project(project.slug)); setOpen(false) },
        category: 'project',
      })
    }

    // Team members
    for (const member of team.filter((m) => m.slug)) {
      items.push({
        id: `person-${member.slug}`,
        label: member.name,
        sublabel: member.role,
        icon: User,
        action: () => { navigate(PATHS.teamMember(member.slug!)); setOpen(false) },
        category: 'person',
      })
    }

    // Meetings — include ALL so search can find older meetings too.
    for (const meeting of meetings) {
      items.push({
        id: `meeting-${meeting.id}`,
        label: meeting.title,
        sublabel: meeting.date,
        icon: Users,
        action: () => { navigate(PATHS.meeting(meeting.id)); setOpen(false) },
        category: 'meeting',
      })
    }

    return items
  }, [tasks, projects, team, meetings, navigate])

  // Project mode: when query starts with `/`
  const isProjectMode = query.startsWith('/')

  // Build project-mode items with enhanced info
  const projectModeItems = useMemo<CommandItem[]>(() => {
    if (!isProjectMode) return []

    // Compute task counts per project
    const taskCounts: Record<string, number> = {}
    const nextActions: Record<string, string> = {}
    for (const task of tasks.filter(t => !t.completed)) {
      const pid = (task as any).project_id || (task as any).project_slug
      if (pid) {
        taskCounts[pid] = (taskCounts[pid] || 0) + 1
        // First open task becomes next action (sorted by priority already from API)
        if (!nextActions[pid]) {
          nextActions[pid] = task.title || task.description || ''
        }
      }
    }

    return projects.map((project) => {
      const count = taskCounts[project.slug] || 0
      const next = nextActions[project.slug] || ''
      const stagePart = project.stage ? `${project.stage}` : ''
      const countPart = `${count} task${count !== 1 ? 's' : ''}`
      const nextPart = next ? ` · ${next.length > 40 ? next.slice(0, 40) + '...' : next}` : ''

      return {
        id: `proj-${project.slug}`,
        label: project.title,
        sublabel: `${stagePart}${stagePart ? ' · ' : ''}${countPart}${nextPart}`,
        icon: FolderKanban,
        action: () => { navigate(PATHS.project(project.slug)); setOpen(false) },
        category: 'project' as const,
        _taskCount: count,
        _stage: project.stage || '',
      } as CommandItem & { _taskCount: number; _stage: string }
    }).sort((a, b) => {
      // Sort by task count descending (most active first), then alphabetically
      const ac = (a as any)._taskCount || 0
      const bc = (b as any)._taskCount || 0
      if (bc !== ac) return bc - ac
      return a.label.localeCompare(b.label)
    })
  }, [isProjectMode, projects, tasks, navigate])

  // Filter by query (fuzzy)
  const filtered = useMemo(() => {
    // Project mode: filter within projects only
    if (isProjectMode) {
      const subQuery = query.slice(1).trim().toLowerCase()
      if (!subQuery) return projectModeItems.slice(0, 15)
      return projectModeItems
        .filter((i) => {
          const text = `${i.label} ${i.sublabel || ''}`.toLowerCase()
          let idx = 0
          for (const char of subQuery) {
            idx = text.indexOf(char, idx)
            if (idx === -1) return false
            idx++
          }
          return true
        })
        .slice(0, 15)
    }

    if (!query.trim()) {
      // Show recent + context + actions + filters + navigation when no query
      return allItems.filter((i) => i.category === 'recent' || i.category === 'context' || i.category === 'action' || i.category === 'filter' || i.category === 'navigation')
    }
    const q = query.toLowerCase()
    return allItems
      .filter((i) => {
        const text = `${i.label} ${i.sublabel || ''}`.toLowerCase()
        // Fuzzy: every character of query appears in order
        let idx = 0
        for (const char of q) {
          idx = text.indexOf(char, idx)
          if (idx === -1) return false
          idx++
        }
        return true
      })
      .slice(0, 12)
  }, [allItems, query, isProjectMode, projectModeItems])

  // Reset selection when filter changes
  useEffect(() => { setSelectedIndex(0) }, [filtered])

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        filtered[selectedIndex]?.action()
        break
      case 'Escape':
        setOpen(false)
        break
    }
  }, [filtered, selectedIndex])

  const categoryOrder: Record<string, number> = { recent: 0, context: 1, action: 2, filter: 3, navigation: 4, task: 5, project: 6, person: 7, meeting: 8 }
  const grouped = open ? filtered.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {} as Record<string, CommandItem[]>) : {}

  const categoryLabels: Record<string, string> = {
    recent: 'Recent',
    context: 'This Page',
    action: 'Actions',
    filter: 'Quick Filters',
    navigation: 'Go To',
    task: 'Tasks',
    project: isProjectMode ? 'Switch Project' : 'Projects',
    person: 'People',
    meeting: 'Meetings',
  }

  let globalIdx = -1

  return (
    <AnimatePresence>
      {open && (
    <motion.div
      className="fixed inset-0 flex items-start justify-center pt-[15vh]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 'var(--z-modal)' }}
      onClick={() => setOpen(false)}
    >
      <motion.div
        ref={paletteRef}
        role="dialog"
        aria-label="Command palette"
        aria-modal="true"
        data-testid="command-palette"
        className="w-full max-w-lg rounded-xl shadow-2xl border overflow-hidden card-elevated"
        initial={{ opacity: 0, scale: 0.95, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -4 }}
        transition={spring.snappy}
        style={{ backgroundColor: 'var(--cream, white)', borderColor: 'var(--border-subtle)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          {isProjectMode
            ? <FolderKanban size={16} style={{ color: 'var(--teal)', opacity: 0.85 }} />
            : <Search size={16} style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }} />
          }
          <input
            ref={inputRef}
            data-testid="command-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isProjectMode ? "Switch to project..." : "Search tasks, projects, people, or type a command..."}
            className="flex-1 text-sm outline-none"
            style={{ color: 'var(--ink)', background: 'none', border: 'none' }}
            role="combobox"
            aria-expanded={filtered.length > 0}
            aria-controls="command-palette-results"
            aria-autocomplete="list"
            aria-activedescendant={selectedIndex >= 0 ? `cmd-result-${selectedIndex}` : undefined}
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', borderColor: 'var(--border-subtle)', opacity: 'var(--ink-label)' }}>
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} id="command-palette-results" role="listbox" aria-label="Search results" className="max-h-[50vh] overflow-y-auto py-1" style={{ scrollbarWidth: 'thin' }}>
          {Object.entries(grouped)
            .sort(([a], [b]) => (categoryOrder[a] || 9) - (categoryOrder[b] || 9))
            .map(([category, items]) => (
              <div key={category}>
                <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                  {categoryLabels[category] || category}
                </div>
                {items.map((item) => {
                  globalIdx++
                  const isSelected = globalIdx === selectedIndex
                  const Icon = item.icon
                  const currentIdx = globalIdx
                  return (
                    <div
                      key={item.id}
                      role="option"
                      id={`cmd-result-${currentIdx}`}
                      aria-selected={isSelected}
                      tabIndex={-1}
                      className="flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors"
                      style={{
                        backgroundColor: isSelected ? 'var(--teal-active)' : 'transparent',
                      }}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIndex(currentIdx)}
                    >
                      <Icon size={15} style={{ color: isSelected ? 'var(--teal)' : 'var(--slate)', opacity: isSelected ? 1 : 0.85, flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm truncate block" style={{ color: isSelected ? 'var(--teal)' : 'var(--ink)', fontWeight: isSelected ? 500 : 400 }}>
                          {item.label}
                        </span>
                        {item.sublabel && (
                          <span className="text-[10px] truncate block" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                            {item.sublabel}
                          </span>
                        )}
                      </div>
                      {item.shortcut && (
                        <kbd className="text-[10px] px-1.5 py-0.5 rounded border" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', borderColor: 'var(--border-subtle)', opacity: 'var(--ink-label)' }}>
                          {item.shortcut}
                        </kbd>
                      )}
                      {isSelected && <ArrowRight size={12} style={{ color: 'var(--teal)', opacity: 'var(--ink-label)' }} />}
                    </div>
                  )
                })}
              </div>
            ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
              No results for "{query}"
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t text-[10px]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--slate)' }}>
          <span style={{ opacity: 'var(--ink-label)' }}>↑↓ navigate</span>
          <span style={{ opacity: 'var(--ink-label)' }}>↵ select</span>
          <span style={{ opacity: 'var(--ink-label)' }}>esc close</span>
          {!isProjectMode && <span style={{ opacity: 'var(--ink-label)' }}>/ projects</span>}
          <span style={{ opacity: 'var(--ink-hint)' }}>
            {tasks.filter(t => !t.completed).length} tasks · {projects.length} projects · {team.length} people · {meetings.length} meetings
          </span>
          {query.length >= 2 && (
            <button
              type="button"
              onClick={() => { navigate(`${PATHS.search}?q=${encodeURIComponent(query)}`); setOpen(false) }}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px]"
              style={{ color: 'var(--teal)', background: 'var(--teal-hover)', border: '1px solid rgba(45,138,138,0.3)', cursor: 'pointer' }}
              title="Open full Search page with this query"
            >
              View all <ArrowRight size={9} />
            </button>
          )}
          <span className="ml-auto flex items-center gap-1" style={{ opacity: 'var(--ink-label)' }}>
            <Command size={9} />K to toggle
          </span>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  )
}
