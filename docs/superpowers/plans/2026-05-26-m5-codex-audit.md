# M5 Timeline Audit — Verdict

**Build with amendments.** Increment 2 is directionally correct, but not buildable as-is: `activity_log` is the right reuse target only after schema extension, `/api/mutations` really blocks it, and the notes→description removal inventory is incomplete. The highest-risk miss is body ownership: live readers still depend on plain `description` across search, meeting agenda, task why, and project detail, while `description_json` is only an accepted/selected task field today, not a coherent canonical body model (`tasks.ts:20-31`, `tasks.ts:239`, `search.ts:149-158`, `meetings.ts:170-177`, `ProjectDetail.tsx:515-516`, `ProjectDetail.tsx:1720-1722`).

## Plan alterations (gaps, risks, better sequencing — each with file:line + fix)

- **Treat `bootstrap-schema.sql` as insufficient evidence for current prod schema.** It explicitly says it is not current production schema (`bootstrap-schema.sql:3-6`). Fix: migration plan must start with D1 export/schema introspection before DDL, but live code still proves legacy `activity_log` shape because `logActivity` inserts only `(id,type,description,actor,related_id,related_type)` (`helpers.ts:215-225`) and `/api/activity` reads `SELECT * FROM activity_log` ordered by `timestamp` (`activity.ts:16-39`).

- **Extend `activity_log`, but keep legacy columns populated.** Bootstrap shape lacks `entity_type`, `entity_id`, `entry_type`, `body`, `actor_slug`, `mentions_json`, `source_table`, `source_id` (`bootstrap-schema.sql:86-94`). Fix: add columns and a unique idempotency index on `(source_table, source_id)`, while backfilling old `type/description/actor/related_*` for existing readers (`ActivityPage.tsx:234-242`).

- **Write-transport gap is real.** `/api/mutations` allows fixed tables and excludes `activity_log` (`mutations.ts:28-33`); unknown tables are rejected (`mutations.ts:358-360`). Fix: either add a dedicated authenticated `POST /api/activity/entries`, or register `activity_log` in `/api/mutations` with a field whitelist and PB outbox support.

- **Do not build a new composer.** There is already `SmartCompose`, and it already wraps `MentionInput` (`SmartCompose.tsx:1-14`, `SmartCompose.tsx:297-306`). Fix: make timeline comments use `SmartCompose`/`MentionInput`; delete raw task comment input (`TaskComments.tsx:117-124`) and raw task-update textarea (`TaskUpdateFeed.tsx:67-88`).

- **Visibility gating needs tightening, not invention.** `/api/activity` is public for kiosk use and only filters PB-category project rows (`activity.ts:7-12`, `activity.ts:23-30`). Fix: comments/body entries require authenticated read rules by entity, not just the existing PB-category exclusion.

- **Delete obsolete “Notes vs Comments” product copy.** Project detail still says notes are private progress logs and comments are team-visible (`ProjectDetail.tsx:1858-1877`). Fix: remove the banner when Activity replaces notes/comments/update split.

## Body-model recommendation (description_json vs plain; canonical-vs-generated; sync mechanism)

Make **plain `description` canonical for this migration**. `description_json` should be an optional generated/editor cache, not the source of truth yet.

Reason: every risky live read path consumes plain text: task list/select returns `description` (`tasks.ts:19-31`), task “why” slices plain `description` (`tasks.ts:541-546`), search matches plain task/project descriptions (`search.ts:149-158`), meeting agenda carries plain task description (`meetings.ts:170-177`), ProjectDetail saves and renders plain `description` (`ProjectDetail.tsx:515-516`, `ProjectDetail.tsx:1720-1722`). Task APIs merely allow `description_json` (`tasks.ts:239`), and projects do not have a JSON body path in the allowed fields (`projects.ts:468-469`).

Concrete rule: reject JSON-only description writes. If a task editor submits `description_json`, server code must derive plain text and write both fields in the same mutation. For now, explicit body edits write `description`; JSON can be rebuilt from plain text. A future rich-text migration can flip canonical ownership separately, after all readers stop depending on plain text.

