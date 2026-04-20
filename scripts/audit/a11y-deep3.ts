/**
 * Round 3 — final probes: focus indicator on rows, contrast on inactive sidebar text,
 * panel trap leak verification, status pill semantics on plain status (not Project).
 */
import { chromium } from '@playwright/test'

const BASE = 'https://mn-ccore-lab.pages.dev'

function relLuminance(r: number, g: number, b: number) {
  function ch(c: number) {
    c = c / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}
function contrast(a: string, b: string): number {
  const parse = (s: string): [number, number, number] => {
    const m = s.match(/(\d+(?:\.\d+)?)/g)
    if (!m) return [0, 0, 0]
    return [parseFloat(m[0]), parseFloat(m[1]), parseFloat(m[2])]
  }
  const [r1, g1, b1] = parse(a)
  const [r2, g2, b2] = parse(b)
  const l1 = relLuminance(r1, g1, b1)
  const l2 = relLuminance(r2, g2, b2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  })
  await ctx.addInitScript(`window.localStorage.setItem('mn-ccore-theme', 'dark');`)
  const page = await ctx.newPage()
  page.setDefaultTimeout(15000)

  // ── Probe A: focus visibility on TaskGridView rows (Tab to land on .task-grid-row)
  console.log('\n=== A: Focus indicator on .task-grid-row (Tab through to a row) ===')
  await page.goto(BASE + '/tasks', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  // Tab until we land on a task-grid-row
  let landed = false
  for (let i = 0; i < 50; i++) {
    await page.keyboard.press('Tab')
    const isRow: any = await page.evaluate(`(function(){
      var ae = document.activeElement;
      if (!ae) return null;
      return {isRow: ae.classList && ae.classList.contains('task-grid-row'), tag: ae.tagName, classes: (ae.className||'').toString().slice(0,80)};
    })()`)
    if (isRow && isRow.isRow) {
      landed = true
      const focus: any = await page.evaluate(`(function(){
        var el = document.activeElement;
        var cs = getComputedStyle(el);
        return {
          outline: cs.outline,
          outlineWidth: cs.outlineWidth,
          outlineColor: cs.outlineColor,
          boxShadow: cs.boxShadow,
          background: cs.backgroundColor
        };
      })()`)
      console.log('Row focus styles:', JSON.stringify(focus, null, 2))
      break
    }
  }
  if (!landed) console.log('Could not land on a task-grid-row via Tab (50 tabs)')

  // ── Probe B: Inactive sidebar text contrast against actual sidebar bg
  console.log('\n=== B: Sidebar inactive text contrast (rgb(176,181,185) on actual sidebar bg) ===')
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const sb: any = await page.evaluate(`(function(){
    var aside = document.querySelector('aside');
    if (!aside) return {found: false};
    var s = getComputedStyle(aside);
    var nav = aside.querySelector('nav');
    var navStyle = nav ? getComputedStyle(nav) : null;
    return {
      asideBg: s.backgroundColor,
      navBg: navStyle ? navStyle.backgroundColor : '',
      // get the body bg too
      bodyBg: getComputedStyle(document.body).backgroundColor
    };
  })()`)
  console.log('Sidebar bg:', JSON.stringify(sb))
  // From probe 6: inactive text rgb(176, 181, 185), bg color-mix(cream, black 12%)
  // computed bg likely close to rgb(28, 30, 35) area
  const inactiveText = 'rgb(176, 181, 185)'
  const navBg = sb.navBg || sb.asideBg
  // Try to compute: oklch likely resolves to something like rgb(20-30, 20-30, 25-30)
  // We can resolve via JS
  const resolved: any = await page.evaluate(`(function(){
    var d = document.createElement('div');
    d.style.position = 'absolute';
    d.style.backgroundColor = 'color-mix(in oklch, var(--cream), black 12%)';
    document.body.appendChild(d);
    var c = getComputedStyle(d).backgroundColor;
    document.body.removeChild(d);
    return c;
  })()`)
  console.log('Resolved sidebar bg:', resolved)
  const ratio = contrast(inactiveText, resolved)
  console.log(`Contrast ratio inactive text vs sidebar bg = ${ratio.toFixed(2)}:1 (need 4.5:1 for AA)`)

  // ── Probe C: Tab leak from panel
  console.log('\n=== C: TaskDetailPanel — does tab cycle properly inside? ===')
  await page.goto(BASE + '/tasks', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.evaluate(`(function(){
    var rows = document.querySelectorAll('.task-grid-row');
    if (rows.length > 0) {
      var btn = rows[0].querySelector('span[role="button"]');
      if (btn) btn.click();
    }
  })()`)
  await page.waitForTimeout(800)
  // Tab 5x at a time, see where we end up
  for (let block = 1; block <= 6; block++) {
    for (let i = 0; i < 5; i++) await page.keyboard.press('Tab')
    const ae: any = await page.evaluate(`(function(){
      var p = document.querySelector('[role=dialog][aria-modal="true"]');
      var ae = document.activeElement;
      return {
        focusInside: !!(p && ae && p.contains(ae)),
        focusedTag: ae ? ae.tagName : 'none',
        focusedAria: ae ? (ae.getAttribute('aria-label') || (ae.textContent||'').trim().slice(0,40)) : '',
        focusedClasses: ae ? (ae.className||'').toString().slice(0,80) : ''
      };
    })()`)
    console.log(`Block ${block} (${block * 5} tabs):`, JSON.stringify(ae))
  }

  // ── Probe D: ProjectDetail page inline editing
  console.log('\n=== D: ProjectDetail page status field ===')
  await page.goto(BASE + '/projects', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  // Find first project link
  const proj: any = await page.evaluate(`(function(){
    var a = document.querySelector('main a[href^="/projects/"], main a[href*="/projects/"]:not([href="/projects"])');
    if (!a) return {found: false};
    return {href: a.getAttribute('href'), text: (a.textContent||'').trim().slice(0,40)};
  })()`)
  console.log('First project link:', JSON.stringify(proj))

  // ── Probe E: Realtime sync — when /api/version updates, is anything announced?
  console.log('\n=== E: Realtime sync — aria-live announcements? ===')
  await page.goto(BASE + '/tasks', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const liveRegions: any = await page.evaluate(`(function(){
    var regions = Array.prototype.slice.call(document.querySelectorAll('[aria-live], [role=status], [role=alert]'));
    return regions.map(function(r){
      return {
        tag: r.tagName,
        live: r.getAttribute('aria-live') || '',
        role: r.getAttribute('role') || '',
        atomic: r.getAttribute('aria-atomic') || '',
        text: (r.textContent||'').trim().slice(0,40),
        hidden: r.hidden || (getComputedStyle(r).display === 'none')
      };
    });
  })()`)
  console.log('Live regions on /tasks:', JSON.stringify(liveRegions, null, 2))

  // ── Probe F: Skip to content link visibility on focus
  console.log('\n=== F: Skip to content link on Tab ===')
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.keyboard.press('Tab')
  const skip: any = await page.evaluate(`(function(){
    var ae = document.activeElement;
    if (!ae) return null;
    var r = ae.getBoundingClientRect();
    var cs = getComputedStyle(ae);
    return {
      tag: ae.tagName,
      text: (ae.textContent||'').trim(),
      width: Math.round(r.width),
      height: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
      position: cs.position,
      zIndex: cs.zIndex,
      transform: cs.transform,
      clip: cs.clip,
      clipPath: cs.clipPath
    };
  })()`)
  console.log('Skip link on focus:', JSON.stringify(skip, null, 2))

  // ── Probe G: Status pill in row — look for plain status (not project)
  console.log('\n=== G: All combobox semantics inside .task-grid-row ===')
  await page.goto(BASE + '/tasks', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const combos: any = await page.evaluate(`(function(){
    var row = document.querySelector('.task-grid-row');
    if (!row) return [];
    var cs = Array.prototype.slice.call(row.querySelectorAll('[role=combobox], [role=button]'));
    return cs.map(function(c){
      return {
        role: c.getAttribute('role'),
        ariaLabel: (c.getAttribute('aria-label') || '').slice(0,80),
        haspop: c.getAttribute('aria-haspopup') || '',
        tag: c.tagName
      };
    });
  })()`)
  console.log('Comboboxes/buttons in row:', JSON.stringify(combos, null, 2))

  // ── Probe H: Light mode focus indicator
  console.log('\n=== H: LIGHT mode focus indicator on row ===')
  await ctx.close()
  const ctxL = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  })
  await ctxL.addInitScript(`window.localStorage.setItem('mn-ccore-theme', 'light');`)
  const page2 = await ctxL.newPage()
  page2.setDefaultTimeout(15000)
  await page2.goto(BASE + '/tasks', { waitUntil: 'domcontentloaded' })
  await page2.waitForTimeout(2500)
  for (let i = 0; i < 50; i++) {
    await page2.keyboard.press('Tab')
    const isRow: any = await page2.evaluate(`(function(){
      var ae = document.activeElement;
      return ae && ae.classList && ae.classList.contains('task-grid-row');
    })()`)
    if (isRow) {
      const f: any = await page2.evaluate(`(function(){
        var el = document.activeElement;
        var cs = getComputedStyle(el);
        return {outline: cs.outline, boxShadow: cs.boxShadow, bg: cs.backgroundColor};
      })()`)
      console.log('Light-mode row focus:', JSON.stringify(f))
      break
    }
  }
  await ctxL.close()
  await browser.close()
}

main().catch(console.error)
