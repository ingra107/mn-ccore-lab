/**
 * useLabFacts -- every number on the public Home, from live data.
 *
 * Papers, years and areas come from /api/publications; the active-project
 * count from /api/projects (anonymous callers get the status only, never a
 * title); funding from /api/grants (usePublicGrants: funded awards for everyone). People and sites are the roster and the
 * site list, counted once each (lib/roster, data/clifSites). A count whose
 * list has not loaded yet is null, so the page shows a dash, never a guess.
 */
import { useMemo } from 'react'
import { usePublications, useProjects } from './useApiData'
import { usePublicGrants } from './usePublicGrants'
import { agencyOf } from '../lib/publicGrants'
import { mechanismOf } from '../lib/grants'
import { isProjectActive } from '../lib/taskConstants'
import { countPublications, isPublished } from '../lib/publicationCounts'
import { areaCounts } from '../lib/researchAreas'
import { rosterCount } from '../lib/roster'
import { CLIF_SITES } from '../data/clifSites'

const YEARS_SHOWN = 10

export function useLabFacts() {
  const pubs = usePublications()
  const projects = useProjects()
  const grants = usePublicGrants()
  const publications = pubs.data
  const projectRows = projects.data
  const grantRows = grants.data

  return useMemo(() => {
    const list = publications ?? []
    const published = list.filter(isPublished)
    const thisYear = new Date().getFullYear()
    const byYear: { year: number; n: number }[] = []
    for (let y = thisYear - YEARS_SHOWN + 1; y <= thisYear; y++) {
      byYear.push({ year: y, n: published.filter((p) => p.year === y).length })
    }
    // Newest first; a stable sort keeps the API's order inside a year.
    const recent = [...published].sort((a, b) => b.year - a.year)
    const featured = recent.filter((p) => p.featured)
    const activeGrants = (grantRows ?? []).filter((g) => g.bucket === 'active')
    return {
      loaded: publications !== undefined,
      papers: publications ? countPublications(list).published : null,
      byYear,
      areas: areaCounts(list),
      recent,
      featured,
      activeProjects: projectRows ? projectRows.filter((p) => isProjectActive(p.status)).length : null,
      sites: CLIF_SITES.length,
      people: rosterCount,
      funders: [...new Set(activeGrants.map((g) => agencyOf(g.venue)).filter(Boolean))],
      mechanisms: [...new Set(activeGrants.map((g) => mechanismOf(g.venue)).filter((m): m is string => !!m))],
      activeGrants: grantRows ? activeGrants.length : null,
    }
  }, [publications, projectRows, grantRows])
}
