/**
 * Session 2: Seed 10 real ideas to prod Hub.
 * Usage: tsx scripts/seed/session2-ideas.ts
 */

const HUB = process.env.HUB_API_URL || 'https://mn-ccore-lab.pages.dev'
const KEY = process.env.PB_API_KEY || ''

if (!KEY) {
  console.error('PB_API_KEY env var required')
  process.exit(1)
}

const ideas = [
  { title: 'Pre-meeting email prompt for async status updates', description: '48hr before biweekly: auto-email team members with their action items and a link to post updates. Reduces meeting time on status reports.', research_area: 'ops', submitted_by: 'nick' },
  { title: 'Cross-project insight engine', description: 'Flag shared variables and populations across projects. When two projects use the same CLIF cohort, surface the overlap and suggest collaboration.', research_area: 'tool', submitted_by: 'nick' },
  { title: 'Weekly research digest email', description: 'Daily PubMed scan condensed into a weekly curated email to the lab. Each paper tagged with relevant projects and team members.', research_area: 'tool', submitted_by: 'nick' },
  { title: 'Trainee journal club pilot', description: 'Bi-weekly trainee-led paper discussion. Fellows pick papers, present 15min + 15min discussion. Builds presentation skills.', research_area: 'culture', submitted_by: 'nate' },
  { title: 'Shared code review rubric for fellows', description: 'Standardize feedback on R/Python analysis code. Checklist: reproducibility, documentation, version control, unit tests.', research_area: 'ops', submitted_by: 'eddington' },
  { title: 'Open office hours with PI', description: 'Weekly 30-min drop-in block for trainees. No appointment needed. Builds rapport and catches small questions before they become blockers.', research_area: 'culture', submitted_by: 'nate' },
  { title: 'Grant opportunity bulletin board', description: 'Shared board of active RFAs relevant to critical care. Auto-populated from NIH RePORTER + manual entries. Deadlines with countdown.', research_area: 'tool', submitted_by: 'nick' },
  { title: 'Quarterly data review office hours', description: 'Open biostats block -- any team member brings dataset, gets 30min of analysis help. Builds data literacy across the lab.', research_area: 'ops', submitted_by: 'eddington' },
  { title: 'Lab podcast experiment', description: '10-min monthly audio bites: one lab member explains their current project to a general audience. Practices communication, creates outreach content.', research_area: 'culture', submitted_by: 'fitzgerald' },
  { title: 'Mentee milestone dashboard integration', description: 'Track committee meetings, scholarly project deadlines, program director asks. Proactive alerts 30 days before due dates.', research_area: 'tool', submitted_by: 'nick' },
]

async function main() {
  for (const idea of ideas) {
    const res = await fetch(`${HUB}/api/ideas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${KEY}`,
      },
      body: JSON.stringify(idea),
    })
    const status = res.status
    const body = await res.json().catch(() => ({}))
    console.log(`[${status}] ${idea.title.slice(0, 50)}...`)
    if (status >= 400) {
      console.error('  Error:', JSON.stringify(body))
    }
  }

  // Add votes on top 3 ideas
  console.log('\nFetching ideas for voting...')
  const listRes = await fetch(`${HUB}/api/ideas`, {
    headers: { 'Authorization': `Bearer ${KEY}` },
  })
  const listBody = await listRes.json() as { data?: { id: string; title: string }[] }
  const allIdeas = listBody.data || []

  const voteTargets = ['Cross-project', 'Weekly research digest', 'Pre-meeting email']
  for (const target of voteTargets) {
    const match = allIdeas.find(i => i.title.toLowerCase().includes(target.toLowerCase()))
    if (match) {
      const vRes = await fetch(`${HUB}/api/ideas/${match.id}/vote`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${KEY}` },
      })
      console.log(`Vote on "${match.title.slice(0, 40)}...": ${vRes.status}`)
    }
  }

  console.log('\nDone. Verify at: https://mn-ccore-lab.pages.dev/ideas')
}

main().catch(console.error)
