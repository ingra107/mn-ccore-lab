/**
 * taskLinkOverflow — partition a task's stored links (the unbounded `links`
 * table, post-mig-110 source of truth) against the 3 denormalized
 * key_link_1/2/3 slots (#910, Nick 2026-07-24: "in the FULL expanded version
 * of task edit we should have all the links shown on the hub whenever
 * possible").
 *
 * WHY: the 2026-06-21 double-render cleanup (62b31111) removed the read-only
 * task-own chips on the premise that slots are backfilled 1:1 from the links
 * table. That premise holds only while a task has <= 3 links — the table is
 * unbounded, so a 4th+ link had NO render path anywhere in the expanded view
 * and was indistinguishable from "never saved."
 *
 * TOTAL-COVERAGE INVARIANT (the point of this module): every live stored link
 * either matches a slot URL (rendered editably by KeyLinksEditor) or is
 * returned by taskOwnOverflowLinks (rendered as a read-only chip). There is
 * no predicate under which a live row renders nowhere.
 *
 * Matching is deliberately CONSERVATIVE — exact equality on the raw slot URL
 * or its normalizeLink() canonical form (the same generated PB link-contract
 * canonicalizer that wrote `links.canonical_url` in the first place). A
 * canonicalization mismatch therefore degrades to a DUPLICATE chip (visible
 * twice, cosmetic), never an invisible link. The failure direction is chosen
 * on purpose: over-matching would hide links; under-matching only repeats one.
 */

import { normalizeLink } from './pbLinks.generated'
import type { StoredLink } from '../hooks/useApiData'

export type SlotUrl = string | null | undefined

/**
 * The set of canonical_url forms a task's key_link_* slots can take in the
 * links table: each non-empty slot contributes its raw trimmed URL plus its
 * PB-canonical form (when the link contract recognizes it).
 */
export function slotCanonicalUrls(slotUrls: SlotUrl[]): Set<string> {
  const covered = new Set<string>()
  for (const raw of slotUrls) {
    if (!raw) continue
    const trimmed = raw.trim()
    if (!trimmed) continue
    covered.add(trimmed)
    const canonical = normalizeLink(trimmed)?.canonical_url
    if (canonical) covered.add(canonical)
  }
  return covered
}

/**
 * Task-own stored links NOT covered by a key_link_* slot — the rows the
 * 3-slot denormalization silently dropped. Preserves the caller's array
 * order (the API returns sort_order ASC, id ASC — already deterministic).
 */
export function taskOwnOverflowLinks(
  taskLinks: StoredLink[] | undefined,
  slotUrls: SlotUrl[],
): StoredLink[] {
  if (!taskLinks || taskLinks.length === 0) return []
  const covered = slotCanonicalUrls(slotUrls)
  return taskLinks.filter((link) => !covered.has(link.canonical_url))
}
