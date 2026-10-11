import { chromium } from '@playwright/test'

const BASE = 'https://mn-ccore-lab.pages.dev'

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

  // Probe row focus by directly focusing a row
  console.log('\n=== Row direct focus styling ===')
  await page.goto(BASE + '/portal/my-tasks', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const focusInfo: any = await page.evaluate(`(function(){
    var rows = document.querySelectorAll('.task-grid-row');
    if (rows.length === 0) return {err: 'no rows'};
    rows[0].focus();
    var ae = document.activeElement;
    var cs = getComputedStyle(ae);
    return {
      ae: ae === rows[0],
      outline: cs.outline,
      outlineWidth: cs.outlineWidth,
      outlineColor: cs.outlineColor,
      outlineOffset: cs.outlineOffset,
      boxShadow: cs.boxShadow,
      bg: cs.backgroundColor,
      hasFocusVisible: (function(){try{return ae.matches(':focus-visible');}catch(e){return null;}})(),
      hasFocus: (function(){try{return ae.matches(':focus');}catch(e){return null;}})()
    };
  })()`)
  console.log('Row focus:', JSON.stringify(focusInfo, null, 2))

  // Sidebar aria-current
  console.log('\n=== Sidebar aria-current on active link ===')
  await page.goto(BASE + '/portal/my-tasks', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const navInfo: any = await page.evaluate(`(function(){
    var aside = document.querySelector('aside');
    if (!aside) return {found: false};
    var links = Array.prototype.slice.call(aside.querySelectorAll('nav a'));
    return links.map(function(l){
      var s = getComputedStyle(l);
      return {
        href: l.getAttribute('href'),
        text: (l.textContent||'').trim().slice(0,15),
        ariaCurrent: l.getAttribute('aria-current') || 'NONE',
        active: s.color === 'rgb(92, 188, 180)' || s.fontWeight === '500'
      };
    }).slice(0,12);
  })()`)
  console.log('Nav links:', JSON.stringify(navInfo, null, 2))

  // hover-only badges
  console.log('\n=== Hover-only badges (visible to AT?) ===')
  await page.goto(BASE + '/portal/my-tasks', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const hoverBadges: any = await page.evaluate(`(function(){
    var badges = Array.prototype.slice.call(document.querySelectorAll('.hover-badge'));
    return badges.slice(0,3).map(function(b){
      var cs = getComputedStyle(b);
      return {
        text: (b.textContent||'').trim().slice(0,30),
        opacity: cs.opacity,
        visibility: cs.visibility,
        display: cs.display,
        ariaHidden: b.getAttribute('aria-hidden') || 'NONE'
      };
    });
  })()`)
  console.log('Hover badges (default state):', JSON.stringify(hoverBadges, null, 2))

  // Drag-to-reorder mode test
  console.log('\n=== Drag to reorder button — does pressing it expose keyboard reorder? ===')
  await page.goto(BASE + '/portal/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const beforePress: any = await page.evaluate(`(function(){
    var b = document.querySelector('button[aria-label*="reorder" i], button[aria-label*="Drag" i]');
    if (!b) return {found: false};
    return {
      ariaPressed: b.getAttribute('aria-pressed'),
      ariaExpanded: b.getAttribute('aria-expanded'),
      text: (b.textContent||'').trim().slice(0,30)
    };
  })()`)
  console.log('Before press:', JSON.stringify(beforePress))
  // Click it
  await page.evaluate(`(function(){
    var b = document.querySelector('button[aria-label*="reorder" i], button[aria-label*="Drag" i]');
    if (b) b.click();
  })()`)
  await page.waitForTimeout(500)
  const afterPress: any = await page.evaluate(`(function(){
    var b = document.querySelector('button[aria-label*="reorder" i], button[aria-label*="Drag" i], button[aria-label*="Done" i]');
    if (!b) return {found: false};
    return {
      ariaPressed: b.getAttribute('aria-pressed'),
      ariaExpanded: b.getAttribute('aria-expanded'),
      text: (b.textContent||'').trim().slice(0,30),
      // Check if any grid items now have keyboard handlers
      gridItems: document.querySelectorAll('.react-grid-item').length,
      tabbableItems: Array.prototype.slice.call(document.querySelectorAll('.react-grid-item')).filter(function(e){return e.tabIndex >= 0;}).length
    };
  })()`)
  console.log('After press:', JSON.stringify(afterPress))

  // Status messages frequency
  console.log('\n=== Last synced status — does it update text? ===')
  await page.goto(BASE + '/portal/my-tasks', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const t1: any = await page.evaluate(`(function(){
    var els = Array.prototype.slice.call(document.querySelectorAll('[role=status], [aria-live]'));
    return els.map(function(e){return (e.textContent||'').slice(0,60);});
  })()`)
  console.log('At T+0:', JSON.stringify(t1))
  await page.waitForTimeout(20000) // wait past one /api/version poll cycle (15s)
  const t2: any = await page.evaluate(`(function(){
    var els = Array.prototype.slice.call(document.querySelectorAll('[role=status], [aria-live]'));
    return els.map(function(e){return (e.textContent||'').slice(0,60);});
  })()`)
  console.log('At T+20s:', JSON.stringify(t2))

  // Hub-realtime polling — does data refresh announce?
  console.log('\n=== Subtask checkbox (in detail panel) keyboard reachable? ===')
  await page.goto(BASE + '/portal/my-tasks', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.evaluate(`(function(){
    var rows = document.querySelectorAll('.task-grid-row');
    if (rows.length > 0) {
      var btn = rows[0].querySelector('span[role="button"]');
      if (btn) btn.click();
    }
  })()`)
  await page.waitForTimeout(800)
  const subtasks: any = await page.evaluate(`(function(){
    var sub = document.querySelectorAll('input[type=checkbox], button[role="checkbox"], [role="checkbox"]');
    return Array.prototype.slice.call(sub).slice(0,5).map(function(c){
      return {
        tag: c.tagName,
        type: c.getAttribute('type') || '',
        ariaLabel: c.getAttribute('aria-label') || (c.getAttribute('aria-labelledby')) || '',
        ariaChecked: c.getAttribute('aria-checked') || (c.checked !== undefined ? c.checked : '?'),
        tabIndex: c.tabIndex
      };
    });
  })()`)
  console.log('Checkboxes in panel:', JSON.stringify(subtasks, null, 2))

  await ctx.close()
  await browser.close()
}

main().catch(console.error)
