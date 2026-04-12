import { X, FolderKanban, Users, CircleDot, Flag } from 'lucide-react'
import { useTeam } from '../../hooks/useApiData'
import { useProjects } from '../../hooks/useApiData'
import type { LucideIcon } from 'lucide-react'

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

function FilterChipSelect({
  icon: Icon,
  value,
  onChange,
  active,
  children,
}: {
  icon: LucideIcon
  value: string
  onChange: (val: string) => void
  active: boolean
  children: React.ReactNode
}) {
  return (
    <div className="relative flex items-center">
      <Icon
        size={13}
        className="absolute left-3 pointer-events-none"
        style={{ color: active ? 'var(--teal)' : 'var(--slate)', opacity: 0.7 }}
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-full border py-1.5"
        style={{
          fontSize: 'var(--value-size)',
          color: active ? 'var(--teal)' : 'var(--slate)',
          backgroundColor: active ? 'var(--teal-hover)' : 'transparent',
          borderColor: active ? 'var(--teal)' : 'var(--border-subtle)',
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 8px center',
          paddingLeft: '28px',
          paddingRight: '24px',
        }}
      >
        {children}
      </select>
    </div>
  )
}

export default function TaskFilters({ filters, onChange }: TaskFiltersProps) {
  const { data: team = [] } = useTeam()
  const { data: projects = [] } = useProjects()

  const hasFilters = filters.assignee || filters.status || filters.priority || filters.project

  const memberOptions = team
    .filter((m) => m.slug)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <FilterChipSelect
        icon={FolderKanban}
        value={filters.project}
        onChange={(val) => onChange({ ...filters, project: val })}
        active={!!filters.project}
      >
        <option value="">All Projects</option>
        {projects.map((p) => (
          <option key={p.slug} value={p.slug}>{p.title}</option>
        ))}
      </FilterChipSelect>

      <FilterChipSelect
        icon={Users}
        value={filters.assignee}
        onChange={(val) => onChange({ ...filters, assignee: val })}
        active={!!filters.assignee}
      >
        <option value="">All Members</option>
        {memberOptions.map((m) => (
          <option key={m.slug} value={m.slug}>{m.name}</option>
        ))}
      </FilterChipSelect>

      <FilterChipSelect
        icon={CircleDot}
        value={filters.status}
        onChange={(val) => onChange({ ...filters, status: val })}
        active={!!filters.status}
      >
        {statusOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </FilterChipSelect>

      <FilterChipSelect
        icon={Flag}
        value={filters.priority}
        onChange={(val) => onChange({ ...filters, priority: val })}
        active={!!filters.priority}
      >
        {priorityOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </FilterChipSelect>

      {hasFilters && (
        <button
          onClick={() => onChange({ assignee: '', status: '', priority: '', project: '' })}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] transition-colors hover:bg-black/5"
          style={{
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
