import { describe, it, expect } from 'vitest'
import {
  buildTitleIndex,
  bylineNameMatchesMember,
  excludedPublication,
  isAcceptableWork,
  parseName,
  parsePubmedAuthors,
  publicationExclusions,
} from '../publicationFilter'

// Every example is a real row from the 2026-10-13 prod publications audit
// (PB Scratch/publications-integrity-2026-10-13.csv); the byline facts are the
// OpenAlex single-work records read that night.
const DUDLEY = ['Adams Dudley', 'Dudley RA', 'R. Adams Dudley']
const SAFADI = ['Sami Safadi', 'Safadi S', 'Sami Safadi']
const NICK = ['Nick Ingraham', 'Ingraham NE', 'Nicholas E. Ingraham']

describe('isAcceptableWork rejects the audit classes', () => {
  it('a raw byline name that is a different person (Ryan Dudley on KARDIA-2, gen-10-1001-jama-2025-6681)', () => {
    const v = isAcceptableWork(
      {
        title: 'Add-On Treatment With Zilebesiran for Inadequately Controlled Hypertension: The KARDIA-2 Randomized Clinical Trial',
        doi: 'https://doi.org/10.1001/jama.2025.6681',
        type: 'article',
        byline: { count: 2438, memberIndex: 590, rawName: 'Ryan Dudley', claimed: false },
      },
      DUDLEY,
    )
    expect(v).toMatchObject({ ok: false, reason: 'name-conflict' })
  })

  it('an initial that fits but a 1,295-name commission byline (gen-10-1093-bjs-znab307)', () => {
    const v = isAcceptableWork(
      {
        title: 'BJS commission on surgery and perioperative care post-COVID-19',
        doi: 'https://doi.org/10.1093/bjs/znab307',
        type: 'article',
        byline: { count: 1295, memberIndex: 345, rawName: 'R Dudley', claimed: false },
      },
      DUDLEY,
    )
    expect(v).toMatchObject({ ok: false, reason: 'consortium-byline' })
  })

  it('a consortium list of 353 with the member at 247 (KPMP, gen-10-1038-s41467-023-44467-6)', () => {
    const v = isAcceptableWork(
      {
        title: 'The chromatin landscape of healthy and injured cell types in the human kidney',
        doi: 'https://doi.org/10.1038/s41467-023-44467-6',
        byline: { count: 353, memberIndex: 246, rawName: 'Sami Safadi', claimed: true },
      },
      SAFADI,
    )
    expect(v).toMatchObject({ ok: false, reason: 'consortium-byline' })
  })

  it('a 10.17615 university-repository copy (gen-10-17615-kcfx-6s16)', () => {
    const v = isAcceptableWork(
      { title: 'mTOR inhibition in COVID‐19: A commentary and review of efficacy in RNA viruses', doi: 'https://doi.org/10.17615/kcfx-6s16', sourceName: 'UNC Libraries' },
      NICK,
    )
    expect(v).toMatchObject({ ok: false, reason: 'repository-doi' })
  })

  it('a referee report (gen-10-21956-hrbopenres-15091-r39808), by type and by title', () => {
    const title = 'Referee report. For: Co-designing a recruitment strategy for lung cancer screening in high risk populations'
    expect(isAcceptableWork({ title, type: 'peer-review' }, [])).toMatchObject({ ok: false, reason: 'non-paper-type' })
    expect(isAcceptableWork({ title }, [])).toMatchObject({ ok: false, reason: 'non-paper-title' })
  })

  it('a whole abstract book (gen-adams-dudley-2020-northeastern-section-of-the-aua)', () => {
    const v = isAcceptableWork({ title: 'Northeastern Section of the AUA 72nd Annual Meeting Abstracts', type: 'article' }, DUDLEY)
    expect(v).toMatchObject({ ok: false, reason: 'non-paper-title' })
  })

  it('paratext is refused; a stand-alone conference abstract is not (gen-10-1200-jco-2026-44-16-suppl-e23148 is VERIFIED)', () => {
    expect(isAcceptableWork({ title: 'Front matter', type: 'paratext' }, [])).toMatchObject({ reason: 'non-paper-type' })
    expect(isAcceptableWork({ title: 'A JCO supplement abstract', type: 'conference-abstract' }, []).ok).toBe(true)
  })

  it('a 406-name abstract session with the member mid-list, PubMed silent (gen-10-1093-ndt-gft107)', () => {
    const v = isAcceptableWork(
      { title: 'AKI - experimental models', byline: { count: 406, memberIndex: 200, rawName: 'D. Wacker', claimed: false, pubmedNames: [] } },
      ['Dave Wacker', 'Wacker DA', 'David A. Wacker'],
    )
    expect(v).toMatchObject({ ok: false, reason: 'consortium-byline' })
  })

  it('a medRxiv preprint whose published title differs only by plural and acronym (gen-10-1101-2023-01-19-23284796)', () => {
    const titles = buildTitleIndex([
      {
        title: 'Prediction of In-Hospital Mortality Among Intensive Care Unit Patients Using Modified Daily Laboratory-Based Acute Physiology Score, Version 2',
        doi: 'https://doi.org/10.1097/MLR.0000000000001878',
        pubmed: 'https://pubmed.ncbi.nlm.nih.gov/37308947/',
      },
    ])
    const v = isAcceptableWork(
      {
        title: 'Prediction of in-hospital mortality among intensive care unit patients using modified daily Laboratory-based Acute Physiology Scores, version 2 (LAPS2)',
        doi: 'https://doi.org/10.1101/2023.01.19.23284796',
      },
      [],
      titles,
    )
    expect(v).toMatchObject({ ok: false, reason: 'preprint-shadowed' })
  })

  it.each([
    'Figure C12, Scenario 3: Hypothetical World and Evaluation Function',
    '[Table], Table 15. Scenario 1, year 1: Sensitivity and specificity calculations',
    'Figure 3. Model of the evaluation',
    'Acronyms and Abbreviations',
    '[Table, Acronyms and Abbreviations].',
  ])('a report figure or table catalogued as a work: %s', (title) => {
    expect(isAcceptableWork({ title }, DUDLEY)).toMatchObject({ ok: false, reason: 'non-paper-title' })
  })

  it('a real title that merely mentions a figure or table is kept', () => {
    expect(isAcceptableWork({ title: 'Figure skating injuries in adolescents' }, []).ok).toBe(true)
    expect(isAcceptableWork({ title: 'Table-top exercises for ICU surge planning' }, []).ok).toBe(true)
  })

  it('the "Results for Literature Search" placeholder (gen-10-1212-01-wnl-0000086808-56096-da)', () => {
    expect(isAcceptableWork({ title: 'Results for Literature Search' }, [])).toMatchObject({ reason: 'non-paper-title' })
  })

  it('a medRxiv preprint whose published paper is listed (gen-10-1101-2025-09-05-25334955 vs olson-2026-pccm-job-offers)', () => {
    const titles = buildTitleIndex([
      {
        title: 'Variability in First Academic Medicine Job Offers in Pulmonary and Critical Care Medicine',
        doi: 'https://doi.org/10.1093/atsscholar/aapag010',
        pubmed: 'https://pubmed.ncbi.nlm.nih.gov/41734005/',
      },
    ])
    const v = isAcceptableWork(
      { title: 'Variability in First Academic Medicine Job Offers in Pulmonary and Critical Care Medicine', doi: 'https://doi.org/10.1101/2025.09.05.25334955' },
      [],
      titles,
    )
    expect(v).toMatchObject({ ok: false, reason: 'preprint-shadowed' })
  })

  it('a meeting abstract whose full paper is listed under another year (gen-10-1016-j-jamcollsurg-2008-06-234)', () => {
    const titles = buildTitleIndex([
      {
        title: 'A Novel Critical Skills Curriculum for Surgical Interns Incorporating Simulation Training Improves Readiness for Acute Inpatient Care',
        doi: 'https://doi.org/10.1016/j.jsurg.2009.09.002',
        pubmed: 'https://pubmed.ncbi.nlm.nih.gov/20005496/',
      },
    ])
    const v = isAcceptableWork(
      {
        title: 'A novel “critical skills” curriculum for surgical interns incorporating simulation training improves readiness for acute inpatient care',
        doi: 'https://doi.org/10.1016/j.jamcollsurg.2008.06.234',
      },
      [],
      titles,
    )
    expect(v).toMatchObject({ ok: false, reason: 'abstract-shadowed' })
  })
})

