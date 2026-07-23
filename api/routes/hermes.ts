// api/routes/hermes.ts — Hermes-lane-only Hub reads. Phase 10 (Hermes Lane
// Unification, 2026-07-23): a leak-safe read endpoint so the PB listener
// (hub_ai_listener.py) can retrieve a requester's OWN prior-day Hermes
// conversations before answering a fresh @hermes ask, so "remember what we
// talked about this morning" extends past the current day.
//
// PRIVACY-CRITICAL — same leak class as the two 2026-07-22 defects (see
// SESSION-HANDOFF.md 79-87 and api/routes/seen.ts's §9.5.1 comment): the
// listener authenticates with PB_API_KEY, which BYPASSES the visibility gate
// everywhere else in this codebase (`activityVisibilityGate` / `isPiRequest`
// both treat a valid API key as "sees everything"). That is correct for the
// listener's OWN dispatch/response plumbing (it IS the system of record), but
// it means this endpoint must NEVER derive visibility from the caller's
// identity the way every other feed does — the caller here is never the
// person whose history is being read. Every row this endpoint can return is
// scoped by an identity the SERVER resolves and verifies against data it
// already wrote, never by a client-supplied filter.
//
// Design ref: docs/superpowers/plans/2026-07-22-hermes-lane-unification.md
// (Phase 10), codex-vetted requester-scoping mechanism.

import type { Env } from '../helpers';
import { json, error, actorSlug } from '../helpers';
import { validateApiKey } from '../middleware/api-key-auth';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Server-owned bounds (BOUND section of the design) — the client can never
// widen these; there is no query param that maps to any of them.
const LOOKBACK_DAYS = 30;
const PER_DAY_CAP = 5;
const TOTAL_CAP = 40;
const PREVIEW_CHARS = 100;
const SERIALIZED_CAP_CHARS = 6000;

interface DayIndexRoot {
  id: string;
  created_at: string;
  preview: string;
  hidden: boolean;
}

interface DayIndexDay {
  date: string;
  roots: DayIndexRoot[];
}

type DayIndexResponse = { data: DayIndexDay[]; count: number };

// The uniform failure shape — `{"data":[],"count":0}`. EVERY verification-
// chain failure below returns exactly this (200, not 401/403/404) — the
// endpoint must not become an identity- or row-existence oracle: a caller who
// guesses a wrong ai_request_id, a wrong requested_by, or an unresolvable
// identity gets the SAME response as a legitimate caller asking about a day
// with no history. A fresh literal per call (not a shared const) so no future
// edit can accidentally mutate a cached response body.
function empty(): Response {
  return json({ data: [], count: 0 } satisfies DayIndexResponse);
}

/**
 * Strict identity resolution: an identity claim (email, or an already-slug
 * value) resolves to a REAL `team_members.slug`, or null.
 *
 * Deliberately NOT the bare `actorSlug()` helper alone: `actorSlug()` is
 * designed for an AUTHENTICATED session where an unmapped email prefix is a
 * legitimate fallback slug (the caller undeniably owns that email — CF Access
 * verified it). Here the identity arrives as a query-string claim from an
 * API-key caller acting on someone else's behalf; the whole verification
 * chain in `handleGetHermesDayIndex` exists to prove that claim, and it must
 * be checkable against a real directory row before it is trusted as "the
 * requester". Falling back to an invented slug for an unrecognized email
 * would let the strict resolver silently accept any string as if it named a
 * real person. `team_members` is the SAME directory `resolveActor()`
 * validates overrides against (helpers.ts) — reusing that check here, not
 * forking a second identity notion.
 */
async function resolveStrictRequesterSlug(env: Env, rawIdentity: string): Promise<string | null> {
  const raw = rawIdentity.trim();
  if (!raw) return null;
  const candidate = raw.includes('@') ? actorSlug(raw) : raw;
  const member = await env.DB.prepare(
    'SELECT 1 FROM team_members WHERE slug = ? LIMIT 1'
  ).bind(candidate).first();
  return member ? candidate : null;
}

/** First N Unicode CODE POINTS (not UTF-16 code units) of a body, for the preview. */
function previewOf(body: string): string {
  return Array.from(body).slice(0, PREVIEW_CHARS).join('');
}

/**
 * Shift a YYYY-MM-DD civil-date string by `days` (may be negative). Pure
 * calendar arithmetic in UTC — `entity_id` values are civil dates with no
 * time component, so anchoring at UTC midnight avoids any DST/local-timezone
 * skew that a server-local `Date` constructor would introduce.
 */
function shiftIsoDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  // anti-pattern-allowed: pure UTC civil-date arithmetic anchored at T00:00:00Z (all-UTC ops, no local tz, no roll-tomorrow)
  return d.toISOString().slice(0, 10);
}

/**
 * Group already-ordered rows (entity_id DESC, created_at DESC, id DESC — days
 * newest-first, roots newest-first within a day) into day buckets, capping
 * each bucket at PER_DAY_CAP. Order is preserved by construction (input rows
 * are pre-sorted; this only buckets consecutive same-date rows together).
 */
function groupWithPerDayCap(
  rows: Array<{ id: string; created_at: string; entity_id: string; body: string; hidden_at: string | null }>,
): DayIndexDay[] {
  const days: DayIndexDay[] = [];
  for (const row of rows) {
    const last = days[days.length - 1];
    const bucket = last && last.date === row.entity_id ? last : (() => {
      const fresh: DayIndexDay = { date: row.entity_id, roots: [] };
      days.push(fresh);
      return fresh;
    })();
    if (bucket.roots.length < PER_DAY_CAP) {
      bucket.roots.push({
        id: row.id,
        created_at: row.created_at,
        preview: previewOf(row.body),
        hidden: row.hidden_at != null,
      });
    }
  }
  return days;
}

/**
 * Enforce the overall TOTAL_CAP root count across all days, dropping the
 * OLDEST roots first. Flattening to one newest-first list (the day grouping
 * above already preserves that order), slicing the first TOTAL_CAP entries,
 * and re-grouping consecutive same-date entries recovers a correctly nested
 * `DayIndexDay[]` with no day exceeding its already-applied per-day cap, and
 * with the tail (oldest days / oldest roots within the oldest surviving day)
 * trimmed first.
 */
function capTotalRoots(days: DayIndexDay[]): DayIndexDay[] {
  const flat: Array<{ date: string; root: DayIndexRoot }> = [];
  for (const day of days) for (const root of day.roots) flat.push({ date: day.date, root });
  const capped = flat.slice(0, TOTAL_CAP);
  const out: DayIndexDay[] = [];
  for (const { date, root } of capped) {
    const last = out[out.length - 1];
    if (last && last.date === date) last.roots.push(root);
    else out.push({ date, roots: [root] });
  }
  return out;
}

/**
 * Server-owned serialized-size cap. Deterministic oldest-first truncation:
 * pop roots off the tail (the oldest day's oldest-remaining root, since every
 * day's roots are already newest-first and days are already newest-first) one
 * at a time, dropping an emptied day entirely, until the JSON body fits.
 */
function capSerializedSize(days: DayIndexDay[]): DayIndexDay[] {
  const out = days.map((d) => ({ date: d.date, roots: [...d.roots] }));
  const size = () => JSON.stringify({ data: out, count: out.length }).length;
  while (size() > SERIALIZED_CAP_CHARS && out.length > 0) {
    const oldestDay = out[out.length - 1];
    if (oldestDay.roots.length > 1) {
      oldestDay.roots.pop();
    } else {
      out.pop();
    }
  }
  return out;
}

