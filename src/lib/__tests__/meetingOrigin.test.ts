import { describe, it, expect } from 'vitest';
import { isFromMeeting, meetingTitleFor, meetingHrefFor, meetingLabelFor, MEETING_SOURCES } from '../meetingOrigin';

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
  it('links to the RESOLVED canonical id', () => {
    expect(
      meetingHrefFor({
        meeting_id: 'cal-20260731T1300-nickadams-meeting',
        meeting_ref: 'mtg-2026-07-31-acc249c0',
        meeting_title: 'Nick/Adams Meeting',
      }),
    ).toBe('/portal/meetings/mtg-2026-07-31-acc249c0');
  });

  it('NEVER falls back to the raw meeting_id — the dead-link trap (#108)', () => {
    // These are real prod values from tasks; none exists in `meetings`, so
    // linking them would 404. Only meeting_ref is a safe target, and the server
    // sets it only when it actually identified the meeting.
    expect(meetingHrefFor({ meeting_id: 'cal-20260731T1300-nickadams-meeting' })).toBeNull();
    expect(meetingHrefFor({ meeting_id: 'mtg_20260731T182205', meeting_title: 'Something' })).toBeNull();
  });

  it('does not link a task with no meeting at all', () => {
    expect(meetingHrefFor({ meeting_title: 'Stray title', meeting_id: null })).toBeNull();
    expect(meetingHrefFor({ meeting_ref: '  ' })).toBeNull();
  });
});

describe('meetingLabelFor', () => {
  it('reads "<name> · <date>" when both are known', () => {
    expect(meetingLabelFor({ meeting_title: 'Nick/Adams Meeting', meeting_date: '2026-07-31' }))
      .toBe('Nick/Adams Meeting · Jul 31');
  });

  it('parses the date from PARTS, never as UTC', () => {
    // new Date('2026-07-31') is UTC midnight = Jul 30 evening in Central time.
    expect(meetingLabelFor({ meeting_title: 'M', meeting_date: '2026-01-01' })).toBe('M · Jan 1');
  });

  it('falls back to the name alone, then to the bare phrase', () => {
    expect(meetingLabelFor({ meeting_title: 'Lab Sync' })).toBe('Lab Sync');
    expect(meetingLabelFor({ meeting_id: 'mtg_20260731T182205' })).toBe('From a meeting');
  });
});