## notes→description removal — complete path inventory (every write/pull/create path, real file:line; flag any the spec missed)

- **PB push map:** `tasks.notes -> description` and `projects.notes -> description` are still in `_LOCAL_TO_HUB_FIELD_MAP` (`outbox.py:292-300`), and `translate_patch_for_hub` applies the rename (`outbox.py:524`, `outbox.py:543`, `outbox.py:549`).

- **PB pull-back existing tasks:** Hub `description` is copied back into local `notes` when non-null and different (`hub.py:1341-1353`).

- **PB create project leak:** `create_project` builds Hub payload with `"description": notes` (`query.py:807-815`).

- **PB create task leak:** `create_task` builds Hub payload with `"description": notes` (`query.py:974-977`).

- **PB hub_payload project create leak:** `translate_project_for_hub` sets `description` from `notes` or `next_action` for new projects (`hub_payload.py:563-566`). **Spec missed this in the Increment-2 removal list.**

- **PB hub_payload pull-create leaks:** `translate_task_from_hub` maps Hub `description` into local `notes` (`hub_payload.py:590-599`), and `translate_project_from_hub` does the same for projects (`hub_payload.py:659-665`). **Reconciliation §2 missed these CREATE-pull paths.**

- **Hub PWA/mobile create leak:** mobile task create derives `description` from `pwaTask.description || pwaTask.notes || title` (`tasks.ts:1028-1064`) and also stores `notes` (`tasks.ts:1098-1117`).

- **Hub direct task create still stores Hub `notes`:** task create accepts `notes` (`tasks.ts:359`) and writes it to the insert payload (`tasks.ts:405-421`). Not a notes→description path, but incompatible with “Hub notes unused/local-only.”

- **Hub task update still accepts Hub `notes`:** `TASK_ALLOWED_FIELDS` includes `notes` (`tasks.ts:239-242`), and mutation whitelist includes `notes` (`mutations.ts:199-205`). Remove or explicitly quarantine it.

- **Auto-marker appenders:** completion appends `[date] ...` into local task notes (`query.py:1327-1329`), reopen appends `reopened:` (`query.py:1553-1561`), and duplicate retirement appends `retired_local_duplicate` (`query.py:1876-1883`). These must emit Activity going forward, not body text.

## Migration runbook — explicit step-by-step (numbered; per step: change + file:line + test + ship-risk A/B/C + rollback)

1. **Snapshot and count first.** Export D1 tables `activity_log`, `task_comments`, `task_updates`, `comments`, `project_updates`, `tasks`, `projects`; snapshot PB `brain.db`. Bootstrap warns it is not prod schema (`bootstrap-schema.sql:3-6`). Test: verify row counts and schema columns before DDL. **Risk C**: named failure is irreversible body/timeline split without source rows. Rollback: restore D1 export + PB DB snapshot.

2. **Add Activity columns without switching readers.** Extend `activity_log` from legacy shape (`bootstrap-schema.sql:86-94`) with new columns; keep `logActivity` old insert working (`helpers.ts:215-225`). Test: old `/api/activity` still returns rows (`activity.ts:16-45`). **Risk A**. Rollback: revert migration if no data backfill; otherwise restore snapshot.

3. **Add Activity write API.** Add authenticated create path because `/api/mutations` rejects `activity_log` today (`mutations.ts:28-33`, `mutations.ts:358-360`). Test: create comment/system entry, reject unauthorized create, reject unknown entity. **Risk A**. Rollback: revert endpoint; legacy comments/updates still work.

4. **Dual-read unified feed.** Make task/project/global feed read new `activity_log` entries plus old tables until backfill completes; current task feed already merges updates/comments/activity client-side (`TaskActivityFeed.tsx:65-72`). Test: existing task updates/comments still appear. **Risk B**. Rollback: revert feed to existing `TaskActivityFeed`, `ProjectUpdateFeed`, `ProjectComments`.

