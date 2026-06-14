# M5 Notes-Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sever the brain.db `notes` → team-visible `description` leak by giving brain.db a real `description` column, making `notes` brain.db-local-only, and ending the `notes→description` wire rename — so `description` becomes a clean static team body and `notes` becomes a private local log.

**Architecture:** A cross-repo schema-contract change across **three** git repos: `Peripheral-Brain` (PB — sync engine + brain.db), the **`pb-schema` git submodule** (the generated field-authority contract, vendored into both PB and Hub), and `mn-ccore-lab` (Hub — Cloudflare Worker). The rename is authored **once** in PB's typed SSOT `scripts/db/schema_dsl.py` (per-column `ColumnSpec.hub_rename`) and **derived/aliased everywhere else** — so the contract flip is a small set of SSOT edits + a regen of two generated artifacts, plus a handful of hand-authored copies that do NOT derive from the SSOT and must be edited in lockstep. Two physical brain.db files (work laptop + home laptop) each get an additive column-migration that must be backfilled on **both** machines **before** the rename flips, gated by a `cross-machine-relay` confirm.

**Tech Stack:** Python (PB sync engine, SQLite/brain.db, migrations), TypeScript (Hub Worker + the generated `field-authority.generated.ts`), Cloudflare D1 (Hub canonical store), Vitest (Hub contract tests), `cross-machine-relay` skill (two-machine coordination).

**Source spec (APPROVED + codex-audited):** `docs/superpowers/specs/2026-06-13-m5-notes-privacy-final-design.md`. This plan folds in all 10 codex amendments.

---

## The contract picture (verified against current code 2026-06-14 — re-grep before edit, numbers drift)

**The rename is authored in ONE place and derived everywhere:**
- SSOT: `PB/scripts/db/schema_dsl.py` — `("tasks","notes"): _hub(rename="description")` (line ~390) and `("projects","notes"): _hub(rename="description")` (line ~453). The wire whitelist is **derived** from `spec.hub_rename` by `_derive_governed_table_fields()` (~line 593).
- Module maps in the same file alias it: `LOCAL_TO_HUB_FIELD_MAP` (~698: `{"notes":"description"}`), `HUB_TO_LOCAL` (~507: `{"description":"notes"}`), `BRAIN_DB_ONLY_FIELDS` (~717: `notes` NOT yet present).
- `PB/scripts/db/outbox.py` aliases those maps (`_LOCAL_TO_HUB_FIELD_MAP = schema_dsl.LOCAL_TO_HUB_FIELD_MAP`, ~343). So `translate_patch_for_hub`, `compute_base_hash`, `_compute_field_race`, `build_hub_create_payload` all follow the SSOT automatically.

**Three sites do NOT derive from the SSOT and MUST be hand-edited in lockstep:**
1. `PB/scripts/db/janitor_dead_letters.py` `_HUB_TO_LOCAL` (~92): hand-authored `{"description":"notes"}`.
2. `PB/scripts/db/sync/drivers/hub.py` — LWW pull-back writes Hub `description` → local `notes` (~2255, ~3254, cold-insert ~827).
3. `PB/scripts/db/sync/hub_payload.py` — inbound translators map Hub `description` → local `notes` (~764 task, ~867 project); outbound project create seeds `description` from `notes` (~703–731).

