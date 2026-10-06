/**
 * calendar-feeds.poll-token.test.ts
 *
 * Regression test for Level-1 durability fix (schema v85, 2026-06-18):
 *
 * BUG: pollFeed previously did DELETE first, then INSERT chunks. If any INSERT
 * chunk failed (e.g. D1 timeout under storage pressure), the feed's cache was
 * left EMPTY. Users saw "connect a calendar" until the next successful poll —
 * this drove the 2026-06-18 calendar outage after processed_mutations bloat.
 *
 * FIX: INSERT with a fresh poll_token first; DELETE old rows (different
 * poll_token) LAST, only after all INSERT chunks succeed. The empty-on-failure
 * state is now structurally unrepresentable.
 *
 * #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
 * The first cut's stub threw from a hand-written batch() and counted DELETE
 * statements, so "old rows preserved" meant "no DELETE string was seen" -- it
 * could not see a cache that was emptied some other way, and its batch could
 * not roll back. Here the feed's cached events are real rows; an INSERT
 * failure is injected with d1Adapter failSql, and each case reads back which
 * events the feed holds afterwards.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { Env } from '../helpers';
import { nowInstant } from '../lib/time';
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db';

// We need to mock fetch() so pollFeed doesn't make real HTTP calls.
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// pollFeed is not exported; pollAllStaleFeeds drives it.
import { pollAllStaleFeeds } from './calendar-feeds';

// ── Minimal ICS fixture ──────────────────────────────────────────────────────

function makeIcs(uid: string, summary: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Test//EN',
    'BEGIN:VEVENT',
    `UID:${uid}@test.com`,
    `SUMMARY:${summary}`,
    `DTSTART:${nowInstant().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTEND:${new Date(Date.now() + 3600000).toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

let db: InstanceType<typeof Database>;

function seedFeed(id: string, extra: Record<string, unknown> = {}) {
  insertRow(db, 'user_calendar_feeds', {
    id, user_slug: 'nick-ingraham', feed_url: `https://cal.example.com/${id}.ics`, feed_label: 'Test',
    last_polled_at: null, ...extra,
  });
}
/** A cached event from an EARLIER poll (or a pre-v85 row when token is null). */
function seedOldEvent(feedId: string, uid: string, token: string | null) {
  insertRow(db, 'user_calendar_events', {
    id: `old_${uid}`, feed_id: feedId, user_slug: 'nick-ingraham', uid, summary: `Old ${uid}`,
    start_at: '2026-06-01T10:00:00Z', end_at: '2026-06-01T11:00:00Z', is_all_day: 0, poll_token: token,
  });
}
const summaries = (feedId: string) =>
  (db.prepare('SELECT summary FROM user_calendar_events WHERE feed_id = ? ORDER BY summary').all(feedId) as { summary: string }[]).map((r) => r.summary);
const feed = (id: string) => db.prepare('SELECT * FROM user_calendar_feeds WHERE id = ?').get(id) as Record<string, unknown>;
const envWith = (hooks: Parameters<typeof d1Adapter>[1] = {}) => ({ DB: d1Adapter(db, hooks) }) as unknown as Env;

beforeEach(() => {
  db = prodSchemaDb();
});

