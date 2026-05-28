# Prod-Cleanup Ledger Pattern

Every prod-mutating cleanup script MUST run through `scripts/cleanup-wrapper.mjs::runCleanup()`. The wrapper enforces:

1. pre-counts (read what's about to change)
2. mutate (via `/api/mutations` or `scripts/wrangler-d1`)
3. waitValidator (5-min cache flush per codex pass-2 finding E)
4. post-counts (read AGAIN; the values MUST show progress)
5. write `_final_summary.json` ONLY on verified success

## Artifacts

- `_final_summary.json` — present ⇔ cleanup verified. Single source of truth.
- `_error_summary.json` — present when a step threw. Includes which step + message.
- `_verification_failed.json` — present when post-counts did not show expected change.

Only one of these three files is written per run. The ABSENCE of `_final_summary.json` is proof the cleanup did not complete successfully.

## Verification contract

All metrics in `preCounts()` must reach **zero** in `postCounts()`. Partial reduction (e.g. 25→7 survivors) is treated as a failure and writes `_verification_failed.json`. This prevents partial cleanups from claiming success and leaving residue that re-accumulates.

For multi-pass cleanups where zero is not expected in one shot, check `result.mutateResult` and decide on retry logic at the caller — do NOT weaken the default contract.

## Why this exists

Phase 5 cleanup in the hardening plan was prod-mutating. The historical `_final_summary.json` was an ERROR artifact misnamed — codex caught it. Without this wrapper, cleanups can claim success without proof.

## Usage example

```js
import { runCleanup } from '../scripts/cleanup-wrapper.mjs'
import { execWranglerD1 } from '../scripts/wrangler-d1.js'

await runCleanup({
  label: 'phase-N-dedup-slugs',
  outDir: 'Scratch/phase-N-cleanup',

  preCounts: async () => ({
    dup_slugs: await execWranglerD1('SELECT COUNT(*) FROM ...')
  }),

  mutate: async (pre) => {
    // Execute via /api/mutations or scripts/wrangler-d1
    const result = await execWranglerD1('DELETE FROM ...')
    return { mutation_batch_id: `phase-N-${Date.now()}`, changed: pre.dup_slugs }
  },

  waitValidator: async () => {
    // 5-minute wait for validator cache to flush (codex finding E)
    await new Promise(r => setTimeout(r, 5 * 60 * 1000))
  },

  postCounts: async () => ({
    dup_slugs: await execWranglerD1('SELECT COUNT(*) FROM ...')
  }),
})
```

## Future cleanups

Any new script under `scripts/cleanup-*` MUST use `runCleanup({...})`. Use the 3-test example in `scripts/cleanup-wrapper.test.mjs` as a template.

## Retroactive

The already-shipped Phase 5 cleanup is NOT retroactively wrapped (it landed before Z7). Optional follow-up: re-run the cleanup queries in read-only mode and write a `_final_summary.json` if every metric is at the post-cleanup state.
