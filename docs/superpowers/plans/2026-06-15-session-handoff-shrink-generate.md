# Plan: shrink + generate the session handoff; steer from existing backlog primitives

**Status:** DRAFT v2 (revised after codex plan-audit, 2026-06-15). Codex synthesis: `review/codex-handoff-last.md`.
**Decided with Nick (2026-06-15):** "shrink + generate" (not kill the file, but kill the prose docket); "best for the system" → use **existing** backlog primitives, do NOT build a new agent-backlog substrate.
**Repos:** PB owns `generate-today` + `brain.db` + the `session-close` skill; Hub owns `SESSION-HANDOFF.md` + D1 + the header generator.

---

## 1. Diagnosis (grounded; refined by codex)

**Surface framing:** *append-only is correct for HISTORY (CHANGELOG, git, project_state_log) and fatal for STATE (handoff, next_action).*
**Deeper root cause (codex):** *multiple writable state surfaces with no enforced owner.* Two `SESSION-HANDOFF.md` files (Hub + PB folder); `session-close` sweeps 8 global docs but misses the project handoff so it accretes; the real "what next" lives in 1,291 lines of prose instead of structured data; `PROJECT.md:next_action` drifted from D1's `next_action` (proven live this session — the file is past-tense/stale, D1 is forward). Fix: **one canonical source per question; delete the secondary surfaces.**

Evidence: `SESSION-HANDOFF.md` = 1,291 lines, 9 dated banners, never pruned, 3 tenses mixed. `CHANGELOG.md` = 2,351 lines duplicating "what shipped." `get_today_data()` → `get_incomplete_tasks()` (PB `query.py:762/962`) pulls **every** incomplete task with **no ownership filter** — so any task is a TODAY task (this is why the docket was prose, not tasks).

---

## 2. Target architecture — one canonical source per question

| Reader's question | Authoritative home | Freshness mechanism |
|---|---|---|
| "What do I do right now?" | `projects.next_action` (D1, canonical) — one imperative, future-tense line | set at session-close; generator surfaces it + flags stale (past-tense regex + `updated_at < last-commit`) |
| "What's the agent/engineering backlog?" | **existing** `hub-future-ideas.md` (88-item registry, off-TODAY by construction) + `projects.next_action` | already structured; no new substrate |
| "What's committed/scheduled work?" | `tasks` (correctly appears on TODAY when real) | live data |
| "What just shipped?" | CHANGELOG + git log | append-only is *correct* here |
| "Where am I mid-flight?" | a SHORT, OVERWRITTEN, pointers-only note in the ONE handoff | 80-line cap; overwrite never append |
| "What will break me?" | CLAUDE.md Rules + Known Gotchas + memory | undated, already maintained |
| git HEAD / schema / counts | **auto-generated** from git + D1 | a query (which **fails loud/closed**, never silent) |

`SESSION-HANDOFF.md`: 1,291 → ~45 lines (generated header + pointers-only in-flight note).

---

## 3. Backlog separation — RESOLVED: use existing primitives, build no new substrate

Constraint: agent/engineering items must NOT leak onto `TODAY.md`. Three options were considered; the best-for-system answer is **none of the new ones** — the requirement is already met:

- **Option C (ideas table) — REJECTED:** the Hub `ideas` table (`api/schema-v7.sql`) is the *team's* research-idea board (submitted_by/research_area/votes; no ordering). Engineering to-dos would leak to the team.
- **Option B (a `tasks` marker + one exclusion) — REJECTED (codex-confirmed):** its no-leak guarantee is a *convention* (one `WHERE` clause in `get_incomplete_tasks()` that every TODAY-read path must honor), not a primitive; and `group_override='agent'` overloads a "which-section" field with "off-TODAY ownership" (latent bug). Requires a cross-repo migration + a full TODAY-read-path audit to be safe.
- **CHOSEN — no new substrate.** The agent/engineering backlog already has leak-proof homes: `hub-future-ideas.md` (the existing 88-item engineering registry — off-TODAY by construction, since generate-today never reads it) + `projects.next_action` (the single next step) + plan docs. An item graduates to a `tasks` row only when it's committed work for a person — which is exactly when it *should* appear on TODAY. **The TODAY-leak problem dissolves: we never put agent items in `tasks`.** Simplicity-first; uses existing primitives; zero migration; zero leak risk.

