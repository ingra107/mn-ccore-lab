import { describe, it, expect } from 'vitest';
import { interleaveMilestones, milestoneRules } from '../taskGrouping';

// GH #131/#132: a milestone is inserted into the active bucket by due date,
// via STABLE insertion — the surrounding tasks never get re-sorted (Rule 62).

type Item = { id: string; kind?: string | null; due_date?: string | null; deadline?: string | null };

const task = (id: string, due_date?: string | null): Item => ({ id, kind: 'task', due_date: due_date ?? null });
const milestone = (id: string, due_date?: string | null, deadline?: string | null): Item =>
  ({ id, kind: 'milestone', due_date: due_date ?? null, deadline: deadline ?? null });

const TODAY = '2026-09-17';

describe('interleaveMilestones', () => {
  it('is the identity when there are no milestones', () => {
    const tasks = [task('a', '2026-09-01'), task('b', null), task('c', '2026-08-01')];
    expect(interleaveMilestones(tasks)).toEqual(tasks);
  });

  it('inserts a milestone between two dated tasks', () => {
    const a = task('a', '2026-09-10');
    const b = task('b', '2026-09-20');
    const m = milestone('m', '2026-09-15');
    expect(interleaveMilestones([a, b, m]).map((t) => t.id)).toEqual(['a', 'm', 'b']);
  });

  it('places a milestone after all tasks when its date is the latest', () => {
    const a = task('a', '2026-09-01');
    const b = task('b', '2026-09-05');
    const m = milestone('m', '2026-09-30');
    expect(interleaveMilestones([a, b, m]).map((t) => t.id)).toEqual(['a', 'b', 'm']);
  });

  it('places a milestone before a no-date task', () => {
    const a = task('a', '2026-09-01');
    const b = task('b', null);
    const m = milestone('m', '2026-09-05');
    expect(interleaveMilestones([a, b, m]).map((t) => t.id)).toEqual(['a', 'm', 'b']);
  });

  it('orders two milestones by date', () => {
    const a = task('a', '2026-09-01');
    const b = task('b', '2026-09-30');
    const m1 = milestone('m1', '2026-09-20');
    const m2 = milestone('m2', '2026-09-10');
    // input order deliberately scrambled — sort must come from due_date, not input order
    expect(interleaveMilestones([a, m1, b, m2]).map((t) => t.id)).toEqual(['a', 'm2', 'm1', 'b']);
  });

  it('sends a no-date milestone to the end', () => {
    const a = task('a', '2026-09-01');
    const b = task('b', '2026-09-30');
    const m = milestone('m', null);
    expect(interleaveMilestones([a, b, m]).map((t) => t.id)).toEqual(['a', 'b', 'm']);
  });

  it('never reorders the tasks themselves', () => {
    const a = task('a', '2026-09-20');
    const b = task('b', '2026-09-05'); // deliberately out of date order vs a
    const m = milestone('m', '2026-09-10');
    const result = interleaveMilestones([a, b, m]).filter((t) => t.kind !== 'milestone').map((t) => t.id);
    expect(result).toEqual(['a', 'b']);
  });

  // Nick 2026-09-17: two-date milestone rendering — due_date is the INTERNAL
  // date, deadline is the HARD (sponsor/journal) date.
  describe('two-date rendering', () => {
    it('single-date milestone (no deadline) is unchanged — one hard entry at due_date', () => {
      const m = milestone('m', '2026-09-20');
      expect(milestoneRules(m, TODAY)).toEqual([{ role: 'hard', date: '2026-09-20' }]);
    });

    it('deadline == due_date collapses to one hard entry', () => {
      const m = milestone('m', '2026-09-20', '2026-09-20');
      expect(milestoneRules(m, TODAY)).toEqual([{ role: 'hard', date: '2026-09-20' }]);
    });

    it('internal date still ahead of today -> one internal entry, no hard entry', () => {
      const m = milestone('m', '2026-09-20', '2026-10-01');
      expect(milestoneRules(m, TODAY)).toEqual([{ role: 'internal', date: '2026-09-20' }]);
    });

    it('internal date == today counts as ahead (>=), not slipped', () => {
      const m = milestone('m', TODAY, '2026-10-01');
      expect(milestoneRules(m, TODAY)).toEqual([{ role: 'internal', date: TODAY }]);
    });

    it('internal date has slipped -> slipped entry at due_date + hard entry at deadline', () => {
      const m = milestone('m', '2026-09-01', '2026-10-01');
      expect(milestoneRules(m, TODAY)).toEqual([
        { role: 'slipped', date: '2026-09-01' },
        { role: 'hard', date: '2026-10-01' },
      ]);
    });

    it('interleaveMilestones emits one row for a single-date milestone, unchanged behavior', () => {
      const a = task('a', '2026-09-10');
      const b = task('b', '2026-09-20');
      const m = milestone('m', '2026-09-15');
      const result = interleaveMilestones([a, b, m], TODAY);
      expect(result.map((t) => t.id)).toEqual(['a', 'm', 'b']);
      expect(result[1].milestoneRole).toBe('hard');
    });

    it('interleaveMilestones emits a single internal row when the internal date is ahead', () => {
      const a = task('a', '2026-09-10');
      const b = task('b', '2026-09-25');
      const m = milestone('m', '2026-09-20', '2026-10-05'); // hard date not yet due
      const result = interleaveMilestones([a, b, m], TODAY);
      expect(result.map((t) => t.id)).toEqual(['a', 'm', 'b']);
      expect(result.filter((t) => t.id === 'm')).toHaveLength(1);
      expect(result[1].milestoneRole).toBe('internal');
      expect(result[1].milestoneDate).toBe('2026-09-20');
    });

    it('interleaveMilestones emits two rows (slipped + hard) when the internal date has slipped, each positioned by its own date', () => {
      const a = task('a', '2026-09-05');
      const b = task('b', '2026-09-12'); // between the slipped internal date and the hard date
      const c = task('c', '2026-09-30');
      const m = milestone('m', '2026-09-01', '2026-09-20'); // internal slipped, hard still ahead
      const result = interleaveMilestones([a, b, c, m], TODAY);
      // slipped entry (09-01) sorts before a (09-05); hard entry (09-20) sorts
      // after b (09-12, not yet past the hard date) and before c (09-30).
      expect(result.map((t) => t.id)).toEqual(['m', 'a', 'b', 'm', 'c']);
      const milestoneRows = result.filter((t) => t.id === 'm');
      expect(milestoneRows.map((t) => t.milestoneRole)).toEqual(['slipped', 'hard']);
      expect(milestoneRows.map((t) => t.milestoneDate)).toEqual(['2026-09-01', '2026-09-20']);
    });
  });
});
