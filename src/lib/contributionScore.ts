// The member Activity card shows a decay-weighted score (each contribution
// counts less as it ages, half-life ~23 days) right above the heatmap's
// unweighted "N contributions in the last 90 days". Rounded to a whole number,
// a few old contributions scored 0 under a non-zero count (prod check
// 2026-10-11). The score is never shown as 0 while anything counted.

/** Display text for a decay-weighted score next to `count` contributions. */
export function formatContributionScore(score: number, count: number): string {
  if (count <= 0 || score <= 0) return '0'
  if (score >= 9.5) return String(Math.round(score))
  if (score >= 0.1) return score.toFixed(1).replace(/\.0$/, '')
  return '<0.1'
}
