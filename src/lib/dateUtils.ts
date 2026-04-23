/**
 * Shared date formatting utilities.
 * All functions accept ISO date strings and handle timezone-safe parsing.
 */

// Append T12:00:00 to date-only strings to avoid midnight timezone rollover
function safeParse(dateStr: string): Date {
  if (dateStr.length === 10) return new Date(dateStr + 'T12:00:00')
  return new Date(dateStr)
}

/** "Mar 25" */
export function formatShortDate(dateStr: string): string {
  return safeParse(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "Mar 25, 2025" */
export function formatMediumDate(dateStr: string): string {
  return safeParse(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "Monday, March 25, 2025" */
export function formatLongDate(dateStr: string): string {
  return safeParse(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

/** "Mon, Mar 25, 2025" */
export function formatFullDate(dateStr: string): string {
  return safeParse(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/** "just now", "5m ago", "3h ago", "2d ago", or "Mar 25" */
export function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function isOverdue(dueDate: string | null, status?: string): boolean {
  if (!dueDate || status === 'done' || status === 'completed') return false
  return new Date(dueDate + 'T23:59:59') < new Date()
}

export function getDaysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T23:59:59')
  return Math.ceil((target.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
}

export function getDaysAgo(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00')
  return Math.floor((new Date().getTime() - target.getTime()) / (1000 * 60 * 60 * 24))
}
