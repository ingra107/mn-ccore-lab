// api/lib/hermes-mention.ts — SSOT for detecting/stripping the @hermes / @claude
// trigger in backend body text. One definition so "what counts as a Hermes
// mention" can't drift between the activity timeline (activity-entry.ts) and the
// Ask-the-Lab question/answer paths (routes/questions.ts).
//
// DETECT_RE gates dispatch (word-boundary so '@claudette' doesn't fire);
// STRIP_RE removes the mention from the AI prompt (global, no word-boundary so
// trailing punctuation goes too). Module-scope so the literals aren't recompiled
// per call.
//
// NOTE: the FRONTEND composers (SmartCompose, MorningThoughtCompose) have their
// own anchored patterns (e.g. /^@hermes\b/) for a different job (caret/prefix UX)
// and are deliberately NOT unified here — this is the server-side trigger.
// #891: `\b` alone rejects an underscore-tagged mention (`@hermes_opus`) --
// `_` is a regex word character, so no boundary exists between "hermes" and
// "_", and the mention never becomes an ai_request at all. A hyphenated tag
// (`@hermes-opus`) already worked because `-` IS a non-word character, so a
// boundary exists there regardless of what follows. The optional group below
// makes the underscore spelling reachable too, without changing HERMES_STRIP_RE
// (see its comment) -- PB's select_model() already accepts both separators.
export const HERMES_DETECT_RE = /@(hermes|claude)(?:[_-](?:opus|sonnet|haiku))?\b/i;
// Deliberately UNCHANGED by #891: this only strips the "@hermes"/"@claude"
// token itself, leaving a `_opus`/`-opus`-style suffix in place. PB's
// select_model() (scripts/scheduled/hub_ai_listener.py) parses that leading
// separator+tag off the resulting ai_requests.prompt -- widening this regex
// to also consume the suffix would strip the model tag before it ever
// reaches PB, silently breaking #217. Do not "simplify" this away.
export const HERMES_STRIP_RE = /@(hermes|claude)/gi;
