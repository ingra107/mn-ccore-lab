// matchLaunchCommand — the pure @workon/@quickchat matcher behind
// useLaunchCommands. Regression for 2026-07-06: @workon typed in the Today
// drawer's comment box posted as a team-visible Progress comment instead of
// firing a launch (seed-isolation violation — see the at-tag delegation
// design doc in PB Context/Decisions/2026-06-25).
//
// executeLaunchCommand — the shared fetch/protocolLaunch/toast execution
// behind useLaunchCommands' tryLaunchCommand (fire-and-forget) and
// tryLaunchCommandAwaited (#525, 2026-07-07) variants. Extracted with
// dependencies injected so it's testable in node mode without a React
// rendering harness (this repo has no @testing-library/react) — this is the
// test-scaffolding #525 required BEFORE converging MorningThoughtCompose's
// @quickchat handling onto it.
//
// Run: npx vitest run --config vitest.config.lib.ts

import { describe, it, expect, vi } from 'vitest'
import { matchLaunchCommand, executeLaunchCommand, type LaunchExecutionDeps } from '../launchCommands'

describe('matchLaunchCommand', () => {
  it('matches @workon with a seed', () => {
    expect(matchLaunchCommand('@workon take a look at the submission from Amy')).toEqual({
      tag: 'workon',
      seed: 'take a look at the submission from Amy',
    })
  })

  it('matches @quickchat case-insensitively', () => {
    expect(matchLaunchCommand('@QuickChat hello there')).toEqual({ tag: 'quickchat', seed: 'hello there' })
  })

  it('matches a bare tag with an empty seed', () => {
    expect(matchLaunchCommand('@workon')).toEqual({ tag: 'workon', seed: '' })
  })

  it('does not match mid-text mentions (prose, not a command)', () => {
    expect(matchLaunchCommand('remember to @workon this later')).toBeNull()
  })

  it('does not match longer words sharing the prefix', () => {
    expect(matchLaunchCommand('@workonx foo')).toBeNull()
  })

  it('does not match other tags or plain comments', () => {
    expect(matchLaunchCommand('@hermes summarize this')).toBeNull()
    expect(matchLaunchCommand('take a look at the submission from Amy')).toBeNull()
  })
})

// ── executeLaunchCommand ─────────────────────────────────────────────────────

function makeDeps(overrides: Partial<LaunchExecutionDeps> = {}): LaunchExecutionDeps & {
  protocolLaunch: ReturnType<typeof vi.fn>
  showInfo: ReturnType<typeof vi.fn>
  showError: ReturnType<typeof vi.fn>
} {
  return {
    fetchFn: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 'lnch_abc123' } }) }),
    detectOriginFn: vi.fn().mockReturnValue('computer'),
    protocolLaunch: vi.fn().mockResolvedValue(undefined),
    showInfo: vi.fn(),
    showError: vi.fn(),
    ...overrides,
  }
}

describe('executeLaunchCommand — origin resolution', () => {
  it('originOverride wins over detectOriginFn (forceHome-style delegation)', async () => {
    const deps = makeDeps({ detectOriginFn: vi.fn().mockReturnValue('computer') })
    await executeLaunchCommand({ tag: 'quickchat', seed: 'hi' }, { originOverride: 'mobile' }, deps)

    expect(deps.protocolLaunch).not.toHaveBeenCalled()
    expect(deps.showInfo).toHaveBeenCalledWith('Queued — your home machine will pick it up')
    const [, init] = (deps.fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse(init.body as string).origin).toBe('mobile')
  })

  it('falls back to detectOriginFn when no override is given', async () => {
    const deps = makeDeps({ detectOriginFn: vi.fn().mockReturnValue('mobile') })
    await executeLaunchCommand({ tag: 'quickchat', seed: 'hi' }, {}, deps)

    expect(deps.protocolLaunch).not.toHaveBeenCalled()
    const [, init] = (deps.fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse(init.body as string).origin).toBe('mobile')
  })
})

describe('executeLaunchCommand — @quickchat', () => {
  it('computer origin fires protocolLaunch with the seed + quickchat messages', async () => {
    const deps = makeDeps()
    const onLaunched = vi.fn()
    await executeLaunchCommand({ tag: 'quickchat', seed: 'ask about the IRB' }, {}, deps, onLaunched)

    expect(deps.protocolLaunch).toHaveBeenCalledWith('mnccore://launch/lnch_abc123', {
      copyText: 'ask about the IRB',
      successMessage: 'Launching Quick Chat on this machine…',
      copyMessage: 'Launching Quick Chat… (seed copied as backup)',
    })
    expect(deps.showInfo).not.toHaveBeenCalled()
    expect(onLaunched).toHaveBeenCalledTimes(1)
  })

  it('mobile origin shows the queued toast, never calls protocolLaunch', async () => {
    const deps = makeDeps({ detectOriginFn: vi.fn().mockReturnValue('mobile') })
    const onLaunched = vi.fn()
    await executeLaunchCommand({ tag: 'quickchat', seed: 'hi' }, {}, deps, onLaunched)

    expect(deps.protocolLaunch).not.toHaveBeenCalled()
    expect(deps.showInfo).toHaveBeenCalledWith('Queued — your home machine will pick it up')
    expect(onLaunched).toHaveBeenCalledTimes(1)
  })

  it('sends task_id: null when no task context is given (Today-bar shape)', async () => {
    const deps = makeDeps()
    await executeLaunchCommand({ tag: 'quickchat', seed: 'hi' }, {}, deps)
    const [, init] = (deps.fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse(init.body as string)).toEqual({ tag: 'quickchat', seed: 'hi', origin: 'computer', task_id: null })
  })

  it('carries taskId through when given (task compose surfaces)', async () => {
    const deps = makeDeps()
    await executeLaunchCommand({ tag: 'quickchat', seed: 'hi' }, { taskId: 'task_123' }, deps)
    const [, init] = (deps.fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse(init.body as string).task_id).toBe('task_123')
  })
})

