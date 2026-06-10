// src/lib/time.test.ts
import { describe, it, expect } from 'vitest';
import { nowInstant, formatLocal, todayCivil, parseDbUtc, formatDbLocal } from './time';

describe('time chokepoint', () => {
  it('nowInstant is explicit-UTC Z-marked ISO', () => {
    const s = nowInstant();
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
    expect(Math.abs(Date.now() - new Date(s).getTime())).toBeLessThan(5000);
  });

  it('todayCivil renders YYYY-MM-DD in an explicit zone', () => {
    const s = todayCivil('America/Chicago');
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('formatLocal renders a UTC instant in a viewer zone', () => {
    // 2026-05-23T02:30:00Z is 2026-05-22 (the prior day) in CT.
    const out = formatLocal('2026-05-23T02:30:00Z', { timeZone: 'America/Chicago' });
    expect(out).toContain('2026');
  });
});

describe('parseDbUtc', () => {
  it('treats a bare D1 datetime (no zone) as UTC, not local', () => {
    // The class bug: `new Date('2026-06-10 13:29:00')` reads it as local.
    // parseDbUtc must pin it to 13:29 UTC regardless of the running machine.
    const d = parseDbUtc('2026-06-10 13:29:00');
    expect(d.toISOString()).toBe('2026-06-10T13:29:00.000Z');
  });

  it('handles a bare datetime without seconds', () => {
    expect(parseDbUtc('2026-06-10 13:29').toISOString()).toBe('2026-06-10T13:29:00.000Z');
  });

  it('handles a T-separated bare datetime as UTC', () => {
    expect(parseDbUtc('2026-06-10T13:29:00').toISOString()).toBe('2026-06-10T13:29:00.000Z');
  });

  it('passes a Z-marked instant through unchanged', () => {
    expect(parseDbUtc('2026-06-10T13:29:00.123Z').toISOString()).toBe('2026-06-10T13:29:00.123Z');
  });

  it('respects an explicit numeric offset', () => {
    // 08:00 at -05:00 == 13:00 UTC.
    expect(parseDbUtc('2026-06-10T08:00:00-05:00').toISOString()).toBe('2026-06-10T13:00:00.000Z');
  });

  it('noon-anchors a date-only string to avoid UTC day-rollover', () => {
    // Built with a local T12:00:00, so the civil day never shifts off 06-10.
    const d = parseDbUtc('2026-06-10');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // June (0-indexed)
    expect(d.getDate()).toBe(10);
    expect(d.getHours()).toBe(12);
  });

  it('returns Invalid Date for empty / null', () => {
    expect(isNaN(parseDbUtc('').getTime())).toBe(true);
    expect(isNaN(parseDbUtc(null).getTime())).toBe(true);
    expect(isNaN(parseDbUtc(undefined).getTime())).toBe(true);
  });
});

describe('formatDbLocal', () => {
  it('renders a bare D1 UTC datetime in the viewer zone', () => {
    // 13:29 UTC == 08:29 in CT (UTC-5, June/CDT).
    const out = formatDbLocal('2026-06-10 13:29:00', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });
    expect(out).toBe('8:29 AM');
  });

  it('returns empty string for unparseable input', () => {
    expect(formatDbLocal('')).toBe('');
    expect(formatDbLocal(null)).toBe('');
  });
});
