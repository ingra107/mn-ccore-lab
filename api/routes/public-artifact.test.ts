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
 *
 * Plus the #508 origin-split half (2026-07-22): the HUB origin's /a/:id is now
 * only a 301 to the cookieless artifact host, and must never touch D1 or emit a
 * body.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Env } from '../helpers';
import {
  handleGetPublicArtifact,
  handleLegacyPublicArtifactRedirect,
  PUBLIC_ARTIFACT_ORIGIN,
} from './public-artifact';

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
    // #915: the stored body has no doctype, so the serve path prepends one
    // (quirks-mode fix); the rest of the document is untouched.
    expect(body).toBe('<!DOCTYPE html>\n<html><body>hi</body></html>');
  });

  it('serves a stored FRAGMENT with a doctype prepended, and a full document byte-identical (#915)', async () => {
    // The real prod fragment shape (art_b424399a, live on the public origin):
    // opens with <title>, no doctype -> quirks mode without the prepend.
    const fragment = '<title>LLM Stewardship</title><h1>Map</h1>';
    const envFragment = {
      DB: makeDb({ body_md: fragment, content_type: 'html', visibility: 'public' }),
    } as unknown as Env;
    const resFragment = await handleGetPublicArtifact('art_frag', envFragment);
    expect(await resFragment.text()).toBe('<!DOCTYPE html>\n' + fragment);

    const full = '<!DOCTYPE html><html lang="en"><body>done</body></html>';
    const envFull = {
      DB: makeDb({ body_md: full, content_type: 'html', visibility: 'public' }),
    } as unknown as Env;
    const resFull = await handleGetPublicArtifact('art_full', envFull);
    expect(await resFull.text()).toBe(full);
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

describe('GET /a/:id on the HUB origin — legacy 301 (#508 origin split)', () => {
  it('redirects an art_<hex> id to the cookieless artifact origin, permanently', () => {
    const res = handleLegacyPublicArtifactRedirect('art_b424399a8dfbdd6bcf59ac9563ce8f62');

    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe(
      `${PUBLIC_ARTIFACT_ORIGIN}/a/art_b424399a8dfbdd6bcf59ac9563ce8f62`,
    );
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    // A 301 with no freshness hint can be pinned by a browser forever.
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });

  it('the cookieless origin is a DIFFERENT SITE, not just a different path', () => {
    // The entire security property of #508 rests on this being a distinct
    // registrable *.pages.dev name (Public Suffix List boundary), so a Hub
    // cookie cannot reach it. A refactor that "simplifies" this back to the Hub
    // host silently reinstates the same-origin stored-XSS class.
    expect(PUBLIC_ARTIFACT_ORIGIN).not.toContain('mn-ccore-lab.pages.dev');
    expect(PUBLIC_ARTIFACT_ORIGIN).toMatch(/^https:\/\/[a-z0-9-]+\.pages\.dev$/);
  });

  it('emits NO body — the Hub origin can no longer serve artifact HTML at all', async () => {
    const res = handleLegacyPublicArtifactRedirect('art_abc123');
    expect(await res.text()).toBe('');
  });

  it('301s uniformly regardless of visibility/existence (no oracle, no DB read)', () => {
    // Same shape for a known-public id and a made-up one: the redirect never
    // consults D1, so it cannot leak whether an artifact exists or is public.
    const a = handleLegacyPublicArtifactRedirect('art_b424399a8dfbdd6bcf59ac9563ce8f62');
    const b = handleLegacyPublicArtifactRedirect('art_0000000000000000000000000000dead');
    expect(a.status).toBe(b.status);
    expect(a.headers.get('Cache-Control')).toBe(b.headers.get('Cache-Control'));
  });

  it('404s (no Location built) for anything that is not literally art_<hex>', () => {
    for (const bad of [
      '',
      'not-an-artifact-id',
      'art_',
      'art_zzz',                       // non-hex
      'art_abc/../../evil',            // path traversal into the Location header
      'art_abc%0d%0aX-Injected: 1',    // CRLF header injection
      '//evil.example.com',            // open-redirect shape
    ]) {
      const res = handleLegacyPublicArtifactRedirect(bad);
      expect(res.status, `expected 404 for ${JSON.stringify(bad)}`).toBe(404);
      expect(res.headers.get('Location')).toBeNull();
    }
  });
});
