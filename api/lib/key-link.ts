// api/lib/key-link.ts — SSOT for the task key_link slot model. The 3 key_link_N
// slots are a write-once link cache on the tasks row (NOT A3-conflict targets —
// no base_seq/hash), backfilled at source by two paths that must agree on the
// slot rules: the artifact CREATE path (routes/artifacts.ts) and the artifact
// COMMENT path (lib/activity-entry.ts). One resolver + one desc cap so the two
// can't drift.

import { normalizeLink } from '../../shared/pbLinks.generated';
import { generateId } from '../helpers';

// Maximum 120 chars for a key_link description so it fits comfortably in
// Obsidian/TODAY.md.
export const KEY_LINK_DESC_MAX = 120;

export interface TaskKeyLinkRow {
  key_link_1: string | null;
  key_link_2: string | null;
  key_link_3: string | null;
}

/**
 * Resolve which key_link slot a URL should occupy on a task row.
 *   { slot: 1|2|3, alreadyPresent: false } → first empty slot, left-to-right
 *   { slot: null,  alreadyPresent: false } → all three slots occupied
 *   { slot: null,  alreadyPresent: true  } → URL already linked (idempotent)
 */
export function resolveKeyLinkSlot(
  task: TaskKeyLinkRow,
  url: string,
): { slot: 1 | 2 | 3 | null; alreadyPresent: boolean } {
  const slots: [1 | 2 | 3, string | null][] = [
    [1, task.key_link_1],
    [2, task.key_link_2],
    [3, task.key_link_3],
  ];
  for (const [, val] of slots) {
    if (val === url) return { slot: null, alreadyPresent: true };
  }
  for (const [n, val] of slots) {
    if (!val) return { slot: n, alreadyPresent: false };
  }
  return { slot: null, alreadyPresent: false };
}

/** Build the `Hermes: <title>` key_link description, capped to KEY_LINK_DESC_MAX. */
export function hermesKeyLinkDesc(title: string): string {
  return `Hermes: ${title.trim()}`.slice(0, KEY_LINK_DESC_MAX);
}

// ---------------------------------------------------------------------------
// Slot -> `links` mirror (#8842 R7)
// ---------------------------------------------------------------------------
// The typed `links` table replaces the slots by expand/contract
// (PB Context/Decisions/2026-06-20-links-table.md): every slot write was to
// write both stores. Only PB's writers did, best-effort and after the fact, so
// a slot written on the Hub (the Gmail Apps Script create, the KeyLinksEditor)
// never reached `links`, and every reader of `links` missed it: 608 of 801
// task slots on 2026-10-05. The mirror now lives HERE, as statements that ride
// in the same D1 batch as the slot write, so a slot cannot land without its
// links row. Callers: mutations.ts applyInsert / decideAndCommitUpdate.

const SLOTS = [1, 2, 3] as const;

const SLOT_COLS = SLOTS.flatMap((n) => [`key_link_${n}`, `key_link_${n}_desc`]);

/** True when a patch or payload carries any key_link slot column. */
export function touchesKeyLinkSlots(fields: Record<string, unknown> | undefined): boolean {
  if (!fields) return false;
  return SLOT_COLS.some((c) => Object.prototype.hasOwnProperty.call(fields, c));
}

interface SlotLink {
  slot: 1 | 2 | 3;
  type: string;
  canonical_url: string;
  short_title: string;
  source_raw: string | null;
  /** The slot's own description, when it has one (the user-chosen title). */
  desc: string | null;
}

/** Each non-empty slot normalized, in slot order, one entry per canonical (the
 *  first slot holding it wins). An unrecognizable value is skipped: it stays in
 *  the slot, as PB's writers have always left it. */
function slotLinks(row: Record<string, unknown>): SlotLink[] {
  const out: SlotLink[] = [];
  const seen = new Set<string>();
  for (const n of SLOTS) {
    const raw = row[`key_link_${n}`];
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const d = row[`key_link_${n}_desc`];
    const desc = typeof d === 'string' && d.trim() ? d : null;
    const link = normalizeLink(raw, { titleHint: desc });
    if (!link || seen.has(link.canonical_url)) continue;
    seen.add(link.canonical_url);
    out.push({ slot: n, ...link, desc });
  }
  return out;
}