describe('executeLaunchCommand — @workon', () => {
  it('computer origin with a folder fires protocolLaunch with folder-specific messages', async () => {
    const deps = makeDeps()
    await executeLaunchCommand({ tag: 'workon', seed: '' }, { primaryFolder: 'C:/proj', projectSlug: 'clif' }, deps)

    expect(deps.protocolLaunch).toHaveBeenCalledWith('mnccore://launch/lnch_abc123', {
      copyText: 'C:/proj',
      successMessage: 'Launching Claude in this project…',
      copyMessage: 'Launching… (folder copied as backup)',
    })
    const [, init] = (deps.fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse(init.body as string)).toMatchObject({ tag: 'workon', project_slug: 'clif' })
  })

  it('computer origin with NO folder shows the no-folder toast instead of launching', async () => {
    const deps = makeDeps()
    await executeLaunchCommand({ tag: 'workon', seed: '' }, {}, deps)

    expect(deps.protocolLaunch).not.toHaveBeenCalled()
    expect(deps.showInfo).toHaveBeenCalledWith('No project folder set for this task')
  })
})

describe('executeLaunchCommand — failure handling', () => {
  it('a non-ok response shows the failure toast and never calls onLaunched', async () => {
    const deps = makeDeps({ fetchFn: vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) })
    const onLaunched = vi.fn()
    await executeLaunchCommand({ tag: 'quickchat', seed: 'hi' }, {}, deps, onLaunched)

    expect(deps.showError).toHaveBeenCalledWith('@quickchat failed — your text is still here, try again')
    expect(onLaunched).not.toHaveBeenCalled()
    expect(deps.protocolLaunch).not.toHaveBeenCalled()
  })

  it('a thrown fetch error is caught — the returned promise still RESOLVES, never rejects', async () => {
    const deps = makeDeps({ fetchFn: vi.fn().mockRejectedValue(new Error('network down')) })
    await expect(executeLaunchCommand({ tag: 'quickchat', seed: 'hi' }, {}, deps)).resolves.toBeUndefined()
    expect(deps.showError).toHaveBeenCalledWith('@quickchat failed — your text is still here, try again')
  })
})

describe('executeLaunchCommand — default fetch wiring (#543 regression)', () => {
  // #525 wired `fetchFn: fetch` (a receiver-detached native fetch) into the
  // production call sites; in the browser that throws "Illegal invocation"
  // BEFORE the POST, surfacing as the failure toast with no launch_log row.
  // The fix: production OMITS fetchFn and the lib defaults it to a bound global
  // fetch. This locks that contract — and, being omit-able, a required-fetchFn
  // regression would fail to type-check here.
  it('omitting fetchFn uses the global fetch and POSTs to /api/launch-log', async () => {
    const globalFetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ data: { id: 'lnch_default' } }) })
    const original = globalThis.fetch
    globalThis.fetch = globalFetch as unknown as typeof fetch
    try {
      const deps: LaunchExecutionDeps = {
        // fetchFn deliberately omitted — mirrors the production wiring
        detectOriginFn: vi.fn().mockReturnValue('mobile'),
        protocolLaunch: vi.fn().mockResolvedValue(undefined),
        showInfo: vi.fn(),
        showError: vi.fn(),
      }
      await executeLaunchCommand({ tag: 'quickchat', seed: 'hi' }, {}, deps)
      expect(globalFetch).toHaveBeenCalledWith('/api/launch-log', expect.objectContaining({ method: 'POST' }))
      expect(deps.showError).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('executeLaunchCommand — awaited timing (#525)', () => {
  it('the returned promise resolves only AFTER protocolLaunch completes, not fire-and-forget', async () => {
    let protocolLaunchResolved = false
    const deps = makeDeps({
      protocolLaunch: vi.fn().mockImplementation(async () => {
        await Promise.resolve()
        await Promise.resolve() // a couple microtask hops to prove real ordering
        protocolLaunchResolved = true
      }),
    })

    await executeLaunchCommand({ tag: 'quickchat', seed: 'hi' }, {}, deps)
    expect(protocolLaunchResolved).toBe(true)
  })
})
