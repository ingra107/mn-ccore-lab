import type { Mentee } from './types'

// Trainees shared across MNCCORE — mentored as a team.
// slug links to team.ts for photos/member pages; projectSlugs link to projects.ts
export const mentees: Mentee[] = [
  {
    name: 'Dan Shyu',
    slug: 'dan-shyu',
    role: 'Critical Care Fellow',
    credentials: 'MD',
    mentor: 'shared',
    yearStarted: 2024,
    bio: 'Critical care fellow investigating provider-level variation in ventilator management and ICU quality metrics across the CLIF Consortium.',
    researchInterests: ['Mechanical ventilation', 'Provider variation', 'CLIF data science'],
    projectSlugs: ['fellow-icu-handoff-communication', 'p1-gender-disparities-low-tidal-volume', 'volume-vs-pressure-control-mortality'],
  },
  {
    name: 'Beret Fitzgerald',
    slug: 'beret-fitzgerald',
    role: 'Critical Care Fellow',
    credentials: 'MD',
    mentor: 'shared',
    yearStarted: 2024,
    bio: 'Critical care fellow focused on goals-of-care decision-making and chronic critical illness trajectories in ICU patients.',
    researchInterests: ['Goals of care', 'Chronic critical illness', 'DNR variation'],
    projectSlugs: ['fellow-goc-timing-prolonged-icu', 'cci-in-ards', 'dnr-provider-variation'],
  },
  {
    name: 'Emma Bromley',
    slug: 'emma-bromley',
    role: 'Research Coordinator',
    mentor: 'nick-ingraham',
    yearStarted: 2023,
    bio: 'Pre-doctoral research coordinator leading the Decision-Making Survey (GDMS) study and supporting multi-center CLIF data collection efforts.',
    researchInterests: ['Clinical decision-making', 'Survey methodology', 'Evidence-based practice'],
    projectSlugs: ['decision-making-survey-gdms', 'provider-ebp-research-program'],
  },
  {
    name: 'Casey Eddington',
    slug: 'casey-eddington',
    role: 'Data Analyst',
    mentor: 'nick-ingraham',
    yearStarted: 2023,
    bio: 'Data analyst supporting CLIF consortium analytics, including gender disparities research and ICU quality metric development.',
    researchInterests: ['CLIF analytics', 'ICU quality metrics', 'Multi-center data'],
    projectSlugs: ['p1-gender-disparities-low-tidal-volume', 'p4-icu-quality-metrics', 'lpv-adherence-paper'],
  },
  {
    name: 'Claire Collins',
    slug: 'claire-collins',
    role: 'Medical Student Researcher',
    mentor: 'shared',
    yearStarted: 2025,
    bio: 'Medical student exploring the intersection of provider cognitive styles and ICU treatment decisions.',
    researchInterests: ['Cognitive science', 'Clinical decision-making', 'Medical education'],
    projectSlugs: ['student-cognitive-biases-icu-triage', 'decision-making-survey-gdms'],
  },
  {
    name: 'Steven Arriaza',
    slug: 'steven-arriaza',
    role: 'Research Coordinator',
    mentor: 'shared',
    yearStarted: 2024,
    bio: 'Research coordinator supporting data collection and study operations across MNCCORE projects.',
    researchInterests: ['Clinical research operations', 'Data management'],
    projectSlugs: [],
  },
]

// Helper: find mentee by slug
export function getMenteeBySlug(slug: string): Mentee | undefined {
  return mentees.find((m) => m.slug === slug)
}

// Helper: get mentees for a specific project
export function getMenteesForProject(projectSlug: string): Mentee[] {
  return mentees.filter((m) => m.projectSlugs?.includes(projectSlug))
}

// Helper: get mentees by mentor
export function getMenteesByMentor(mentor: 'nick-ingraham' | 'nate-mesfin' | 'shared'): Mentee[] {
  return mentees.filter((m) => m.mentor === mentor || m.mentor === 'shared')
}
