import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, LayoutDashboard, User, CheckSquare, ListTodo, Calendar,
  Clock, FolderKanban, FileText, Lightbulb, BookOpen, DollarSign,
  Users, Plus, ArrowRight, Command,
} from 'lucide-react'
import { useTasks, useProjects, useTeam, useMeetingsApi } from '../hooks/useApiData'
import { getPersonInfo } from '../data/team'

interface CommandItem {
  id: string
  label: string
  sublabel?: string
  icon: typeof Search
  action: () => void
  category: 'navigation' | 'task' | 'project' | 'person' | 'meeting' | 'action'
  shortcut?: string
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: team = [] } = useTeam()
  const { data: meetings = [] } = useMeetingsApi()

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

  // Focus input when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  // Build command items
  const allItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = []

    // Navigation commands
    const navItems: { path: string; label: string; icon: typeof Search; shortcut?: string }[] = [
      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: 'G D' },
      { path: '/personal', label: 'My Hub', icon: User, shortcut: 'G H' },
      { path: '/tasks', label: 'All Tasks', icon: ListTodo, shortcut: 'G T' },
      { path: '/my-tasks', label: 'My Tasks', icon: CheckSquare },
      { path: '/calendar', label: 'Calendar', icon: Calendar, shortcut: 'G C' },
      { path: '/deadlines', label: 'Deadlines', icon: Clock },
      { path: '/projects', label: 'Projects', icon: FolderKanban, shortcut: 'G P' },
      { path: '/manuscripts', label: 'Manuscripts', icon: FileText },
      { path: '/ideas', label: 'Ideas', icon: Lightbulb },
      { path: '/digest', label: 'Literature', icon: BookOpen },
      { path: '/grants', label: 'Grants', icon: DollarSign },
      { path: '/meetings', label: 'Meetings', icon: Users, shortcut: 'G M' },
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
      action: () => { navigate('/tasks?create=true'); setOpen(false) },
      category: 'action',
      shortcut: 'C',
    })
    items.push({
      id: 'action-create-idea',
      label: 'Submit Idea',
      sublabel: 'Add a new research idea',
      icon: Lightbulb,
      action: () => { navigate('/ideas?create=true'); setOpen(false) },
      category: 'action',
    })

    // Tasks (pending only)
    for (const task of tasks.filter((t) => !t.completed).slice(0, 20)) {
      const person = getPersonInfo(task.assignee)
      items.push({
        id: `task-${task.id}`,
        label: task.title || task.description,
        sublabel: `${person.name} · ${task.status}`,
        icon: CheckSquare,
        action: () => { navigate(`/tasks?open=${task.id}`); setOpen(false) },
        category: 'task',
      })
    }

    // Projects
    for (const project of projects.slice(0, 15)) {
      items.push({
        id: `project-${project.slug}`,
        label: project.title,
        sublabel: `${project.stage || 'Active'} · ${project.category}`,
        icon: FolderKanban,
        action: () => { navigate(`/projects/${project.slug}`); setOpen(false) },
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
        action: () => { navigate(`/team/${member.slug}`); setOpen(false) },
        category: 'person',
      })
    }

    // Meetings
    for (const meeting of meetings.slice(0, 5)) {
      items.push({
        id: `meeting-${meeting.id}`,
        label: meeting.title,
        sublabel: meeting.date,
        icon: Users,
        action: () => { navigate(`/meetings/${meeting.id}`); setOpen(false) },
        category: 'meeting',
      })
    }

    return items
  }, [tasks, projects, team, meetings, navigate])

  // Filter by query (fuzzy)
  const filtered = useMemo(() => {
    if (!query.trim()) {
      // Show navigation + actions when no query
      return allItems.filter((i) => i.category === 'navigation' || i.category === 'action')
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
  }, [allItems, query])

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

  if (!open) return null

  const categoryOrder: Record<string, number> = { action: 0, navigation: 1, task: 2, project: 3, person: 4, meeting: 5 }
  const grouped = filtered.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {} as Record<string, CommandItem[]>)

  const categoryLabels: Record<string, string> = {
    action: 'Actions',
    navigation: 'Navigation',
    task: 'Tasks',
    project: 'Projects',
    person: 'People',
    meeting: 'Meetings',
  }

  let globalIdx = -1

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: 'rgba(15, 25, 35, 0.5)' }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl border overflow-hidden"
        style={{ backgroundColor: 'white', borderColor: 'var(--border-light)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <Search size={16} style={{ color: 'var(--slate)', opacity: 0.5 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks, projects, people, or type a command..."
            className="flex-1 text-sm outline-none"
            style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)', background: 'none', border: 'none' }}
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', borderColor: 'var(--border-light)', opacity: 0.5 }}>
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1" style={{ scrollbarWidth: 'thin' }}>
          {Object.entries(grouped)
            .sort(([a], [b]) => (categoryOrder[a] || 9) - (categoryOrder[b] || 9))
            .map(([category, items]) => (
              <div key={category}>
                <div className="px-4 py-1.5 text-[9px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.4 }}>
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
                      className="flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors"
                      style={{
                        backgroundColor: isSelected ? 'rgba(45, 138, 138, 0.08)' : 'transparent',
                      }}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIndex(currentIdx)}
                    >
                      <Icon size={15} style={{ color: isSelected ? 'var(--teal)' : 'var(--slate)', opacity: isSelected ? 1 : 0.4, flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm truncate block" style={{ fontFamily: 'var(--font-sans)', color: isSelected ? 'var(--teal)' : 'var(--ink)', fontWeight: isSelected ? 500 : 400 }}>
                          {item.label}
                        </span>
                        {item.sublabel && (
                          <span className="text-[10px] truncate block" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>
                            {item.sublabel}
                          </span>
                        )}
                      </div>
                      {item.shortcut && (
                        <kbd className="text-[9px] px-1.5 py-0.5 rounded border" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', borderColor: 'var(--border-light)', opacity: 0.4 }}>
                          {item.shortcut}
                        </kbd>
                      )}
                      {isSelected && <ArrowRight size={12} style={{ color: 'var(--teal)', opacity: 0.5 }} />}
                    </div>
                  )
                })}
              </div>
            ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>
              No results for "{query}"
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t text-[10px]" style={{ borderColor: 'var(--border-light)', fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.4 }}>
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
          <span className="ml-auto flex items-center gap-1">
            <Command size={9} />K to toggle
          </span>
        </div>
      </div>
    </div>
  )
}
