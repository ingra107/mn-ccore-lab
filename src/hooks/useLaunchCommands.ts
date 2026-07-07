// useLaunchCommands — shared @workon/@quickchat routing for compose surfaces.
//
// Seed-isolation contract (PB Context/Decisions/2026-06-25-hub-at-tag-delegation-design.md):
// a launch seed persists to launch_log ONLY. It must never reach
// /api/tasks/:id/comments or any other team-visible activity ("@workon 'remind
// me where we saved the IRB' must never surface in the team activity log").
// Callers run tryLaunchCommand() FIRST in their submit path and stop when it
// returns true.
//
// Extracted from TaskDetailPanel's OverviewQuickAdd (2026-07-06) so every
// compose surface whose MentionInput dropdown advertises the tags routes them
// identically — before this, the Today drawer and MyTasks InlineDetail
// (SmartCompose task mode) posted the seed as a team-visible Progress comment
// and launched nothing.
//
// The actual fetch/protocolLaunch/toast execution lives in lib/launchCommands.ts
// (executeLaunchCommand) — this hook is a thin wrapper supplying the real
// dependencies (fetch, detectOrigin, useProtocolLaunch, useToast) so the
// execution logic is node-mode testable without a React rendering harness.

import { useCallback } from 'react'
import { matchLaunchCommand, executeLaunchCommand, type LaunchExecutionContext } from '../lib/launchCommands'
import { detectOrigin } from '../lib/launchOrigin'
import { useProtocolLaunch } from './useProtocolLaunch'
import { useToast } from './useToast'

export type LaunchCommandContext = LaunchExecutionContext

/** Build the launch context for a TASK compose surface. taskId is a REQUIRED
 *  argument — a task surface cannot construct its context without it, so a new
 *  surface can't silently launch context-free (#490; the worker still degrades
 *  gracefully if it somehow receives none). Every task compose surface routes
 *  through this; only non-task surfaces (Today bar) pass a plain context. */
export function taskLaunchContext(
  taskId: string,
  base: Omit<LaunchCommandContext, 'taskId'> = {},
): LaunchCommandContext {
  return { ...base, taskId }
}

export function useLaunchCommands() {
  const { launch: protocolLaunch } = useProtocolLaunch()
  const { showInfo, showError } = useToast()

  /** Route text as a launch command if it starts with @workon/@quickchat.
   *  Returns true when routed — the caller must NOT post the text anywhere
   *  and must NOT clear its input directly: onLaunched fires on success and
   *  is where the caller clears; on failure the seed stays put for retry.
   *  Fire-and-forget: the returned boolean tells the caller "routed", not
   *  "completed" — completion is signaled via onLaunched. */
  const tryLaunchCommand = useCallback(
    (text: string, ctx: LaunchCommandContext = {}, onLaunched?: () => void): boolean => {
      const cmd = matchLaunchCommand(text)
      if (!cmd) return false
      void executeLaunchCommand(cmd, ctx, { fetchFn: fetch, detectOriginFn: detectOrigin, protocolLaunch, showInfo, showError }, onLaunched)
      return true
    },
    [protocolLaunch, showInfo, showError],
  )

  /** Same routing as tryLaunchCommand, but AWAITS the full launch attempt
   *  before resolving — for callers whose own promise gates caller-visible
   *  timing (#525: MorningThoughtCompose's SmartCompose parent clears the
   *  input only after onSubmit's promise resolves, not fire-and-forget).
   *  Resolves `false` when `text` isn't a launch command (caller falls
   *  through to its next route); resolves `true` after routing + executing,
   *  success or failure (executeLaunchCommand never rejects). */
  const tryLaunchCommandAwaited = useCallback(
    async (text: string, ctx: LaunchCommandContext = {}, onLaunched?: () => void): Promise<boolean> => {
      const cmd = matchLaunchCommand(text)
      if (!cmd) return false
      await executeLaunchCommand(cmd, ctx, { fetchFn: fetch, detectOriginFn: detectOrigin, protocolLaunch, showInfo, showError }, onLaunched)
      return true
    },
    [protocolLaunch, showInfo, showError],
  )

  return { tryLaunchCommand, tryLaunchCommandAwaited }
}
