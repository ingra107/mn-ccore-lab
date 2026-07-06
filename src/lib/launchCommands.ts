// Pure @-tag launch-command matcher — shared by the compose routing hook
// (src/hooks/useLaunchCommands.ts). Lives in lib/ so node-mode unit tests
// (vitest.config.lib.ts) cover it without a browser.
//
// Only start-of-text tags count: "remember to @workon this later" is prose,
// not a command — same rule as every existing tag route (MorningThoughtCompose,
// TaskDetailPanel).

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
