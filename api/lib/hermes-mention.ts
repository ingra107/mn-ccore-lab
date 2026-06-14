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
export const HERMES_DETECT_RE = /@(hermes|claude)\b/i;
export const HERMES_STRIP_RE = /@(hermes|claude)/gi;
