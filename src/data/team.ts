import type { Director, TeamMember } from './types'

export const directors: Director[] = [
  {
    name: 'Nick Ingraham',
    credentials: 'MD',
    title: 'Assistant Professor, Pulmonary & Critical Care Medicine',
    role: 'Co-Director, MN-CCORE',
    initials: 'NI',
    slug: 'nick',
    path: '/nick',
    bio: 'Physician-scientist focused on provider variation, lung-protective ventilation, and clinical decision-making in the ICU. Founding member of the CLIF Consortium.',
    photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-06/Nick%20Picture_2022.jpg?itok=VEDKgpUN',
    scholarId: 'ZKMVVHkAAAAJ', // Scholar stats (2026-03-24): citations 2626, h-index 24, i10-index 39
  },
  {
    name: 'Nathan Mesfin',
    credentials: 'MD',
    title: 'Assistant Professor, Critical Care Medicine',
    role: 'Co-Director, MN-CCORE',
    initials: 'NM',
    slug: 'nate',
    path: '/nate',
    bio: 'Critical care physician investigating in-hospital cardiac arrest survivability, DNR order variation, and chronic critical illness outcomes.',
    photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/images/dom-faculty-_0135_layer-164_0.png?itok=YWiCOKFA',
  },
]

export const seniorMentors: TeamMember[] = [
  {
    name: 'Adams Dudley',
    initials: 'AD',
    role: 'Senior Mentor',
    credentials: 'MD, MBA',
    slug: 'dudley',
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
    slug: 'chipman',
    authorName: 'Chipman JG',
    bio: 'Professor of Surgery and surgical critical care physician. Co-investigator on multiple MNCCORE studies involving provider variation and ventilator management.',
    photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-08/Copy%20of%20UMN-8471.jpg?itok=UqPdFLCU',
  },
]

// Order = activity level in MNCCORE (most active first). Keep updated.
export const facultyCollaborators: TeamMember[] = [
  { name: 'Kendall McEachron', initials: 'KM', role: 'Faculty Collaborator', slug: 'mceachron', authorName: 'McEachron K', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/images/u_of_m_2023_resident_graduation_6-27-23_0107-edit.jpeg?itok=3fV81qKA' },
  { name: 'Sami Safadi', initials: 'SS', role: 'Faculty Collaborator', slug: 'safadi', authorName: 'Safadi S', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-01/DOM-Faculty-_0076_Layer-223.png' },
  { name: 'Abbie Begnaud', initials: 'AB', role: 'Faculty', credentials: 'MD', slug: 'begnaud', authorName: 'Begnaud A', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-01/begnaud-abbie.png?itok=gSTF7AGX' },
  { name: 'Ben Henkle', initials: 'BH', role: 'Faculty', credentials: 'MD, MPH', slug: 'henkle', authorName: 'Henkle BE', photoUrl: 'https://www.va.gov/MINNEAPOLISRESEARCH/images/staff/benjaminhenkle.jpg' },
  { name: 'Dave MacDonald', initials: 'DM', role: 'Faculty', credentials: 'MD, MS', slug: 'macdonald', authorName: 'MacDonald DM', scholarId: 'EZt8qpMAAAAJ', /* Scholar stats (2026-03-24): citations 257, h-index 11, i10-index 11 */ links: [{ label: 'Scholar', href: 'https://scholar.google.com/citations?user=EZt8qpMAAAAJ&hl=en' }] },
  { name: 'Josh Trujeque', initials: 'JT', role: 'Faculty', credentials: 'MD', slug: 'trujeque', authorName: 'Trujeque J', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/images/picture9.png' },
  { name: 'Katie Pendleton', initials: 'KP', role: 'Faculty', credentials: 'MD', slug: 'pendleton', authorName: 'Pendleton KM', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-01/DOM-Faculty-_0112_Layer-187.png?itok=1xJq3yYt' },
  { name: 'Michael Kalinoski', initials: 'MK', role: 'Faculty', credentials: 'MD', slug: 'kalinoski', authorName: 'Kalinoski M' },
  { name: 'Dave Wacker', initials: 'DW', role: 'Faculty', credentials: 'MD', slug: 'wacker', authorName: 'Wacker DA', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-01/DOM-Faculty-_0028_Layer-271.png?itok=skFv-xW5' },
]

// Order = activity level in MNCCORE (most active first). Keep updated.
export const researchTeam: TeamMember[] = [
  { name: 'Steven Arriaza', initials: 'SA', role: 'Research Coordinator', slug: 'arriaza' },
  { name: 'Emma Bromley', initials: 'EB', role: 'Research Coordinator', slug: 'bromley', authorName: 'Bromley E' },
  { name: 'Casey Eddington', initials: 'CE', role: 'Data Analyst', slug: 'eddington', authorName: 'Eddington C' },
  { name: 'Dan Shyu', initials: 'DS', role: 'Critical Care Fellow', credentials: 'MD', slug: 'shyu', authorName: 'Shyu D', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/images/shyu-daniel.png' },
  { name: 'Beret Fitzgerald', initials: 'BF', role: 'Critical Care Fellow', credentials: 'MD', slug: 'fitzgerald', authorName: 'Fitzgerald B', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/images/fitzgerald-beret-001.png' },
  { name: 'Claire Collins', initials: 'CC', role: 'Medical Student Researcher', slug: 'collins', authorName: 'Collins C' },
]

// Helper: get all team members as a flat array
export function getAllMembers(): TeamMember[] {
  return [...seniorMentors, ...facultyCollaborators, ...researchTeam]
}

// Helper: find team member by slug
export function getMemberBySlug(slug: string): TeamMember | undefined {
  return getAllMembers().find((m) => m.slug === slug)
}

// Shared person lookup — used across MeetingDetail, ProjectDetail, MeetingCard, etc.
export function getPersonInfo(slug: string): { name: string; initials: string; photoUrl: string | undefined } {
  // AI Co-Scientist
  if (slug === 'claude-ai') {
    return { name: 'Claude AI', initials: 'AI', photoUrl: undefined }
  }
  const director = directors.find((d) => d.slug === slug)
  if (director) return { name: director.name, initials: director.initials, photoUrl: director.photoUrl }
  const member = getMemberBySlug(slug)
  if (member) return { name: member.name, initials: member.initials, photoUrl: member.photoUrl }
  // Handle email addresses (from D1 auth)
  const name = slug.includes('@') ? slug.split('@')[0] : slug
  return { name, initials: name.slice(0, 2).toUpperCase(), photoUrl: undefined }
}
