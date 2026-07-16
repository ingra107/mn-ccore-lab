// launchStatusLabel.ts — pure display-label helper for launch_log status
// values. Split out of LaunchLogPanel.tsx (a components-only file) so this
// non-component export has its own home. Covered by
// LaunchLogPanel.test.tsx.

export function statusLabel(s: string): string {
  switch (s) {
    case 'launched':  return 'Launched'
    case 'pending':   return 'Waiting for home'
    case 'completed': return 'Completed'
    case 'failed':    return 'Failed'
    case 'expired':   return 'Expired (home was offline)'
    default:          return s
  }
}
