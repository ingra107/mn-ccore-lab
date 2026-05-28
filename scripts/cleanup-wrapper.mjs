// cleanup-wrapper.mjs — Z7.1
//
// Codex's Other-Primitive #8: prod cleanup/migration scripts claim success
// without a durable artifact. Phase 5 in the hardening plan is prod-mutating;
// the available _final_summary.json from a prior run was actually an ERROR
// artifact, not proof of cleanup.
//
// runCleanup() enforces the sequence:
//   1. pre-counts (read what's about to change)
//   2. mutate (the actual prod write — via /api/mutations or scripts/wrangler-d1)
//   3. waitValidator (5-min validator-cache wait/reset — codex E)
//   4. post-counts (read AGAIN to confirm the change took)
//   5. compare pre vs post; only write _final_summary.json on verified success
//
// On ANY step failure, write a DIFFERENT artifact (_error_summary.json or
// _verification_failed.json). The presence of _final_summary.json is the
// SOLE signal of "this cleanup actually worked."

import fs from 'node:fs'
import path from 'node:path'

// Use posix join for artifact paths so tests pass on Windows and Unix alike.
// outDir values from callers always use forward slashes; path.join on Windows
// would produce backslashes and break stub-fs key comparisons in tests.
const joinPath = (...parts) => parts.join('/').replace(/\/+/g, '/')

/**
 * runCleanup — enforces the pre-counts → mutate → wait → post-counts →
 * verify sequence for prod-mutating cleanup scripts.
 *
 * @param {object} opts
 * @param {string} opts.label        - Human label for this cleanup run (e.g. 'phase-5-cleanup')
 * @param {string} opts.outDir       - Directory to write artifact files into
 * @param {() => Promise<object>} opts.preCounts    - Async fn; returns {metric: count} before mutation
 * @param {(pre: object) => Promise<object>} opts.mutate  - Async fn; executes the prod mutation; returns result with mutation_batch_id
 * @param {() => Promise<object>} opts.postCounts   - Async fn; returns {metric: count} after mutation
 * @param {() => Promise<void>} opts.waitValidator  - Async fn; blocks until validator cache flush (5-min wait in prod)
 * @param {object} [opts.fs]         - Overridable fs implementation (for tests)
 * @returns {Promise<{verified: boolean, mutateResult?: object, error?: object, reason?: string}>}
 */
export async function runCleanup({
  label,
  outDir,
  preCounts,
  mutate,
  postCounts,
  waitValidator,
  fs: fsImpl = fs,
}) {
  fsImpl.mkdirSync(outDir, { recursive: true })  // outDir is caller-provided; no join needed here
  const startedAt = new Date().toISOString()

  let preResult, mutateResult, postResult, error

  try {
    preResult = await preCounts()
  } catch (e) {
    error = { step: 'preCounts', message: e.message }
  }

  if (!error) {
    try {
      mutateResult = await mutate(preResult)
    } catch (e) {
      error = { step: 'mutate', message: e.message }
    }
  }

  if (!error) {
    try {
      await waitValidator()
    } catch (e) {
      error = { step: 'waitValidator', message: e.message }
    }
  }

  if (!error) {
    try {
      postResult = await postCounts()
    } catch (e) {
      error = { step: 'postCounts', message: e.message }
    }
  }

  // Error path: write _error_summary.json and return early.
  if (error) {
    const payload = {
      label,
      startedAt,
      error,
      preResult: preResult ?? null,
      mutateResult: mutateResult ?? null,
      postResult: postResult ?? null,
      verified: false,
    }
    fsImpl.writeFileSync(
      joinPath(outDir, '_error_summary.json'),
      JSON.stringify(payload, null, 2),
    )
    return { verified: false, error }
  }

  // Verification: every metric tracked in preResult must reach zero in postResult.
  // "Strictly less than pre" is insufficient — partial cleanup leaves survivors
  // that will re-accumulate; the ledger contract requires full clearance.
  // Callers with multi-pass cleanups (where zero is not expected in one shot)
  // should provide their own verifier by post-processing the return value.
  const verifyPasses = Object.keys(preResult).every(k => {
    return postResult[k] === 0
  })

  if (!verifyPasses) {
    const payload = {
      label,
      startedAt,
      verified: false,
      reason: 'post-counts did not show expected progress',
      preResult,
      mutateResult,
      postResult,
    }
    fsImpl.writeFileSync(
      joinPath(outDir, '_verification_failed.json'),
      JSON.stringify(payload, null, 2),
    )
    return { verified: false, reason: 'post-counts unchanged' }
  }

  // Success — write the single durable artifact that means "this worked."
  const payload = {
    label,
    startedAt,
    finishedAt: new Date().toISOString(),
    verified: true,
    preResult,
    mutateResult,
    postResult,
  }
  fsImpl.writeFileSync(
    joinPath(outDir, '_final_summary.json'),
    JSON.stringify(payload, null, 2),
  )
  return { verified: true, mutateResult }
}
