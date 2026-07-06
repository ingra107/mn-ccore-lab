/**
 * public-artifact.test.ts — GET /a/:id (schema-v94 public HTML artifact serve).
 *
 * Covers:
 *   - serves the stored html body + the full hardened security-header set when
 *     visibility='public' AND content_type='html' (CSP incl. connect-src
 *     'none' — the fix for the blind-CSRF gap bare `sandbox allow-scripts`
 *     left open — plus nosniff + Cache-Control)
 *   - 404 when visibility='team' (even if content_type='html')
 *   - 404 when content_type='markdown' (even if visibility='public')
 *   - 404 when the artifact id doesn't exist
 *   - 404 (no DB round-trip) when the id doesn't look like art_<hex>
 *   - the 404 response never leaks the stored body
 */

import { describe, it, expect, vi } from 'vitest';
import type { Env } from '../helpers';
import { handleGetPublicArtifact } from './public-artifact';

function makeDb(row: Record<string, unknown> | null) {
  const prepare = vi.fn((_sql: string) => ({
    bind: vi.fn((..._args: unknown[]) => ({
      first: vi.fn(async () => row),
    })),
  }));
  return { prepare };
}

describe('GET /a/:id — public artifact serve', () => {
  const HARDENED_CSP =
    "sandbox allow-scripts; default-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; script-src 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; media-src data: blob:";

  it('serves html body + hardened CSP + nosniff + Cache-Control + noindex + content-type when public+html', async () => {
    const env = {
      DB: makeDb({ body_md: '<html><body>hi</body></html>', content_type: 'html', visibility: 'public' }),
    } as unknown as Env;

    const res = await handleGetPublicArtifact('art_abc123', env);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('Content-Security-Policy')).toBe(HARDENED_CSP);
    // connect-src 'none' is the load-bearing addition over bare
    // `sandbox allow-scripts` — closes the blind-CSRF gap (a sandboxed
    // opaque-origin doc could otherwise still fetch() the Hub's own /api/*
    // with the viewer's cookies via a no-preflight simple request).
    expect(res.headers.get('Content-Security-Policy')).toContain("connect-src 'none'");
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    const body = await res.text();
    expect(body).toBe('<html><body>hi</body></html>');
  });

  it('404s when visibility=team (content_type=html)', async () => {
    const env = {
      DB: makeDb({ body_md: '<html>secret</html>', content_type: 'html', visibility: 'team' }),
    } as unknown as Env;

    const res = await handleGetPublicArtifact('art_team', env);

    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain('secret');
  });

  it('404s when content_type=markdown (visibility=public)', async () => {
    const env = {
      DB: makeDb({ body_md: '# Markdown body', content_type: 'markdown', visibility: 'public' }),
    } as unknown as Env;

    const res = await handleGetPublicArtifact('art_md', env);

    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain('Markdown body');
  });

  it('404s when the artifact does not exist', async () => {
    const env = { DB: makeDb(null) } as unknown as Env;
    const res = await handleGetPublicArtifact('art_missing', env);
    expect(res.status).toBe(404);
  });

  it('404s without a DB round-trip when the id is not art_-shaped', async () => {
    const db = makeDb(null);
    const env = { DB: db } as unknown as Env;
    const res = await handleGetPublicArtifact('not-an-artifact-id', env);
    expect(res.status).toBe(404);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('team AND missing 404s are identical in shape (no signal leak)', async () => {
    const envTeam = {
      DB: makeDb({ body_md: 'x', content_type: 'html', visibility: 'team' }),
    } as unknown as Env;
    const envMissing = { DB: makeDb(null) } as unknown as Env;

    const resTeam = await handleGetPublicArtifact('art_a', envTeam);
    const resMissing = await handleGetPublicArtifact('art_b', envMissing);

    expect(resTeam.status).toBe(resMissing.status);
    expect(await resTeam.text()).toBe(await resMissing.text());
    expect(resTeam.headers.get('X-Robots-Tag')).toBe(resMissing.headers.get('X-Robots-Tag'));
  });
});
