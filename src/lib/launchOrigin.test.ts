// src/lib/launchOrigin.test.ts
import { describe, it, expect } from 'vitest';
import { detectOrigin } from './launchOrigin';
import { buildLaunchUri } from './launch';

describe('detectOrigin', () => {
  it('returns mobile when userAgentData.mobile is true', () => {
    expect(detectOrigin({ userAgentData: { mobile: true }, userAgent: '' } as any)).toBe('mobile');
  });
  it('returns computer when userAgentData.mobile is false', () => {
    expect(detectOrigin({ userAgentData: { mobile: false }, userAgent: 'Mozilla/5.0 (Windows NT 10.0)' } as any)).toBe('computer');
  });
  it('falls back to UA string when userAgentData is absent (iPhone → mobile)', () => {
    expect(detectOrigin({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } as any)).toBe('mobile');
  });
  it('falls back to UA string (desktop → computer)', () => {
    expect(detectOrigin({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)' } as any)).toBe('computer');
  });
});

describe('buildLaunchUri', () => {
  it('builds a launch URI from an opaque id', () => {
    expect(buildLaunchUri('lnch_abc123')).toBe('mnccore://launch/lnch_abc123');
  });
  it('percent-encodes any special characters in the id', () => {
    expect(buildLaunchUri('lnch_a/b')).toBe('mnccore://launch/lnch_a%2Fb');
  });
});

describe('@quickchat parse', () => {
  const strip = (s: string) => s.replace(/^@quickchat\s*/i, '').trim();
  it('strips the tag and trims', () => {
    expect(strip('@quickchat  rework the figure ')).toBe('rework the figure');
  });
  it('matches case-insensitively', () => {
    expect(/^@quickchat\b/i.test('@QuickChat hi')).toBe(true);
  });
});

describe('@workon parse', () => {
  const strip = (s: string) => s.replace(/^@workon\s*/i, '').trim();
  it('strips and trims', () => {
    expect(strip('@workon improve the methods')).toBe('improve the methods');
  });
  it('handles extra spaces after tag', () => {
    expect(strip('@workon   fix the bug  ')).toBe('fix the bug');
  });
  it('matches case-insensitively', () => {
    expect(/^@workon\b/i.test('@WorkOn something')).toBe(true);
  });
  it('does not match @workonmore (word-boundary)', () => {
    expect(/^@workon\b/i.test('@workonmore')).toBe(false);
  });
});
