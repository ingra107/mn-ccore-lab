# Project-Identity Convergence — EXECUTION PLAN (START HERE post-compact)

> **Status: APPROVED to execute (Nick, 2026-06-05). Priority: TODAY.** This is the
> self-contained ticket queue — execute the slices IN ORDER without re-triaging.
> Everything needed is below; do NOT re-investigate the verified facts.
> Decision record: PB `Context/Decisions/2026-06-05-project-identity-single-machine-identity.md`.
> Reconciled design: `Scratch/project-id-decision-2026-06-05/SYNTHESIS-project-identity-northstar.md`
> (+ builder `DESIGN-...md`, Codex `/tmp|AppData/.../codex-northstar-last.md`, audits A1/A2/AUDIT-*).

## THE DECISION (north-star)
**ONE machine identity = typed `proj_*` PK, everywhere internal** (storage, all FK columns,
kg, AND the brain.db↔Hub replication wire). **Slug = a one-way human projection** (browser
URL + on-screen label) resolved ONLY at the HTTP edge — a LEAF, never a hub that any
internal/machine path resolves back into. This is ONE system (surrogate-key pattern), and it
ends the recurring "slug is load-bearing on an internal machine path" bug class (3 instances:
tasks half-migration, kg staleness, per-store propagation gaps). Demote slug from hub → leaf.

## VERIFIED FACTS (do not re-investigate)
- **`projects.id` CONVERGED on work+Hub**: Hub D1 76/76 typed `proj_*` (73 active + 3 deleted),
  brain.db 73/73 typed. Same PKs cross-store (e.g. `peripheral-brain-system` = `proj_7F27APDE49WTC2GE4SKRMNYTAM`
  on BOTH; the old `proj_01KP9FM305…` is a `superseded_pk` ALIAS, NOT a live divergence — the
  earlier "divergence" claim was false). **HOME brain.db: UNVERIFIED from work** (gate must check it).
- **`tasks.project_id`**: typed-PK storage; browser read resolves PK→slug via `COALESCE` in
  `api/lib/task-cols.ts` (Direction 1, shipped + live deploy `7653955d`/commit `8cc00130`).
  5 slug stragglers backfilled→typed in prod (Slice B = DONE). The browser `/api/tasks` slug
  read is CORRECT (human boundary) — keep it.
- **kg is STALE + actively corrupting** (Slice A target): Hub D1 `kg_entities` ~346 stale +
  `kg_relations` ~499 stale refs, all **slug-format** (`project:<slug>`, NOT hex). brain.db kg
  ~80% stale too. kg syncs via **Hub D1 Lane-3, PULL-ONLY (Hub→brain.db)** — `lane3_registry.py`
  + `__init__.py::PULL_ONLY_TABLES` + Hub `api/routes/lane3.ts`. So every `sync pull` re-imports
  Hub's slug-keyed kg into brain.db (re-poisons local). **NO Hub UI reads kg** (Network page uses
  publications). `project:*` is a DUAL-USE namespace — most slug nodes are extractor GARBAGE
  (`project:hub.py`, `project:/process`); see PB `b2_kg_slug_noise_analysis.py`. Full numbers:
  `Scratch/project-id-decision-2026-06-05/AUDIT-kg-hub-stale-pk.md`.
- **Sync wire today carries SLUG**: PB push maps local `proj_*`→slug (`hub_payload.py:~334`,
  docstring says "Hub stores slug" — now stale); pull reads slug (`hub.py:~2211 d1_project_slug`,
  with a `proj_*` direct fallback `hub_payload.py:~512`). The wire is the only purely
  machine-to-machine project path → it must become typed PK (Slice C).
- **The two prior failures were ASYMMETRIC guards** (brain.db guarded; Hub/kg/consumers not).
  The fix is a symmetric, fail-closed gate (below).

## EXECUTION ORDER

### SLICE A — kg reconciliation (FIRST; stops the live bleed). Hub-first, then brain.db converges on pull.
1. **Build the slug→`proj_*` map** from `projects` (Hub D1 + brain.db must agree — they do for
   live projects). Reuse the deterministic map / `entity_aliases` (hub_slug, superseded_pk).
