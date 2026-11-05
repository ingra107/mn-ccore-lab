import { describe, expect, it } from 'vitest'
import { journalDisplayName } from '../journalName'
import { generatedPublications } from '../../data/publications.generated'

// The 18 names Nick saw change on the mock card, 2026-11-05.
const CARD: [string, string][] = [
  ['AMERICAN JOURNAL OF GASTROENTEROLOGY', 'American Journal of Gastroenterology'],
  ['AMERICAN JOURNAL OF RESPIRATORY AND CRITICAL CARE MEDICINE', 'American Journal of Respiratory and Critical Care Medicine'],
  ['American Society of Clinical Oncology educational book. American Society of Clinical Oncology. Meeting', 'American Society of Clinical Oncology Educational Book. American Society of Clinical Oncology. Meeting'],
  ['American family physician', 'American Family Physician'],
  ['American journal of respiratory and critical care medicine', 'American Journal of Respiratory and Critical Care Medicine'],
  ['Critical care medicine', 'Critical Care Medicine'],
  ['JOURNAL OF GENERAL INTERNAL MEDICINE', 'Journal of General Internal Medicine'],
  ['JOURNAL OF INTENSIVE CARE MEDICINE', 'Journal of Intensive Care Medicine'],
  ['JOURNAL OF PALLIATIVE MEDICINE', 'Journal of Palliative Medicine'],
  ['Journal of health care for the poor and underserved', 'Journal of Health Care for the Poor and Underserved'],
  ['Journal of signal transduction', 'Journal of Signal Transduction'],
  ['Journal of surgical education', 'Journal of Surgical Education'],
  ['PALLIATIVE MEDICINE', 'Palliative Medicine'],
  ['PEDIATRICS', 'Pediatrics'],
  ['Primary care diabetes', 'Primary Care Diabetes'],
  ['Respiratory care', 'Respiratory Care'],
  ['THERAPEUTIC ADVANCES IN RESPIRATORY DISEASE', 'Therapeutic Advances in Respiratory Disease'],
  ['Tobacco control', 'Tobacco Control'],
]

describe('journalDisplayName', () => {
  it.each(CARD)('%s', (raw, want) => expect(journalDisplayName(raw)).toBe(want))

  it.each([
    'JAMA Network Open', 'JAMA', 'CHEST Journal', 'CHEST', 'AIDS', 'HPB', 'BMC Pulmonary Medicine',
    'PLoS ONE', 'PLOS ONE', 'PLoS One', 'Alzheimer s & Dementia', 'The Lancet',
    // Real names a word-by-word rule wrecked on the live data: acronyms in a mixed name.
    'ATS Scholar', 'CA A Cancer Journal for Clinicians', 'ERJ Open Research', 'JCI Insight', 'The FASEB Journal',
    'IEEE/ACM Transactions on Computational Biology and Bioinformatics',
    'Research Square (preprint)', 'MEDINFO 2023 - The Future is Accessible',
    'Proceedings - 21st IEEE International Conference on Machine Learning and Applications, ICMLA 2022',
    'npj Digital Medicine', 'mBio', 'eLife',
  ])('leaves %s as it is', (name) => expect(journalDisplayName(name)).toBe(name))

  // Review, 2026-11-05: one word in capitals is usually an acronym we have not listed.
  it.each(['JAMIA', 'MMWR', 'AJRCCM', 'NPJ', 'AACN', 'NEJM'])('leaves the one-word name %s as it is', (name) => {
    expect(journalDisplayName(name)).toBe(name)
  })

  it('still fixes the one plain word on the card, and a no-vowel word stays in a long name', () => {
    expect(journalDisplayName('PEDIATRICS')).toBe('Pediatrics')
    expect(journalDisplayName('NPJ DIGITAL MEDICINE')).toBe('NPJ Digital Medicine')
  })

  it('prints nothing for no journal', () => {
    expect(journalDisplayName(null)).toBe('')
    expect(journalDisplayName(undefined)).toBe('')
    expect(journalDisplayName('')).toBe('')
  })

  it('leaves every keep-list name in the bundled papers in capitals', () => {
    for (const p of generatedPublications) {
      const out = journalDisplayName(p.journal)
      for (const w of ['JAMA', 'CHEST', 'AIDS', 'HPB', 'BMC']) {
        if (new RegExp(`\\b${w}\\b`).test(p.journal ?? '')) expect(out).toMatch(new RegExp(`\\b${w}\\b`))
      }
    }
  })
})
