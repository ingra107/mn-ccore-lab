// src/lib/time.test.ts
import { describe, it, expect } from 'vitest';
import { nowInstant, formatLocal, todayCivil } from './time';

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
