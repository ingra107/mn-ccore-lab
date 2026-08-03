import { describe, it, expect } from 'vitest';
import { civilDatePlusDays } from '../taskGrouping';

// #105. The Today due-window compares a task's civil due_date against an edge
// date. Getting this arithmetic wrong shifts the whole window by a day in every
// western timezone — the same defect isToday() already documents.
describe('civilDatePlusDays', () => {
  it('adds days within a month', () => {
    expect(civilDatePlusDays('2026-08-03', 7)).toBe('2026-08-10');
    expect(civilDatePlusDays('2026-08-03', 0)).toBe('2026-08-03');
  });

  it('rolls over month and year boundaries', () => {
    expect(civilDatePlusDays('2026-08-28', 7)).toBe('2026-09-04');
    expect(civilDatePlusDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(civilDatePlusDays('2026-01-31', 30)).toBe('2026-03-02'); // 2026 is not a leap year
  });

  it('handles a leap day', () => {
    expect(civilDatePlusDays('2024-02-27', 3)).toBe('2024-03-01');
  });

  it('does NOT drift across a DST transition', () => {
    // US DST starts 2026-03-08 and ends 2026-11-01. Naive
    // `date + days * 86_400_000` arithmetic lands on the wrong civil day here.
    expect(civilDatePlusDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(civilDatePlusDays('2026-03-07', 7)).toBe('2026-03-14');
    expect(civilDatePlusDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(civilDatePlusDays('2026-10-28', 14)).toBe('2026-11-11');
  });

  it('never parses as UTC (the previous-day trap)', () => {
    // new Date('2026-08-03') is UTC midnight = Aug 2 evening in Central time.
    // A UTC-parsing implementation returns 2026-08-02 for a +0 offset.
    expect(civilDatePlusDays('2026-08-03', 0)).toBe('2026-08-03');
    expect(civilDatePlusDays('2026-01-01', 0)).toBe('2026-01-01');
  });

  it('returns the input unchanged when it is not a civil date', () => {
    expect(civilDatePlusDays('', 7)).toBe('');
    expect(civilDatePlusDays('not-a-date', 7)).toBe('not-a-date');
  });
});