5. **Backfill five source tables into Activity.** Sources are current separate reads: `activity_log` (`search.ts:170-172`), `project_updates` (`search.ts:173-178`), `task_updates` (`search.ts:179-182`), `task_comments` (`search.ts:183-186`), `comments` (`search.ts:166-169`). Test: idempotent rerun inserts zero duplicates via `(source_table,source_id)`. **Risk B**. Rollback: delete rows where `source_table in (...)`; restore if needed.

6. **Switch composers to Activity.** Replace raw `TaskComments` input (`TaskComments.tsx:117-124`) and raw `TaskUpdateFeed` textarea (`TaskUpdateFeed.tsx:67-88`) with `SmartCompose` using `MentionInput` (`SmartCompose.tsx:297-306`). Test: Enter/Cmd+Enter behavior, @mention autocomplete from `/api/team/slugs` (`useMentionAutocomplete.ts:8-18`), notification insert. **Risk B**. Rollback: revert UI; old endpoints still live.

7. **Switch comment writes to Activity.** Current task comments insert `task_comments` (`tasks.ts:481-494`), task updates insert `task_updates` (`tasks.ts:972-985`), project comments insert `comments` (`projects.ts:778-813`), project updates insert `project_updates` (`projects.ts:859-873`). Test: posting creates one Activity row, mentions notify, no old-table insert unless compatibility mirror is intentionally kept. **Risk B**. Rollback: revert write endpoints to old tables.

8. **Remove notes→description push after Activity marker path exists.** Delete PB map entries (`outbox.py:292-300`) and verify `translate_patch_for_hub` no longer emits description for notes (`outbox.py:549`). Test: update local notes, flush, Hub task/project description unchanged. **Risk B**. Rollback: restore map; snapshot protects data.

9. **Remove PB create leaks.** Stop `create_project` and `create_task` payloads from setting description from notes (`query.py:807-815`, `query.py:974-977`). Test: new PB-created task/project has empty/explicit body, local notes remain local. **Risk B**. Rollback: restore payload mapping.

10. **Remove pull-back into local notes.** Delete task description→notes pull-back (`hub.py:1341-1353`) and hub_payload create-pull mappings (`hub_payload.py:590-599`, `hub_payload.py:659-665`). Test: Hub body edit does not overwrite PB notes. **Risk B**. Rollback: restore pull mapping.

11. **Fix Hub mobile/direct create leaks.** Stop PWA `notes` from becoming `description` (`tasks.ts:1062-1064`) and stop writing Hub `notes` (`tasks.ts:1116`). Remove `notes` from Hub task create/update allowlists (`tasks.ts:239-242`, `mutations.ts:199-205`). Test: mobile sync creates body only from explicit description or blank policy. **Risk B**. Rollback: revert Hub route.

12. **Manual cleanup active descriptions.** Archive current descriptions, then clean active set by hand; do not global parse-split. The marker patterns overlap real prose from PB appenders (`query.py:1327-1329`, `query.py:1553-1561`, `query.py:1876-1883`). Test: all live description read sites still nonempty where they were nonempty. **Risk C**. Rollback: restore archived descriptions.

## Backfill plan (source tables, idempotency key, de-dup, marker double-count avoidance)

Use `activity_log`, `task_comments`, `task_updates`, `comments`, and `project_updates` as the five backfill sources; current search proves all five are distinct searchable surfaces (`search.ts:166-186`). Add `source_table` and `source_id`; enforce unique `(source_table, source_id)`. For legacy `activity_log`, use existing `id` and map `description -> body`, `timestamp -> created_at`, `actor -> actor_slug` after normalizing through `actorSlug` where needed (`helpers.ts:215-225`, `helpers.ts:266-269`).

For comments/updates, preserve `created_at`, body/content, and author fields from their current endpoints (`tasks.ts:983-989`, `projects.ts:809-813`, `projects.ts:869-873`). For project comments, `comments.author_id` is a team member id, not slug (`bootstrap-schema.sql:97-102`), so backfill must join `team_members` like the existing comments read does (`projects.ts:286-292`).

