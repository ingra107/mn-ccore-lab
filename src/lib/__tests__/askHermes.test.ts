// askHermes.test.ts -- pins the user-facing copy that five compose surfaces now
// share, so extracting it stays behavior-identical to the blocks it replaced.
//
// The load-bearing assertion is `keeps a saved-but-not-dispatched ask as info`:
// the user's words ARE stored in those branches, and calling that an error reads
// as data loss. That distinction was the reason the copy existed in three places
// in the first place.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { askHermesOnDay, hermesOutcomeToast, dayActivityQueryKey } from '../askHermes';

describe('hermesOutcomeToast', () => {
  it('reports a dispatched ask as success', () => {
    expect(hermesOutcomeToast({ ok: true, hermes: { dispatched: true } })).toEqual({
      kind: 'success',
      text: 'Asked Hermes',
    });
  });

  it('treats a missing hermes verdict as success (older/other responses)', () => {
    expect(hermesOutcomeToast({ ok: true })).toEqual({ kind: 'success', text: 'Asked Hermes' });
  });

  it('keeps a saved-but-not-dispatched ask as info, not error', () => {
    const empty = hermesOutcomeToast({ ok: true, hermes: { dispatched: false, reason: 'empty' } });
    expect(empty.kind).toBe('info');
    expect(empty.text).toBe('Saved privately — add a question for Hermes');

    const unreachable = hermesOutcomeToast({ ok: true, hermes: { dispatched: false } });
    expect(unreachable.kind).toBe('info');
    expect(unreachable.text).toBe('Saved privately, but Hermes could not be reached — try again');
  });

  it('swaps only the verb for task surfaces', () => {
    expect(
      hermesOutcomeToast({ ok: true, hermes: { dispatched: false, reason: 'empty' } }, 'Posted').text
    ).toBe('Posted privately — add a question for Hermes');
    expect(
      hermesOutcomeToast({ ok: true, hermes: { dispatched: false } }, 'Posted').text
    ).toBe('Posted privately, but Hermes could not be reached — try again');
  });

  it('reports a transport failure as error, carrying the reason', () => {
    const out = hermesOutcomeToast({ ok: false, error: new Error('/api/days 500') });
    expect(out.kind).toBe('error');
    expect(out.text).toContain('/api/days 500');
  });
});

describe('askHermesOnDay', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the body verbatim so the server can detect the token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hermes: { dispatched: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await askHermesOnDay('@hermes what time is my CLIF meeting today', '2026-07-23');

    expect(res).toEqual({ ok: true, hermes: { dispatched: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/days/2026-07-23/activity',
      expect.objectContaining({
        method: 'POST',
        // The @hermes token MUST survive — stripping it is a silent "no Hermes".
        body: JSON.stringify({ content: '@hermes what time is my CLIF meeting today' }),
      })
    );
  });

  it('returns ok:false instead of throwing on a non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const res = await askHermesOnDay('@hermes hi', '2026-07-23');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe('/api/days 503');
  });

  it('returns ok:false instead of throwing when the network rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const res = await askHermesOnDay('@hermes hi', '2026-07-23');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe('offline');
  });
});

describe('dayActivityQueryKey', () => {
  it('matches the key the day feed reads', () => {
    expect(dayActivityQueryKey('2026-07-23')).toEqual(['day-activity', '2026-07-23']);
  });
});
