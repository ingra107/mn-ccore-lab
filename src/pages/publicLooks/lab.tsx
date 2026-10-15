import { useMemo } from 'react'
import { usePublications, useProjects, useExpertise } from '../../hooks/useApiData'
import type { ExpertiseTag } from '../../hooks/useApiData'
import { isProjectActive } from '../../lib/taskConstants'
import { countPublications, isPublished, memberPublications } from '../../lib/publicationCounts'
import { directors, seniorMentors, facultyCollaborators, researchTeam } from '../../data/team'
import type { TeamMember } from '../../data/types'
import { FaceDisc } from '../../components/today/skin'
import { photoFor } from '../../lib/personLabel'
import { displayName } from '../../lib/nameUtils'
import './looks.css'

export type Look = 'a' | 'b' | 'c' | 'd'
export const LOOKS: Look[] = ['a', 'b', 'c', 'd']

export interface Person { m: TeamMember; group: 'directors' | 'mentors' | 'faculty' | 'team'; pubs: number }

export function useLab() {
  const { data: publications = [] } = usePublications()
  const { data: projects = [] } = useProjects()
  const { data: allExpertise = [] } = useExpertise() as { data: ExpertiseTag[] }
  return useMemo(() => {
    const published = publications.filter(isPublished)
    const counts = countPublications(publications)
    const year = new Date().getFullYear()
    const byYear: { year: number; n: number }[] = []
    for (let y = year - 5; y <= year; y++) byYear.push({ year: y, n: published.filter(p => p.year === y).length })
    const recent = [...published].sort((a, b) => b.year - a.year).slice(0, 6)
    const featured = published.filter(p => p.featured).slice(0, 4)
    const topicMap = new Map<string, number>()
    for (const p of published) for (const t of p.topics ?? []) topicMap.set(t, (topicMap.get(t) ?? 0) + 1)
    const topics = [...topicMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    const active = projects.filter(p => isProjectActive(p.status))
    const mk = (list: TeamMember[], group: Person['group']): Person[] =>
      list.map(m => ({ m, group, pubs: memberPublications(publications, m).filter(isPublished).length }))
    const people = [
      ...mk(directors, 'directors'), ...mk(seniorMentors, 'mentors'),
      ...mk(facultyCollaborators, 'faculty'), ...mk(researchTeam, 'team'),
    ]
    const tagsByMember = new Map<string, string[]>()
    for (const t of allExpertise) tagsByMember.set(t.member_slug, [...(tagsByMember.get(t.member_slug) ?? []), t.tag])
    return { counts, byYear, recent, featured, topics, active, projects, people, tagsByMember, allExpertise }
  }, [publications, projects, allExpertise])
}

export function Who({ m, px = 28, ring = false }: { m: TeamMember; px?: number; ring?: boolean }) {
  const slug = m.slug ?? ''
  return (
    <span className={ring ? 'pl-face-hue' : undefined} style={{ display: 'inline-flex', flex: 'none' }}>
      <FaceDisc initials={m.initials} photo={m.photoUrl ?? photoFor(slug)} label={displayName(slug) || m.name} px={px} decorative />
    </span>
  )
}

export function fullName(m: TeamMember) {
  return m.credentials ? `${m.name}, ${m.credentials}` : m.name
}

export const AREAS = [
  { t: 'Provider variation', d: 'How individual clinician practice shapes ICU outcomes across hospitals.' },
  { t: 'ICU quality metrics', d: 'Building and validating quality measures from multi-center data.' },
  { t: 'Clinical decision-making', d: 'How cognitive style and heuristics drive behavior at the bedside.' },
  { t: 'Multi-center data science', d: 'Open data infrastructure through the CLIF Consortium.' },
]
