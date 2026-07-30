import type { Director, TeamMember } from './types'
import { emailToSlug } from '../lib/emailSlug'

export const directors: Director[] = [
  {
    name: 'Nick Ingraham',
    credentials: 'MD',
    title: 'Assistant Professor, Pulmonary & Critical Care Medicine',
    role: 'Co-Director, MN-CCORE',
    initials: 'NI',
    slug: 'nick-ingraham',
    path: '/nick-ingraham',
    bio: 'Physician-scientist focused on provider variation, lung-protective ventilation, and clinical decision-making in the ICU. Founding member of the CLIF Consortium.',
    photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-06/Nick%20Picture_2022.jpg?itok=VEDKgpUN',
    scholarId: 'ZKMVVHkAAAAJ', // Scholar stats (2026-03-24): citations 2626, h-index 24, i10-index 39
    orcidId: '0000-0002-0292-0594', // #357 — ORCID primary source for publications
    authorName: 'Ingraham NE', // #906 — was matched only via authorSlugs, which a co-authored paper can miss (see mergePublications dedup-skip note)
  },
  {
    name: 'Nathan Mesfin',
    credentials: 'MD',
    title: 'Assistant Professor, Critical Care Medicine',
    role: 'Co-Director, MN-CCORE',
    initials: 'NM',
    slug: 'nate-mesfin',
    orcidId: '0000-0001-8419-0339', // #905 OpenAlex backfill (Nathan Mesfin, UMN+MPLS VA)
    path: '/nate-mesfin',
    bio: 'Critical care physician investigating in-hospital cardiac arrest survivability, DNR order variation, and chronic critical illness outcomes.',
    photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/images/dom-faculty-_0135_layer-164_0.png?itok=YWiCOKFA',
    authorName: 'Mesfin N', // #906 — see Nick's authorName note above
  },
]

export const seniorMentors: TeamMember[] = [
  {
    name: 'Adams Dudley',
    initials: 'AD',
    role: 'Senior Mentor',
    credentials: 'MD, MBA',
    slug: 'adams-dudley',
    orcidId: '0000-0002-8532-8552', // #905 OpenAlex backfill (R. Adams Dudley, MPLS VA)
    authorName: 'Dudley RA',
    bio: 'Professor of Medicine specializing in health services research, quality measurement, and healthcare policy. Senior mentor to MN-CCORE investigators.',
    photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/images/r._adams_dudley_0.png?itok=BykmoC6t',
    scholarId: 'Aoq0YhcAAAAJ', // Scholar stats (2026-03-24): citations 15734, h-index 63, i10-index 170
    links: [{ label: 'Scholar', href: 'https://scholar.google.com/citations?user=Aoq0YhcAAAAJ&hl=en' }],
  },
  {
    name: 'Jeff Chipman',
    initials: 'JC',
    role: 'Senior Mentor & Surgical Critical Care',
    credentials: 'MD',
    slug: 'jeff-chipman',
    orcidId: '0000-0002-0759-3705', // #905 OpenAlex backfill (Jeffrey G. Chipman, UMN)
    authorName: 'Chipman JG',
    bio: 'Professor of Surgery and surgical critical care physician. Co-investigator on multiple MNCCORE studies involving provider variation and ventilator management.',
    photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-08/Copy%20of%20UMN-8471.jpg?itok=UqPdFLCU',
  },
]

