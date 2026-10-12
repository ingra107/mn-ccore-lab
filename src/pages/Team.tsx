import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { FaceDisc } from '../components/today/skin'
import { PublicHead, SecHead } from '../components/public/PublicParts'
import { usePageMeta } from '../hooks/usePageMeta'
import type { TeamMember } from '../data/types'
import { usePublications, useExpertise } from '../hooks/useApiData'
import type { ExpertiseTag } from '../hooks/useApiData'
import { displayName } from '../lib/nameUtils'
import { memberPublications, isPublished } from '../lib/publicationCounts'
import { ROSTER, rosterCount } from '../lib/roster'
import AddMemberPanel from '../components/AddMemberPanel'
import { useAuth } from '../hooks/useAuth'

/** "2 grants, 71 papers": a zero is left out, never printed. */
function statLine(parts: [number, string, string][]): string {
  return parts.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`).join(' · ')
}

export default function Team() {
  const { user } = useAuth()
  const { data: publications = [] } = usePublications()
  // #507 follow-up opt-out: the roster is static (lib/roster), so the page always
  // renders; a failed expertise load only drops the tags and the filter.
  const { data: allExpertise = [] } = useExpertise() as { data: ExpertiseTag[] }
  const [searchParams, setSearchParams] = useSearchParams()
  const expertiseFilter = searchParams.get('expertise') || ''

  const expertiseByMember = useMemo(() => {
    const map = new Map<string, ExpertiseTag[]>()
    for (const tag of allExpertise) map.set(tag.member_slug, [...(map.get(tag.member_slug) ?? []), tag])
    return map
  }, [allExpertise])

  const allTags = useMemo(() => {
    const tagSet = new Map<string, number>()
    for (const tag of allExpertise) tagSet.set(tag.tag, (tagSet.get(tag.tag) || 0) + 1)
    return [...tagSet.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }))
  }, [allExpertise])

  const filteredSlugs = useMemo(() => {
    if (!expertiseFilter) return null
    const slugs = new Set<string>()
    for (const tag of allExpertise) if (tag.tag.toLowerCase() === expertiseFilter.toLowerCase()) slugs.add(tag.member_slug)
    return slugs
  }, [allExpertise, expertiseFilter])

  const shown = (m: TeamMember) => !filteredSlugs || (!!m.slug && filteredSlugs.has(m.slug))

  usePageMeta(
    'Team | MN-CCORE Lab',
    `Meet the ${rosterCount} people of MN-CCORE: co-directors Nick Ingraham and Nathan Mesfin, senior mentors, faculty collaborators, fellows, students and research staff.`
  )

  // Trainees are the roster's own group (fellows and students), never the mentee list.
  const traineeCount = ROSTER.find((g) => g.id === 'trainees')?.members.length ?? 0
  const nameOf = (m: TeamMember) => (m.slug ? displayName(m.slug, 'formal') : m.name)

  return (
    <div className="content-container pub-foot">
      <PublicHead
        kicker="The people"
        title={<>Who we <em>are</em>.</>}
        lede={`${rosterCount} physicians, scientists, trainees and research staff, working on one question: how to make ICU care better.`}
        small
      >
        {/* PI only: who can sign in to the Hub is a team_members row, and
            this is how one is added (2026-10-08). The API refuses anyone else. */}
        {user.isPi && <div style={{ marginTop: 16 }}><AddMemberPanel /></div>}
      </PublicHead>

      {allTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 22 }} aria-label="Filter by expertise">
          {expertiseFilter ? (
            <button type="button" className="pub-chip pub-on" onClick={() => setSearchParams({})}>
              {expertiseFilter}<X size={12} aria-hidden="true" />
            </button>
          ) : allTags.slice(0, 10).map(({ tag }) => (
            <button key={tag} type="button" className="pub-chip" onClick={() => setSearchParams({ expertise: tag })}>{tag}</button>
          ))}
        </div>
      )}

      {ROSTER.map((group) => {
        const members = group.members.filter(shown)
        if (members.length === 0) return null
        if (group.id === 'directors') {
          return (
            <section key={group.id} aria-label={group.label}>
              <SecHead title={group.label} />
              <div className="pub-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', marginTop: 14 }}>
                {members.map((m) => {
                  const slug = m.slug ?? ''
                  const tags = expertiseByMember.get(slug) ?? []
                  const stats = statLine([
                    [memberPublications(publications, m).filter(isPublished).length, 'paper', 'papers'],
                    [traineeCount, 'trainee', 'trainees'],
                  ])
                  return (
                    <Link key={slug} to={`/team/${slug}`} className="pub-card pub-hov pub-dir">
                      <div className="pub-dir-hd">
                        <FaceDisc initials={m.initials} photo={m.photoUrl} label={nameOf(m)} px={80} pxSm={64} variant="brand" decorative />
                        <div style={{ minWidth: 0 }}>
                          <div className="pub-dir-name">{nameOf(m)}</div>
                          <div className="pub-dir-role">{m.role}</div>
                        </div>
                      </div>
                      <div className="pub-dir-bd">
                        {'title' in m && typeof (m as { title?: string }).title === 'string' && (
                          <div className="pub-rj" style={{ fontSize: 14, marginTop: 0 }}>{(m as { title?: string }).title}</div>
                        )}
                        {m.bio && <p>{m.bio}</p>}
                        {tags.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                            {tags.slice(0, 4).map((t) => <span key={t.id} className="pub-chip" style={{ cursor: 'default' }}>{t.tag}</span>)}
                          </div>
                        )}
                        {stats && <div className="pub-meta" style={{ marginTop: 12 }}>{stats}</div>}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          )
        }
        return (
          <section key={group.id} aria-label={group.label}>
            <SecHead title={group.label} count={members.length} />
            <div className="pub-cards">
              {members.map((m) => {
                const tags = (m.slug ? expertiseByMember.get(m.slug) : undefined) ?? []
                const name = nameOf(m)
                // The group head already says it: no "Faculty" under every faculty card.
                const showRole = !(group.id === 'faculty' && /^faculty( collaborator)?$/i.test(m.role))
                  && !(group.id === 'mentors' && /^senior mentor$/i.test(m.role))
                const inner = (
                  <>
                    <FaceDisc initials={m.initials} photo={m.photoUrl} label={name} px={76} pxSm={64} variant="brand" decorative />
                    <span className="pub-pn" style={{ marginTop: 10 }}>{name}</span>
                    {showRole && <span className="pub-pr">{m.role}</span>}
                    {tags.length > 0 && <span className="pub-pr" style={{ marginTop: 6, fontStyle: 'italic' }}>{tags.slice(0, 2).map((t) => t.tag).join(' · ')}</span>}
                  </>
                )
                return m.slug
                  ? <Link key={m.slug} to={`/team/${m.slug}`} className="pub-card pub-hov pub-pcard">{inner}</Link>
                  : <div key={m.name} className="pub-card pub-pcard">{inner}</div>
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
