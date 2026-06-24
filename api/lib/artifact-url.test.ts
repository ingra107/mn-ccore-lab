// artifact-url.test.ts — the shared artifact portal URL matcher used by the
// at-source key_link hook (activity-entry.ts). Must stay byte-equivalent to PB's
// scripts/process_hub_comments.py::_ARTIFACT_RE so the two link paths agree.

import { describe, it, expect } from 'vitest';
import { ARTIFACT_URL_RE, matchAllArtifactUrls, artifactIdFromUrl } from './artifact-url';

describe('artifact-url matcher', () => {
  const ABC = 'https://mn-ccore-lab.pages.dev/portal/artifacts/art_abc123';
  const DEF = 'https://mn-ccore-lab.pages.dev/portal/artifacts/art_def456';

  it('matches a bare artifact URL', () => {
    expect(ARTIFACT_URL_RE.test(ABC)).toBe(true);
  });

  it('extracts a single URL from surrounding prose', () => {
    expect(matchAllArtifactUrls(`Full write-up: ${ABC} — take a look`)).toEqual([ABC]);
  });

  it('stops the URL at a trailing ) > ] (markdown link / bracket)', () => {
    expect(matchAllArtifactUrls(`[draft](${ABC})`)).toEqual([ABC]);
    expect(matchAllArtifactUrls(`<${ABC}>`)).toEqual([ABC]);
  });

  it('extracts multiple URLs left-to-right', () => {
    expect(matchAllArtifactUrls(`one ${ABC} two ${DEF}`)).toEqual([ABC, DEF]);
  });

  it('de-duplicates a URL pasted twice (first occurrence order)', () => {
    expect(matchAllArtifactUrls(`${ABC} and again ${ABC}`)).toEqual([ABC]);
  });

  it('ignores a non-artifact URL', () => {
    expect(matchAllArtifactUrls('see https://docs.google.com/document/d/abc')).toEqual([]);
  });

  it('ignores a /portal path that is not /artifacts/art_', () => {
    expect(matchAllArtifactUrls('https://mn-ccore-lab.pages.dev/portal/tasks/123')).toEqual([]);
  });

  it('empty / undefined body → []', () => {
    expect(matchAllArtifactUrls('')).toEqual([]);
    expect(matchAllArtifactUrls(undefined as unknown as string)).toEqual([]);
  });

  it('parses the art_ id from a URL', () => {
    expect(artifactIdFromUrl(ABC)).toBe('art_abc123');
  });

  it('returns null for a URL without an art_ id', () => {
    expect(artifactIdFromUrl('https://x/portal/tasks/123')).toBeNull();
  });
});
