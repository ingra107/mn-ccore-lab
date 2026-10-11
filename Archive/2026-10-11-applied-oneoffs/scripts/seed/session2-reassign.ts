/**
 * Session 2: Reassign ~30 tasks from nick to team members.
 * Keyword-based matching on title + project.
 * Usage: npx tsx scripts/seed/session2-reassign.ts
 */

const HUB = process.env.HUB_API_URL || 'https://mn-ccore-lab.pages.dev'
const KEY = process.env.PB_API_KEY || ''

if (!KEY) {
  console.error('PB_API_KEY env var required')
  process.exit(1)
}

type Task = { id: string; title: string; project_id: string | null; assignee: string; status: string }

// Reassignment rules: [keywords (any match), new assignee, reason]
const rules: [string[], string, string][] = [
  // Nate's domain
  [['cardiac arrest', 'dnr', 'resuscitation', 'nate', 'mesfin'], 'nate', 'Nate domain'],
  [['fellow', 'trainee', 'mentee', 'T32', 'fellowship award'], 'nate', 'Training oversight'],
  // Eddington's domain
  [['data analysis', 'r script', 'python script', 'redcap', 'data dictionary', 'exploratory plot'], 'eddington', 'Data analyst scope'],
  [['CRRT', 'epidemiology', 'guleria', 'chhikara'], 'eddington', 'Data extraction'],
  // Shyu's domain
  [['vasopressor', 'iv fluid', 'shyu', 'hemodynamic'], 'shyu', 'Shyu project'],
  // Arriaza (coordinator)
  [['coordinator', 'SOP', 'irb', 'citi training', 'room booking', 'conference room', 'invitee list'], 'arriaza', 'Coordinator scope'],
  [['respondent list', 'survey', 'steven'], 'arriaza', 'Coordinator data'],
  // McEachron
  [['central line', 'mceachron', 'kendall'], 'mceachron', 'McEachron project'],
  // Fitzgerald
  [['palliative', 'goals of care', 'communication pattern', 'handoff'], 'fitzgerald', 'Fitzgerald domain'],
]

async function main() {
  // Fetch open nick tasks
  const res = await fetch(`${HUB}/api/tasks?limit=500&assignee=nick`, {
    headers: { 'Authorization': `Bearer ${KEY}` },
  })
  const body = await res.json() as { data?: Task[] }
  const tasks = (body.data || []).filter(t => t.status !== 'done' && t.assignee === 'nick')
  console.log(`Found ${tasks.length} open nick tasks`)

  let reassigned = 0
  const reassignments: { id: string; title: string; to: string; reason: string }[] = []

  for (const task of tasks) {
    const titleLower = (task.title || '').toLowerCase()
    const projectLower = (task.project_id || '').toLowerCase()
    const searchText = titleLower + ' ' + projectLower

    for (const [keywords, newAssignee, reason] of rules) {
      if (keywords.some(kw => searchText.includes(kw.toLowerCase()))) {
        reassignments.push({ id: task.id, title: task.title, to: newAssignee, reason })
        break // first matching rule wins
      }
    }
  }

  console.log(`\nMatched ${reassignments.length} tasks for reassignment:`)
  for (const r of reassignments) {
    console.log(`  → ${r.to.padEnd(12)} | ${r.reason.padEnd(20)} | ${r.title.slice(0, 50)}`)
  }

  // Execute reassignments
  console.log(`\nReassigning...`)
  for (const r of reassignments) {
    const patchRes = await fetch(`${HUB}/api/tasks/${r.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${KEY}`,
      },
      body: JSON.stringify({ assignee: r.to }),
    })
    const status = patchRes.status
    if (status >= 400) {
      console.log(`  [${status}] FAILED: ${r.title.slice(0, 40)}`)
    } else {
      reassigned++
    }
  }

  console.log(`\nReassigned ${reassigned}/${reassignments.length} tasks`)

  // Summary by assignee
  const byAssignee: Record<string, number> = {}
  for (const r of reassignments) {
    byAssignee[r.to] = (byAssignee[r.to] || 0) + 1
  }
  console.log('\nDistribution:')
  for (const [slug, count] of Object.entries(byAssignee).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${slug}: ${count} tasks`)
  }
}

main().catch(console.error)
