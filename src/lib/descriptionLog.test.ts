import { describe, it, expect } from 'vitest'
import { parseDescriptionLog } from './descriptionLog'

describe('parseDescriptionLog', () => {
  it('returns whole text as lead when there are no dated lines', () => {
    const r = parseDescriptionLog('CLIF project led by Vaishvik. GitHub: https://x')
    expect(r.lead).toBe('CLIF project led by Vaishvik. GitHub: https://x')
    expect(r.entries).toEqual([])
  })

  it('returns empty for empty/undefined input', () => {
    expect(parseDescriptionLog('')).toEqual({ lead: '', entries: [] })
    // @ts-expect-error exercising the null guard
    expect(parseDescriptionLog(undefined)).toEqual({ lead: '', entries: [] })
  })

  it('splits a leading summary from dated entries in source order', () => {
    const text = [
      'CLIF project led by Vaishvik.',
      '[2026-01-22] WG discussed provider table.',
      '[2026-02-13] Adams meeting well-received.',
    ].join('\n')
    const r = parseDescriptionLog(text)
    expect(r.lead).toBe('CLIF project led by Vaishvik.')
    expect(r.entries.map((e) => e.date)).toEqual(['2026-01-22', '2026-02-13'])
    expect(r.entries[0].text).toBe('[2026-01-22] WG discussed provider table.')
  })

  it('keeps continuation lines with the dated entry above them', () => {
    const text = [
      '[2026-01-15] HSR meeting reviewed feedback. Key decisions:',
      '- Expand sample to include fellows',
      '- Reframe hypothesis',
      '[2026-02-05] NIH revisions received.',
    ].join('\n')
    const r = parseDescriptionLog(text)
    expect(r.entries).toHaveLength(2)
    expect(r.entries[0].text).toBe(
      '[2026-01-15] HSR meeting reviewed feedback. Key decisions:\n- Expand sample to include fellows\n- Reframe hypothesis',
    )
    expect(r.entries[1].text).toBe('[2026-02-05] NIH revisions received.')
  })

  it('treats an undated [Jan 14]-style tag as lead, not a dated entry', () => {
    const text = [
      '[Jan 14] Summary statement received - ND outcome.',
      '[2026-01-15] HSR meeting reviewed R03 feedback.',
    ].join('\n')
    const r = parseDescriptionLog(text)
    expect(r.lead).toBe('[Jan 14] Summary statement received - ND outcome.')
    expect(r.entries.map((e) => e.date)).toEqual(['2026-01-15'])
  })

  it('handles a leading blank line (description that opens with \\n)', () => {
    const text = '\n[2026-01-15] something'
    const r = parseDescriptionLog(text)
    // leading blank-line collapses to empty lead; the dated entry is captured
    expect(r.lead).toBe('')
    expect(r.entries.map((e) => e.date)).toEqual(['2026-01-15'])
  })

  it('keeps multiple entries that share a date as separate entries', () => {
    const text = [
      '[2026-02-20] Email Casey re dataset location',
      '[2026-02-20] Casey/Nick meeting: save Parquet',
    ].join('\n')
    const r = parseDescriptionLog(text)
    expect(r.entries).toHaveLength(2)
    expect(r.entries.map((e) => e.date)).toEqual(['2026-02-20', '2026-02-20'])
  })

  it('reversal of entries yields newest-first while lead stays put (caller pattern)', () => {
    const text = [
      'Static summary.',
      '[2026-01-22] first',
      '[2026-02-13] second',
      '[2026-03-01] third',
    ].join('\n')
    const r = parseDescriptionLog(text)
    const newestFirst = [...r.entries].reverse().map((e) => e.date)
    expect(newestFirst).toEqual(['2026-03-01', '2026-02-13', '2026-01-22'])
    expect(r.lead).toBe('Static summary.')
  })
})
