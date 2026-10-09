// The lab-series classifier over every prod meeting title of 2026-10-09
// (PB Scratch/hub-d1-preimages/2026-10-09-v119/pre-meetings.json, 73 rows).
// Nick's three series are lab; every consult, 1:1 and other CLIF group stays
// private.

import { describe, it, expect } from 'vitest'
import { labSeriesKey, isLabSeriesTitle, initialAudience, isMeetingAudience, normalizeSeriesTitle } from '../../../shared/meetingAudience'

const PROD_TITLES = [
  'MN-CCORE: Sarah Kesler Consult', 'MN-CCORE: Steffan Okorafor Intro', 'MN-CCORE: Kaveri Chhikara Ats Oral Clif',
  'MN-CCORE: Mnccore Biweekly', 'MN-CCORE: Tignanelli Circle Origin', 'MN-CCORE: Dan Shyu Immunosep',
  'MN-CCORE: Mnccore Biweekly', 'MN-CCORE: Clif Wg Weekly', 'MN-CCORE: Julia Heneghan Data Infrastructure',
  'MN-CCORE: Clif Steering Committee', 'MN-CCORE: Mnccore Biweekly', 'MN-CCORE Biweekly Meeting -- April 07, 2026',
  'MNCCORE Biweekly Meeting -- April 21, 2026', 'MN-CCORE: Mnccore', 'MN-CCORE: Needs Review_0F30Fab8',
  'MN-CCORE: Needs Review_4F51E2E3', 'MN-CCORE: Ats 2026 People And Meetings', 'MN-CCORE: Needs Review_E84Eb93F',
  'MN-CCORE: Needs Review_16Dd1662', 'MN-CCORE: Needs Review_476693E1', 'MN-CCORE: Nick Adams Meeting',
  'MN-CCORE: Needs Review_3940349E', 'MNCCORE', 'Nick UMN Appt Schedule (60m slots) (Daniel Shyu)',
  'LPV paper discussion', 'ADHERE-LPV meeting', 'Proactive Readmissions - new SOW discussion',
  'Meeting -- William Parker, JC, CLIF Consortium', 'CLIF Grant Writing Workshop',
  'Nick UMN Appt Schedule (30m slots) (Patrick Lyons)', 'Pulmonary HSR Group Meeting', 'R01 meet follow up + Aim 3',
  'Pulmonary HSR Group Meeting', 'Nick Ingraham, AD Letter Check-In', 'LHS Ambulatory Discovery - SME Discussion',
  'CLIF WG Weekly Meeting', 'Nick/Adams Meeting', 'Weekly Meeting with Daniel/Nick', 'Dudley NLP Updates',
  'CLIF Grant Writing Workshop', 'Whitney health care', 'Nick Ingraham - TA with Dr. Khan', 'CLIF WG Weekly Meeting',
  'Pulmonary HSR Group Meeting', 'SME review process', 'MNCCORE', 'Nick UMN Appt Schedule (30m slots) (Casey Eddington)',
  'Dudley NLP Updates', 'MNCCORE', 'ADHERE-LPV meeting', 'CLIF WG Weekly Meeting',
  'Nick UMN Appt Schedule (30m slots) (Collin Knudsen)',
  'Cardiotoxicity Model: Determining best clinical thresholds for intervention', 'ADHERE-LPV meeting',
  'CLIF WG Weekly Meeting', '2nd CLIF Senior Advisory Meeting', 'MNCCORE', 'Pulmonary HSR Group Meeting',
  'ASCI Early-Career Award Feedback - Dr. Ingraham', 'Nick/Adams Meeting', 'R01',
  'Meeting -- Amanda C Trofholz, Molly Diethelm, Manmeet Kaur', 'Weekly Meeting with Daniel/Nick',
  'Pulmonary HSR Group Meeting', 'MNCCORE', 'TASK2460594', 'Pulmonary HSR Group Meeting', 'Weekly Meeting with Daniel/Nick',
  'COVID servers replacement', 'MNCCORE', 'CLIF Foundation — First Board of Directors Meeting',
  'Pulmonary HSR Group Meeting', 'LHS Ambulatory Discovery - SME Discussion',
]

describe('labSeriesKey over the 73 prod titles', () => {
  it('has the whole fixture', () => {
    expect(PROD_TITLES).toHaveLength(73)
  })

  it('marks 24 lab: 12 MNCCORE, 7 Pulmonary HSR, 5 CLIF WG', () => {
    const counts: Record<string, number> = {}
    for (const t of PROD_TITLES) {
      const k = labSeriesKey(t)
      if (k) counts[k] = (counts[k] ?? 0) + 1
    }
    expect(counts).toEqual({ mnccore: 12, 'pulm-hsr': 7, 'clif-wg': 5 })
  })

  it('keeps every consult, 1:1, review row and other CLIF group private', () => {
    for (const t of [
      'MN-CCORE: Sarah Kesler Consult', 'MN-CCORE: Clif Steering Committee', 'MN-CCORE: Needs Review_0F30Fab8',
      'MN-CCORE: Nick Adams Meeting', 'CLIF Grant Writing Workshop', '2nd CLIF Senior Advisory Meeting',
      'CLIF Foundation — First Board of Directors Meeting', 'Nick/Adams Meeting', 'Weekly Meeting with Daniel/Nick',
      'ASCI Early-Career Award Feedback - Dr. Ingraham', 'Nick Ingraham - TA with Dr. Khan', 'MN-CCORE: Ats 2026 People And Meetings',
      'Meeting -- William Parker, JC, CLIF Consortium',
    ]) {
      expect(labSeriesKey(t), t).toBeNull()
      expect(initialAudience(t), t).toBe('private')
    }
  })

  it('is anchored: a series name inside a longer title is not the series', () => {
    expect(labSeriesKey('MNCCORE prep with Casey')).toBeNull()
    expect(labSeriesKey('Before Pulmonary HSR Group Meeting')).toBeNull()
    expect(labSeriesKey('CLIF WG Weekly Meeting notes review')).toBeNull()
    expect(labSeriesKey('')).toBeNull()
    expect(labSeriesKey(null)).toBeNull()
  })

  it('reads case and punctuation variants of the series as the series', () => {
    expect(labSeriesKey('  mnccore  ')).toBe('mnccore')
    expect(labSeriesKey('MN-CCORE Biweekly')).toBe('mnccore')
    expect(labSeriesKey('mnccore biweekly meeting - October 6, 2026')).toBe('mnccore')
    expect(labSeriesKey('pulmonary hsr group meeting')).toBe('pulm-hsr')
    expect(labSeriesKey('CLIF WG weekly')).toBe('clif-wg')
    expect(isLabSeriesTitle('CLIF WG Weekly Meeting')).toBe(true)
    expect(initialAudience('MNCCORE')).toBe('lab')
    expect(normalizeSeriesTitle('MN-CCORE: Mnccore Biweekly')).toBe('mnccore mnccore biweekly')
  })

  it('knows its two audiences and nothing else', () => {
    expect(isMeetingAudience('lab')).toBe(true)
    expect(isMeetingAudience('private')).toBe(true)
    expect(isMeetingAudience('public')).toBe(false)
    expect(isMeetingAudience(undefined)).toBe(false)
  })
})
