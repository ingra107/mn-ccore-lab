import { describe, it, expect } from 'vitest';
import { isFromMeeting, meetingTitleFor, meetingHrefFor, MEETING_SOURCES } from '../meetingOrigin';

describe('isFromMeeting', () => {
  it('recognises every source the live pipeline writes (#108)', () => {
    // The old TaskCard gate checked source === 'meeting' only, which is why
    // nothing rendered for tasks the current pipeline creates.
    for (const source of ['meeting', 'meeting_extraction', 'meeting_approval']) {
      expect(isFromMeeting({ source })).toBe(true);
    }
    expect(MEETING_SOURCES.has('meeting_extraction')).toBe(true);
  });

  it('recognises meeting origin from meeting_id alone, with no title and no source', () => {
    // The whole point: origin must NOT depend on the join that fails 144/152 times.
    expect(isFromMeeting({ meeting_id: 'cal-20260731T1300-nickadams-meeting' })).toBe(true);
    expect(isFromMeeting({ meeting_id: 'mtg_20260731T182205', meeting_title: null })).toBe(true);
  });

  it('is false for ordinary tasks', () => {
    expect(isFromMeeting({})).toBe(false);
    expect(isFromMeeting({ source: 'pb' })).toBe(false);
    expect(isFromMeeting({ source: 'email', meeting_id: null })).toBe(false);
  });
});

describe('meetingTitleFor', () => {
  it('keeps the head of a prefixed capture title', () => {
    expect(meetingTitleFor({ meeting_title: 'Meeting: CLIFathon 2026' })).toBe('Meeting');
    expect(meetingTitleFor({ meeting_title: 'R01 meet follow up + Aim 3' })).toBe('R01 meet follow up + Aim 3');
  });
  it('returns null when the join did not resolve', () => {
    expect(meetingTitleFor({ meeting_title: null })).toBeNull();
    expect(meetingTitleFor({ meeting_title: '   ' })).toBeNull();
    expect(meetingTitleFor({})).toBeNull();
  });
});

describe('meetingHrefFor', () => {
  it('links when the join resolved (a real meetings.id)', () => {
    expect(
      meetingHrefFor({ meeting_id: 'mtg-2026-07-24-ef23d426', meeting_title: 'R01 meet follow up + Aim 3' }),
    ).toBe('/portal/meetings/mtg-2026-07-24-ef23d426');
  });

  it('NEVER links a dangling meeting_id — the 144/152 case (#108)', () => {
    // These ids are real prod values from tasks; none exists in `meetings`.
    // Linking them would 404. A null title is the only signal we have that the
    // join failed, so it must gate the href.
    expect(meetingHrefFor({ meeting_id: 'cal-20260731T1300-nickadams-meeting', meeting_title: null })).toBeNull();
    expect(meetingHrefFor({ meeting_id: 'mtg_20260731T182205' })).toBeNull();
  });

  it('does not link a task with no meeting at all', () => {
    expect(meetingHrefFor({ meeting_title: 'Stray title', meeting_id: null })).toBeNull();
  });
});
