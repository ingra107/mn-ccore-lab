// task-run-skill.ts -- who may write tasks.run_skill (schema-v155, 2026-11-02).
//
// tasks.run_skill names the PB skill the task's teal Run button starts (PB
// Context/Decisions/2026-11-02-task-run-skill.md). PB producers write it through
// /api/mutations with the PB API key; nothing else may. The D1 CHECK
// tasks_run_skill_shape owns the value's shape. This function owns the writer:
//
//   1. a write that CHANGES run_skill must come from the PB API key and not from
//      a hub_ui: route. A PI browser session is refused too: /api/mutations admits
//      one (helpers.ts isPiRequest), and Nick's own tab can be driven by another
//      page. A write that carries the stored value unchanged (a whole-row copy)
//      is not a change and passes.                        -> run_skill_writer
//   2. a question or a check-in never carries one (they have their own surfaces,
//      and a check-in is one tap).                         -> run_skill_kind
//   3. the shape, for a readable refusal before D1's CHECK fires. -> run_skill_shape
//
// `isPbKey` is decided from authentication, never from a header: the receipts
// middleware stamps env.RECEIPT_ORIGIN only for a valid PB_API_KEY
// (api/lib/receipts.ts receiptOriginOf), and the caller passes
// originOf(env) !== null. A receipt Undo runs with RECEIPT_ORIGIN cleared, so an
// undo that would change run_skill is refused; a producer re-run fixes it.
//
// Level 2 (one chokepoint, applyInsert + applyPatch). Level 1 would need
// per-writer authorization in D1, which does not exist; a raw D1 write still gets
// through. The boundary that matters is on the laptop: PB runs a skill only if it
// is in the git-tracked enums.RUN_SKILLS and the task's source is one that skill
// allows.

import { HUB_UI_ORIGIN_PREFIX } from './task-question';

export const RUN_SKILL_COL = 'run_skill';

/** Same shape as the D1 CHECK and PB run_skill_task.SKILL_RE. */
export const RUN_SKILL_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const NO_RUN_SKILL_KINDS: ReadonlySet<string> = new Set(['question', 'checkin']);

export type RunSkillError = `run_skill_${'writer' | 'kind' | 'shape'}: ${string}`;

/**
 * `current` is {} on insert; `effective` is current + patch; `patch` is what
 * this write carries. Returns a refusal message or null.
 */
export function runSkillError(
  current: Record<string, unknown>,
  effective: Record<string, unknown>,
  patch: Record<string, unknown>,
  originMachine: string | undefined,
  isPbKey: boolean,
): RunSkillError | null {
  const carries = Object.prototype.hasOwnProperty.call(patch, RUN_SKILL_COL) && patch[RUN_SKILL_COL] !== undefined;
  if (carries) {
    const next = patch[RUN_SKILL_COL] ?? null;
    const stored = current[RUN_SKILL_COL] ?? null;
    if (next !== stored) {
      if ((originMachine ?? '').startsWith(HUB_UI_ORIGIN_PREFIX) || !isPbKey) {
        return `run_skill_writer: ${RUN_SKILL_COL} is written only by a PB producer with the PB API key, never from the Hub UI or a browser session`;
      }
      if (next !== null && (typeof next !== 'string' || !RUN_SKILL_RE.test(next))) {
        return `run_skill_shape: ${RUN_SKILL_COL} must be a skill directory name (a-z, 0-9, '-', 1-64 chars)`;
      }
    }
  }
  const value = effective[RUN_SKILL_COL] ?? null;
  if (value !== null && NO_RUN_SKILL_KINDS.has(String(effective.kind ?? 'task'))) {
    return `run_skill_kind: a ${String(effective.kind)} row cannot carry ${RUN_SKILL_COL}`;
  }
  return null;
}
