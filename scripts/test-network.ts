import { chromium } from 'playwright'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const page = await ctx.newPage()
  const errors: string[] = []
  const logs: string[] = []
  page.on('pageerror', e => errors.push('PAGEERR: ' + e.message))
  page.on('console', msg => {
    const t = msg.text().slice(0, 300)
    if (msg.type() === 'error') errors.push('ERR: ' + t)
    else if (msg.type() === 'warning') logs.push('WARN: ' + t)
    else if (t.includes('reagraph') || t.includes('WebGL') || t.includes('THREE')) logs.push('LOG: ' + t)
  })
  await page.goto('https://mn-ccore-lab.pages.dev/network', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(10000)

  // Check WebGL + reagraph state
  const state = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl')
    return {
      hasCanvas: !!canvas,
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      canvasVisible: canvas ? canvas.offsetWidth > 0 && canvas.offsetHeight > 0 : false,
      canvasOffsetW: canvas?.offsetWidth ?? 0,
      canvasOffsetH: canvas?.offsetHeight ?? 0,
      hasWebGL: !!gl,
      glVersion: gl ? (gl as WebGLRenderingContext).getParameter((gl as WebGLRenderingContext).VERSION) : null,
    }
  })
  await page.screenshot({ path: 'review/network-test.png', fullPage: false })
  console.log('state:', JSON.stringify(state, null, 2))
  console.log('errors (first 10):')
  errors.slice(0, 10).forEach(e => console.log('  ' + e))
  console.log('logs (first 10):')
  logs.slice(0, 10).forEach(l => console.log('  ' + l))
  await browser.close()
}

main().catch(e => { console.error(e); process.exit(1) })
