# Launch Testing Handbook

Agent-driven pre-flight testing for the MN-CCORE Lab Hub. No humans required.

## TL;DR

```bash
npm run preflight
```

Runs 7 persona agents sequentially against production. Each persona simulates a different user type and records findings. Produces a launch-gate decision: **GREEN** (deploy) or **HOLD** (fix + rerun).

## What it does

Unlike traditional automated tests that verify specific endpoints work, pre-flight personas simulate **how real users actually use the site**. Each persona has a role, a mental model, and an explicit journey — they navigate, mutate, react, and observe the way a human would. Findings capture "this didn't work the way it should" from that user's perspective.

## The 7 personas

| Persona | Role | What it verifies |
|---------|------|------------------|
| **pi-power-user** | Nick — daily power user | Dashboard cards, command palette speed, chord nav (g+p, g+t), decision log N-key, multi-project view, analytics, PI dashboard, task-create → Focus Next, keyboard shortcuts (?, Ctrl+., Ctrl+K), meeting prep, theme toggle |
| **collaborator** | Mesfin-like senior mentor | Monday catchup flow: /my-tasks, @mention fan-out, project-PI view, manuscripts revision tracker, grants, /team formal name, meeting detail + prep, notifications |
| **coordinator** | Research coordinator | Heavy data entry: create 3 tasks, add comment + note + status change, log decision with outcome, submit idea + vote, ask question + answer, digest save, /activity feed populated, title-click → detail panel |
| **trainee** | Student/mentee | Access boundaries: /my-tasks, /mentee-milestones, /trajectory/:slug, /team formal tier, search, task acknowledge, idea submit, /network, /publications |
| **mobile** | iPhone 12 @ 375×812 | Every primary action at mobile viewport: no horizontal overflow, tap targets ≥44×44, tab bar present, dashboard cards stack, detail panel opens from tap, Attach photo button visible on bug reporter, no sub-11px text |
| **accessibility** | Keyboard-only + screen reader | skip-to-content link, `<main>` landmark on every page, 10 Tab-stops with visible focus outline, modals `aria-modal=true` + focus trap, form field labels, heading hierarchy (no skipped levels), image alt text, aria-live regions, contrast sanity |
| **breaker** | Adversary / edge cases | XSS `<script>` → no execution, HTML `<img onerror>` → no execution, 10 concurrent POSTs, 50KB title round-trip, rapid 5-click New Task spam, 3 concurrent status-change race, invalid enum rejected 400, empty batch rejected 400, resize 1920→320px no overflow, 50 req /api/version burst, slow-3G still usable, projects/health regression check |

## Output

Every run produces:

```
review/preflight/<run-id>/
├── SUMMARY.md              ← the executive summary with launch-gate decision
├── pi-power-user/
│   ├── findings.md         ← detailed findings for this persona
│   ├── journey.log         ← text log of what the persona did step-by-step
│   └── 001-dashboard.png   ← numbered screenshots captured at each step
│   └── 002-...
├── collaborator/
│   └── ...
└── ... (one dir per persona)
```

**SUMMARY.md** shows the gate decision, per-persona pass/fail counts, and links into the detailed findings files. Anything P0 blocks launch; ≥3 P1s blocks launch; otherwise GREEN.

## Launch gate decision criteria

The orchestrator exits with code **0 (GREEN)** when:
- **P0 = 0** (no critical blockers)
- **P1 < 3** (fewer than 3 high-severity findings)

Otherwise exits **1 (HOLD)** — fix findings and rerun.

## How to invoke

```bash
# Run everything — ~5 minutes total
npm run preflight

# Run an individual persona for faster iteration on a specific concern
npm run preflight:pi
npm run preflight:collaborator
npm run preflight:coordinator
npm run preflight:trainee
npm run preflight:mobile
npm run preflight:a11y
npm run preflight:breaker

# Override base URL (e.g. preview deploy)
PREFLIGHT_BASE=https://abc1234.mn-ccore-lab.pages.dev npm run preflight

# Tag run for a specific commit/release
PREFLIGHT_RUN_ID=v1.0-release-candidate npm run preflight
```

## How findings work

Each persona records:
- **Passes** — a positive observation ("✓ Dashboard renders 6 bento cards")
- **Findings** — anything that didn't match expectation, tagged:
  - **P0** 🔥 launch blocker (site fundamentally broken)
  - **P1** ❌ high-severity (degrades core user flow)
  - **P2** ⚠ moderate (annoyance, edge case)
  - **INFO** ℹ observation, not a bug

Each finding has:
- unique ID (stable identifier for tracking across runs)
- scenario (what the persona was doing)
- observed (what actually happened)
- expected (what should have happened)
- URL (page at time of observation)
- screenshot path (when applicable)
- timestamp

## Extending

To add a new persona:
1. Create `scripts/pre-flight/persona-<name>.ts`
2. Import the shared helpers from `./shared`
3. Wrap your journey in `openPersona()` / `closePersona()`
4. Use `section()`, `pass()`, `record()`, `snap()` to log progress
5. Add to `PERSONAS` array in `00-orchestrator.ts`
6. Add an npm script alias in `package.json`

Pattern:

```ts
import { openPersona, closePersona, section, pass, record, snap, goto } from './shared'

async function main() {
  const s = await openPersona({ persona: 'my-persona', role: 'What they are', colorScheme: 'dark' })
  try {
    section(s, '1  First step of journey')
    await goto(s, '/some-page')
    await snap(s, 'landed')
    // ... do things ...
    pass(s, 'Thing worked')
    // or
    record(s, { id: 'THING-BROKEN', severity: 'P1', scenario: 'Thing should work', observed: 'it did not', expected: 'thing works' })
  } finally {
    await closePersona(s)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
```

## Integration with the deeper audit suites

The pre-flight personas are **complementary** to the existing `scripts/deep-audit/` suites. Deep audit is surgical — one endpoint, all its lifecycle states. Pre-flight is experiential — one user, their whole Monday-morning flow.

Recommended cadence:
- **Before every deploy:** `npm run preflight` (5 min) + `npm run test:smoke` (inspection suite)
- **Weekly:** full deep-audit sweep + preflight
- **Before major releases:** preflight + hub-audit + all deep-audit suites, 0 P0 / 0 P1 required

## Running on a schedule

Once `schema-drift.yml` is set up with GitHub secrets, we can add a nightly preflight cron via GitHub Actions:

```yaml
# .github/workflows/nightly-preflight.yml (not yet shipped — add when ready)
on:
  schedule: [{ cron: '0 9 * * *' }]  # 9 AM UTC daily
jobs:
  preflight:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run preflight
      - if: failure()
        # Post findings to Slack/Issues
```

## Why this replaces human testing

Traditional approach: email test scripts to 7 team members, wait for 7 people to find time, collate their bug reports.

Pre-flight approach: `npm run preflight` → 5 minutes → a complete report with screenshots.

Coverage is identical because the personas execute the same scripts a human would. Reproducibility is infinite — re-run on demand, compare findings across runs, gate deploys automatically. Zero human coordination overhead.

The one thing it can't do: catch **aesthetic** issues that require human judgment (is this color combination tasteful? does this interaction feel right?). For those, the in-Hub Bug Report modal lets a human flag them after launch.
