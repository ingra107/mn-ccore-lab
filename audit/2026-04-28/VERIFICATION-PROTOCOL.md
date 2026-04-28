# Verification Protocol — MANDATORY before fixing any audit finding

> **Trust nothing. Verify everything. The audit is dated 2026-04-28; the codebase changes daily.**
>
> **Skipping this protocol = fixing things already fixed, breaking things that work, missing context that changed.**

---

## The 6-step verification before ANY fix

### Step 1: Read the source-of-truth report
Open `reports/NN-pagename.md` for the affected page. Read the **full finding** — not just the row in the table. The narrative section above the table usually has context that explains WHY the finding matters.

### Step 2: Locate the file:line citation
The agent cited `path/to/file.tsx:123` in the finding. Open that file. Confirm the citation:

- ✅ **Line still matches the cited code** → proceed to step 3
- ⚠️ **Line moved (file was edited)** → search by content (`Grep` for the cited symbol/string)
- ❌ **File no longer exists** → finding is likely stale; check `git log` for the rename/delete; **ASK NICK** if unsure
- ❌ **Citation is wrong** (agent looked at wrong file) → flag in progress-log; reassess whether finding even applies

### Step 3: Check git log for changes since audit date

```bash
git log --since=2026-04-28 -- path/to/file.tsx
git log --since=2026-04-28 --all -p -S "<unique-string-from-finding>" -- path/to/file.tsx
```

If commits exist that touched the area:
- Read each commit message + diff
- Decide: was this finding addressed? partially? not at all?
- If addressed → mark `ALREADY FIXED` in progress-log and skip to next finding
- If partially → narrow your fix to the remaining gap
- If untouched → continue to step 4

### Step 4: Reproduce the bug

This is the step that catches stale findings. Different verification methods by finding type:

#### UI / interaction bugs
- Start dev server: `cd C:/Users/ingra/mn-ccore-lab && npm run dev`
- Navigate to the page in browser (use a real browser, not just Playwright trace)
- Perform the exact action the finding describes
- Confirm the bug is reproducible
- Take a screenshot if it'll be useful in commit message

#### Data / query bugs
- For D1 queries: `npx wrangler d1 execute mnccore-lab --remote --command="<SQL>"` (read-only checks fine; ask Nick before any write)
- For brain.db: `BrainDB` class (per CLAUDE.md "Ground Truth"), never raw SQL
- For server-side logic: `npm run test:local` to run Miniflare harness

#### Decorative compose / dead-code bugs
- Open file in editor
- Trace the handler. If it's literally `() => appendCharToInput('@')` or `defaultChecked` with no `onChange`, finding stands.
- Try the action live (browser) — if nothing happens, confirmed dead.

#### Hardcoded / fake data bugs
- Open the file
- Check if the literal still exists (`Grep` for `2626`, hardcoded array, etc.)
- Look for whether a real query was added since 2026-04-28 (`useGrants()` actually consumed?)

#### Token / brand-primitive violations
- `Grep` for the violation pattern across affected file
- If 0 hits → already swept
- If hits remain → fix them all in one PR, not piecemeal

