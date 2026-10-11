/**
 * Round 2 — additional probes to confirm/deny ambiguous findings
 * and add coverage for edge cases.
 */
import { chromium, type Page } from '@playwright/test'

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

  console.log('\n=== Probe 1: Cmd+K Escape close ===')
  await page.goto(BASE + '/portal/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(600)
  const beforeEsc: any = await page.evaluate(`(function(){
    var d = document.querySelector('[role=dialog]');
    return {
      dialogPresent: !!d,
      visible: d ? (d.getBoundingClientRect().width > 0 && getComputedStyle(d).visibility !== 'hidden' && getComputedStyle(d).display !== 'none') : false,
      ae: document.activeElement ? (document.activeElement.tagName + ' ' + (document.activeElement.getAttribute('aria-label') || (document.activeElement.textContent||'').slice(0,30))) : 'none'
    };
  })()`)
  console.log('Before Esc:', JSON.stringify(beforeEsc))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(800)
  const afterEsc: any = await page.evaluate(`(function(){
    var d = document.querySelector('[role=dialog]');
    return {
      dialogPresent: !!d,
      visible: d ? (d.getBoundingClientRect().width > 0 && getComputedStyle(d).visibility !== 'hidden' && getComputedStyle(d).display !== 'none') : false,
      input: !!document.querySelector('input[placeholder*="Search" i]'),
      ae: document.activeElement ? (document.activeElement.tagName + ' ' + (document.activeElement.getAttribute('aria-label') || (document.activeElement.textContent||'').slice(0,30))) : 'none'
    };
  })()`)
  console.log('After Esc:', JSON.stringify(afterEsc))

  console.log('\n=== Probe 2: TaskGridView row semantics ===')
  await page.goto(BASE + '/portal/my-tasks', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const rows: any = await page.evaluate(`(function(){
    var rows = Array.prototype.slice.call(document.querySelectorAll('.task-grid-row'));
    if (rows.length === 0) {
      // fallback
      rows = Array.prototype.slice.call(document.querySelectorAll('[class*="task-row"], [class*="TaskRow"]'));
    }
    var sample = rows.slice(0,3).map(function(r){
      return {
        tag: r.tagName,
        role: r.getAttribute('role') || 'NONE',
        tabIndex: r.tabIndex,
        ariaLabel: r.getAttribute('aria-label') || '',
        ariaLabelledBy: r.getAttribute('aria-labelledby') || ''
      };
    });
    return {total: rows.length, sample: sample};
  })()`)
  console.log('Rows:', JSON.stringify(rows, null, 2))

  console.log('\n=== Probe 3: TaskDetailPanel close button placement ===')
  await page.goto(BASE + '/portal/my-tasks', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  // Click first task row
  await page.evaluate(`(function(){
    var rows = document.querySelectorAll('.task-grid-row');
    if (rows.length > 0) {
      var btn = rows[0].querySelector('span[role="button"]');
      if (btn) btn.click();
    }
  })()`)
  await page.waitForTimeout(800)
  const panel: any = await page.evaluate(`(function(){
    var p = document.querySelector('aside[aria-modal], [role=dialog], [class*="DetailPanel"]');
    if (!p) {
      // try any aside
      p = document.querySelector('aside');
    }
    if (!p) return {found: false};
    var ae = document.activeElement;
    return {
      found: true,
      tag: p.tagName,
      role: p.getAttribute('role') || '',
      ariaModal: p.getAttribute('aria-modal') || '',
      label: p.getAttribute('aria-label') || p.getAttribute('aria-labelledby') || '',
      focusedTag: ae ? ae.tagName + ' "' + (ae.getAttribute('aria-label') || (ae.textContent||'').trim().slice(0,30)) + '"' : 'NONE',
      focusInside: !!(ae && p.contains(ae))
    };
  })()`)
  console.log('Panel:', JSON.stringify(panel, null, 2))

  console.log('\n=== Probe 4: Status pill on a task row ===')
  const status: any = await page.evaluate(`(function(){
    // Click somewhere not a row first
    document.body.focus();
    var sel = document.querySelector('.task-grid-row [role="combobox"]');
    if (!sel) return {found: false};
    return {
      found: true,
      role: sel.getAttribute('role'),
      ariaLabel: sel.getAttribute('aria-label'),
      ariaHaspopup: sel.getAttribute('aria-haspopup'),
      ariaExpanded: sel.getAttribute('aria-expanded'),
      tag: sel.tagName
    };
  })()`)
  console.log('Status:', JSON.stringify(status, null, 2))

  console.log('\n=== Probe 5: Close panel + check focus restore ===')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  const afterClose: any = await page.evaluate(`(function(){
    var p = document.querySelector('aside[aria-modal], [role=dialog]');
    var ae = document.activeElement;
    return {
      panelStillThere: !!p,
      ae: ae ? ae.tagName + ' "' + (ae.getAttribute('aria-label') || (ae.textContent||'').trim().slice(0,30)) + '"' : 'NONE'
    };
  })()`)
  console.log('AfterPanelClose:', JSON.stringify(afterClose))

  console.log('\n=== Probe 6: Sidebar text-on-bg contrast (inactive) ===')
  await page.goto(BASE + '/portal/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const sb: any = await page.evaluate(`(function(){
    var nav = document.querySelector('aside nav, nav');
    if (!nav) return {found: false};
    var navStyle = getComputedStyle(nav.parentElement || nav);
    var links = Array.prototype.slice.call(nav.querySelectorAll('a'));
    var samples = links.slice(0,5).map(function(l){
      var s = getComputedStyle(l);
      return {
        text: (l.textContent||'').trim().slice(0,15),
        color: s.color,
        opacity: s.opacity,
        bg: getComputedStyle(l).backgroundColor
      };
    });
    return {sidebarBg: navStyle.backgroundColor, samples: samples};
  })()`)
  console.log('Sidebar:', JSON.stringify(sb, null, 2))

  console.log('\n=== Probe 7: Dashboard "Drag to reorder" button keyboard test ===')
  await page.goto(BASE + '/portal/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const drag: any = await page.evaluate(`(function(){
    var b = document.querySelector('button[aria-label*="reorder" i], button[aria-label*="Drag" i], button[aria-label*="customize" i]');
    if (!b) return {found: false};
    return {
      found: true,
      ariaLabel: b.getAttribute('aria-label'),
      ariaPressed: b.getAttribute('aria-pressed'),
      ariaExpanded: b.getAttribute('aria-expanded'),
      role: b.getAttribute('role') || 'button'
    };
  })()`)
  console.log('Drag button:', JSON.stringify(drag, null, 2))

  console.log('\n=== Probe 8: TaskDetailPanel inside-content (rich text editor focus trap?) ===')
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
  // Tab a few times — see if focus stays in panel
  for (let i = 0; i < 30; i++) await page.keyboard.press('Tab')
  const inside: any = await page.evaluate(`(function(){
    var p = document.querySelector('aside[aria-modal], [role=dialog], [class*="DetailPanel"]');
    if (!p) p = document.querySelector('aside');
    var ae = document.activeElement;
    return {
      panelExists: !!p,
      focusInside: !!(p && ae && p.contains(ae)),
      focusedTag: ae ? ae.tagName : 'none',
      focusedAria: ae ? (ae.getAttribute('aria-label') || (ae.textContent||'').trim().slice(0,40)) : ''
    };
  })()`)
  console.log('After 30 tabs in panel:', JSON.stringify(inside))

  console.log('\n=== Probe 9: H1 headings per page ===')
  for (const path of ['/portal/dashboard', '/portal/my-tasks', '/portal/projects', '/portal/meetings', '/portal/personal', '/team', '/portal/settings']) {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    const h: any = await page.evaluate(`(function(){
      var h1s = Array.prototype.slice.call(document.querySelectorAll('h1'));
      return h1s.map(function(h){return (h.textContent||'').trim().slice(0,40);});
    })()`)
    console.log(`${path}: H1=${JSON.stringify(h)}`)
  }

  console.log('\n=== Probe 10: Mobile bottom tab bar ===')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(BASE + '/portal/my-tasks', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const mt: any = await page.evaluate(`(function(){
    var tabs = Array.prototype.slice.call(document.querySelectorAll('a, [role=tab]'));
    var bottom = tabs.filter(function(t){
      var r = t.getBoundingClientRect();
      return r.top > 750 && r.bottom < 900 && r.width > 30 && r.height > 30;
    });
    return bottom.map(function(t){
      var r = t.getBoundingClientRect();
      return {
        text: (t.textContent||'').trim().slice(0,20),
        href: t.getAttribute('href') || '',
        ariaCurrent: t.getAttribute('aria-current') || 'NONE',
        w: Math.round(r.width),
        h: Math.round(r.height)
      };
    });
  })()`)
  console.log('Mobile tabs:', JSON.stringify(mt, null, 2))

  await ctx.close()
  await browser.close()
}

main().catch(console.error)