describe('isAcceptableWork keeps real papers', () => {
  it('a lab paper with the member mid-byline (lyons-2026-federation-paradigm)', () => {
    const v = isAcceptableWork(
      {
        title: 'Federation, Not Centralization: A New Paradigm for EHR-Based Critical Care Research',
        doi: 'https://doi.org/10.1093/annalsats/aaoaf067',
        pubmed: 'https://pubmed.ncbi.nlm.nih.gov/41915560/',
        type: 'article',
        byline: { count: 15, memberIndex: 13, rawName: 'Nicholas E Ingraham', claimed: false },
      },
      NICK,
    )
    expect(v).toEqual({ ok: true })
  })

  it('a long byline when the member leads or closes it', () => {
    const base = { title: 'A large trial', doi: 'https://doi.org/10.1/x' }
    expect(isAcceptableWork({ ...base, byline: { count: 400, memberIndex: 0, rawName: 'R. Adams Dudley', claimed: false } }, DUDLEY).ok).toBe(true)
    expect(isAcceptableWork({ ...base, byline: { count: 400, memberIndex: 397, rawName: 'R. Adams Dudley', claimed: false } }, DUDLEY).ok).toBe(true)
    expect(isAcceptableWork({ ...base, byline: { count: 400, memberIndex: 3, rawName: 'R. Adams Dudley', claimed: false } }, DUDLEY).ok).toBe(false)
  })

  it('a long byline when PubMed names the member as an author', () => {
    const v = isAcceptableWork(
      {
        title: 'A big trial',
        doi: 'https://doi.org/10.1/z',
        byline: { count: 150, memberIndex: 60, rawName: 'Nicholas E Ingraham', claimed: false, pubmedNames: ['Carolyn T Bramante', 'Nicholas E Ingraham'] },
      },
      NICK,
    )
    expect(v.ok).toBe(true)
  })

  it('a work the member claimed in ORCID passes a byline name that does not parse as theirs', () => {
    const v = isAcceptableWork(
      { title: 'Some paper', doi: 'https://doi.org/10.1/y', byline: { count: 8, memberIndex: 2, rawName: 'Dudley, Richard', claimed: true } },
      DUDLEY,
    )
    expect(v.ok).toBe(true)
  })

  it('a preprint with no published twin, and a published paper with its own preprint in the index', () => {
    const titles = buildTitleIndex([
      { title: 'Prediction of mortality', doi: 'https://doi.org/10.1101/2023.01.19.23284796' },
      { title: 'Prediction of mortality', doi: 'https://doi.org/10.1097/MLR.0000000000001878', pubmed: '37308947' },
    ])
    expect(isAcceptableWork({ title: 'Unpublished idea', doi: 'https://doi.org/10.1101/2024.01.01.1' }, [], titles).ok).toBe(true)
    expect(
      isAcceptableWork({ title: 'Prediction of mortality', doi: 'https://doi.org/10.1097/MLR.0000000000001878', pubmed: '37308947' }, [], titles).ok,
    ).toBe(true)
  })
})

