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
  { name: 'Adams Dudley', initials: 'AD', role: 'Senior Mentor', credentials: 'MD, MBA', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/images/r._adams_dudley_0.png?itok=BykmoC6t' },
  { name: 'Jeff Chipman', initials: 'JC', role: 'Senior Mentor & Surgical Critical Care', credentials: 'MD', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-08/Copy%20of%20UMN-8471.jpg?itok=UqPdFLCU' },
]

// Order = activity level in MNCCORE (most active first). Keep updated.
export const facultyCollaborators: TeamMember[] = [
  { name: 'Kendall McEachron', initials: 'KM', role: 'Faculty Collaborator', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/images/u_of_m_2023_resident_graduation_6-27-23_0107-edit.jpeg?itok=3fV81qKA' },
  { name: 'Sami Safadi', initials: 'SS', role: 'Faculty Collaborator', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-01/DOM-Faculty-_0076_Layer-223.png' },
  { name: 'Abbie Begnaud', initials: 'AB', role: 'Faculty', credentials: 'MD', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-01/begnaud-abbie.png?itok=gSTF7AGX' },
  { name: 'Ben Henkle', initials: 'BH', role: 'Faculty', credentials: 'MD, MPH' },
  { name: 'Dave MacDonald', initials: 'DM', role: 'Faculty', credentials: 'MD, MS' },
  { name: 'Josh Trujeque', initials: 'JT', role: 'Faculty', credentials: 'MD', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/images/picture9.png' },
  { name: 'Katie Pendleton', initials: 'KP', role: 'Faculty', credentials: 'MD', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-01/DOM-Faculty-_0112_Layer-187.png?itok=1xJq3yYt' },
  { name: 'Michael Kalinoski', initials: 'MK', role: 'Faculty', credentials: 'MD' },
  { name: 'Dave Wacker', initials: 'DW', role: 'Faculty', credentials: 'MD', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-01/DOM-Faculty-_0028_Layer-271.png?itok=skFv-xW5' },
]

// Order = activity level in MNCCORE (most active first). Keep updated.
export const researchTeam: TeamMember[] = [
  { name: 'Steven Arriaza', initials: 'SA', role: 'Research Coordinator' },
  { name: 'Emma Bromley', initials: 'EB', role: 'Research Coordinator' },
  { name: 'Casey Eddington', initials: 'CE', role: 'Data Analyst' },
  { name: 'Dan Shyu', initials: 'DS', role: 'Critical Care Fellow', credentials: 'MD', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/images/shyu-daniel.png' },
  { name: 'Beret Fitzgerald', initials: 'BF', role: 'Critical Care Fellow', credentials: 'MD', photoUrl: 'https://med.umn.edu/sites/med.umn.edu/files/images/fitzgerald-beret-001.png' },
  { name: 'Claire Collins', initials: 'CC', role: 'Medical Student Researcher' },
]
