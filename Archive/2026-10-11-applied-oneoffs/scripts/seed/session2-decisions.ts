/**
 * Session 2: Seed 8 real decisions to prod Hub.
 * Usage: npx tsx scripts/seed/session2-decisions.ts
 */

const HUB = process.env.HUB_API_URL || 'https://mn-ccore-lab.pages.dev'
const KEY = process.env.PB_API_KEY || ''

if (!KEY) {
  console.error('PB_API_KEY env var required')
  process.exit(1)
}

const decisions = [
  { title: 'Hub design pivot: operational over editorial', rationale: 'Editorial aesthetic made the Hub feel amateur. Operational tools need clean data tables, dark-first mode, inline editing. 7 design rules established.', decided_by: 'nick', project_slug: 'mn-ccore-lab-hub', tags: ['design', 'architecture'] },
  { title: 'D1 as cloud truth, brain.db as local cache', rationale: 'Eliminates CRDT merge complexity. Both machines talk to D1 via API. Pull on session start, push in background.', decided_by: 'nick', project_slug: 'mn-ccore-lab-hub', tags: ['architecture', 'sync'] },
  { title: 'Grant status taxonomy locked (7 values)', rationale: 'planning, in_preparation, submitted, under_review, funded, not_funded, completed. Shared between Hub and brain.db via enums.py.', decided_by: 'nick', tags: ['taxonomy', 'grants'] },
  { title: 'Dashboard cards resizable via react-grid-layout', rationale: 'Users customize their dashboard layout. Drag handle + SE resize, persisted per-user in localStorage.', decided_by: 'nick', project_slug: 'mn-ccore-lab-hub', tags: ['ux', 'dashboard'] },
  { title: 'CCI in ARDS manuscript to PLOS One', rationale: 'After reviewer feedback, PLOS One is the best fit for the CCI trajectory analysis. Revision addresses all 15 reviewer comments.', decided_by: 'nick', project_slug: 'cci-in-ards', tags: ['manuscripts', 'submission'] },
  { title: 'SCAFFOLD collaboration with Zach Landis-Lewis', rationale: 'R01 on LPV Precision Practice needs feedback delivery mechanism. SCAFFOLD provides the platform and GDMS decision-making styles for personalized messaging.', decided_by: 'nick', project_slug: 'r01-lpv-precision-practice-assistance', tags: ['collaboration', 'grants'] },
  { title: 'Hermes AI response latency acceptable at 60s', rationale: 'Reduced polling from 20s to 60s. Saves 5,400 Worker requests/day. Team members rarely need sub-minute AI responses.', decided_by: 'nick', project_slug: 'mn-ccore-lab-hub', tags: ['infrastructure', 'performance'] },
  { title: 'Miniflare replaces X-Test-Mode for local testing', rationale: 'X-Test-Mode routed to empty DB_TEST causing silent false positives. Miniflare gives full local D1 with seeded data. 6 journey specs + 5 data-validation.', decided_by: 'nick', project_slug: 'mn-ccore-lab-hub', tags: ['testing', 'infrastructure'] },
]

async function main() {
  for (const decision of decisions) {
    const res = await fetch(`${HUB}/api/decisions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${KEY}`,
      },
      body: JSON.stringify({
        ...decision,
        tags: JSON.stringify(decision.tags),
      }),
    })
    const status = res.status
    const body = await res.json().catch(() => ({}))
    console.log(`[${status}] ${decision.title.slice(0, 55)}...`)
    if (status >= 400) {
      console.error('  Error:', JSON.stringify(body))
    }
  }
  console.log('\nDone. Verify at: https://mn-ccore-lab.pages.dev/decisions')
}

main().catch(console.error)