// GET /api/hermes/day-index?ai_request_id=<>&requested_by=<>
//
// Returns an INDEX (date + root id/created_at/preview/hidden) of the
// requester's OWN prior-day `day`-entity conversation roots — never replies,
// full bodies, reply counts, hidden_by, mentions, or metadata. Own-only per
// Nick's owner decision (2026-07-23): team-authored day roots are explicitly
// OUT of scope for this phase, not an oversight — see the query comment below.
//
// Verification chain — EVERY step must pass or the uniform empty shape wins;
// no step distinguishes its failure reason in the response (no oracle):
//   1. an ACTUAL API key (not the broader isPiRequest PI-or-key class — a
//      browser PI session must not authorize act-as retrieval here).
//   2. the named ai_requests row exists.
//   3. its stored requested_by EXACTLY equals the supplied requested_by.
//   4. that identity resolves to ONE real team_members.slug (strict — never
//      an invented fallback).
//   5. ai_requests.source_id resolves to an activity_entries row that is
//      entity_type='day', authored by that SAME resolved slug, with a valid
//      YYYY-MM-DD entity_id.
//   6. the anchor date is read from THAT row's entity_id — never from a
//      caller-supplied date or lookback window.
export async function handleGetHermesDayIndex(request: Request, env: Env): Promise<Response> {
  // 1. Actual API-key auth only.
  if (validateApiKey(request, env) !== true) {
    return error('Forbidden — API key required', 403);
  }

  const url = new URL(request.url);
  const aiRequestId = url.searchParams.get('ai_request_id');
  const requestedByParam = url.searchParams.get('requested_by');
  if (!aiRequestId || !requestedByParam) return empty();

  // 2. Load the named ai_requests row.
  const aiRequest = await env.DB.prepare(
    'SELECT source_id, requested_by FROM ai_requests WHERE id = ? LIMIT 1'
  ).bind(aiRequestId).first<{ source_id: string; requested_by: string | null }>();
  if (!aiRequest) return empty();

  // 3. Exact equality — the caller's claim must match what Hub itself wrote
  // at dispatch time (dispatchHermes sets requested_by = the authenticated
  // human caller's email; see api/lib/activity-entry.ts:489).
  if (!aiRequest.requested_by || aiRequest.requested_by !== requestedByParam) return empty();

  // 4. Strict identity resolution.
  const requesterSlug = await resolveStrictRequesterSlug(env, requestedByParam);
  if (!requesterSlug) return empty();

  // 5. The triggering activity_entries row binds the identity claim to a row
  // Hub already wrote: a caller cannot satisfy both #3 and #5 without
  // actually being the party ai_requests.requested_by names.
  // activity-hidden-exempt: identity/ownership check on the triggering entry
  // — must still resolve the day + actor even if the thread was later
  // dismissed (dismiss is a frontend verb, never "forget"; owner req 9.1.5).
  const trigger = await env.DB.prepare(
    'SELECT entity_type, entity_id, actor_slug FROM activity_entries WHERE id = ? LIMIT 1'
  ).bind(aiRequest.source_id).first<{ entity_type: string; entity_id: string; actor_slug: string }>();
  if (!trigger) return empty();
  if (trigger.entity_type !== 'day') return empty();
  if (trigger.actor_slug !== requesterSlug) return empty();
  if (!DATE_RE.test(trigger.entity_id)) return empty();

  // 6. Anchor date derived ONLY from the trigger row. The lookback WINDOW is
  // computed here (JS, from LOOKBACK_DAYS) rather than via SQLite's date()
  // modifier — the constant is the single source for the bound, and the bind
  // values below are plain literal dates, not a function call the SQL text
  // has to get right a second time.
  const anchorDate = trigger.entity_id;
  const windowStart = shiftIsoDate(anchorDate, -LOOKBACK_DAYS);
  const windowEnd = shiftIsoDate(anchorDate, -1);

  // Own-only day roots (Nick's owner decision, 2026-07-23): roots AUTHORED by
  // the requester only — no `visibility='team' OR ...` arm, and deliberately
  // NOT `activityVisibilityGate()`, whose API-key branch returns `1=1` (see
  // that function's PI/API-key comment) — exactly the bypass this endpoint
  // exists to contain. The hidden clause is written out explicitly rather
  // than via `activityHiddenClause(..., true)`: redundant under an own-only
  // predicate today, but it documents that only the requester's OWN hidden
  // roots may ever cross the hide boundary if a team-authored arm is added
  // later (a separate, reviewed expansion — not an accidental side effect of
  // this phase).
  const rows = await env.DB.prepare(
    `SELECT ae.id, ae.created_at, ae.entity_id, ae.body, ae.hidden_at
       FROM activity_entries ae
      WHERE ae.entity_type = 'day'
        AND ae.parent_id IS NULL
        AND ae.actor_slug = ?
        AND ae.entity_id BETWEEN ? AND ?
        AND (ae.hidden_at IS NULL OR ae.actor_slug = ?)
      ORDER BY ae.entity_id DESC, ae.created_at DESC, ae.id DESC`
  ).bind(requesterSlug, windowStart, windowEnd, requesterSlug)
    .all<{ id: string; created_at: string; entity_id: string; body: string; hidden_at: string | null }>();

  const perDay = groupWithPerDayCap(rows.results ?? []);
  const totalCapped = capTotalRoots(perDay);
  const sizeCapped = capSerializedSize(totalCapped);

  return json({ data: sizeCapped, count: sizeCapped.length } satisfies DayIndexResponse);
}
