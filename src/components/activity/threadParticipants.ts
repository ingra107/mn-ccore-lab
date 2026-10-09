/** Distinct people in a thread: the root author first, then the repliers in the
 *  order they first replied (the feed's comma-joined `participants` column). */
export function threadParticipants(rootActor: string, participantsCsv?: string | null): string[] {
  const out = [rootActor]
  for (const slug of (participantsCsv ?? '').split(',')) if (slug && !out.includes(slug)) out.push(slug)
  return out
}
