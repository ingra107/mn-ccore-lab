// api/lib/artifact-link-mirror.ts — mirror a Hermes artifact portal URL into the
// synced `links` table (#196).
//
// Background: the artifact create-path (routes/artifacts.ts) and comment-path
// (lib/activity-entry.ts) write the artifact URL to a legacy key_link_N SLOT.
// But the P5 readers (TODAY.md scripts/today/sections.py, the Hub link panel)
// were cut over to the `links` table — so a slot-only artifact link is INVISIBLE
// to them. This helper writes the matching `links` row so they render it.
//
// Canonical parity is the dedup hinge: a Hub-created links row and a PB-pushed
// one must collapse on the (owner_table, owner_id, role, canonical_url) partial-
// UNIQUE. PB's link contract (scripts/links/link_contract.py) host-normalizes
// /portal/artifacts/art_<hex> to the PROD origin on the stable art_ id (so the
// request/staging/custom-domain origin can't fork the key). We MUST byte-match
// that canonical here. api/ does not import the generated normalizer in src/lib
// (same boundary reason artifact-url.ts is a self-contained copy), so the cross-
// repo fixture corpus (link-fixtures.json) is the drift gate that keeps the two
// in lockstep.

import type { AuthUser, Env } from '../helpers';
import { generateId } from '../helpers';
import { nowInstant } from './time';
import { applyInsert, type Mutation } from '../routes/mutations';
import { artifactIdFromUrl } from './artifact-url';

// MUST equal the host the PB `artifact` contract rule normalizes to
// (link_contract.py: https://mn-ccore-lab.pages.dev/portal/artifacts/\1).
const ARTIFACT_CANONICAL_ORIGIN = 'https://mn-ccore-lab.pages.dev';

/**
 * Canonical links.canonical_url for an artifact portal URL — host-normalized to
 * the prod origin on the stable art_ id. Returns null when the URL carries no
 * art_<hex> id (defensive; callers pass URLs already matched by ARTIFACT_URL_RE).
 */
export function artifactCanonicalUrl(url: string): string | null {
  const artId = artifactIdFromUrl(url);
  return artId ? `${ARTIFACT_CANONICAL_ORIGIN}/portal/artifacts/${artId}` : null;
}

export type ArtifactLinkMirrorResult =
  | 'inserted'
  | 'already_present'
  | 'skipped_no_id'
  | 'failed';

/**
 * Mirror an artifact portal URL into the `links` table for a task/project owner.
 *
 * - Idempotent: pre-checks the live (owner, role, canonical_url) natural key and
 *   skips if present. applyInsert's ON CONFLICT targets only the PK, so a same-
 *   url/different-id insert would hit the partial-UNIQUE and THROW — the pre-
 *   check (plus the catch-all below for the rare race) avoids surfacing that.
 * - Writes REGARDLESS of slot availability: the links table is uncapped, so an
 *   artifact link shows on TODAY.md even when all 3 legacy key_link slots are
 *   full (the whole point of #196 — slots are a capped legacy cache).
 * - NEVER throws: a mirror failure leaves the slot as the recoverable fallback
 *   (Nick 2026-06-23: sequential slot-then-link is acceptable). The /process
 *   safety-net + backfill_key_links_to_links.py reconcile a missed row.
 *
 * Routes through the EXPORTED applyInsert (precedent: routes/handoffs.ts:78-90),
 * so the row gets last_mutation_id stamping + the trg_links_seq_insert-assigned
 * seq the A3 pull cursor needs.
 *
 * NB (#199c): calling applyInsert directly BYPASSES processOne's gate stack —
 * ALLOWED_TABLES / TABLE_FIELDS / assertProtectedNotNull / assertEnumDomain.
 * Safe today: all 8 payload cols below are whitelisted and `links` has no enum
 * domain. But a future `links` column omitted from the whitelist would fail
 * SILENTLY at D1 here (status 'failed', no validation error). Keep this payload
 * in lockstep with the links mutation schema, or route through processOne.
 */
export async function mirrorArtifactLink(
  env: Env,
  ownerTable: 'tasks' | 'projects',
  ownerId: string,
  url: string,
  shortTitle: string,
  user: AuthUser,
): Promise<ArtifactLinkMirrorResult> {
  const canonical = artifactCanonicalUrl(url);
  if (!canonical) return 'skipped_no_id';

  try {
    // Idempotency pre-check on the live natural key.
    const existing = await env.DB.prepare(
      `SELECT id FROM links
         WHERE owner_table = ? AND owner_id = ? AND role = 'key'
           AND canonical_url = ? AND deleted_at IS NULL
         LIMIT 1`,
    ).bind(ownerTable, ownerId, canonical).first<{ id: string }>();
    if (existing) return 'already_present';

    // Append after the owner's existing live links. sort_order is display order;
    // slot-position alignment is cosmetic, so a new artifact link appends.
    const maxRow = await env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), -1) AS m FROM links
         WHERE owner_table = ? AND owner_id = ? AND deleted_at IS NULL`,
    ).bind(ownerTable, ownerId).first<{ m: number }>();
    const sortOrder = (maxRow?.m ?? -1) + 1;

    const mut: Mutation = {
      mutation_id: `mut_${generateId()}`,
      origin_machine: 'hub',
      table: 'links',
      op: 'insert',
      record_id: `link_${generateId()}`,
      base_seq: null,
      base_row_hash: null,
      payload: {
        owner_table: ownerTable,
        owner_id: ownerId,
        role: 'key',
        type: 'artifact',
        canonical_url: canonical,
        short_title: shortTitle,
        source_raw: url !== canonical ? url : null,
        sort_order: sortOrder,
      },
      client_ts: nowInstant(),
      issued_at: nowInstant(),
    };
    // #199c (defense-in-depth note): applyInsert is the raw insert primitive — it
    // BYPASSES processOne's ALLOWED_TABLES / TABLE_FIELDS / assertProtectedNotNull /
    // assertEnumDomain gates. Safe today: all 8 payload cols above are whitelisted
    // and `links` carries no enum domain. RISK if links ever gains a field not in
    // the insert whitelist OR an enum-constrained column — it would fail silently at
    // D1 and surface only as a 'failed' return, not a validation error. Keep this
    // payload in sync with the links insert whitelist if the schema grows.
    const res = await applyInsert(env, mut, user);
    return res.status === 'accepted' ? 'inserted' : 'failed';
  } catch (e) {
    // Rare pre-check/insert race or a genuine write error — the slot remains the
    // recoverable fallback. Log, don't propagate (must not 500 the artifact
    // create / comment post over a non-critical link mirror).
    console.error(
      `mirrorArtifactLink failed for ${url} on ${ownerTable}/${ownerId}:`,
      e,
    );
    return 'failed';
  }
}