describe('bylineNameMatchesMember', () => {
  it.each([
    ['R Dudley', DUDLEY, true],
    ['R. Adams Dudley', DUDLEY, true],
    ['Dudley, R Adams', DUDLEY, true],
    ['Ryan Dudley', DUDLEY, false],
    ['Clare MacDonald', ['Dave MacDonald', 'MacDonald DM'], false],
    ['David A. Wacker', ['Dave Wacker', 'Wacker DA'], true],
    ['Jeffery G. Chipman', ['Jeff Chipman', 'Chipman JG', 'Jeffrey G. Chipman'], true],
    ['A. Begnaud', ['Abbie Begnaud', 'Begnaud A'], true],
    ['ABBIE BEGNAUD', ['Abbie Begnaud', 'Begnaud A'], true],
    ['Nate Mesfin', ['Nathan Mesfin', 'Mesfin N'], true],
    ['John Smith', NICK, false],
  ])('%s', (raw, names, expected) => {
    expect(bylineNameMatchesMember(raw, names)).toBe(expected)
  })

  it('reads the PubMed "Surname INITIALS" form', () => {
    expect(parseName('Dudley RA')).toMatchObject({ surnames: ['dudley'], initials: ['r', 'a'], words: [] })
  })
})

describe('parsePubmedAuthors', () => {
  it('reads the AuthorList persons and skips the group name and the InvestigatorList', () => {
    const xml = `<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID Version="1">40434761</PMID>
      <Article><AuthorList CompleteYN="Y">
        <Author ValidYN="Y"><LastName>Desai</LastName><ForeName>Akshay S</ForeName><Initials>AS</Initials></Author>
        <Author ValidYN="Y"><CollectiveName>KARDIA-2 Study Group</CollectiveName></Author>
      </AuthorList></Article>
      <InvestigatorList><Investigator ValidYN="Y"><LastName>Dudley</LastName><ForeName>Ryan</ForeName></Investigator></InvestigatorList>
      </MedlineCitation></PubmedArticle>
      <PubmedArticle><MedlineCitation><PMID Version="1">23174012</PMID><Article><AuthorList>
        <Author ValidYN="Y"><LastName>Dudley</LastName><ForeName>Raymond A</ForeName><Initials>RA</Initials></Author>
      </AuthorList></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>`
    const m = parsePubmedAuthors(xml)
    expect(m.get('40434761')).toEqual(['Akshay S Desai'])
    expect(m.get('23174012')).toEqual(['Raymond A Dudley'])
  })
})

describe('publication exclusions', () => {
  it('holds the audit DELETE set and matches by id and DOI', () => {
    expect(publicationExclusions.length).toBeGreaterThanOrEqual(17)
    expect(excludedPublication({ id: 'ingraham-2024-immunomod-update' })).toBe(true)
    expect(excludedPublication({ id: 'gen-something-else', doi: 'https://doi.org/10.1001/JAMA.2025.6681' })).toBe(true)
  })

  it('never catches the row kept beside an excluded hand-entered copy (88bbf111 vs ingraham-2024-ehr-primary-provider)', () => {
    expect(excludedPublication({ id: '88bbf111' })).toBe(true)
    expect(excludedPublication({ id: 'ingraham-2024-ehr-primary-provider', doi: 'https://doi.org/10.1097/CCE.0000000000001189' })).toBe(false)
  })
})
