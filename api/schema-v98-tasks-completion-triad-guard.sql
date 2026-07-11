-- schema-v98-tasks-completion-triad-guard.sql
--
-- Kills the completion-triad-inconsistency ORIGIN at the D1 layer: a BEFORE
-- INSERT/UPDATE trigger pair that makes "status='done' <=> completed=1 <=>
-- completed_at set" unrepresentable for any non-deleted tasks row, no matter
-- which write path produced it.
--
-- WHY (backlog #629, PB+Hub, filed 2026-07-10): the JS validator
-- `assertCompletionTriad` (api/lib/enum-domains.ts) only guards the
-- `/api/mutations` write path (verified: api/routes/tasks.ts:447 delegates to
-- it too, but ANY write that reaches D1 by another route does not). The
-- 2026-07-08 incident (schema-v96/v97 action_items backfill, #550) minted 11
-- rows with status='done' AND completed_at IS NULL via a raw `--file` seed/
-- backfill that never went through the validator at all — the API-layer
-- guard cannot see a write that bypasses the API. This trigger closes that
-- class structurally (ethos #15, Level 1): the wrong row literally cannot be
-- INSERTed or UPDATEd into D1 regardless of caller (API, --file, --command,
-- seed script, or any future writer).
--
-- Consensus: two independent cold planners (mechanic + builder) proposed this
-- fix for backlog #629's deferred origin-kill; the codex tiebreak selected
-- the trigger design (RAISE(ABORT), no table rebuild; rollback = two
-- `DROP TRIGGER` statements) over the competing CHECK-constraint design
-- (which would require a full table rebuild to install AND to roll back).
--
-- DELETED-ROW EXEMPTION: `NEW.status IS NOT 'deleted'` in the WHEN guard.
-- Live prod D1 already carries ~116 tasks rows with completed=1 (or a
-- completed/completed_at combination that would otherwise violate the triad)
-- alongside status='deleted' — a deleted row is a tombstone, not a
-- completion, and its stored completion flags are historical residue from
-- whatever state the row was in at delete time. Enforcing the triad on
-- deleted rows would make those existing rows permanently unwritable (any
-- future UPDATE to them — including a legitimate one touching an unrelated
-- column — would abort) and would incorrectly treat "deleted" as a fourth
-- completion state it is not. This exactly mirrors the PB-side sibling guard
-- (Peripheral-Brain scripts/db/migrations/090_tasks_completion_tombstone_
-- write_guard.sql, `trg_tasks_completion_triad_guard_ins/_upd`), which
-- exempts non-deleted rows for the identical reason on brain.db. Hub has no
-- PB-style `_pb_sync_apply_ok` pull-sentinel exemption — Hub D1 IS the
-- synced-state arbiter (A3 since 2026-04-30), so there is no "inbound
-- canonical write" to exempt from; every write reaching this trigger is
-- itself the canonical write.
--
-- Unlike mig-090 (2 guards: completion-triad + tombstone), this migration
-- ships ONLY the completion-triad guard — the tombstone guard
-- (deleted_at set => status='deleted') is a separate, not-yet-adjudicated
-- concern on the Hub side and is out of scope for #629.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_tasks_completion_triad_guard_ins;
--   DROP TRIGGER IF EXISTS trg_tasks_completion_triad_guard_upd;
--
-- Idempotent (DROP TRIGGER IF EXISTS precedes each CREATE TRIGGER); safe to
-- re-apply. Triggers only RAISE(ABORT) — they never write.

DROP TRIGGER IF EXISTS trg_tasks_completion_triad_guard_ins;
DROP TRIGGER IF EXISTS trg_tasks_completion_triad_guard_upd;

CREATE TRIGGER trg_tasks_completion_triad_guard_ins BEFORE INSERT ON tasks FOR EACH ROW
WHEN NEW.status IS NOT 'deleted'
 AND ( (NEW.status IS 'done' AND COALESCE(NEW.completed, 0) != 1)
    OR (NEW.status IS 'done' AND NULLIF(NEW.completed_at, '') IS NULL)
    OR (COALESCE(NEW.completed, 0) = 1 AND NEW.status IS NOT 'done')
    OR (NULLIF(NEW.completed_at, '') IS NOT NULL AND COALESCE(NEW.completed, 0) != 1) )
BEGIN SELECT RAISE(ABORT, 'tasks completion triad guard: non-deleted rows require status=done <=> completed=1 <=> completed_at set'); END;

CREATE TRIGGER trg_tasks_completion_triad_guard_upd BEFORE UPDATE ON tasks FOR EACH ROW
WHEN NEW.status IS NOT 'deleted'
 AND ( (NEW.status IS 'done' AND COALESCE(NEW.completed, 0) != 1)
    OR (NEW.status IS 'done' AND NULLIF(NEW.completed_at, '') IS NULL)
    OR (COALESCE(NEW.completed, 0) = 1 AND NEW.status IS NOT 'done')
    OR (NULLIF(NEW.completed_at, '') IS NOT NULL AND COALESCE(NEW.completed, 0) != 1) )
BEGIN SELECT RAISE(ABORT, 'tasks completion triad guard: non-deleted rows require status=done <=> completed=1 <=> completed_at set'); END;
