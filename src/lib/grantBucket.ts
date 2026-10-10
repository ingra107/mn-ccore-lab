// One place that turns a grant's status into its bucket. The `proposed` column
// is only a fallback for rows whose status is unset (it goes stale when status
// is edited). The SQL twin lives in api/routes/grant-bucket.ts.
export type GrantBucket = 'active' | 'proposed' | 'ended'

export function grantBucket(g: { status?: string | null; proposed?: boolean | number | null }): GrantBucket {
  switch (g.status) {
    case 'funded': return 'active'
    case 'planning': case 'in_preparation': case 'submitted': case 'resubmission': return 'proposed'
    case 'declined': case 'closed': return 'ended'
    default: return g.proposed ? 'proposed' : 'active'
  }
}
