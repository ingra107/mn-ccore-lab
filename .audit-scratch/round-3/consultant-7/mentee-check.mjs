import { chromium, devices } from 'playwright'
const SITE = 'https://mn-ccore-lab.pages.dev'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
await p.goto(`${SITE}/mentee-milestones`, { waitUntil: 'networkidle', timeout: 30000 })
// Wait for activity fetch to complete
await p.waitForTimeout(2000)
const out = await p.evaluate(() => {
  const bodyText = document.body.innerText
  // Look for Quiet/Silent badges with Xd pattern
  const quietMatches = bodyText.match(/Quiet \d+d/g) || []
  const silentMatches = bodyText.match(/Silent \d+d/g) || []
  // Also grab mentee cards structure
  const menteeCards = [...document.querySelectorAll('button')].filter(b => {
    const t = b.textContent || ''
    return /Shyu|Fitzgerald|Collins|shyu|fitzgerald|collins/.test(t) && t.length < 400
  }).map(b => b.textContent.trim().replace(/\s+/g, ' ').slice(0, 200))
  return { quietMatches, silentMatches, menteeCards, bodyHasMilestone: /milestone/i.test(bodyText) }
})
console.log(JSON.stringify(out, null, 2))
await b.close()
