import { describe, it, expect } from 'vitest';
import { interleaveMilestones } from '../taskGrouping';

// GH #131/#132: a milestone is inserted into the active bucket by due date,
// via STABLE insertion — the surrounding tasks never get re-sorted (Rule 62).

type Item = { id: string; kind?: string | null; due_date?: string | null };

const task = (id: string, due_date?: string | null): Item => ({ id, kind: 'task', due_date: due_date ?? null });
const milestone = (id: string, due_date?: string | null): Item => ({ id, kind: 'milestone', due_date: due_date ?? null });

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
});
