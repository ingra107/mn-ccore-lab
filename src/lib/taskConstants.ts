export const STATUS_CONFIG = {
  todo: { label: 'Todo', color: 'var(--slate)', icon: 'Circle' },
  in_progress: { label: 'In Progress', color: 'var(--teal)', icon: 'Clock' },
  done: { label: 'Done', color: '#16a34a', icon: 'CheckCircle2' },
  blocked: { label: 'Blocked', color: 'var(--maroon)', icon: 'Ban' },
} as const

export const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', color: 'var(--maroon)' },
  high: { label: 'High', color: '#c2410c' },
  medium: { label: 'Medium', color: 'var(--gold)' },
  low: { label: 'Low', color: 'var(--slate)' },
} as const

export const STAGE_COLORS: Record<string, string> = {
  Idea: '#64748b',
  'Data Collection': '#5b8abf',
  Analysis: '#2d8a8a',
  Writing: '#c9a84c',
  Review: '#7a0019',
  Published: '#16a34a',
}
