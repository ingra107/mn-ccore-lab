import type { Mentee } from './types'
import { directors } from './team'

// Trainees shared across MNCCORE — mentored as a team. Staff are not trainees:
// Casey Eddington (Data Analyst) and Steven Arriaza (Research Coordinator) are
// team staff (Nick, standing rule) and live in team.ts only.
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
    name: 'Claire Collins',
    slug: 'claire-collins',
    role: 'Medical Student Researcher',
    mentor: 'shared',
    yearStarted: 2025,
    bio: 'Medical student exploring the intersection of provider cognitive styles and ICU treatment decisions.',
    researchInterests: ['Cognitive science', 'Clinical decision-making', 'Medical education'],
    projectSlugs: ['student-cognitive-biases-icu-triage', 'decision-making-survey-gdms'],
  },
]

// Helper: find mentee by slug
export function getMenteeBySlug(slug: string): Mentee | undefined {
  return mentees.find((m) => m.slug === slug)
}


/** A director's trainees: the ones they mentor plus the 'shared' ones, named rows only
 *  (a stub row belongs on the internal Team page). Empty for anyone who is not a director. */
export function menteesForDirector(slug: string): Mentee[] {
  if (!directors.some((d) => d.slug === slug)) return []
  return mentees.filter((m) => (m.mentor === slug || m.mentor === 'shared') && m.name?.trim())
}
