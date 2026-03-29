import { X } from 'lucide-react'
import { useTeam } from '../../hooks/useApiData'
import { useProjects } from '../../hooks/useApiData'

interface TaskFiltersProps {
  filters: {
    assignee: string
    status: string
    priority: string
    project: string
  }
  onChange: (filters: TaskFiltersProps['filters']) => void
}

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
]

const priorityOptions = [
  { value: '', label: 'All Priorities' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export default function TaskFilters({ filters, onChange }: TaskFiltersProps) {
  const { data: team = [] } = useTeam()
  const { data: projects = [] } = useProjects()

  const hasFilters = filters.assignee || filters.status || filters.priority || filters.project

  const memberOptions = team
    .filter((m) => m.slug)
    .sort((a, b) => a.name.localeCompare(b.name))

  const chipStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: 'var(--font-sans)',
    fontSize: '12px',
    color: active ? 'var(--teal)' : 'var(--slate)',
    backgroundColor: active ? 'rgba(45,138,138,0.06)' : 'transparent',
    borderColor: active ? 'var(--teal)' : 'var(--border-light)',
    cursor: 'pointer',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
    paddingRight: '24px',
  })

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select
        value={filters.project}
        onChange={(e) => onChange({ ...filters, project: e.target.value })}
        className="rounded-full border px-3 py-1.5"
        style={chipStyle(!!filters.project)}
      >
        <option value="">All Projects</option>
        {projects.map((p) => (
          <option key={p.slug} value={p.slug}>{p.title}</option>
        ))}
      </select>

      <select
        value={filters.assignee}
        onChange={(e) => onChange({ ...filters, assignee: e.target.value })}
        className="rounded-full border px-3 py-1.5"
        style={chipStyle(!!filters.assignee)}
      >
        <option value="">All Members</option>
        {memberOptions.map((m) => (
          <option key={m.slug} value={m.slug}>{m.name}</option>
        ))}
      </select>

      <select
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value })}
        className="rounded-full border px-3 py-1.5"
        style={chipStyle(!!filters.status)}
      >
        {statusOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={filters.priority}
        onChange={(e) => onChange({ ...filters, priority: e.target.value })}
        className="rounded-full border px-3 py-1.5"
        style={chipStyle(!!filters.priority)}
      >
        {priorityOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {hasFilters && (
        <button
          onClick={() => onChange({ assignee: '', status: '', priority: '', project: '' })}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] transition-colors hover:bg-black/5"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--maroon)',
            cursor: 'pointer',
            background: 'none',
            border: 'none',
          }}
        >
          <X size={11} /> Clear
        </button>
      )}
    </div>
  )
}
