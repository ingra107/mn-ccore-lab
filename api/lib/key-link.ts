// api/lib/key-link.ts — SSOT for the task key_link slot model. The 3 key_link_N
// slots are a write-once link cache on the tasks row (NOT A3-conflict targets —
// no base_seq/hash), backfilled at source by two paths that must agree on the
// slot rules: the artifact CREATE path (routes/artifacts.ts) and the artifact
// COMMENT path (lib/activity-entry.ts). One resolver + one desc cap so the two
// can't drift.

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
