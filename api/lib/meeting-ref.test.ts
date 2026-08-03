import { describe, it, expect } from 'vitest';
import {
  deriveMeetingDate, deriveTitleSlug, slugifyTitle, slugifyTitleLoose, resolveMeetingRef,
} from './meeting-ref';

// Fixtures are REAL prod values (2026-08-03): the task ids come from
// tasks.meeting_id, the meetings from the meetings table.
const MEETINGS = [
  { id: 'mtg-2026-07-31-acc249c0', title: 'Nick/Adams Meeting', date: '2026-07-31' },
  { id: 'mtg-2026-07-30-41d7f91f', title: 'CLIF WG Weekly Meeting', date: '2026-07-30' },
  { id: 'mtg-2026-07-30-3332759d', title: 'Pulmonary HSR Group Meeting', date: '2026-07-30' },
  { id: 'mtg-2026-07-24-ef23d426', title: 'R01 meet follow up + Aim 3', date: '2026-07-24' },
];

describe('deriveMeetingDate', () => {
  it('reads the civil date out of each of the three id spaces', () => {
    expect(deriveMeetingDate('mtg-2026-07-24-ef23d426')).toBe('2026-07-24');
    expect(deriveMeetingDate('cal-20260731T1300-nickadams-meeting')).toBe('2026-07-31');
    expect(deriveMeetingDate('mtg_20260731T182205')).toBe('2026-07-31');
  });
  it('returns null for an id with no date in it', () => {
    expect(deriveMeetingDate('task_01KP')).toBeNull();
    expect(deriveMeetingDate('')).toBeNull();
  });
});

describe('slugifyTitle', () => {
  it('matches how a cal- id encodes a title', () => {
    // Real sample: the cal- id for "Nick/Adams Meeting" is `nickadams-meeting`,
    // i.e. the encoder drops the slash rather than splitting on it.
    expect(slugifyTitle('Nick/Adams Meeting')).toBe('nickadams-meeting');
    expect(slugifyTitleLoose('Nick/Adams Meeting')).toBe('nick-adams-meeting');
    expect(slugifyTitle('CLIF WG Weekly Meeting')).toBe('clif-wg-weekly-meeting');
    expect(slugifyTitle('  R01 meet follow up + Aim 3 ')).toBe('r01-meet-follow-up-aim-3');
  });
});

describe('deriveTitleSlug', () => {
  it('pulls the slug out of a cal- id', () => {
    expect(deriveTitleSlug('cal-20260731T1300-nickadams-meeting')).toBe('nickadams-meeting');
  });
  it('is null for id forms that carry no title', () => {
    expect(deriveTitleSlug('mtg_20260731T182205')).toBeNull();
    expect(deriveTitleSlug('mtg-2026-07-31-acc249c0')).toBeNull();
  });
});

describe('resolveMeetingRef', () => {
  it('matches an exact canonical id', () => {
    expect(resolveMeetingRef('mtg-2026-07-24-ef23d426', MEETINGS)?.title).toBe('R01 meet follow up + Aim 3');
  });

  it('resolves a calendar id by date + title slug — the meeting_extraction case', () => {
    // This is the real 2026-07-31 task cluster that rendered no badge at all.
    expect(resolveMeetingRef('cal-20260731T1300-nickadams-meeting', MEETINGS)?.id)
      .toBe('mtg-2026-07-31-acc249c0');
  });

  it('resolves a PB approval id when that day has exactly one meeting', () => {
    expect(resolveMeetingRef('mtg_20260731T182205', MEETINGS)?.id).toBe('mtg-2026-07-31-acc249c0');
  });

  it('REFUSES to guess when the day is ambiguous and there is no title signal', () => {
    // 2026-07-30 has two meetings and mtg_ ids carry no title — a coin flip here
    // would send Nick to the wrong meeting, which is worse than no link.
    expect(resolveMeetingRef('mtg_20260730T150130', MEETINGS)).toBeNull();
  });

  it('picks the right one on an ambiguous day WHEN the title slug disambiguates', () => {
    expect(resolveMeetingRef('cal-20260730T0900-clif-wg-weekly-meeting', MEETINGS)?.id)
      .toBe('mtg-2026-07-30-41d7f91f');
    expect(resolveMeetingRef('cal-20260730T1100-pulmonary-hsr-group-meeting', MEETINGS)?.id)
      .toBe('mtg-2026-07-30-3332759d');
  });

  it('resolves a TRUNCATED title slug by unique prefix', () => {
    // cal- ids cap the embedded slug (~24 chars), so a long title never matches
    // exactly. Real prod values: "Pulmonary HSR Group Meeting" is carried as
    // `pulmonary-hsr-group-meet`, "LHS Ambulatory Discovery - SME Discussion" as
    // `lhs-ambulatory-discovery`. These accounted for 19 of the unresolved tasks.
    expect(resolveMeetingRef('cal-20260730T1200-pulmonary-hsr-group-meet', MEETINGS)?.id)
      .toBe('mtg-2026-07-30-3332759d');
  });

  it('does not let a stubby prefix match half the calendar', () => {
    expect(resolveMeetingRef('cal-20260730T1200-clif', MEETINGS)).toBeNull();
  });

  it('refuses a prefix that fits more than one meeting that day', () => {
    const dupes = [
      { id: 'a', title: 'Weekly Sync Alpha', date: '2026-07-30' },
      { id: 'b', title: 'Weekly Sync Beta', date: '2026-07-30' },
    ];
    expect(resolveMeetingRef('cal-20260730T0900-weekly-sync', dupes)).toBeNull();
  });

  it('returns null for a day with no meeting, an undated id, or no id', () => {
    expect(resolveMeetingRef('cal-20250101T1300-whatever', MEETINGS)).toBeNull();
    expect(resolveMeetingRef('garbage', MEETINGS)).toBeNull();
    expect(resolveMeetingRef(null, MEETINGS)).toBeNull();
  });
});
