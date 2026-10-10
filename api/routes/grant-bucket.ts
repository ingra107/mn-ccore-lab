// SQL twin of src/lib/grantBucket.ts. Evaluates to 'active' | 'proposed' | 'ended'.
// `proposed` is read only when status is unset.
export const GRANT_BUCKET_SQL = `CASE
  WHEN status = 'funded' THEN 'active'
  WHEN status IN ('planning','in_preparation','submitted','resubmission') THEN 'proposed'
  WHEN status IN ('declined','closed') THEN 'ended'
  WHEN proposed = 1 THEN 'proposed'
  ELSE 'active' END`