describe('pollFeed — atomic swap (Level-1 durability, v85)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(
      new Response(makeIcs('test-uid-1', 'Team Standup'), {
        status: 200,
        headers: { 'content-type': 'text/calendar', ETag: 'W/"v2"' },
      }),
    );
  });

  it('a successful poll replaces the cache: new rows carry a 32-char poll_token, old ones (prior token and pre-v85 NULL) are evicted', async () => {
    seedFeed('feed-1');
    seedOldEvent('feed-1', 'prior', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    seedOldEvent('feed-1', 'legacy', null);
    seedFeed('feed-other', { last_polled_at: nowInstant() }); // fresh: not polled
    seedOldEvent('feed-other', 'untouched', null);

    await pollAllStaleFeeds(envWith());

    expect(summaries('feed-1')).toEqual(['Team Standup']);
    const token = (db.prepare("SELECT poll_token FROM user_calendar_events WHERE feed_id = 'feed-1'").get() as { poll_token: string }).poll_token;
    expect(token).toHaveLength(32);
    expect(feed('feed-1')).toMatchObject({ last_error: null, etag: 'W/"v2"' });
    expect(feed('feed-1').last_polled_at).toBeTruthy();
    // Another feed's cache is never touched.
    expect(summaries('feed-other')).toEqual(['Old untouched']);
  });

  it('a failed INSERT chunk keeps the old cache whole and records the error', async () => {
    seedFeed('feed-2', { etag: 'W/"v1"' });
    seedOldEvent('feed-2', 'prior', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

    await expect(pollAllStaleFeeds(envWith({ failSql: /INSERT OR REPLACE INTO user_calendar_events/, failTimes: 1 }))).resolves.not.toThrow();

    // CRITICAL: the cache is not emptied, and no new row slipped in.
    expect(summaries('feed-2')).toEqual(['Old prior']);
    // Conditional headers are cleared so the next poll re-fetches in full.
    expect(feed('feed-2').last_error).toMatch(/^insert chunk 0:/);
    expect(feed('feed-2').etag).toBeNull();
  });

  it('a 304 Not Modified touches no event rows, only last_polled_at', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 304 }));
    seedFeed('feed-3', { etag: 'W/"abc123"' });
    seedOldEvent('feed-3', 'prior', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

    await pollAllStaleFeeds(envWith());

    expect(summaries('feed-3')).toEqual(['Old prior']);
    expect(feed('feed-3').etag).toBe('W/"abc123"');
    expect(feed('feed-3').last_polled_at).toBeTruthy();
  });

  it('a failed stale eviction is non-fatal: the new rows are live and the poll completes', async () => {
    seedFeed('feed-4');
    seedOldEvent('feed-4', 'prior', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

    await expect(pollAllStaleFeeds(envWith({ failSql: /DELETE FROM user_calendar_events/, failTimes: 1 }))).resolves.not.toThrow();

    // New rows landed; the stale one lingers until the next successful poll.
    expect(summaries('feed-4')).toEqual(['Old prior', 'Team Standup']);
    expect(feed('feed-4').last_error).toBeNull();
  });

  it('evicts old rows even when the new event set is empty (zero events in window)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nEND:VCALENDAR\r\n', {
        status: 200, headers: { 'content-type': 'text/calendar' },
      }),
    );
    seedFeed('feed-5');
    seedOldEvent('feed-5', 'prior', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

    await pollAllStaleFeeds(envWith());

    expect(summaries('feed-5')).toEqual([]);
    expect(feed('feed-5').last_error).toBeNull();
  });
});

// ── Regression: backlog #117 — cron path must use user_email, not user_slug ──
//
// BUG: pollAllStaleFeeds was passing feed.user_slug ("nick-ingraham") as the
// ownerEmail argument to pollFeed/parseIcs. The ICS parser matches ownerEmail
// against ATTENDEE mailto: lines ("ingra107@umn.edu") — a slug never matches,
// so PARTSTAT=DECLINED events were silently inserted to D1 and shown in Today.
//
// FIX (schema v86): user_calendar_feeds.user_email stores the owner's real email.
// pollAllStaleFeeds now passes feed.user_email ?? feed.user_slug.
describe('pollFeed — cron path uses user_email for PARTSTAT=DECLINED filter (backlog #117)', () => {
  const OWNER_EMAIL = 'ingra107@umn.edu';
  const declinedIcs = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Test//EN',
    'BEGIN:VEVENT',
    'UID:declined-cron-test@test.com',
    'SUMMARY:Declined pitch',
    `DTSTART:${nowInstant().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTEND:${new Date(Date.now() + 3600000).toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `ATTENDEE;CN=Nick;PARTSTAT=DECLINED:mailto:${OWNER_EMAIL}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(new Response(declinedIcs, { status: 200, headers: { 'content-type': 'text/calendar' } }));
  });

  it('filters the DECLINED event when feed.user_email is the real owner email', async () => {
    seedFeed('feed-declined-email', { user_email: OWNER_EMAIL });
    await pollAllStaleFeeds(envWith());
    expect(summaries('feed-declined-email')).toEqual([]);
  });

  it('does NOT filter the event when feed.user_email is null (legacy row — same as prior behavior)', async () => {
    // user_slug fallback cannot match the email — event is NOT filtered, IS inserted.
    seedFeed('feed-declined-null-email', { user_email: null });
    await pollAllStaleFeeds(envWith());
    expect(summaries('feed-declined-null-email')).toEqual(['Declined pitch']);
  });
});