// Order = activity level in MNCCORE (most active first). Keep updated.
export const facultyCollaborators: TeamMember[] = [
  { name: 'Kendall McEachron', initials: 'KM', role: 'Faculty Collaborator', slug: 'kendall-mceachron', orcidId: '0000-0003-0225-9318', authorName: 'McEachron K', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/images/u_of_m_2023_resident_graduation_6-27-23_0107-edit.jpeg?itok=3fV81qKA' },
  { name: 'Sami Safadi', initials: 'SS', role: 'Faculty Collaborator', slug: 'sami-safadi', orcidId: '0000-0001-7544-3955', authorName: 'Safadi S', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-01/DOM-Faculty-_0076_Layer-223.png' },
  { name: 'Abbie Begnaud', initials: 'AB', role: 'Faculty', credentials: 'MD', slug: 'abbie-begnaud', orcidId: '0000-0001-5634-1638', authorName: 'Begnaud A', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-01/begnaud-abbie.png?itok=gSTF7AGX' },
  { name: 'Ben Henkle', initials: 'BH', role: 'Faculty', credentials: 'MD, MPH', slug: 'benjamin-henkle', openalexId: 'A5079068603', authorName: 'Henkle BE', photoUrl: 'https://www.va.gov/MINNEAPOLISRESEARCH/images/staff/benjaminhenkle.jpg' },
  { name: 'Dave MacDonald', initials: 'DM', role: 'Faculty', credentials: 'MD, MS', slug: 'dave-macdonald', openalexId: 'A5077559572', authorName: 'MacDonald DM', scholarId: 'EZt8qpMAAAAJ', /* Scholar stats (2026-03-24): citations 257, h-index 11, i10-index 11 */ links: [{ label: 'Scholar', href: 'https://scholar.google.com/citations?user=EZt8qpMAAAAJ&hl=en' }] },
  { name: 'Josh Trujeque', initials: 'JT', role: 'Faculty', credentials: 'MD', slug: 'josh-trujeque', openalexId: 'A5034840241|A5114603214|A5137261821|A5092984366|A5033963638', authorName: 'Trujeque J', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/images/picture9.png' },
  { name: 'Katie Pendleton', initials: 'KP', role: 'Faculty', credentials: 'MD', slug: 'katie-pendleton', orcidId: '0000-0003-3248-5738', authorName: 'Pendleton KM', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-01/DOM-Faculty-_0112_Layer-187.png?itok=1xJq3yYt' },
  { name: 'Michael Kalinoski', initials: 'MK', role: 'Faculty', credentials: 'MD', slug: 'michael-kalinoski', orcidId: '0009-0007-6281-0630', authorName: 'Kalinoski M' },
  { name: 'Dave Wacker', initials: 'DW', role: 'Faculty', credentials: 'MD', slug: 'dave-wacker', orcidId: '0000-0002-1504-7819', openalexId: 'A5025128079', authorName: 'Wacker DA', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-01/DOM-Faculty-_0028_Layer-271.png?itok=skFv-xW5' },
]

// Order = activity level in MNCCORE (most active first). Keep updated.
export const researchTeam: TeamMember[] = [
  // NO openalexId on purpose. The #905 candidate A5081788404 was checked on 2026-07-30
  // and REFUSED: the record is CONFLATED, not merely thin. Its 10 works mix clinical
  // research (metformin/COVID recovery, diabetes shared decision-making, a Spanish PRO
  // validation) with "Flight Simulator Training" (2017) and "Politics, Personality, and
  // Poor Decision-Making" (2018), under an "Institute of Accelerating Systems and
  // Applications" affiliation. Wiring it would publish another person's papers on the
  // public site under his name -- the exact failure #905's design exists to prevent.
  // A works_count with no institution is not evidence of a thin record; read the works.
  { name: 'Steven Arriaza', initials: 'SA', role: 'Research Coordinator', slug: 'steven-arriaza' },
  // openalexId corroborated 2026-07-30 on two independent axes before it went public:
  // the record's only affiliation is Minneapolis VA Health Care System, and its one
  // work is "Comparison of six natural language processing approaches to assessing
  // firearm access" (2024) -- right institution, and squarely in the lab's own
  // firearm-access line. Backlog #905.
  { name: 'Emma Bromley', initials: 'EB', role: 'Research Coordinator', slug: 'emma-bromley', openalexId: 'A5114603216', authorName: 'Bromley E' },
  { name: 'Casey Eddington', initials: 'CE', role: 'Data Analyst', slug: 'casey-eddington', openalexId: 'A5048819960', authorName: 'Eddington C' },
  { name: 'Dan Shyu', initials: 'DS', role: 'Critical Care Fellow', credentials: 'MD', slug: 'dan-shyu', openalexId: 'A5111762982', authorName: 'Shyu D', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/images/shyu-daniel.png' },
  { name: 'Beret Fitzgerald', initials: 'BF', role: 'Critical Care Fellow', credentials: 'MD', slug: 'beret-fitzgerald', authorName: 'Fitzgerald B', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/images/fitzgerald-beret-001.png' },
  { name: 'Claire Collins', initials: 'CC', role: 'Medical Student Researcher', slug: 'claire-collins', authorName: 'Collins C' },
]

// Helper: get all team members as a flat array.
// Includes directors (Nick, Nate, Dudley, Chipman) normalized into the
// TeamMember shape — without this, `getMemberBySlug('nick-ingraham')` returns
// undefined and `/team/nick` redirects to `/team` (the PI literally
// can't view his own profile page). Audit caught this 2026-04-19.
export function getAllMembers(): TeamMember[] {
  const directorMembers: TeamMember[] = directors.map((d) => ({
    name: d.name,
    initials: d.initials,
    role: d.role,
    credentials: d.credentials,
    slug: d.slug,
    photoUrl: d.photoUrl,
    bio: d.bio,
    scholarId: d.scholarId,
    authorName: d.authorName,
  }))
  return [...directorMembers, ...seniorMentors, ...facultyCollaborators, ...researchTeam]
}

// Helper: find team member by slug (directors included).
export function getMemberBySlug(slug: string): TeamMember | undefined {
  return getAllMembers().find((m) => m.slug === slug)
}

// Shared person lookup — used across MeetingDetail, ProjectDetail, MeetingCard, etc.
export function getPersonInfo(slug: string): { name: string; initials: string; photoUrl: string | undefined } {
  if (!slug) return { name: 'Unknown', initials: '??', photoUrl: undefined }
  // Hermes — AI research assistant
  if (slug === 'claude-ai') {
    return { name: 'Hermes', initials: 'AI', photoUrl: undefined }
  }
  const director = directors.find((d) => d.slug === slug)
  if (director) return { name: director.name, initials: director.initials, photoUrl: director.photoUrl }
  const member = getMemberBySlug(slug)
  if (member) return { name: member.name, initials: member.initials, photoUrl: member.photoUrl }
  // Handle email addresses (from D1 auth) — try LUT-mapped slug first so
  // `ingra107@umn.edu` finds the member row for `nick-ingraham`.
  if (slug.includes('@')) {
    const mapped = emailToSlug(slug)
    if (mapped !== slug) {
      const director2 = directors.find((d) => d.slug === mapped)
      if (director2) return { name: director2.name, initials: director2.initials, photoUrl: director2.photoUrl }
      const member2 = getMemberBySlug(mapped)
      if (member2) return { name: member2.name, initials: member2.initials, photoUrl: member2.photoUrl }
    }
    const name = slug.split('@')[0]
    return { name, initials: name.slice(0, 2).toUpperCase(), photoUrl: undefined }
  }
  return { name: slug, initials: slug.slice(0, 2).toUpperCase(), photoUrl: undefined }
}