/**
 * The statements that bring `links` in line with a slot write, for one D1 batch.
 *
 * `before` is the row as it stood (`{}` on insert), `after` the row the write
 * produces. `landed` is a SQL predicate that is true only when the slot write
 * in the same batch took effect; every statement is gated on it, so a write
 * that loses its compare-and-swap leaves `links` untouched too.
 *
 *  - INSERT a live role='key' row for each slot canonical that has none.
 *    NOT EXISTS, not OR IGNORE: the partial UNIQUE on the live natural key
 *    would otherwise abort the WHOLE batch, slot write included, and OR IGNORE
 *    would also hide a NOT NULL or CHECK failure. Two slots that normalize to
 *    one canonical make one row (the first slot holding it wins).
 *  - Bring the live row for each slot canonical into line with its slot:
 *    sort_order = slot - 1 always (the editor compacts the slots on remove),
 *    short_title = the slot's description when it has one (a title edit
 *    reaches the row). Only rows that differ are touched, so an unchanged
 *    slot write bumps no seq.
 *  - Tasks only: tombstone the canonical a slot held BEFORE, when no slot
 *    holds it AFTER. What is protected: a role='key' link whose canonical no
 *    slot ever held (a "More links" row) is never touched. What is NOT: the
 *    live natural key admits one role='key' row per canonical, so pinning a
 *    "More links" URL into a slot makes that same row the slot's row, and
 *    clearing the slot tombstones it. That is a soft delete; Phase B (pin =
 *    sort_order, unpin = demote, delete = explicit) is the real fix.
 *  - Projects are insert-only. A project's pinned slots sit over its link
 *    library, and unpinning is not deleting (Nick, 2026-07-21): the old URL
 *    stays a live library link. PB never mirrored project slots at all
 *    (update_project refuses slot writes), so there is no PB precedent here.
 *
 * Rows are stamped with the slot write's mutation_id, so the caller reads
 * back exactly what this write touched (`SELECT ... WHERE last_mutation_id`).
 */
export function slotLinkStatements(
  db: D1Database,
  ownerTable: 'tasks' | 'projects',
  ownerId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  mutationId: string,
  landed: { sql: string; vals: unknown[] },
): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  const now = slotLinks(after);
  const nowUrls = new Set(now.map((l) => l.canonical_url));

  for (const l of now) {
    stmts.push(
      db.prepare(
        `INSERT INTO links (id, owner_table, owner_id, role, type, canonical_url, short_title, source_raw, sort_order, last_mutation_id)
         SELECT ?, ?, ?, 'key', ?, ?, ?, ?, ?, ?
         WHERE ${landed.sql}
           AND NOT EXISTS (SELECT 1 FROM links WHERE owner_table = ? AND owner_id = ? AND role = 'key' AND canonical_url = ? AND deleted_at IS NULL)`,
      ).bind(
        `link_${generateId()}`, ownerTable, ownerId, l.type, l.canonical_url, l.short_title,
        l.source_raw, l.slot - 1, mutationId,
        ...landed.vals,
        ownerTable, ownerId, l.canonical_url,
      ),
    );
    const title = l.desc;  // null: leave a title the slot did not set
    stmts.push(
      db.prepare(
        `UPDATE links SET sort_order = ?, short_title = COALESCE(?, short_title),
                updated_at = datetime('now'), last_mutation_id = ?
         WHERE ${landed.sql}
           AND owner_table = ? AND owner_id = ? AND role = 'key' AND canonical_url = ? AND deleted_at IS NULL
           AND (sort_order IS NOT ? OR (? IS NOT NULL AND short_title IS NOT ?))`,
      ).bind(
        l.slot - 1, title, mutationId,
        ...landed.vals,
        ownerTable, ownerId, l.canonical_url,
        l.slot - 1, title, title,
      ),
    );
  }

  if (ownerTable === 'tasks') {
    const gone = new Set(
      slotLinks(before).map((l) => l.canonical_url).filter((u) => !nowUrls.has(u)),
    );
    for (const url of gone) {
      stmts.push(
        db.prepare(
          `UPDATE links SET deleted_at = datetime('now'), updated_at = datetime('now'), last_mutation_id = ?
           WHERE ${landed.sql}
             AND owner_table = 'tasks' AND owner_id = ? AND role = 'key' AND canonical_url = ? AND deleted_at IS NULL`,
        ).bind(mutationId, ...landed.vals, ownerId, url),
      );
    }
  }
  return stmts;
}

/** Read back the links rows a slot write touched (see slotLinkStatements). */
export function touchedLinksRead(db: D1Database, mutationId: string): D1PreparedStatement {
  return db.prepare('SELECT * FROM links WHERE last_mutation_id = ? ORDER BY sort_order, id').bind(mutationId);
}
