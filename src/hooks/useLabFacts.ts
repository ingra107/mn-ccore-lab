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
    // Only grants with a named funding agency count toward the public
    // "Funded by X through N grants" line: an award row with no agency (the
    // ATS Early Career Award) made it read "2 active grants (K23)". Nick,
    // 2026-10-30: "NHLBI only".
    const activeGrants = (grantRows ?? []).filter((g) => g.bucket === 'active' && !!agencyOf(g.venue))
    return {
      loaded: publications !== undefined,
      papers: publications ? countPublications(list).published : null,
      // The band's hero number: the papers in the years its bars draw, so the
      // number, its "<first> to <last>" label and the bars agree. The all-time
      // count above runs back to 1935 and read as "579 ... 2017 to 2026".
      papersShown: publications ? byYear.reduce((sum, y) => sum + y.n, 0) : null,
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
