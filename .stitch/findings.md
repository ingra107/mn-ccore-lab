# Stitch consultant findings — 2026-04-26

12 mockups skimmed against live Hub. Filtered for **deltas worth acting on** vs noise.

---

## ✅ File as GH issues (5 candidates)

### 1. Per-task "Intelligence" rail panel (from #02 MyTasks)

Stitch added a right-rail panel inside the task list when a row is selected:
- **Relevance score** (e.g. "92%") with one-line rationale ("blocking 3 subsequent research stages")
- **Project velocity** mini-chart (sparkline of recent commits/notes per project)
- **HermesDraft** suggestion card with "Review Draft" CTA — Hermes proactively pre-drafts a response/note when context strongly suggests one

Hub today: TaskDetailPanel has Overview/Notes/Comments/Activity/Details tabs but no "intelligence" surface. The HermesDraft card is the strongest novel idea — Hermes already comments on @mentions; pre-drafting a note when context is rich would be a real upgrade.

**Suggested label:** `enhancement, hermes, tasks`

---

### 2. Threshold sliders in Settings → Lab (from #04 Settings)

Stitch replaced numeric inputs with sliders for the manuscripts needs-attention thresholds (review_days, stale_days) AND added a "Critical Value Threshold (#)" slider with real-time readout next to it (e.g. "16").

Hub today: `useLabPrefs()` writes to localStorage; UI uses number inputs. Sliders give the threshold a tactile feel — easier to nudge "is 7 days too aggressive? try 10" without opening keyboard.

**Suggested label:** `enhancement, settings, ux`

---

### 3. /portal/insights — new page (from #05 Insights)

Greenfield page that doesn't exist in Hub. Stitch's composition:
- **Top:** 4 metric hero cards (Efficiency, Velocity, Resource Strain, Risk Quality), each with sparkline
- **Mid-left:** Workload heatmap (team × weekday, color = task density)
- **Mid-right:** Pipeline funnel as horizontal bars (Idea → Published)
- **Below:** Project Velocity scatter (x = days since last update, y = open task count, outliers in maroon)
- **Bottom:** "Critical Stalled Project Registry" table — stalled projects with suggested actions inline + Export Logs button

This is the **single page worth seriously considering** as a real build. Most of the data already exists in D1 — heatmap reads from `tasks`, velocity from `project_updates.created_at`, funnel from `projects.stage`. Could ship in a single feature branch without new tables. Replaces ad-hoc "what's stalled?" Slack pings.

**Suggested label:** `epic, insights, dashboard`

---

### 4. Hermes citations + findings callout (from #12 Ask the Lab)

Stitch's chat surface adds two patterns to Hermes responses Hub doesn't have:
- **Citation pills** below each Hermes message — clickable project/publication tags showing where the answer was sourced (e.g. `[Metabolic Plasticity in...]`, `[Project Aegis Synthetic Trials]`)
- **"OPERATION FINDINGS" callout** — gold-bordered box highlighting the single key extracted finding with a bolded number/percent ("14.2% statistical deviation in Subject 44A")

Hub today: Hermes responses are plain text bubbles. Adding citation pills would let users jump from "Hermes said X" → the source. Findings callout structures longer responses. Both reuse existing data (Hermes already cites projects in prose; just needs render layer).

**Suggested label:** `enhancement, hermes, ask-the-lab`

---

### 5. Manuscripts category filter pills (from #10 Manuscripts)

Above the manuscripts table, Stitch put a single row of pills: `All / Research / Clinical Trials / Methods`. Click to filter the table inline.

Hub today: Manuscripts table has search + sort but no category quick-filter at top. Categories already exist on rows.

Small win — purely additive, ~1hr build.

**Suggested label:** `enhancement, manuscripts, ux`

---

## 📝 Worth noting (don't file)

- **TodayPage two-CTA hero (#01)** — Begin Review (primary teal solid) + Defer Task (secondary outline) on the same hero card. Hub's RightNowCard probably already does this; double-check before discarding.
- **Quiet system status footer (#01)** — telemetry strip "STSTEM_OK • LAST_SYNC: 03:42:13". Cute micro-pattern. Skip.
- **Admin Team "Hermes Insight" inline card (#08)** — "Your team capacity has grown by 18% this quarter, fellow turnover at historic 3%". Hermes-generated insight inline on admin surface. Interesting concept; not a discrete ticket.
- **Mobile ProjectDetail STAGE strip horizontal scroll (#07)** — already shipped per CLAUDE.md rule 23.

## ❌ Discard

- **Mobile ProjectDetail audio waveform (#07)** — pure AI-slop decoration, no clinical relevance.
- **Calendar week view (#09)** — too thin; Hub's calendar is more developed than Stitch's mockup.
- **Public landing (#11)** — generic editorial layout, no novel pattern over what Hub has.
- **Mobile MyTasks (#06)** — matches what's shipped; no delta.

---

## Stitch model output behavior — useful gotchas for next batch

- Material 3 palette tokens (e.g. `#006a64` teal) leaked into 4/12 mockups despite explicit hex pinning to `#5cbcb4`. Defense: include "DO NOT use Material Design 3 tokens" in next prompt.
- Inter slipped past the font ban on 5/12. Defense: explicit "if you would normally use Inter, use DM Sans instead" — negative-by-name catches more than abstract bans.
- DEVICE_TYPE_AGNOSTIC flag exists; could try for surfaces that should respond fluidly (Insights might be a good test).
- Edit pass via `screen.edit("...")` is built-in — refining is cheap. Insights (#5) is the prime candidate.
