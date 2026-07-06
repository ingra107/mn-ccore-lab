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

import { useCallback } from 'react'
import { matchLaunchCommand } from '../lib/launchCommands'
import { detectOrigin } from '../lib/launchOrigin'
import { buildLaunchUri } from '../lib/launch'
import { useProtocolLaunch } from './useProtocolLaunch'
import { useToast } from './useToast'

export interface LaunchCommandContext {
  /** Task's project slug — @workon scopes the session to this project. */
  projectSlug?: string | null
  /** projects.primary_folder — the computer route opens the session here. */
  primaryFolder?: string | null
}

export function useLaunchCommands() {
  const { launch: protocolLaunch } = useProtocolLaunch()
  const { showInfo, showError } = useToast()

  /** Route text as a launch command if it starts with @workon/@quickchat.
   *  Returns true when routed — the caller must NOT post the text anywhere
   *  and must NOT clear its input directly: onLaunched fires on success and
   *  is where the caller clears; on failure the seed stays put for retry. */
  const tryLaunchCommand = useCallback(
    (text: string, ctx: LaunchCommandContext = {}, onLaunched?: () => void): boolean => {
      const cmd = matchLaunchCommand(text)
      if (!cmd) return false
      const isWorkon = cmd.tag === 'workon'
      const origin = detectOrigin()
      const folder = ctx.primaryFolder ?? ''
      fetch('/api/launch-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isWorkon
            ? { tag: 'workon', seed: cmd.seed, origin, project_slug: ctx.projectSlug ?? null }
            : { tag: 'quickchat', seed: cmd.seed, origin },
        ),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`launch-log ${res.status}`)
          return res.json() as Promise<{ data: { id: string } }>
        })
        .then(({ data }) => {
          if (origin === 'computer' && (!isWorkon || folder)) {
            return protocolLaunch(buildLaunchUri(data.id), {
              copyText: isWorkon ? folder : cmd.seed,
              successMessage: isWorkon ? 'Launching Claude in this project…' : 'Launching Quick Chat on this machine…',
              copyMessage: isWorkon ? 'Launching… (folder copied as backup)' : 'Launching Quick Chat… (seed copied as backup)',
            })
          }
          showInfo(origin === 'computer' ? 'No project folder set for this task' : 'Queued — your home machine will pick it up')
        })
        .then(() => onLaunched?.())
        .catch((e) => {
          console.error(`@${cmd.tag} failed:`, e)
          // Fail-loud + seed-preserving: the caller's input still holds the text.
          showError(`@${cmd.tag} failed — your text is still here, try again`)
        })
      return true
    },
    [protocolLaunch, showInfo, showError],
  )

  return { tryLaunchCommand }
}
