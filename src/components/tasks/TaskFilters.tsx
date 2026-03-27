import { Filter, X } from 'lucide-react'
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

const selectStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: '13px',
  color: 'var(--ink)',
  backgroundColor: 'white',
  borderColor: 'var(--border-light)',
  cursor: 'pointer',
}

export default function TaskFilters({ filters, onChange }: TaskFiltersProps) {
  const { data: team = [] } = useTeam()
  const { data: projects = [] } = useProjects()

  const hasFilters = filters.assignee || filters.status || filters.priority || filters.project

  const memberOptions = team
    .filter((m) => m.slug)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Filter size={14} style={{ color: 'var(--slate)', opacity: 0.5 }} />

      <select
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value })}
        className="rounded-md border px-2.5 py-1.5 text-sm"
        style={selectStyle}
      >
        {statusOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={filters.assignee}
        onChange={(e) => onChange({ ...filters, assignee: e.target.value })}
        className="rounded-md border px-2.5 py-1.5 text-sm"
        style={selectStyle}
      >
        <option value="">All Members</option>
        {memberOptions.map((m) => (
          <option key={m.slug} value={m.slug}>{m.name}</option>
        ))}
      </select>

      <select
        value={filters.priority}
        onChange={(e) => onChange({ ...filters, priority: e.target.value })}
        className="rounded-md border px-2.5 py-1.5 text-sm"
        style={selectStyle}
      >
        {priorityOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={filters.project}
        onChange={(e) => onChange({ ...filters, project: e.target.value })}
        className="rounded-md border px-2.5 py-1.5 text-sm"
        style={selectStyle}
      >
        <option value="">All Projects</option>
        {projects.map((p) => (
          <option key={p.slug} value={p.slug}>{p.title}</option>
        ))}
      </select>

      {hasFilters && (
        <button
          onClick={() => onChange({ assignee: '', status: '', priority: '', project: '' })}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors hover:bg-black/5"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--maroon)',
            cursor: 'pointer',
            background: 'none',
            border: 'none',
          }}
        >
          <X size={12} /> Clear
        </button>
      )}
    </div>
  )
}
