# Stitch — One-time Setup

We use the **official `@google/stitch-sdk`** (NOT a community MCP server). Auth is a single env var — no interactive wizard, no third-party trust.

## Steps

1. Open https://stitch.withgoogle.com — sign in with your Google account.
2. Click **Settings** (top-right) → **API Keys** → **Generate**. Copy the key.
3. Write it to `.stitch/.env` (gitignored):
   ```
   STITCH_API_KEY=AQ.<key>
   ```
4. Install isolated deps (only needed once per machine):
   ```bash
   cd .stitch && npm install
   ```
5. Smoke-test with one prompt:
   ```bash
   npx tsx run-batch.ts 01-today-page
   ```
   Output lands in `.stitch/designs/01-today-page.{html,png,json}`. If it works, you're done.

## Free tier (April 2026)

- 350 GEMINI_3_FLASH generations / month (default model in `run-batch.ts`)
- 200 GEMINI_3_PRO generations / month
- No credit card required
- Paid tiers projected Q4 2026

12 prompts in our `prompts.md` batch = ~12 generations. Well under cap.

## Fire the full batch

```bash
cd .stitch && npx tsx run-batch.ts all
```

Or one prompt:
```bash
cd .stitch && npx tsx run-batch.ts 05-insights-page
```

## Iterate one mockup

```bash
# Write your refinement instructions to .stitch/edits/<slug>.md, then:
cd .stitch && npx tsx edit.ts 05-insights-page
# → produces .stitch/designs/05-insights-page-r1.{html,png,json}
```

## Why not the davideast MCP?

We evaluated `@_davideast/stitch-mcp` (community MCP server, Firebase-DevRel-built but Google-adjacent ≠ official Google). It works, but: (1) it's community, (2) it requires an interactive `init` wizard, (3) the official SDK ships everything we need without the indirection. Stay on the SDK unless something specifically requires MCP semantics.

## Gotchas

- `project.generate(prompt, deviceType, modelId)` — POSITIONAL args, NOT options object. `{ deviceType: 'DESKTOP' }` will fail.
- Transient `Incomplete API response from generate_screen_from_text` errors clear on retry. ~25% first-try fail rate observed.
- `run-batch.ts` caches the project ID in `.stitch/.project-id` (gitignored) so re-runs reuse the same Stitch project.
