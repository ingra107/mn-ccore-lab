// planDraft -- the unsent answer to a week plan, kept in this browser so a
// reload does not lose it (#166, Nick 2026-11-04: "anyway that its saved in case
// of a refresh and then can be dropped after its clicked. its ok to be browser
// specific"). Deploys reload open tabs through the stale-chunk recovery, so a
// long pick page needs this. Nothing here reaches the Hub: the one write is
// still the answer, on a click of Prep or Save.

export interface PlanDraft {
  picked: string[]
  open: Record<string, boolean>
  choice: Record<string, string>
  text: Record<string, string>
}

const PREFIX = 'mnccore.planDraft.v1.'
/** A draft for an offer nobody answered is dead after the offer's week. */
const MAX_AGE_MS = 14 * 86_400_000

const keyOf = (taskId: string) => `${PREFIX}${taskId}`

export const EMPTY_PLAN_DRAFT: PlanDraft = { picked: [], open: {}, choice: {}, text: {} }

function isEmpty(d: PlanDraft): boolean {
  return d.picked.length === 0 && Object.keys(d.open).length === 0
    && Object.keys(d.choice).length === 0 && Object.keys(d.text).length === 0
}

export function readPlanDraft(taskId: string): PlanDraft {
  try {
    const raw = localStorage.getItem(keyOf(taskId))
    if (!raw) return EMPTY_PLAN_DRAFT
    const d = JSON.parse(raw) as Partial<PlanDraft>
    return {
      picked: Array.isArray(d.picked) ? d.picked : [],
      open: d.open ?? {}, choice: d.choice ?? {}, text: d.text ?? {},
    }
  } catch {
    return EMPTY_PLAN_DRAFT
  }
}

export function writePlanDraft(taskId: string, draft: PlanDraft, nowMs: number): void {
  try {
    if (isEmpty(draft)) { localStorage.removeItem(keyOf(taskId)); return }
    localStorage.setItem(keyOf(taskId), JSON.stringify({ ...draft, savedAt: nowMs }))
  } catch { /* storage unavailable or full: the page still works, unsaved */ }
}

export function clearPlanDraft(taskId: string): void {
  try { localStorage.removeItem(keyOf(taskId)) } catch { /* unavailable */ }
}

/** Drop drafts of offers that were never answered. */
export function prunePlanDrafts(nowMs: number): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (!k?.startsWith(PREFIX)) continue
      let savedAt = 0
      try { savedAt = Number((JSON.parse(localStorage.getItem(k) ?? '{}') as { savedAt?: unknown }).savedAt) || 0 } catch { /* unreadable: drop it */ }
      if (nowMs - savedAt > MAX_AGE_MS) localStorage.removeItem(k)
    }
  } catch { /* unavailable */ }
}
