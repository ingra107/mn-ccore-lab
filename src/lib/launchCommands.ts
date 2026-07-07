// Pure @-tag launch-command matcher + execution, shared by the compose
// routing hook (src/hooks/useLaunchCommands.ts). Lives in lib/ so node-mode
// unit tests (vitest.config.lib.ts) cover both without a browser or a React
// rendering harness (this repo has no @testing-library/react).
//
// Only start-of-text tags count: "remember to @workon this later" is prose,
// not a command — same rule as every existing tag route (MorningThoughtCompose,
// TaskDetailPanel).

import { buildLaunchUri } from './launch'

export type LaunchTag = 'workon' | 'quickchat'

export interface LaunchCommand {
  tag: LaunchTag
  /** Text after the tag — the session seed. May be ''. */
  seed: string
}

export function matchLaunchCommand(text: string): LaunchCommand | null {
  const m = text.match(/^@(workon|quickchat)\b\s*/i)
  if (!m) return null
  return { tag: m[1].toLowerCase() as LaunchTag, seed: text.slice(m[0].length).trim() }
}

export interface LaunchExecutionContext {
  /** Task's project slug — @workon scopes the session to this project. */
  projectSlug?: string | null
  /** projects.primary_folder — the computer route opens the session here. */
  primaryFolder?: string | null
  /** Source task id when the launch fires from a task compose surface. */
  taskId?: string | null
  /** Override the detected origin (e.g. the Today bar's "send to home"
   *  checkbox forcing the delegate-to-home-machine path regardless of what
   *  device this actually is). Absent = use detectOriginFn(). */
  originOverride?: 'computer' | 'mobile'
}

export interface LaunchExecutionDeps {
  /** Injected so tests don't need a browser fetch/DOM. Production callers
   *  (useLaunchCommands) always pass the real global fetch. */
  fetchFn: typeof fetch
  detectOriginFn: () => 'computer' | 'mobile'
  protocolLaunch: (uri: string, opts: { copyText: string; successMessage: string; copyMessage: string }) => Promise<void>
  showInfo: (message: string) => void
  showError: (message: string) => void
}

/**
 * The shared @workon/@quickchat execution: POST /api/launch-log, then either
 * fire the local protocol URI (computer origin) or show a "queued" toast
 * (mobile / delegated origin). ALWAYS resolves — errors are caught and shown
 * as a toast, never re-thrown — so callers needing real completion timing
 * (rather than fire-and-forget) can simply `await` this directly (#525,
 * useLaunchCommands' tryLaunchCommandAwaited).
 */
export async function executeLaunchCommand(
  cmd: LaunchCommand,
  ctx: LaunchExecutionContext,
  deps: LaunchExecutionDeps,
  onLaunched?: () => void,
): Promise<void> {
  const isWorkon = cmd.tag === 'workon'
  const origin = ctx.originOverride ?? deps.detectOriginFn()
  const folder = ctx.primaryFolder ?? ''
  try {
    const res = await deps.fetchFn('/api/launch-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        // task_id is sent symmetrically for BOTH tags — a @quickchat fired
        // from a task card carries context just like @workon (#485). Null on
        // context-free surfaces (Today bar) → the claim returns the raw seed.
        isWorkon
          ? { tag: 'workon', seed: cmd.seed, origin, project_slug: ctx.projectSlug ?? null, task_id: ctx.taskId ?? null }
          : { tag: 'quickchat', seed: cmd.seed, origin, task_id: ctx.taskId ?? null },
      ),
    })
    if (!res.ok) throw new Error(`launch-log ${res.status}`)
    const { data } = await res.json() as { data: { id: string } }
    if (origin === 'computer' && (!isWorkon || folder)) {
      await deps.protocolLaunch(buildLaunchUri(data.id), {
        copyText: isWorkon ? folder : cmd.seed,
        successMessage: isWorkon ? 'Launching Claude in this project…' : 'Launching Quick Chat on this machine…',
        copyMessage: isWorkon ? 'Launching… (folder copied as backup)' : 'Launching Quick Chat… (seed copied as backup)',
      })
    } else {
      deps.showInfo(origin === 'computer' ? 'No project folder set for this task' : 'Queued — your home machine will pick it up')
    }
    onLaunched?.()
  } catch (e) {
    console.error(`@${cmd.tag} failed:`, e)
    // Fail-loud + seed-preserving: the caller's input still holds the text.
    deps.showError(`@${cmd.tag} failed — your text is still here, try again`)
  }
}
