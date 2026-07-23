/**
 * #905 — resolve missing member ORCID ids via the OpenAlex authors API
 * (name + affiliation → author profile that carries an ORCID id).
 *
 * REPORTS candidates for human review; does NOT write team.ts. A match is
 * HIGH confidence only when the top OpenAlex author has: a last-name match, a
 * Minnesota-area affiliation, AND an ORCID on record. Everything else is
 * REVIEW (name collisions + split profiles are real — the report shows the top
 * few candidates so a human can judge).
 *
 * Run: npx tsx scripts/backfill-orcid.ts        (public API, no key needed)
 * Output line per member:  <HIGH|REVIEW|NONE>  <slug>  <chosen-orcid>
 */
import { directors, seniorMentors, facultyCollaborators, researchTeam } from '../src/data/team'
import type { Director, TeamMember } from '../src/data/types'

type M = (Director | TeamMember) & { slug?: string; orcidId?: string }

const MAILTO = 'nicholas.ingraham@gmail.com'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const lastName = (n: string) => n.trim().split(/\s+/).slice(-1)[0].toLowerCase().replace(/[^a-z]/g, '')

interface OAInst { display_name?: string }
interface OAAuthor {
  id?: string
  display_name?: string
  orcid?: string | null
  works_count?: number
  last_known_institutions?: OAInst[]
  last_known_institution?: OAInst
}

function affil(a: OAAuthor): string {
  const insts = a.last_known_institutions?.length
    ? a.last_known_institutions
    : a.last_known_institution
      ? [a.last_known_institution]
      : []
  return insts.map((i) => i.display_name).filter(Boolean).join('; ')
}

async function main() {
  const members = [...directors, ...seniorMentors, ...facultyCollaborators, ...researchTeam].filter(
    (m): m is M => Boolean((m as M).slug) && !(m as M).orcidId,
  )
  const summary: Array<{ slug: string; conf: string; orcid: string }> = []

  for (const m of members) {
    try {
      const url = `https://api.openalex.org/authors?search=${encodeURIComponent(m.name)}&per-page=5&mailto=${MAILTO}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`OpenAlex ${res.status}`)
      const data = (await res.json()) as { results?: OAAuthor[] }
      const ln = lastName(m.name)
      const ranked = (data.results ?? [])
        .map((a) => {
          const nameMatch = lastName(a.display_name || '') === ln
          const aff = affil(a).toLowerCase()
          const mn = /minnesota|minneapolis|\bumn\b/.test(aff)
          const hasOrcid = Boolean(a.orcid)
          const score =
            (nameMatch ? 3 : 0) + (mn ? 3 : 0) + (hasOrcid ? 1 : 0) + Math.min((a.works_count || 0) / 50, 1)
          return { a, nameMatch, mn, hasOrcid, score }
        })
        .sort((x, y) => y.score - x.score)

      const top = ranked[0]
      const conf = !top ? 'NONE' : top.nameMatch && top.mn && top.hasOrcid ? 'HIGH' : 'REVIEW'
      const orcid = conf === 'HIGH' ? (top.a.orcid || '').replace('https://orcid.org/', '') : ''
      summary.push({ slug: m.slug!, conf, orcid })
      console.log(`${conf.padEnd(6)} ${m.slug!.padEnd(24)} name="${m.name}"  -> ${orcid || '(review candidates)'}`)
      for (const r of ranked.slice(0, 3)) {
        console.log(
          `        ${(r.a.orcid || 'no-orcid').replace('https://orcid.org/', '').padEnd(20)} | ` +
            `${(r.a.display_name || '').padEnd(24)} | works=${String(r.a.works_count || 0).padStart(4)} | ${affil(r.a).slice(0, 42)}`,
        )
      }
    } catch (err) {
      summary.push({ slug: m.slug!, conf: 'ERROR', orcid: '' })
      console.log(`ERROR  ${m.slug}: ${(err as Error).message}`)
    }
    await sleep(300)
  }

  const hi = summary.filter((s) => s.conf === 'HIGH')
  console.log(`\n=== SUMMARY: ${hi.length} HIGH / ${summary.filter((s) => s.conf === 'REVIEW').length} REVIEW / ` +
    `${summary.filter((s) => s.conf === 'NONE').length} NONE / ${summary.filter((s) => s.conf === 'ERROR').length} ERROR ===`)
  console.log('HIGH-confidence orcidIds (slug -> orcid):')
  for (const s of hi) console.log(`  ${s.slug} -> ${s.orcid}`)
}

main()
