/**
 * Smoke test: verify all portal pages load without errors.
 * Run with: npx tsx scripts/smoke-test.ts [base_url]
 * Default: https://mn-ccore-lab.pages.dev
 */

const BASE = process.argv[2] || 'https://mn-ccore-lab.pages.dev'

const PORTAL_PAGES = [
  { path: '/dashboard', title: 'Dashboard' },
  { path: '/personal', title: 'My Hub' },
  { path: '/my-tasks', title: 'My Tasks' },
  { path: '/tasks', title: 'All Tasks' },
  { path: '/calendar', title: 'Calendar' },
  { path: '/deadlines', title: 'Deadlines' },
  { path: '/projects', title: 'Projects' },
  { path: '/manuscripts', title: 'Manuscripts' },
  { path: '/ideas', title: 'Ideas' },
  { path: '/digest', title: 'Literature' },
  { path: '/search', title: 'Search' },
  { path: '/grants', title: 'Grants' },
  { path: '/meetings', title: 'Meetings' },
  { path: '/meeting-notes', title: 'AI Notes' },
  { path: '/activity', title: 'Activity' },
  { path: '/analytics', title: 'Analytics' },
  { path: '/settings', title: 'Settings' },
  { path: '/pulse', title: 'Lab Pulse' },
]

const API_ENDPOINTS = [
  '/api/team',
  '/api/projects',
  '/api/publications',
  '/api/grants',
  '/api/tasks',
  '/api/meetings',
  '/api/ideas',
  '/api/stats',
  '/api/activity',
  '/api/search?q=test',
]

async function checkPage(path: string, label: string): Promise<{ ok: boolean; status: number; ms: number }> {
  const start = Date.now()
  try {
    const res = await fetch(`${BASE}${path}`, { redirect: 'follow' })
    return { ok: res.ok, status: res.status, ms: Date.now() - start }
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - start }
  }
}

async function checkApi(path: string): Promise<{ ok: boolean; status: number; ms: number; hasData: boolean }> {
  const start = Date.now()
  try {
    const res = await fetch(`${BASE}${path}`)
    const body = await res.json()
    return { ok: res.ok, status: res.status, ms: Date.now() - start, hasData: !!body.data }
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - start, hasData: false }
  }
}

async function main() {
  console.log(`\nSmoke testing: ${BASE}\n`)

  // Pages
  console.log('--- Portal Pages ---')
  let pagePass = 0, pageFail = 0
  for (const page of PORTAL_PAGES) {
    const result = await checkPage(page.path, page.title)
    const icon = result.ok ? '  PASS' : '  FAIL'
    console.log(`${icon}  ${page.title.padEnd(15)} ${page.path.padEnd(20)} ${result.status}  ${result.ms}ms`)
    if (result.ok) pagePass++; else pageFail++
  }

  // API
  console.log('\n--- API Endpoints ---')
  let apiPass = 0, apiFail = 0
  for (const endpoint of API_ENDPOINTS) {
    const result = await checkApi(endpoint)
    const icon = result.ok ? '  PASS' : '  FAIL'
    const data = result.hasData ? 'data:yes' : 'data:no'
    console.log(`${icon}  ${endpoint.padEnd(30)} ${result.status}  ${result.ms}ms  ${data}`)
    if (result.ok) apiPass++; else apiFail++
  }

  // Summary
  console.log(`\n--- Summary ---`)
  console.log(`Pages: ${pagePass}/${PORTAL_PAGES.length} passed`)
  console.log(`API:   ${apiPass}/${API_ENDPOINTS.length} passed`)

  if (pageFail > 0 || apiFail > 0) {
    console.log(`\nFAILURES: ${pageFail} pages, ${apiFail} APIs`)
    process.exit(1)
  } else {
    console.log(`\nAll checks passed.`)
  }
}

main()
