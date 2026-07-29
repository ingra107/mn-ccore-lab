/**
 * html-doctype.test.ts — ensureDoctype / hasLeadingDoctype (#915).
 *
 * The contract under test: fragments gain a doctype (standards mode on every
 * sink); anything already opening with a doctype comes back BYTE-IDENTICAL
 * (the ingest chokepoint must never rewrite a well-formed document).
 */

import { describe, it, expect } from 'vitest';
import { ensureDoctype, hasLeadingDoctype } from './html-doctype';

// The real prod shape (art_880863ad / art_b424399a, measured 2026-07-29):
// a Claude-Artifact export opening with <title>, no doctype, no html/head/body.
const FRAGMENT = '<title>Aims Funnel Framework</title>\n<style>body{margin:0}</style>\n<h1>Hi</h1>';

describe('ensureDoctype', () => {
  it('prepends a doctype to a Claude-Artifact-shaped fragment', () => {
    const out = ensureDoctype(FRAGMENT);
    expect(out).toBe('<!DOCTYPE html>\n' + FRAGMENT);
  });

  it('passes a full document through byte-identical', () => {
    const full = '<!DOCTYPE html><html lang="en"><head><title>t</title></head><body>x</body></html>';
    expect(ensureDoctype(full)).toBe(full);
  });

  it('accepts a lowercase doctype', () => {
    const full = '<!doctype html>\n<html lang="en"><body>x</body></html>';
    expect(ensureDoctype(full)).toBe(full);
  });

  it('accepts leading whitespace + HTML comments before the doctype (no quirks trigger)', () => {
    const full = '\n  <!-- generated 2026-07-29 -->\n<!DOCTYPE html><html><body>x</body></html>';
    expect(ensureDoctype(full)).toBe(full);
  });

  it('a doctype-less <html>-rooted document STILL gets the prepend (no doctype = quirks mode)', () => {
    const noDoctype = '<html><body>hi</body></html>';
    expect(ensureDoctype(noDoctype)).toBe('<!DOCTYPE html>\n<html><body>hi</body></html>');
  });

  it('keeps a BOM as the FIRST character (doctype inserted after it)', () => {
    const bom = '\uFEFF';
    expect(ensureDoctype(bom + FRAGMENT)).toBe(bom + '<!DOCTYPE html>\n' + FRAGMENT);
    // BOM + existing doctype: untouched.
    const full = bom + '<!DOCTYPE html><html></html>';
    expect(ensureDoctype(full)).toBe(full);
  });

  it('is idempotent', () => {
    const once = ensureDoctype(FRAGMENT);
    expect(ensureDoctype(once)).toBe(once);
  });
});

describe('hasLeadingDoctype', () => {
  it('is false for a fragment, true after normalization', () => {
    expect(hasLeadingDoctype(FRAGMENT)).toBe(false);
    expect(hasLeadingDoctype(ensureDoctype(FRAGMENT))).toBe(true);
  });

  it('a doctype buried mid-document does not count', () => {
    expect(hasLeadingDoctype('<h1>x</h1><!DOCTYPE html>')).toBe(false);
  });
});