#### Authorization / security bugs (P0)
- Test the bypass directly (curl with no auth header)
- Confirm the bypass works on prod or dev (Nick's call which env)
- **Do not commit the test request to git**

### Step 5: If still reproducible, plan the fix

Before writing code:

- Read CLAUDE.md sections relevant to the area you'll touch
- Check the agent's "Proposed fix" column — is it correct? overcooked? underspecified?
- Check existing patterns elsewhere in the codebase (`Grep` for similar surface that already does it right)
- For Phase A cross-cutting sweeps (SmartCompose adoption, brand primitive sweep, token cleanup): **stop and ask Nick** whether to do the sweep as one PR or staged
- Estimate effort. If S → just do it. If M → break into commits. If L → write a brief plan first

### Step 6: Implement, verify the fix, commit

- Apply minimal change (don't refactor adjacent code while you're there)
- Run `npm run build` to confirm TypeScript clean (CLAUDE.md Rule 13)
- Test the fix in browser (or via test harness for backend)
- Append to `progress-log.md` with finding ID + verification + action + commit hash
- Commit with finding ID in message: `fix(today): wire SmartCompose on morning thought (TP-01)`

---

## When to ASK NICK instead of proceeding

These are the stop-and-ask triggers. Do not guess.

| Trigger | Why ask | Where to find context |
|---------|---------|----------------------|
| File:line citation no longer matches and content search returns nothing | Agent's premise may have evaporated | Show diff of the area + what you did find |
| Finding requires schema change | Cross-repo coordination per CLAUDE.md "Cross-repo schema coordination" | Identify the registered shared field |
| Finding requires deletion of a feature/page (e.g. retire `/portal/personal`) | Substrate swap rule from CLAUDE.md | See "Before Disabling / Retiring" section |
| Two reports contradict each other | Audit error | Cite both report IDs |
| Open question from `synthesis-plan.md` § "Top Open Questions for Nick" applies | Nick already flagged this needs decision | Reference the question number |
| Auth, billing, retention, or data-write changes | Blast radius is high | Reference the finding |
| Phase A foundation sweep (12+ sites at once) | Bundle vs split is a judgment call Nick makes | Show the sites you found |
| You'd be flipping a permanent feature flag, retiring a code path, or swapping a substrate | CLAUDE.md "Before Disabling" hard rule | Run the substrate-swap skill checklist |
| The finding is rated High/P0 and the fix isn't obvious | Stakes warrant calibration | Show what's ambiguous |

**Form for asking**: "Working finding `<ID>` from report `<NN>`. Verification: <what you found>. Question: <specific question>. Options I see: (a) ..., (b) ..."

---

## Common verification gotchas

- **Hot reload lies**: dev server may show pre-edit behavior. Hard refresh + restart.
- **CF Access proxies prod**: visiting `/portal/*` on prod requires login. Use preview deploy URLs for capture/audit (per CLAUDE.md Rule 33).
- **Optimistic UI fakes a fix**: a button click may show success while the API write fails. Confirm via API directly.
- **`X-Test-Mode` swap**: tests run against `mnccore-lab-test` D1, not prod. A test passing is not the same as prod working. Phase 3 Miniflare harness (`npm run test:local`) is the canonical local check.
- **Mobile only**: some findings only reproduce on `<768px`. Use Chrome devtools responsive mode set to Pixel 5 (the canonical small viewport per audits).
- **Dark mode only**: AA contrast bugs often only fire in dark mode. Toggle via `localStorage.setItem('mn-ccore-theme', 'dark')` (Rule "Dark mode localStorage key" — note `mn-ccore-theme`, NOT `theme`).
- **Hover-only states**: Phase 36c made hover-only badges `visibility:hidden` (Rule 27). If the finding is "phantom badges in AT tree," verify in screen reader or check actual CSS computed style.

---

## Verification log format (for progress-log.md)

Every fixed item must record verification evidence. Pattern:

```markdown
### <ID> — <short title> (<severity>)

- **File:line confirmed**: yes / yes-after-search / no
- **git log since audit**: <commit hashes touching this area, or "none">
- **Reproduction**: <what you did + what you saw>
- **Status**: STILL BROKEN / ALREADY FIXED / PARTIALLY FIXED / BLOCKED / NEEDS INFO
- **Action**: <what you did, or "none — already fixed", or "asked Nick">
- **Commit**: <hash if applicable>
```

This evidence is what protects future sessions from re-doing or undoing your work.

---

## What "trust nothing" means in practice

- The agent that wrote `reports/05-lab-overview.md` looked at `Dashboard.tsx` on 2026-04-28. If the file was overhauled since, the report is fiction.
- An agent's "fix in S effort" estimate is a guess. Verify scope yourself.
- An agent's "P0" rating is a snapshot. After a Phase A sweep, what was P0 may be P3.
- An agent saw ONE page. Some findings are local; some are cross-cutting. Don't blindly fix per-page when a horizontal sweep is cheaper.
- An agent's source citations are real but may be stale. Always re-locate by content, not by line number alone.