**If a structured, queryable, ordered agent-backlog is ever genuinely needed** (YAGNI now), the gate is: a dedicated `tasks.surface`/`audience` field (NOT `group_override` overload) + an audited **single** TODAY-read chokepoint + a **test fixture** proving agent-marked tasks never appear in `get_today_data()` while normal tasks do. Don't build it on a convention.

---

## 4. The generated header (built + hardened per codex)

`scripts/gen-session-header.mjs` emits a ~13-line block between `<!-- BEGIN/END GENERATED STATE -->` markers: git HEAD/branch/last-5-commits, D1 `next_action` (+ stale flag), open todo count, table count, timestamp. Pulls from git + ONE batched D1 query via `scripts/wrangler-d1`.

**Proven:** the pre-hardening version ran clean and produced a correct header; `--check` correctly failed the 1,291-line file over the 80-line cap. (Hardened-rewrite runtime re-verify is pending a clean shell window — the MSYS fork crash; logic verified by reading.)

**Hardened per codex audit:**
- **Fail closed, not silent:** D1 parse throws on non-JSON / wrong block-count / missing results array (no clean-looking-but-wrong header). Git parse throws if unparseable. Missing project row throws (no fabricated `{}` state).
- **Atomic-ish write:** the line-cap is checked BEFORE `writeFileSync` — a failed run never leaves an over-cap file on disk.
- **Objective stale check:** `next_action` flagged if past-tense (regex, advisory) OR `projects.updated_at < HEAD commit date` (objective).
- **Robust parsing:** git output split on newline + TAB (`%x09`), no ad-hoc `@@SEP@@`. Sentinel order validated in `replaceBlock` (throws on malformed).
- The header is descriptive only — it never asserts "clean/green."

---

## 5. Enforcement — what makes the cap a real primitive (not a nag)

The 80-line cap is only a primitive if it runs where it can't be skipped:
- `node scripts/gen-session-header.mjs --check` in **`.githooks/pre-commit`** (the repo already has one for the d1-lint) AND in CI — so an over-cap handoff blocks the commit/build.
- Bumping `MAX_LINES` is treated as a **policy change** (PR-visible), not a silent edit.
- `session-close` runs the generator (regenerate header) + leaves only the pointers-only in-flight note.
- Stale-`next_action`: the **objective** `updated_at < last-commit` check is the gate-grade signal; the past-tense regex stays advisory (codex: regex can't prove tense).

(Deleted overclaims per codex: "a query can't go stale" — queries fail/wrong-env/malformed, hence fail-closed; "SINGLE enforcement point" as a safety claim — it was a convention, which is why Option B is dropped.)

---

## 6. Consolidate the two handoff files

One canonical home = the **Hub-repo** `SESSION-HANDOFF.md` (git-syncs to both laptops). The PB-folder `Projects/mn-ccore-lab-hub/SESSION-HANDOFF.md` becomes a one-line pointer to it (or is deleted). **Concrete step (not just "verify nothing reads it"):** grep PB scripts/hooks for reads of that path; retarget or remove; leave a pointer.

---

## 7. Phased execution (ship-now bias; independent phases)

- **Phase 1 — generator + shrink (Hub only):** generator DONE (hardened). Shrink `SESSION-HANDOFF.md` to generated header + pointers-only in-flight note; old 1,291 lines preserved in git (`git show <sha>:SESSION-HANDOFF.md`). Ships on green; rollback = revert.
- **Phase 2 — enforcement:** wire `--check` into `.githooks/pre-commit` + CI; add the regenerate step to `session-close`. Ships independently.
- **Phase 3 — consolidate** the two handoff files (§6).
- **(No Phase for a backlog migration — §3 cancelled it.)**

**Risk/rollback:** all phases are doc edits or independent code paths → ship on green, rollback = `git revert`. No cross-repo schema migration (the one risky piece, dropped). The generator/cap need a working shell to run + a pre-commit hook to enforce — gated on the MSYS-fork-crash fix (serialize / UMN IT exclusion).

---

## 8. Highest-leverage single change
Make `projects.next_action` the single fresh "start here" + auto-generate the header from it (Phase 1). Kills the "stale prose mis-steers the next session" failure (the one that bit at this session's start) without touching anything else.

## 9. Open for Nick
- Apply the shrink (overwrite `SESSION-HANDOFF.md` with the generated header + pointers-only note)? Reversible via git.
- Pre-commit + CI wiring of the cap (Phase 2) — agreed as the thing that makes it a real primitive?
