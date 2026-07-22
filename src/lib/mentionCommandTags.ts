// Known command @-tags for the mention dropdown (#240), plus the Hermes
// model-tag variants (#891) -- pulled out of MentionInput.tsx so the
// filtering rules (which tags are eligible to suggest for a given typed
// filter) are unit-testable without mounting the component.

export interface CommandTagDef {
  label: string
  color: string
  bg: string
}

// Always-visible top-level command tags. These also drive MentionInput's
// highlight-overlay tint and the "command recognized" badge (#240), so they
// keep exactly the shape/keys they had before #891 -- the Hermes model
// variants below are deliberately NOT folded in here, or they'd surface on
// a bare "@herm" prefix match (the exact pollution #891 exists to prevent).
export const KNOWN_COMMAND_TAGS: Record<string, CommandTagDef> = {
  hermes:    { label: '⌘ Hermes AI',         color: 'var(--gold)',  bg: 'var(--gold-active)'  },
  quickchat: { label: '⌘ Quick Chat launch', color: 'var(--teal)',  bg: 'var(--teal-active)'  },
  workon:    { label: '⌘ Work On launch',    color: 'var(--teal)',  bg: 'var(--teal-active)'  },
  backlog:   { label: '⌘ Backlog idea',      color: 'var(--slate)', bg: 'var(--hover-subtle)' },
}

// Hermes per-request model tags (#891, pairs with #217's `@hermes-opus` /
// `@hermes-haiku` / `@hermes_opus` / `@hermes_haiku` dispatch support --
// hermes-mention.ts + hermesRouting.ts). Nick's explicit requirement: typing
// "@herm"/"@hermes" must suggest ONLY the plain (sonnet-default) tag --
// opus/haiku must never compete with it while the word is still mid-type.
//
// Kept OUT of KNOWN_COMMAND_TAGS so nothing but the explicit '-' gate in
// filterCommandTags below can ever surface them: there is no separate
// "show variants now" flag to forget to check anywhere else in the
// component -- the typed filter string is the only path to visibility.
//
// `hermes-sonnet` is deliberately omitted: sonnet is already what a bare
// "@hermes" selects, so a third identical-outcome entry would just be
// dropdown noise, not a real choice (matches the row's own spec, which
// names only the opus/haiku variants).
export const HERMES_MODEL_VARIANT_TAGS: Record<string, CommandTagDef> = {
  'hermes-opus':  { label: '⌘ Hermes AI (opus)',  color: KNOWN_COMMAND_TAGS.hermes.color, bg: KNOWN_COMMAND_TAGS.hermes.bg },
  'hermes-haiku': { label: '⌘ Hermes AI (haiku)', color: KNOWN_COMMAND_TAGS.hermes.color, bg: KNOWN_COMMAND_TAGS.hermes.bg },
}

const ALL_COMMAND_TAGS: Record<string, CommandTagDef> = {
  ...KNOWN_COMMAND_TAGS,
  ...HERMES_MODEL_VARIANT_TAGS,
}

/** True when `filter` (the text typed after '@') is the exact, fully-typed
 *  spelling of a command tag -- base OR Hermes model variant. This is the
 *  #221 signal: the dropdown should close entirely and Enter should fall
 *  through to command routing instead of re-inserting the tag that's
 *  already there. Extending it to the model variants (#891) keeps that
 *  parity: without this, completing "@hermes-opus" would leave the dropdown
 *  open on a stale single-item list instead of routing the command. */
export function isExactCommandTag(filter: string): boolean {
  return filter.toLowerCase() in ALL_COMMAND_TAGS
}

/** Command entries eligible for the mention dropdown for the current typed
 *  filter (the text after '@', not yet lowercased).
 *
 *  - Base command tags (hermes/quickchat/workon/backlog) surface on any
 *    prefix match, unchanged from #240.
 *  - The Hermes model variants (`hermes-opus`/`hermes-haiku`) surface ONLY
 *    once the filter itself contains the `-` (checked via the filter
 *    string's own prefix, not a separate mode flag) -- so there is no code
 *    path that can show them before the '-' key is pressed. */
export function filterCommandTags(filter: string): Array<[string, CommandTagDef]> {
  const lower = filter.toLowerCase()
  if (lower in ALL_COMMAND_TAGS) return []
  const entries = Object.entries(KNOWN_COMMAND_TAGS).filter(([key]) => key.startsWith(lower))
  if (lower.startsWith('hermes-')) {
    entries.push(...Object.entries(HERMES_MODEL_VARIANT_TAGS).filter(([key]) => key.startsWith(lower)))
  }
  return entries
}