**Generated artifacts that encode the contract (regen, don't hand-edit):**
- `pb-schema/pb_schema/generated/field-authority.generated.ts` — `TABLE_FIELDS` (Hub's mutation whitelist). **`notes` already absent + `description` already present** for tasks/projects (pb-schema 0.4.0). Regen: `cd pb-schema && python sync_from_pb.py`. `CONTRACT_VERSION` (~18) = `0.5.0`.
- `mn-ccore-lab/api/brain-db-schema-snapshot.json` — records brain.db `brain_cols` per table + `hub_to_local`. Today `brain_cols.tasks`/`.projects` contain `notes`, NOT `description`; `hub_to_local` says `description→notes`. Regen: `python PB/scripts/db/generate_hub_schema_snapshot.py --out <Hub>/api/brain-db-schema-snapshot.json`. Drives `api/routes/mutations.schema-drift.test.ts`, which **fails loud** if a Hub `description` field maps (via `hub_to_local`) to a non-existent brain.db column — **this is the atomic-flip canary.**

**Hub side is tiny:** one real code line — `api/routes/tasks.ts:1356` `const description = pwaTask.description || pwaTask.notes || title;` (drop `|| pwaTask.notes`). Everything else Hub-side is the submodule bump + snapshot regen + tests. `notes` is already read-redacted in `api/lib/task-cols.ts` (verify-only, codex #10).

**Why this is safe-by-construction once sequenced right:** adding `notes` to `BRAIN_DB_ONLY_FIELDS` makes EVERY `notes` write local automatically (drop at `translate_patch_for_hub` ~560) — so the dated-append sites (completion/reopen/add-note) **need no code change**; they simply stop riding the wire. The ONLY writer that must change with the flip is the **create path** (body must go to the new `description` column, else creates send no body and blank the Hub body — codex #2).

---

## File Structure (all files touched, by repo + phase)

**Phase 1 — additive (independent, shippable alone):**
- `PB/scripts/db/migrations/107_m5_add_description_column.sql` — *create*. Add `description TEXT` to tasks+projects, backfill from `notes`.
- `PB/scripts/db/schema.sql` — *modify*. Add `description TEXT` to the tasks + projects seed `CREATE TABLE` (fresh-DB parity).
- `mn-ccore-lab/api/routes/tasks.ts:1356` — *modify*. Drop `|| pwaTask.notes` (additive-safe, ships now).

**Phase 2 — the atomic contract flip (relay-gated, lockstep across 3 repos):**
- `PB/scripts/db/schema_dsl.py` — *modify*. Add `description` column specs; flip `notes` specs to local-only; add `notes` to `BRAIN_DB_ONLY_FIELDS`.
- `PB/scripts/db/query.py` — *modify*. Create paths write body → `description`.
- `PB/scripts/db/sync/drivers/hub.py` — *modify*. Pull-back targets local `description`.
- `PB/scripts/db/sync/hub_payload.py` — *modify*. Inbound translators + outbound project seed target `description`.
- `PB/scripts/db/janitor_dead_letters.py` — *modify*. `_HUB_TO_LOCAL` description→description.
- `pb-schema/` (submodule) — *regen + version bump*. `sync_from_pb.py` → `field-authority.generated.ts`; bump `VERSION`/`CONTRACT_VERSION` 0.5.0 → 0.6.0.
- `mn-ccore-lab/api/brain-db-schema-snapshot.json` — *regen*.
- `mn-ccore-lab/pb-schema` — *submodule bump* to the new pb-schema commit.
- Hub + PB contract tests — *add/extend*.

**Phase 3 — TODAY.md + view reads (decision-gated):**
- `PB/scripts/today/data_fetcher.py` (~205/309/336) + `PB/scripts/today/sections.py` — *modify, optional*. Switch body source `notes` → `description` (or keep — see Task 9).

**Phase 4 — non-destructive log-line migration (slow background):**
- `PB/scripts/gardener/` or a new janitor — *create*. Incrementally strip dated event-lines out of `description` into the timeline. `notes` kept frozen-local.

---

## Phase 0 — Pre-flight & baseline (relay-gated)

### Task 0: Establish a clean two-machine baseline

**Files:** none (operational).

- [ ] **Step 1: Snapshot BOTH brain.dbs.** On THIS machine: `cd ~/Peripheral-Brain && PYTHONPATH=$PWD python scripts/db/backup.py` (WAL-safe + verify; writes `data/backups/brain_<ts>.db`). NOTE: `backup.py` and `sync.py` need `PYTHONPATH=$PWD` (the integrity check imports the `scripts` package); `run_pending_migrations.py` does not. Via `cross-machine-relay` chat, ask the other machine to run the identical command and report the snapshot filename. Record both filenames in the execution log.

- [ ] **Step 2: Confirm both machines at the same migration HEAD + drained outbox.** On THIS machine:
```bash
cd ~/Peripheral-Brain
# latest APPLIED migration — GLOB filters the non-numbered '__init__' marker (sorts AFTER digits in plain DESC)
python -c "import sqlite3; print(sqlite3.connect('data/brain.db').execute(\"SELECT name FROM schema_migrations WHERE name GLOB '[0-9]*' ORDER BY name DESC LIMIT 1\").fetchone())"   # expect ('106_project_status_deleted_enum_guard',)
# the outbox has NO synced_at column (cols: sent_at/ack_at/ack_status/dead_letter_at) — sync.py status is authoritative
PYTHONPATH=$PWD python scripts/db/sync.py status   # expect: Outbox unsent 0, dead-letter 0; Pending changes local_modified 0
```
Relay the same three to the other machine. **GATE:** both machines must show migration HEAD `106` and a drained outbox before proceeding. If either is behind/dirty, `sync` it first.

- [ ] **Step 3: Record the current contract version.** `grep CONTRACT_VERSION ~/Peripheral-Brain/pb-schema/pb_schema/generated/field-authority.generated.ts` → expect `'0.5.0'`. This is the version we flip FROM.

---

## Phase 1 — Additive column (independent, shippable alone)

> Adds the real `description` column and backfills it from `notes`, on BOTH machines, with `notes` still the wired body (rename unchanged). Pure addition — cannot blank any Hub body. The Hub `pwaTask.notes` fallback removal also ships here (additive-safe).

### Task 1: brain.db `description` column migration + seed parity

**Files:**
- Create: `~/Peripheral-Brain/scripts/db/migrations/107_m5_add_description_column.sql`
- Modify: `~/Peripheral-Brain/scripts/db/schema.sql` (tasks + projects `CREATE TABLE`)

- [ ] **Step 1: Write the migration.** Create `107_m5_add_description_column.sql`:
```sql
-- 107 (M5 notes-privacy): add a real local `description` column to tasks + projects
-- and backfill it from `notes`. ADDITIVE ONLY — does NOT touch the notes->description
-- wire rename (that is the separate, relay-gated Phase 2 contract flip in schema_dsl.py).
-- Safe to ship alone: with the rename unchanged, `notes` still carries the team body on
-- the wire; `description` is a dormant local column until Phase 2 wires it.
-- Runs exactly once per machine (tracked by stem in schema_migrations).

ALTER TABLE tasks    ADD COLUMN description TEXT;
ALTER TABLE projects ADD COLUMN description TEXT;

UPDATE tasks    SET description = notes WHERE description IS NULL AND notes IS NOT NULL;
UPDATE projects SET description = notes WHERE description IS NULL AND notes IS NOT NULL;
```

- [ ] **Step 2: Add the column to the seed schema (fresh-DB parity).** In `schema.sql`, in `CREATE TABLE ... tasks`, add `description TEXT,` immediately after the `notes TEXT,` line (~line 105). Do the same in `CREATE TABLE ... projects` after its `notes TEXT,` (~line 32). Match surrounding indentation; add a trailing comment `-- M5: clean static team body (notes is now local-only forensic log)`.

- [ ] **Step 3: `git add` the migration (it MUST be git-tracked or the runner skips it).**
```bash
cd ~/Peripheral-Brain
git add scripts/db/migrations/107_m5_add_description_column.sql scripts/db/schema.sql
```

- [ ] **Step 4: Apply on THIS machine and verify the column + backfill.**
```bash
python scripts/db/run_pending_migrations.py        # expect: migrations: ['107_m5_add_description_column']
sqlite3 data/brain.db "PRAGMA table_info(tasks);"  | grep -i description   # description column present
sqlite3 data/brain.db "PRAGMA table_info(projects);" | grep -i description
```

- [ ] **Step 5: Run the codex-#2 backfill audit (must be EMPTY).** A row with `notes` set but `description` NULL would, after the Phase-2 flip, send a NULL/absent `description` and blank the Hub body:
```bash
sqlite3 data/brain.db "SELECT COUNT(*) FROM tasks    WHERE description IS NULL AND notes IS NOT NULL;"   # expect 0
sqlite3 data/brain.db "SELECT COUNT(*) FROM projects WHERE description IS NULL AND notes IS NOT NULL;"   # expect 0
```
Expected: both `0`. If non-zero, re-run the `UPDATE` from Step 1.

- [ ] **Step 6: Commit (PB), path-explicit.**
```bash
cat > /tmp/m5-p1.txt <<'EOF'
feat(brain-db): M5 phase 1 — add local description column + backfill from notes

Additive migration 107: adds a real `description` TEXT column to tasks/projects
and backfills it from `notes`. Does not touch the notes->description wire rename
(that is the relay-gated Phase 2 flip). Seed schema updated for fresh-DB parity.
EOF
git commit -F /tmp/m5-p1.txt -- scripts/db/migrations/107_m5_add_description_column.sql scripts/db/schema.sql
```

- [ ] **Step 7: Roll out to the other machine via relay, then re-audit there.** Ask the other machine (via `cross-machine-relay` chat) to `git pull`, run `python scripts/db/run_pending_migrations.py`, and report the Step-5 audit counts. **GATE for Phase 2:** BOTH machines show `107` applied and audit counts `0`.

### Task 2: Hub — drop the `pwaTask.notes` create fallback

**Files:**
- Modify: `~/mn-ccore-lab/api/routes/tasks.ts:1356`

- [ ] **Step 1: Make the edit.** Change:
```typescript
    const description = pwaTask.description || pwaTask.notes || title;
```
to:
```typescript
    // M5: PWA imports carry the body as `description`; `notes` is brain.db-local-only
    // and is never sent over the wire, so it can never appear here. Fall back to title.
    const description = pwaTask.description || title;
```

- [ ] **Step 2: Build-verify.** `cd ~/mn-ccore-lab && npx tsc -b` → expect exit 0.

- [ ] **Step 3: Run the notes-leak + apply-mutation regression tests.**
```bash
npm run test:api -- mutations.notes-leak mutations.apply-mutation
```
Expected: PASS (these already assert `notes` is not accepted into `TABLE_FIELDS.tasks`).

- [ ] **Step 4: Commit (Hub), path-explicit.**
```bash
cat > /tmp/m5-hub-fallback.txt <<'EOF'
fix(pwa-import): drop notes fallback for description (M5 notes-privacy)

notes is brain.db-local-only and never crosses the wire, so pwaTask.notes is
always undefined here. Fall back to title instead. Additive-safe, independent
of the Phase 2 contract flip.
EOF
git commit -F /tmp/m5-hub-fallback.txt -- api/routes/tasks.ts
```

- [ ] **Step 5: Deploy + verify (Hub deploys are Claude-run).** `npm run deploy:pages:gated`. This change is import-path only; smoke-verify nothing else regressed with `npm run test:api` if not already green.

---

## Phase 2 — The atomic contract flip (relay-gated, lockstep across 3 repos)

> **GATE (codex #2/#4):** do NOT start until Task 1 Step 7 confirms BOTH machines have run 107 and pass the backfill audit. This phase flips the SSOT, the hand-authored copies, the create writer, and BOTH generated artifacts as ONE contract version, then relays before the other machine pulls it. A half-flip false-conflicts or unknown-field-rejects (codex #4).

### Task 3: Flip the SSOT (`schema_dsl.py`)

**Files:**
- Modify: `~/Peripheral-Brain/scripts/db/schema_dsl.py`

- [ ] **Step 1: Add `description` column specs.** In `COLUMNS`, immediately after `("tasks","notes"): ...` add:
```python
    ("tasks", "description"): _hub(),
```
and after `("projects","notes"): ...` add:
```python
    ("projects", "description"): _hub(),
```
`_hub()` with no `rename` → wire field name is the identity `description` (the name Hub already accepts), `materialization="hub_overwrite"`, bidirectional.

- [ ] **Step 2: Flip the `notes` specs to local-only.** Change:
```python
    ("tasks", "notes"): _hub(rename="description"),
```
to:
```python
    ("tasks", "notes"): _cache(),   # M5: brain.db-local-only forensic log; never wired
```
and the projects one the same way (`_cache()`).

- [ ] **Step 3: Add `notes` to `BRAIN_DB_ONLY_FIELDS`.** Change:
```python
    "tasks": frozenset({"thread_id"}),
    "projects": frozenset({"last_session", "last_modified"}),
```
to:
```python
    "tasks": frozenset({"thread_id", "notes"}),
    "projects": frozenset({"last_session", "last_modified", "notes"}),
```

- [ ] **Step 4: Update the inline column-count comments** (`# ---- tasks (55 cols: 44 hub...)` and the projects one) to reflect +1 column each. Cosmetic but keeps the file honest.

- [ ] **Step 5: Verify the derived maps flip correctly.** Run a one-liner that imports the SSOT and prints the derived state:
```bash
cd ~/Peripheral-Brain && python -c "
import scripts.db.schema_dsl as s
print('LOCAL_TO_HUB tasks:', s.LOCAL_TO_HUB_FIELD_MAP['tasks'])
print('HUB_TO_LOCAL tasks:', s.HUB_TO_LOCAL['tasks'])
print('BRAIN_ONLY tasks:', s.BRAIN_DB_ONLY_FIELDS['tasks'])
wire = s._derive_governed_table_fields('tasks')
print('description in wire:', 'description' in wire, '| notes in wire:', 'notes' in wire)
"
```
**Note:** `LOCAL_TO_HUB_FIELD_MAP` and `HUB_TO_LOCAL` are module-level literals that ALIAS the rename in their comments but are authored as standalone dicts (per the extraction). VERIFY whether they auto-derive from `COLUMNS` or are independent literals. If they are independent literals (they currently read `{"notes":"description"}`), **edit them too**: remove the `"notes":"description"` entry from `LOCAL_TO_HUB_FIELD_MAP['tasks'/'projects']` and the `"description":"notes"` entry from `HUB_TO_LOCAL['tasks'/'projects']`. Expected final state: `description NOT in wire? ` — wire SHOULD contain `description` (identity, from the new `_hub()` spec) and SHOULD NOT contain `notes`. Re-run until: `description in wire: True | notes in wire: False`.

### Task 4: Flip the hand-authored non-derived copy (`janitor_dead_letters.py`)

**Files:**
- Modify: `~/Peripheral-Brain/scripts/db/janitor_dead_letters.py` (~line 92)

- [ ] **Step 1: Edit `_HUB_TO_LOCAL`.** Change:
```python
    "tasks": {"title": "name", "description": "notes"},
    ...
    "projects": {"title": "name", "description": "notes"},
```
to map Hub `description` → local `description` (identity, so drop the entry):
```python
    "tasks": {"title": "name"},
    ...
    "projects": {"title": "name"},
```
(`_is_state_equivalent` uses `rename.get(key, key)`, so a missing key falls through to identity — Hub `description` now correctly compares against the local `description` column.)

### Task 5: Flip the create writer (`query.py`) — body → `description`

> Required IN this phase (codex #2): once `notes` is `BRAIN_DB_ONLY`, a create that writes the body to `notes` sends NO body → blank Hub description. The append sites (completion/reopen/add-note/retire/converge) need NO change — they write `notes`, which now simply stays local.

**Files:**
- Modify: `~/Peripheral-Brain/scripts/db/query.py` — `_create_task_hub_first` (~1534/1564), `_create_project_hub_first` (~1188/1222)

- [ ] **Step 1: Task create — INSERT writes `description`.** In `_create_task_hub_first`, change the INSERT column list + skeleton so the body lands in `description`:
```python
        self.cursor.execute(
            """
            INSERT INTO tasks (id, name, project_id, due_date,
                               deadline, status, description, priority, assignee,
                               updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [local_id, name, project_id, due_date, deadline,
             status, notes, priority, assignee, _now_instant()],
        )
```
and the skeleton:
```python
        skeleton_local = {
            "name": name,
            "description": notes,
            "project_id": project_id,
            "due_date": due_date,
            "deadline": deadline,
            "status": status,
            "priority": priority,
            "assignee": assignee,
        }
        payload = build_hub_create_payload("tasks", skeleton_local)
```
(The public param stays named `notes` to avoid a repo-wide caller rename — it is "the body input." Update its docstring to say it populates `description`. **DECISION FLAG for Nick:** keep the legacy `notes=` param name, or rename to `description=` with a deprecated `notes=` alias? Default in this plan: keep `notes=` param, write to `description` column.)

- [ ] **Step 2: Project create — same change** in `_create_project_hub_first`: swap `notes` → `description` in the INSERT column list and in `skeleton_local` (the VALUES still bind the `notes` local variable / body input).

- [ ] **Step 3: Verify a create round-trips the body as `description`.** With the SSOT flipped, dry-run a create payload build:
```bash
cd ~/Peripheral-Brain && python -c "
from scripts.db.outbox import build_hub_create_payload
p = build_hub_create_payload('tasks', {'name':'t','description':'BODY','status':'todo','assignee':'nick-ingraham'})
assert p.get('description') == 'BODY', p
assert 'notes' not in p, p
print('OK create payload:', p)
"
```
Expected: `description='BODY'`, no `notes` key.

### Task 6: Retarget the LWW pull-back (`hub.py`) + inbound translators (`hub_payload.py`)

**Files:**
- Modify: `~/Peripheral-Brain/scripts/db/sync/drivers/hub.py` (~2255, ~3254, cold-insert ~827)
- Modify: `~/Peripheral-Brain/scripts/db/sync/hub_payload.py` (~764, ~867, ~703–731)

- [ ] **Step 1: hub.py — existing-row TASK pull-back targets `description`.** Change (~2255):
```python
                d1_description = item.get("description")
                brain_desc = existing["description"] if "description" in existing.keys() else None
                if d1_description is not None and d1_description != brain_desc:
                    changes.append(("description", d1_description))
```
(was comparing to / writing `notes`.)

- [ ] **Step 2: hub.py — existing-row PROJECT pull-back targets `description`.** Change (~3254):
```python
                if "description" in existing_keys and "description" in p:
                    _hub_desc = p.get("description")
                    if _hub_desc != existing["description"]:
                        patch["description"] = _hub_desc
```

- [ ] **Step 3: hub.py — cold-insert column list uses `description`.** In the cold-insert path (~827), replace `"notes"` in `_cols` with `"description"` and the corresponding `payload["notes"]` in `_vals` with `payload["description"]` (the translator in Step 4 now emits `description`).

- [ ] **Step 4: hub_payload.py — inbound translators map Hub `description` → local `description`.** In `translate_task_from_hub` (~764) change `"notes": item.get("description"),` to `"description": item.get("description"),`. In `translate_project_from_hub` (~867), same change.

- [ ] **Step 5: hub_payload.py — outbound project create seeds from `description`.** Change (~703):
```python
    if not is_existing:
        desc = row.get("description") or row.get("next_action") or ""
        if desc.strip():
            fields["description"] = desc
    else:
        ...
        if "description" in row:
            fields["description"] = row["description"]
```
(was sourcing from `notes`.)

- [ ] **Step 6: `_apply_canonical_to_cache` (outbox.py ~2058) auto-follows** the flipped `HUB_TO_LOCAL` (Hub `description` → local `description` by identity). No edit — but add a one-line assertion test in Task 8.

### Task 7: Regenerate BOTH contract artifacts + bump the version (atomic)

**Files:**
- Regen: `pb-schema/pb_schema/generated/field-authority.generated.ts` + bump `pb-schema/VERSION`
- Regen: `mn-ccore-lab/api/brain-db-schema-snapshot.json`
- Bump: `mn-ccore-lab/pb-schema` submodule gitlink

- [ ] **Step 1: Bump the contract version.** Edit `~/Peripheral-Brain/pb-schema/VERSION` `0.5.0` → `0.6.0`. (codex #4: the flip is ONE version.)

- [ ] **Step 2: Regenerate `field-authority.generated.ts`.**
```bash
cd ~/Peripheral-Brain/pb-schema && python sync_from_pb.py
grep "CONTRACT_VERSION" pb_schema/generated/field-authority.generated.ts   # expect '0.6.0'
```
Confirm the `tasks`/`projects` Sets still contain `description` and do NOT contain `notes` (expected: unchanged — `notes` was already absent; this regen just re-stamps the version + any derived deltas).

- [ ] **Step 3: Regenerate the Hub brain-db snapshot.**
```bash
cd ~/Peripheral-Brain && python scripts/db/generate_hub_schema_snapshot.py --out ~/mn-ccore-lab/api/brain-db-schema-snapshot.json
```
Confirm the diff: `brain_cols.tasks`/`.projects` now INCLUDE `description`; `hub_to_local.tasks`/`.projects` no longer map `description→notes` (drops to identity). This regen is the codex-#3 canary — if brain.db lacked the `description` column it would error here.

- [ ] **Step 4: Commit the pb-schema submodule repo first.**
```bash
cd ~/Peripheral-Brain/pb-schema
git add VERSION pb_schema/generated/field-authority.generated.ts
git commit -m "contract 0.6.0: M5 — notes local-only, description identity-synced (tasks/projects)"
git rev-parse HEAD   # record the new pb-schema commit hash
```

- [ ] **Step 5: Bump the Hub submodule + commit the snapshot together.**
```bash
cd ~/mn-ccore-lab/pb-schema && git fetch && git checkout <new-pb-schema-commit>
cd ~/mn-ccore-lab && git add pb-schema api/brain-db-schema-snapshot.json
```
(Commit happens after Task 8's tests pass.)

### Task 8: Contract assertion tests (PB + Hub)

**Files:**
- Create/extend: `~/mn-ccore-lab/api/routes/mutations.notes-leak.test.ts` (or a new `mutations.m5-contract.test.ts`)
- Extend: PB sync round-trip test (find the existing sync test dir; if none, a `scripts/db/tests/test_m5_contract.py`)

- [ ] **Step 1: Hub — assert `description` identity + `notes` local-only.** Add a test:
```typescript
import { TABLE_FIELDS } from '../../pb-schema/pb_schema/generated/field-authority.generated.ts'
import snapshot from '../brain-db-schema-snapshot.json'

it('M5: tasks/projects accept description and reject notes on the wire', () => {
  for (const t of ['tasks', 'projects']) {
    expect(TABLE_FIELDS[t].has('description')).toBe(true)
    expect(TABLE_FIELDS[t].has('notes')).toBe(false)
    // snapshot: description is a real brain col; hub_to_local no longer renames it
    expect(snapshot.brain_cols[t]).toContain('description')
    expect(snapshot.hub_to_local[t]?.description).toBeUndefined()
  }
})
```

- [ ] **Step 2: Run the Hub contract + drift tests.**
```bash
cd ~/mn-ccore-lab && npm run test:api -- mutations.schema-drift mutations.notes-leak mutations.m5-contract
```
Expected: PASS (the schema-drift test validates the regenerated snapshot against `TABLE_FIELDS`).

- [ ] **Step 3: PB — assert a create + a pull round-trips body as `description`, notes stays local.** Add a Python test using a temp brain.db (copy the pattern from the nearest existing sync test):
```python
def test_m5_create_sends_description_not_notes(db):
    payload = build_hub_create_payload('tasks',
        {'name':'t','description':'BODY','status':'todo','assignee':'nick-ingraham'})
    assert payload['description'] == 'BODY'
    assert 'notes' not in payload

def test_m5_inbound_description_lands_in_description(db):
    local = translate_task_from_hub({'title':'t','description':'TEAM BODY','status':'todo'})
    assert local['description'] == 'TEAM BODY'
    assert local.get('notes') in (None, '')   # notes is no longer the inbound target
```

- [ ] **Step 4: Run the PB tests.** `cd ~/Peripheral-Brain && python -m pytest scripts/db/tests/test_m5_contract.py -v` → expect PASS.

### Task 9: Relay-confirm + lockstep ship (codex #4)

- [ ] **Step 1: Commit the PB sync-engine changes (path-explicit).**
```bash
cd ~/Peripheral-Brain
cat > /tmp/m5-p2.txt <<'EOF'
feat(sync): M5 phase 2 — sever notes->description rename (contract 0.6.0)

notes becomes brain.db-local-only; description is a real bidirectional column
synced identity-mapped to Hub description. Flips schema_dsl SSOT, the hand-authored
janitor reverse map, the create writer (body->description), and the LWW pull-back +
inbound translators. Append sites (completion/reopen/add-note/retire) now stay local
automatically. Lockstep with pb-schema 0.6.0 + Hub snapshot regen.
EOF
git commit -F /tmp/m5-p2.txt -- scripts/db/schema_dsl.py scripts/db/query.py \
  scripts/db/sync/drivers/hub.py scripts/db/sync/hub_payload.py scripts/db/janitor_dead_letters.py
```

- [ ] **Step 2: Commit the Hub submodule bump + snapshot.**
```bash
cd ~/mn-ccore-lab
cat > /tmp/m5-hub-p2.txt <<'EOF'
chore(contract): M5 — pb-schema 0.6.0 submodule bump + brain-db snapshot regen

notes local-only / description identity-synced. Pairs with PB phase-2 sync changes.
EOF
git commit -F /tmp/m5-hub-p2.txt -- pb-schema api/brain-db-schema-snapshot.json api/routes/mutations.m5-contract.test.ts
```

- [ ] **Step 3: Push pb-schema repo, then PB, then Hub.** Push the pb-schema repo first (so the submodule ref resolves for collaborators), then PB, then Hub.

- [ ] **Step 4: RELAY GATE — bring the other machine to the new contract atomically.** Via `cross-machine-relay` chat, instruct the other machine to, in ONE pull cycle: `git pull` (PB), `git submodule update --init pb-schema` if it consumes it, run a `python scripts/db/sync.py status`, and confirm `CONTRACT_VERSION 0.6.0`. Both machines must be on `0.6.0` before either runs a `sync push`. **Do NOT let one machine sit on 0.5.0 while the other is on 0.6.0 across a sync** (codex #4: hash mismatch → false conflicts).

- [ ] **Step 5: Post-flip smoke — a real create + a real edit round-trip.** On THIS machine: create a throwaway task with a body via the CLI, `python scripts/db/sync.py push`, then `curl -H "Authorization: Bearer $PB_API_KEY" https://mn-ccore-lab.pages.dev/api/tasks?...` and confirm the team-visible `description` shows the body (not blank). Edit the body, push, confirm Hub updates. Then delete the throwaway. Relay the other machine to pull + confirm it sees the same `description`.

- [ ] **Step 6: Deploy the Hub.** `npm run deploy:pages:gated` (the Phase-2 Hub change is the snapshot + submodule + test; verify `npm run test:api` green before deploy).

---

## Phase 3 — TODAY.md + view body source (decision-gated)

### Task 10: Point Nick's CLI views at the clean `description`

**Files:**
- Modify: `~/Peripheral-Brain/scripts/today/data_fetcher.py` (~205, ~309, ~336)
- Verify: `~/Peripheral-Brain/scripts/today/sections.py` (`fields["Notes"]` readers)

> **DECISION FLAG for Nick:** TODAY.md's body currently comes from local `notes` (via the `"Notes"` field alias). Post-sever, `notes` is the messy local log and `description` is the clean static body. Options: (A) switch TODAY.md to read `description` (clean, team-aligned); (B) keep `notes` (Nick still sees his private log inline); (C) read `description` with a `notes` fallback during the Phase-4 transition. **Plan default: (C)** — least surprising while the janitor (Phase 4) is still cleaning descriptions.

- [ ] **Step 1: Switch the body source (option C).** In `data_fetcher.py`, change the three `"Notes": ...get("notes")` builders (~205 task, ~309 project, ~336 alt-task) to:
```python
            "Notes": task_dict.get("description") or task_dict.get("notes"),
```
(and the project/alt analogues). The `"Notes"` field key stays (so `sections.py` is unchanged) — only its SOURCE moves to `description`-first.

- [ ] **Step 2: Regenerate TODAY.md and eyeball it.** `python scripts/generate_today.py` (or the canonical generator) → open `TODAY.md`, confirm task/project bodies render the same content (description was backfilled = notes in Phase 1, so identical until the janitor cleans).

- [ ] **Step 3: Commit (PB).** Path-explicit on `scripts/today/data_fetcher.py`.

---

## Phase 4 — Non-destructive log-line migration (slow background)

### Task 11: Nightly janitor strips dated event-lines out of `description`

> Lowest urgency, runs as a slow background pass (spec + codex #7). Non-destructive: `notes` keeps the full original; the janitor only edits `description` via a candidate-then-promote flow. Do NOT regex-split the only copy.

**Files:**
- Create: `~/Peripheral-Brain/scripts/gardener/description_delog.py` (or extend the existing activity_gardener)

- [ ] **Step 1: Write a DRY-RUN-default delog pass.** For each task/project where `description` contains `[YYYY-MM-DD]` dated lines: compute a `description_candidate` = description with dated-log lines removed (lead prose preserved), and emit a diff. Do NOT write. Guard: `[YYYY-MM-DD]` regex is insufficient (real prose can start with a date — codex #7) — only strip lines that match the KNOWN append templates (`[date] reopened:`, `[date] converged_to_hub_deleted:`, `[date] retired_local_duplicate`, completion-note shape). Use a bounded Haiku call ONLY to classify ambiguous lines, never to rewrite the body.

- [ ] **Step 2: Review the dry-run artifact** (write to `data/gardener/runs/`), then run with `--apply` on a SNAPSHOTTED db. `--apply` writes `description` (promotes the candidate); `notes` is untouched (full original preserved locally).

- [ ] **Step 3: Schedule home-only nightly** (mirror the activity_gardener schedule pattern; enable only after the first `--apply` artifact is Nick-reviewed).

- [ ] **Step 4 (much later, snapshot-gated): drop the `notes` column.** Out of scope for this plan — a separate cleanup migration after months of verified clean `description` (spec "Out of scope").

---

## Deliverables checklist (spec §Deliverables)

- [ ] This plan.
- [ ] PB decision doc `~/Peripheral-Brain/Context/Decisions/2026-06-13-m5-notes-privacy-final.md` (supersede the 2026-05-23 stub's pending parts).
- [ ] `~/Peripheral-Brain/data/shared/hub-schema-changes.jsonl` Hub-first handoff line (for the hub-schema-sync specialist).
- [ ] Schema registry update `~/Peripheral-Brain/Context/Topics/shared-schema-registry.md`: `notes` local-only; local `description` ↔ Hub `description` identity; contract 0.6.0.
- [ ] brain.db snapshot + restore runbook entry (Phase 0 snapshots recorded).

---

## Self-Review (run against the spec)

**1. Spec coverage:**
- Field model (one clean `description` body, `notes` retired-as-concept/local-only) → Tasks 1, 3, 5. ✅
- Auto-append sites stop touching the body → handled by-construction (Task 3 Step 3 adds `notes` to BRAIN_DB_ONLY; appends auto-go-local). ✅ Explicitly noted.
- Hub PWA fallback removed → Task 2. ✅
- Migration non-destructive (candidate→promote, Haiku splits dated lines) → Task 11. ✅
- brain.db snapshot before migration → Task 0 Step 1. ✅
- Relay-confirm before wire change → Task 9 Step 4. ✅
- Atomic contract-version flip (COLUMNS + maps + pb-schema + Hub snapshot as one version) → Task 7 (0.5.0→0.6.0). ✅
- add+backfill description BEFORE identity mapping → Phase 1 gates Phase 2 (Task 1 Step 7). ✅
- `retire_local_duplicate` exception (stays local, no timeline) → unchanged by design (Task 5 note); no code touches it. ✅
- Hand-authored copies (janitor_dead_letters, records.py) → Task 4; records.py is a tolerant allowlist already admitting both `description` + `notes`, so **no edit required** (noted — optional later tightening). ✅
- Dead-letter reverse map (codex #5) → Task 4 covers `janitor_dead_letters._HUB_TO_LOCAL`. ✅
- TODAY surfaces still read notes (codex #6) → Task 10. ✅
- Privacy model honesty (codex #8) → `@me` entries are SQL-access-gated server rows, not local-secret; acceptable for single-user PB. State in the decision doc.

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". Two explicit DECISION FLAGS for Nick (create param name; TODAY.md body source) are surfaced, not hidden, each with a stated plan default.

**3. Type/name consistency:** `description` (new column, identity wire field) used consistently in COLUMNS spec, INSERTs, skeletons, translators, snapshot, TABLE_FIELDS. `notes` consistently `_cache()` + BRAIN_DB_ONLY. Contract version `0.6.0` consistent across pb-schema VERSION + field-authority + commit messages.

**Open verification the implementer must do live (codex blind spots):** (a) whether `LOCAL_TO_HUB_FIELD_MAP`/`HUB_TO_LOCAL` in schema_dsl.py auto-derive from COLUMNS or are independent literals needing direct edits (Task 3 Step 5 forces this check); (b) the exact `.py` vs `.sql` migration-runner behavior for ADD COLUMN idempotency (Task 1 uses `.sql`, runs once); (c) real-corpus separability of body-vs-dated-line content (Task 11 dry-run on the snapshot); (d) the other laptop's HEAD/outbox state at flip time (Task 0 + Task 9 relay gates).