Do **not** parse current `tasks.description` wholesale into Activity. Historical marker text already reached description through notes sync (`outbox.py:292-300`, `outbox.py:549`) and may duplicate existing system events from `logActivity` (`tasks.ts:140`, `tasks.ts:224`). Marker extraction is allowed only from the archived body with synthetic source ids like `description_marker:<entity_id>:<hash>`, and only when no same-entity/same-day/same-type Activity row exists.

## Safe-ordering guarantee (the sequence + the read sites that must never break)

Sequence: add Activity schema/API → dual-read feeds → backfill → switch composers/writes → remove sync leaks → manual body cleanup. Never clean `description` before all current readers are protected.

Read sites that must continue working throughout: task API returns `description` (`tasks.ts:19-31`, `tasks.ts:71`), task why callout reads first paragraph (`tasks.ts:541-546`), Today drawer falls back to `task.description` (`TaskDetailDrawer.tsx:32-33`), global search reads task/project descriptions (`search.ts:149-158`), meeting agenda labels carried-forward items from `title || description` (`meetings.ts:170-177`, `meetings.ts:230-236`), ProjectDetail saves/renders plain description (`ProjectDetail.tsx:515-516`, `ProjectDetail.tsx:1720-1722`), and `/portal/activity` still renders legacy `description/type/timestamp` (`ActivityPage.tsx:234-242`).

## Cross-repo lockstep sequence (what ships where, in what order, failure mode if wrong)

1. **Hub first:** add Activity write/read compatibility and schema extension. PB cannot emit marker Activity until Hub accepts it; `/api/mutations` rejects unknown tables today (`mutations.ts:28-33`, `mutations.ts:358-360`).

2. **PB second:** emit completion/reopen markers to Activity before removing notes sync; current PB appends markers into notes (`query.py:1327-1329`, `query.py:1553-1561`, `query.py:1876-1883`).

3. **Then remove PB notes→description push/create/pull.** Remove map and create leaks only after Activity marker transport exists (`outbox.py:292-300`, `query.py:807-815`, `query.py:974-977`, `hub.py:1341-1353`).

4. **Then remove Hub PWA/direct notes leaks.** Mobile create still maps `notes` into description fallback and writes `notes` (`tasks.ts:1062-1064`, `tasks.ts:1116`).

Failure mode if order is wrong: if PB stops notes→description before Activity exists, done/reopen/retire markers disappear from team-visible history; if Hub switches readers before backfill, comments/updates vanish from feeds; if Hub keeps PWA notes fallback after PB cleanup, new tasks continue polluting `description`.

## What's missing / risk-ordered top issues

1. **Auth model for Activity create/read.** Existing `/api/activity` is public and only PB-category gated (`activity.ts:7-12`, `activity.ts:23-30`). Comment bodies need authenticated entity-scoped access.

2. **Production schema/row counts.** Bootstrap is not current prod schema (`bootstrap-schema.sql:3-6`), and the reconciliation doc itself lists row-count snapshot as open (`time-sync-timeline-reconciliation-design.md:96-98`).

3. **Mirror-table fate.** The specs flag `d1_task_updates`/`d1_project_updates` as unresolved (`time-sync-timeline-reconciliation-design.md:96-98`); no migration should delete old update tables until mirror consumers are named.

4. **Hub `tasks.notes` is still writable.** `TASK_ALLOWED_FIELDS` and mutation whitelist both accept it (`tasks.ts:239-242`, `mutations.ts:199-205`). That contradicts local-only notes.

5. **Residual `SELECT *` response leak remains.** `handleToggleTask` can return `SELECT * FROM ${table}` for tasks (`tasks.ts:226`) despite `TASK_SELECT_COLS` deliberately excluding notes (`tasks.ts:8-32`). This is separate from notes→description but should be deleted in the same privacy cleanup.