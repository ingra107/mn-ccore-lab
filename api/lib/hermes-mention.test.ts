// hermes-mention.test.ts -- #891: widen HERMES_DETECT_RE to accept an
// underscore-separated model tag (`@hermes_opus`) alongside the
// already-working hyphenated spelling (`@hermes-opus`), without letting
// HERMES_STRIP_RE start consuming the tag it must leave for PB's
// select_model() to parse. No test file existed for this module before
// #891; this is the first one.
import { describe, it, expect } from 'vitest';
import { HERMES_DETECT_RE, HERMES_STRIP_RE } from './hermes-mention';

describe('HERMES_DETECT_RE', () => {
  it('matches a bare @hermes/@claude mention (unchanged)', () => {
    expect(HERMES_DETECT_RE.test('please ask @hermes about this')).toBe(true);
    expect(HERMES_DETECT_RE.test('cc @claude for context')).toBe(true);
  });

  it('matches a hyphenated model tag (already reachable pre-#891)', () => {
    expect(HERMES_DETECT_RE.test('@hermes-opus summarize this')).toBe(true);
    expect(HERMES_DETECT_RE.test('@hermes-haiku quick one')).toBe(true);
  });

  it('#891: matches an underscore model tag (was unreachable -- `_` is a regex word character, so a bare \\b never held right after "hermes")', () => {
    expect(HERMES_DETECT_RE.test('@hermes_opus summarize this')).toBe(true);
    expect(HERMES_DETECT_RE.test('@hermes_sonnet do the thing')).toBe(true);
    expect(HERMES_DETECT_RE.test('@hermes_haiku quick one')).toBe(true);
    expect(HERMES_DETECT_RE.test('@Hermes_Opus case-insensitive')).toBe(true);
    expect(HERMES_DETECT_RE.test('@claude_opus also widened')).toBe(true);
  });

  it('still rejects a token that only starts with hermes (word boundary preserved)', () => {
    expect(HERMES_DETECT_RE.test('@hermesx do a thing')).toBe(false);
    expect(HERMES_DETECT_RE.test('@hermetic seal')).toBe(false);
  });

  it('#891: a hyphenated bogus tag still dispatches (unchanged, "-" is never a word char); an underscore bogus tag does not -- a known, scoped limitation (only opus/sonnet/haiku are literal alternatives; widening further was out of scope for this row)', () => {
    expect(HERMES_DETECT_RE.test('@hermes-bogus still dispatches')).toBe(true);
    expect(HERMES_DETECT_RE.test('@hermes_bogus does not dispatch')).toBe(false);
  });
});

describe('HERMES_STRIP_RE -- must NOT consume the model-tag separator (contract with PB select_model())', () => {
  it('strips only the @hermes/@claude token, leaving a hyphenated tag intact', () => {
    expect('@hermes-opus what is up'.replace(HERMES_STRIP_RE, '').trim()).toBe('-opus what is up');
  });

  it('#891: strips only the @hermes/@claude token, leaving an underscore tag intact', () => {
    expect('@hermes_opus what is up'.replace(HERMES_STRIP_RE, '').trim()).toBe('_opus what is up');
  });
});
