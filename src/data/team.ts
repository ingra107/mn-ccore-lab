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
  },
]

export const seniorMentors: TeamMember[] = [
  { name: 'Adams Dudley', initials: 'AD', role: 'Senior Mentor', credentials: 'MD, MBA' },
  { name: 'Jeff Chipman', initials: 'JC', role: 'Senior Mentor & Surgical Critical Care', credentials: 'MD' },
]

// Order = activity level in MNCCORE (most active first). Keep updated.
export const facultyCollaborators: TeamMember[] = [
  { name: 'Kendall McEachron', initials: 'KM', role: 'Faculty Collaborator' },
  { name: 'Sami Safadi', initials: 'SS', role: 'Faculty Collaborator' },
  { name: 'Abbie Begnaud', initials: 'AB', role: 'Faculty', credentials: 'MD' },
  { name: 'Ben Henkle', initials: 'BH', role: 'Faculty', credentials: 'MD, MPH' },
  { name: 'Dave MacDonald', initials: 'DM', role: 'Faculty', credentials: 'MD, MS' },
  { name: 'Josh Trujeque', initials: 'JT', role: 'Faculty', credentials: 'MD' },
  { name: 'Katie Pendleton', initials: 'KP', role: 'Faculty', credentials: 'MD' },
  { name: 'Michael Kalinoski', initials: 'MK', role: 'Faculty', credentials: 'MD' },
  { name: 'Dave Wacker', initials: 'DW', role: 'Faculty', credentials: 'MD' },
]

// Order = activity level in MNCCORE (most active first). Keep updated.
export const researchTeam: TeamMember[] = [
  { name: 'Steven Arriaza', initials: 'SA', role: 'Research Coordinator' },
  { name: 'Emma Bromley', initials: 'EB', role: 'Research Coordinator' },
  { name: 'Casey Eddington', initials: 'CE', role: 'Data Analyst' },
  { name: 'Dan Shyu', initials: 'DS', role: 'Critical Care Fellow', credentials: 'MD' },
  { name: 'Beret Fitzgerald', initials: 'BF', role: 'Critical Care Fellow', credentials: 'MD' },
  { name: 'Claire Collins', initials: 'CC', role: 'Medical Student Researcher' },
]