2. **Tier every `project:<suffix>` kg node** (dual-use namespace — DO NOT blind-rewrite):
   - CONFIDENT: suffix ∈ projects.slug → rewrite `project:<slug>` → `project:<proj_*>`.
   - GARBAGE: free-text (`project:hub.py`, `project:/process`, file paths) → DELETE (or leave;
     decide via `b2_kg_slug_noise_analysis.py` output). 
   - AMBIGUOUS → defer to Nick (list them).
   Applies to `kg_entities.id`, `kg_relations.source_id`/`target_id`, `kg_entity_chunks.entity_id`,
   `kg_memory_access.entity_id`, `embeddings_meta` (meta-only UPDATE, vec0 untouched — see
   p2-CONSOLIDATED §1B/§1C).
3. **Hub D1 first** (via `scripts/wrangler-d1`), dry-run on a temp copy, fail-closed (0 unmapped
   live refs), row-count conservation, then apply. **Then brain.db** (BrainDB/get_db with vec0).
4. **Verify**: 0 `project:<slug>` referencing a live project remain on Hub OR brain.db; one
   `sync pull` leaves local kg canonical (no re-poison). Add a kg assertion to the gate (Slice E).
5. **Rollback**: D1 Time-Travel bookmark (capture before); brain.db `VACUUM INTO` snapshot.

### SLICE E (do alongside/after A) — the symmetric Project-Identity Completeness GATE (the primitive)
The highest-leverage durable artifact. Build it so convergence can't half-finish again:
- **SSOT column list**: every identity-bearing project surface across `[brain.db, Hub D1] ×
  [storage, FK, kg, JSON/CSV fields, composite `project:*`, sync push/pull translators]` — ONE
  list (extend the p2-CONSOLIDATED §1 UNION surface to be SYMMETRIC across both stores + kg + consumers).
- **Schema-introspection check** (CI + pre-deploy): assert NO `%project%id%`/`project:*` surface
  escapes the list/exemption set on EITHER store. Fail-closed.
- **Runtime guards**: internal project FK columns reject non-`proj_*`; kg rejects `project:<slug>`;
  sync pull rejects unknown typed refs unless an `entity_aliases` resolve succeeds (never silently store).
- **Round-trip test**: create project → rename slug → create task → create kg relation → push →
  pull → rebuild cache; assert internal storage = typed, browser display = slug.
- **Both-store + home dry-run**: any finish-now migration runs temp-copy rewrite on Hub + work +
  HOME before prod; abort on any unclassified ref.

### SLICE C — replication wire → typed PK (LAST; cross-repo; gated on the gate + home verification)
- Give replication its OWN typed-PK contract; the browser `/api/tasks` keeps returning slug
  (preserves today's resolver + `task-cols.test.ts`). Per Codex: a dedicated typed shape, so the
  sync STOPS consuming the slug presentation shape. (Options: a `?wire=typed`/dedicated endpoint,
  or have the sync read project_id raw-typed via a sync-specific projection.)
- PB sync: push sends typed `proj_*` (drop the `proj_*→slug` map at `hub_payload.py:~334`); pull
  consumes typed `proj_*` directly (drop the slug resolve at `hub.py:~2211`), fail-closed via
  alias resolve on unknown.
- **Preconditions** (like Increment-1A β): home brain.db PK convergence verified; snapshots;
  fail-closed alias-resolving so a slightly-behind home can't store a dangling PK. Update
  shared-schema-registry `tasks.project_id` contract: storage typed, **wire typed**, display slug.
- Invert the now-stale registry/CLAUDE.md "wire = slug" lines for the SYNC (browser stays slug).

### SLICE D — `project_dependencies` (slug-keyed by design) + HISTORICAL tables — final disposition.
Decide per-table: migrate to typed PK or document as a deliberate slug-keyed exception. (Downgraded
from the p2 §3 gates — no longer blocking, but close them out.)

## ALREADY DONE (this session, 2026-06-05) — do NOT redo
- tasks.project_id browser-boundary fix (Direction 1) + 5-row backfill = **Slice B DONE**, deployed.
- 9a007fd1 Today fixes verified+deployed; edit-more + P6 shipped; key_links = no bug.
- Doc corrections (false divergence struck; kg-lane fixed) committed+pushed.

## GIT HEADS (at plan time)
- Hub `main`: `5921ce18` (deploy live = `8cc00130`/`7653955d`). PB `main`: `b3ef97e5`.

## DON'T
- Don't run the gated `scripts/p2_hub_rekey_apply.py` as-is (it's the projects.id rekey, already
  converged for the parent + doesn't cover kg correctly). Slice A is a NEW targeted kg script.
- Don't blind-rewrite `project:*` (dual-use namespace).
- Don't flip the wire (C) before the gate (E) + home verification.
- Don't let `COALESCE(...,raw)` tolerance leak into internal channels (it hides residue).
