/**
 * Deep accessibility audit — what axe-core can't see.
 * Uses string-form page.evaluate to avoid tsx name-annotation issues.
 */
import { chromium, type Page, type Browser } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const BASE = process.env.PREFLIGHT_BASE || 'https://mn-ccore-lab.pages.dev'
const RUN_ID = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 14)
const OUT_DIR = join('review', 'a11y-deep', RUN_ID)
mkdirSync(OUT_DIR, { recursive: true })

interface Finding {
  id: string
  severity: 'P0' | 'P1' | 'P2' | 'INFO'
  page: string
  observed: string
  wcag?: string
}
const findings: Finding[] = []
function record(f: Finding) {
  findings.push(f)
  console.log(`[${f.severity}] ${f.id} @ ${f.page} — ${f.observed.slice(0, 200)}`)
}

async function setupPage(browser: Browser, mode: 'light' | 'dark' = 'dark') {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: mode,
    reducedMotion: 'reduce',
  })
  await ctx.addInitScript(`window.localStorage.setItem('mn-ccore-theme', '${mode}');`)
  const page = await ctx.newPage()
  page.setDefaultTimeout(15000)
  return { ctx, page }
}

async function go(page: Page, path: string) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
}

async function auditLandmarks(page: Page, path: string) {
  await go(page, path)
  const landmarks: any = await page.evaluate(`(function(){
    function get(sel){
      var arr = Array.prototype.slice.call(document.querySelectorAll(sel));
      return arr.map(function(e){
        return {tag: e.tagName.toLowerCase(), label: e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || '', role: e.getAttribute('role') || ''};
      });
    }
    return {
      nav: get('nav, [role=navigation]'),
      main: get('main, [role=main]'),
      h1: Array.prototype.slice.call(document.querySelectorAll('h1')).map(function(h){return (h.textContent||'').trim();})
    };
  })()`)
  if (landmarks.main.length === 0) {
    record({ id: 'LM-NO-MAIN', severity: 'P1', page: path, observed: 'no <main> landmark', wcag: '1.3.1 Info and Relationships' })
  }
  if (landmarks.main.length > 1) {
    record({ id: 'LM-MULTI-MAIN', severity: 'P1', page: path, observed: `${landmarks.main.length} <main> landmarks (only one allowed per page)`, wcag: '1.3.1' })
  }
  const unlabeledNavs = landmarks.nav.filter((n: any) => !n.label)
  if (landmarks.nav.length > 1 && unlabeledNavs.length > 0) {
    record({ id: 'LM-NAV-UNLABELED', severity: 'P1', page: path, observed: `${unlabeledNavs.length}/${landmarks.nav.length} <nav> elements have no aria-label (multiple navs require distinct labels)`, wcag: '1.3.1' })
  }
  if (landmarks.h1.length === 0) {
    record({ id: 'H1-MISSING', severity: 'P1', page: path, observed: 'no <h1> on page', wcag: '2.4.6 Headings and Labels' })
  } else if (landmarks.h1.length > 1) {
    record({ id: 'H1-MULTI', severity: 'P2', page: path, observed: `${landmarks.h1.length} <h1> elements: ${landmarks.h1.slice(0, 3).join(' | ')}`, wcag: '1.3.1' })
  }
}

async function auditTableSemantics(page: Page, path: string) {
  await go(page, path)
  const info: any = await page.evaluate(`(function(){
    var grids = document.querySelectorAll('[role=grid], table, [role=table]').length;
    var rows = document.querySelectorAll('[role=row], tr').length;
    var cells = document.querySelectorAll('[role=gridcell], [role=cell], td').length;
    var colHeaders = document.querySelectorAll('[role=columnheader], th').length;
    return {gridCount: grids, rowCount: rows, cellCount: cells, colHeaderCount: colHeaders};
  })()`)
  const dataPages = ['/portal/my-tasks', '/portal/projects', '/portal/manuscripts', '/portal/deadlines', '/portal/ideas', '/portal/decisions', '/portal/grants']
  if (dataPages.includes(path)) {
    if (info.gridCount === 0 && info.colHeaderCount === 0) {
      record({
        id: 'GRID-NO-ROLE',
        severity: 'P1',
        page: path,
        observed: 'Data page renders columnar layout but has 0 role=grid / role=table / role=columnheader. Screen reader users get no row/column navigation; they hear an undifferentiated stream of div content.',
        wcag: '1.3.1 Info and Relationships',
      })
    }
  }
}

async function auditFocusVisibility(page: Page, path: string) {
  await go(page, path)
  let invisibleFocus = 0
  let totalChecked = 0
  const examples: string[] = []
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(40)
    const data: any = await page.evaluate(`(function(){
      var el = document.activeElement;
      if (!el || el === document.body || el.tagName === 'HTML') return null;
      var cs = window.getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || '',
        label: (el.getAttribute('aria-label') || (el.textContent||'').trim().slice(0,50)),
        outlineW: cs.outlineWidth, outlineStyle: cs.outlineStyle, boxShadow: cs.boxShadow,
        bg: cs.backgroundColor
      };
    })()`)
    if (!data) continue
    totalChecked++
    const noOutline = (data.outlineW === '0px' || data.outlineStyle === 'none') && (data.boxShadow === 'none' || !data.boxShadow)
    if (noOutline) {
      invisibleFocus++
      if (examples.length < 3) examples.push(`<${data.tag} role=${data.role}> "${data.label}"`)
    }
  }
  if (invisibleFocus > 0) {
    record({
      id: 'FOCUS-INVISIBLE',
      severity: invisibleFocus > 3 ? 'P1' : 'P2',
      page: path,
      observed: `${invisibleFocus}/${totalChecked} tabbable elements have NO visible focus indicator. Examples: ${examples.join('; ')}`,
      wcag: '2.4.7 Focus Visible',
    })
  }
}

async function auditIconButtons(page: Page, path: string) {
  await go(page, path)
  const unlabeled: any = await page.evaluate(`(function(){
    var btns = Array.prototype.slice.call(document.querySelectorAll('button, a[role=button], [role=button]'));
    var offenders = [];
    for (var i = 0; i < btns.length; i++) {
      var el = btns[i];
      var text = (el.textContent || '').replace(/\\s+/g,' ').trim();
      var aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title');
      if (text.length > 1) continue;
      if (aria && aria.trim().length > 0) continue;
      var svg = el.querySelector('svg');
      if (!svg) continue;
      offenders.push({outerHTML: el.outerHTML.slice(0,160), classes: (el.className || '').toString().slice(0,80)});
      if (offenders.length >= 8) break;
    }
    return offenders;
  })()`)
  if (unlabeled.length > 0) {
    record({
      id: 'ICON-BTN-UNLABELED',
      severity: 'P0',
      page: path,
      observed: `${unlabeled.length}+ icon-only button(s) with no accessible name. First: ${unlabeled[0].outerHTML}`,
      wcag: '4.1.2 Name, Role, Value / 2.4.4 Link Purpose',
    })
  }
}

async function auditSkeletonsHiddenFromAT(page: Page, path: string) {
  await page.goto(BASE + path, { waitUntil: 'commit' })
  await page.waitForTimeout(150)
  const result: any = await page.evaluate(`(function(){
    var skeletons = Array.prototype.slice.call(document.querySelectorAll('[class*="skeleton"], [class*="Skeleton"], [data-skeleton], [class*="animate-pulse"]'));
    var hidden = 0; var exposed = 0;
    for (var i = 0; i < skeletons.length; i++) {
      var s = skeletons[i];
      var ah = s.getAttribute('aria-hidden');
      var role = s.getAttribute('role');
      var live = s.getAttribute('aria-live');
      if (ah === 'true' || role === 'presentation' || role === 'none') hidden++;
      else exposed++;
    }
    return {total: skeletons.length, hidden: hidden, exposed: exposed};
  })()`)
  if (result.exposed > 0) {
    record({
      id: 'SKEL-EXPOSED-AT',
      severity: 'P2',
      page: path,
      observed: `${result.exposed}/${result.total} loading skeletons exposed to AT (no aria-hidden=true / no role=presentation). SR users hear empty scaffolding while page loads.`,
      wcag: '1.3.1',
    })
  }
}

async function auditAvatarAlt(page: Page, path: string) {
  await go(page, path)
  const issues: any = await page.evaluate(`(function(){
    var imgs = Array.prototype.slice.call(document.querySelectorAll('img'));
    var bad = [];
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var alt = img.getAttribute('alt');
      var ah = img.getAttribute('aria-hidden');
      if (alt === null && ah !== 'true') {
        bad.push({src: (img.src||'').slice(-50), classes: (img.className||'').toString().slice(0,40)});
      }
      if (bad.length >= 5) break;
    }
    return bad;
  })()`)
  if (issues.length > 0) {
    record({
      id: 'IMG-NO-ALT',
      severity: 'P1',
      page: path,
      observed: `${issues.length}+ <img> tags with no alt and no aria-hidden. First: ...${issues[0].src}`,
      wcag: '1.1.1 Non-text Content',
    })
  }
}

async function auditCmdK(page: Page) {
  await go(page, '/portal/dashboard')
  await page.waitForTimeout(800)
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(500)
  const opened: any = await page.evaluate(`(function(){
    var d = document.querySelector('[role=dialog], [aria-modal="true"]');
    if (!d) return {found: false};
    var ae = document.activeElement;
    return {
      found: true,
      role: d.getAttribute('role') || '',
      ariaModal: d.getAttribute('aria-modal') || '',
      label: d.getAttribute('aria-label') || d.getAttribute('aria-labelledby') || '',
      focusInside: !!(ae && d.contains(ae)),
      focusedEl: ae ? (ae.tagName + ' ' + (ae.getAttribute('aria-label') || (ae.textContent||'').slice(0,30))) : 'none'
    };
  })()`)
  if (!opened.found) {
    record({ id: 'CMDK-NO-DIALOG', severity: 'P1', page: '/dashboard', observed: 'Cmd+K opened something but no role=dialog or aria-modal element exists' })
    return
  }
  if (!opened.focusInside) {
    record({ id: 'CMDK-FOCUS-OUTSIDE', severity: 'P0', page: '/dashboard', observed: `Cmd+K modal opened but focus stayed outside (focused: ${opened.focusedEl})`, wcag: '2.4.3 Focus Order' })
  }
  // Test trap: 20 Tabs
  for (let i = 0; i < 20; i++) await page.keyboard.press('Tab')
  const stillTrapped: any = await page.evaluate(`(function(){
    var d = document.querySelector('[role=dialog], [aria-modal="true"]');
    return {trapped: !!(d && document.activeElement && d.contains(document.activeElement))};
  })()`)
  if (!stillTrapped.trapped) {
    record({ id: 'CMDK-TRAP-LEAK', severity: 'P0', page: '/dashboard', observed: 'After 20 Tabs, focus escaped Cmd+K dialog. Modal trap is broken.', wcag: '2.4.3' })
  }
  // Escape close
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const closed: any = await page.evaluate(`(function(){
    var d = document.querySelector('[role=dialog], [aria-modal="true"]');
    return {closed: !d, ae: document.activeElement ? document.activeElement.tagName : 'none'};
  })()`)
  if (!closed.closed) {
    record({ id: 'CMDK-NO-ESC', severity: 'P1', page: '/dashboard', observed: 'Escape key did not close Cmd+K modal', wcag: '2.1.2' })
  }
  if (closed.ae === 'BODY') {
    record({ id: 'CMDK-FOCUS-LOST', severity: 'P1', page: '/dashboard', observed: 'After closing Cmd+K, focus dropped to <body>. Should restore to opener.', wcag: '2.4.3' })
  }
}

async function auditKbdInInputs(page: Page) {
  await go(page, '/portal/my-tasks')
  await page.waitForTimeout(1000)
  // Find any text input
  const focused: any = await page.evaluate(`(function(){
    var i = document.querySelector('input[type=text], input[type=search], input:not([type]), textarea');
    if (!i) return {found: false};
    i.focus();
    return {found: true, tag: i.tagName, type: i.type || ''};
  })()`)
  if (!focused.found) {
    record({ id: 'INPUT-NONE', severity: 'INFO', page: '/tasks', observed: 'No text input found on /tasks; cannot test J/K-while-typing regression directly' })
    return
  }
  await page.keyboard.type('jkn')
  await page.waitForTimeout(200)
  const result: any = await page.evaluate(`(function(){
    var ae = document.activeElement;
    return {tag: ae ? ae.tagName : '', val: (ae && ae.value) || '', dialogOpen: !!document.querySelector('[role=dialog], [aria-modal="true"]')};
  })()`)
  if (!result.val.includes('j') || !result.val.includes('k')) {
    record({ id: 'KBD-EATEN-IN-INPUT', severity: 'P0', page: '/tasks', observed: `Typed "jkn" in <${result.tag}> but value="${result.val}". Keyboard shortcuts are hijacking text input.`, wcag: '2.1.1' })
  }
  if (result.dialogOpen && !result.val.includes('n')) {
    record({ id: 'KBD-N-OPENED-MODAL', severity: 'P0', page: '/tasks', observed: `Pressing "n" in input opened a modal AND ate the keystroke`, wcag: '2.1.1' })
  }
}

async function auditDashDrag(page: Page) {
  await go(page, '/portal/dashboard')
  await page.waitForTimeout(2000)
  const info: any = await page.evaluate(`(function(){
    var items = document.querySelectorAll('.react-grid-item').length;
    var resizable = document.querySelectorAll('.react-resizable-handle').length;
    var grip = document.querySelectorAll('[class*="grip"], [class*="Grip"]').length;
    var customizeBtn = document.querySelector('button[aria-label*="customize" i], button[aria-label*="reorder" i], button[aria-label*="layout" i]');
    return {
      items: items,
      resizable: resizable,
      grip: grip,
      customizeBtn: customizeBtn ? (customizeBtn.getAttribute('aria-label') || '') : null
    };
  })()`)
  if (info.items > 0) {
    if (!info.customizeBtn) {
      record({
        id: 'DASH-DRAG-NO-KBD',
        severity: 'P0',
        page: '/dashboard',
        observed: `${info.items} react-grid-layout cards, ${info.resizable} resize handles, ${info.grip} grip handles. No "customize"/"reorder"/"layout" button found with aria-label. Keyboard-only & motor-impaired users cannot rearrange or resize the dashboard.`,
        wcag: '2.1.1 Keyboard',
      })
    } else {
      record({
        id: 'DASH-DRAG-CHECK-KBD',
        severity: 'INFO',
        page: '/dashboard',
        observed: `Customize button exists ("${info.customizeBtn}"). Manual test required: does it expose keyboard reorder/resize?`,
      })
    }
  }
}

async function auditAriaCurrent(page: Page) {
  await go(page, '/portal/my-tasks')
  await page.waitForTimeout(800)
  const info: any = await page.evaluate(`(function(){
    var links = Array.prototype.slice.call(document.querySelectorAll('nav a, [role=navigation] a, aside a'));
    var tasksLink = null;
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href') || '';
      if (href.endsWith('/tasks') || href === '/tasks') { tasksLink = links[i]; break; }
    }
    if (!tasksLink) return {found: false};
    return {
      found: true,
      ariaCurrent: tasksLink.getAttribute('aria-current') || 'null',
      classes: (tasksLink.className || '').toString().slice(0,100)
    };
  })()`)
  if (info.found && info.ariaCurrent !== 'page') {
    record({
      id: 'NAV-NO-ARIA-CURRENT',
      severity: 'P1',
      page: '/tasks',
      observed: `Sidebar Tasks link is visually active but aria-current="${info.ariaCurrent}". Should be "page". Screen reader doesn't announce current location.`,
      wcag: '4.1.2',
    })
  }
}

async function auditMobileTabBar(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await go(page, '/portal/my-tasks')
  await page.waitForTimeout(800)
  const info: any = await page.evaluate(`(function(){
    var tabs = Array.prototype.slice.call(document.querySelectorAll('nav a, [role=tablist] a, [role=tab]'));
    var bottomTabs = tabs.filter(function(t){
      var r = t.getBoundingClientRect();
      return r.top > 700 && r.bottom < 900;
    });
    var withCurrent = bottomTabs.filter(function(t){return t.getAttribute('aria-current') === 'page';});
    return {total: bottomTabs.length, withCurrent: withCurrent.length};
  })()`)
  if (info.total > 0 && info.withCurrent === 0) {
    record({
      id: 'MOBILE-TAB-NO-ARIA-CURRENT',
      severity: 'P1',
      page: '/tasks (mobile)',
      observed: `Mobile bottom tab bar has ${info.total} tabs but 0 with aria-current="page".`,
      wcag: '4.1.2',
    })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
}

async function auditMobileTouchTargets(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await go(page, '/portal/my-tasks')
  await page.waitForTimeout(1500)
  const small: any = await page.evaluate(`(function(){
    var els = Array.prototype.slice.call(document.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit], input[type=checkbox]'));
    var bad = [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.top > 1044 || r.bottom < -200) continue;
      var label = el.getAttribute('aria-label') || (el.textContent||'').trim().slice(0,30);
      // skip 1x1 SR-only links
      if (r.width <= 2 && r.height <= 2) continue;
      if (r.width < 44 || r.height < 44) {
        bad.push({tag: el.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height), label: label, classes: (el.className||'').toString().slice(0,40)});
      }
    }
    return bad.slice(0,12);
  })()`)
  if (small.length > 0) {
    record({
      id: 'TOUCH-TARGET-SMALL',
      severity: 'P1',
      page: '/tasks (390x844)',
      observed: `${small.length}+ interactive elements below 44×44 minimum. Examples: ${small.slice(0,4).map((s: any) => `<${s.tag}> ${s.w}×${s.h}px "${s.label}"`).join('; ')}`,
      wcag: '2.5.5 Target Size',
    })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
}

async function auditLiveRegions(page: Page, path: string) {
  await go(page, path)
  const info: any = await page.evaluate(`(function(){
    var regions = Array.prototype.slice.call(document.querySelectorAll('[aria-live], [role=status], [role=alert], [role=log]'));
    return {count: regions.length, types: regions.map(function(r){return (r.getAttribute('role') || r.getAttribute('aria-live') || '');}).slice(0,5)};
  })()`)
  if (info.count === 0) {
    record({
      id: 'LIVE-NONE',
      severity: 'P1',
      page: path,
      observed: 'No aria-live regions or role=status/alert found. Toasts, optimistic updates, and realtime sync (15s polling) won\'t be announced to SR users.',
      wcag: '4.1.3 Status Messages',
    })
  }
}

async function auditTaskDetailPanel(page: Page) {
  await go(page, '/portal/my-tasks')
  await page.waitForTimeout(2500)
  // Try to click first task title
  const opened: any = await page.evaluate(`(function(){
    // find anything that looks like a task title button
    var candidates = document.querySelectorAll('button[class*="title" i], [data-testid*="task-title"], button[class*="task" i]');
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var r = c.getBoundingClientRect();
      if (r.width > 50 && r.height > 0) { c.click(); return {clicked: true, label: c.textContent.slice(0,30)}; }
    }
    // fallback: any link in main
    var mainLinks = document.querySelectorAll('main a');
    if (mainLinks.length > 0) { mainLinks[0].click(); return {clicked: true, fallback: true}; }
    return {clicked: false};
  })()`)
  if (!opened.clicked) {
    record({ id: 'PANEL-NO-CLICK', severity: 'INFO', page: '/tasks', observed: 'Could not find task title to click for TaskDetailPanel test' })
    return
  }
  await page.waitForTimeout(800)
  const panel: any = await page.evaluate(`(function(){
    var p = document.querySelector('[role=dialog], aside[aria-modal], [aria-modal="true"], aside[class*="Panel"], [class*="DetailPanel"]');
    if (!p) return {found: false};
    var ae = document.activeElement;
    return {
      found: true,
      role: p.getAttribute('role') || '',
      ariaModal: p.getAttribute('aria-modal') || '',
      label: p.getAttribute('aria-label') || p.getAttribute('aria-labelledby') || '',
      focusInside: !!(ae && p.contains(ae)),
      focusedEl: ae ? (ae.tagName + ' "' + (ae.getAttribute('aria-label') || (ae.textContent||'').trim().slice(0,30)) + '"') : 'none'
    };
  })()`)
  if (!panel.found) {
    record({ id: 'PANEL-NO-OPEN', severity: 'INFO', page: '/tasks', observed: 'Clicked task title but no panel/dialog detected within 800ms' })
    return
  }
  if (!panel.role && !panel.ariaModal) {
    record({
      id: 'PANEL-NO-DIALOG-ROLE',
      severity: 'P1',
      page: '/tasks (panel)',
      observed: `TaskDetailPanel exists but has no role=dialog or aria-modal. Background remains keyboard-reachable.`,
      wcag: '2.4.3, 4.1.2',
    })
  }
  if (!panel.focusInside) {
    record({
      id: 'PANEL-FOCUS-OUTSIDE',
      severity: 'P0',
      page: '/tasks (panel)',
      observed: `TaskDetailPanel opened but focus did NOT move into it. Focused: ${panel.focusedEl}. Keyboard users have to manually Tab to find the panel.`,
      wcag: '2.4.3',
    })
  }
  if (!panel.label) {
    record({
      id: 'PANEL-NO-LABEL',
      severity: 'P1',
      page: '/tasks (panel)',
      observed: 'TaskDetailPanel has no aria-label/aria-labelledby. SR announces just "dialog" with no context.',
      wcag: '4.1.2',
    })
  }
}

async function auditInlineEditableSemantics(page: Page) {
  await go(page, '/portal/my-tasks')
  await page.waitForTimeout(2000)
  const cellInfo: any = await page.evaluate(`(function(){
    // Find candidates for inline-editable cells: status pills, priority pills, assignee picker
    var candidates = Array.prototype.slice.call(document.querySelectorAll('[class*="InlineSelect"], [class*="status-pill"], [class*="StatusPill"], [class*="InlineAssignee"], [class*="InlineDate"], [data-testid*="status"]'));
    var samples = candidates.slice(0, 5).map(function(c){
      return {
        tag: c.tagName.toLowerCase(),
        role: c.getAttribute('role') || '',
        ariaHaspopup: c.getAttribute('aria-haspopup') || '',
        ariaExpanded: c.getAttribute('aria-expanded') || '',
        ariaLabel: c.getAttribute('aria-label') || (c.textContent||'').trim().slice(0,30),
        tabIndex: c.tabIndex,
        classes: (c.className||'').toString().slice(0,60)
      };
    });
    return {found: candidates.length, samples: samples};
  })()`)
  if (cellInfo.found > 0) {
    const sample = cellInfo.samples[0]
    if (!sample.role || (sample.role !== 'combobox' && sample.role !== 'button' && sample.role !== 'listbox')) {
      record({
        id: 'INLINE-EDIT-NO-ROLE',
        severity: 'P1',
        page: '/tasks',
        observed: `Inline-editable cell <${sample.tag}> lacks role=combobox/button/listbox (got "${sample.role}"). Screen reader users can't tell it's interactive.`,
        wcag: '4.1.2',
      })
    }
    if (!sample.ariaHaspopup && sample.role === 'combobox') {
      record({
        id: 'INLINE-EDIT-NO-HASPOPUP',
        severity: 'P2',
        page: '/tasks',
        observed: `Inline editable combobox-like control has no aria-haspopup. SR users won't know a dropdown opens.`,
        wcag: '4.1.2',
      })
    }
    if (sample.tabIndex < 0 && !['BUTTON', 'A', 'INPUT', 'SELECT'].includes(sample.tag.toUpperCase())) {
      record({
        id: 'INLINE-EDIT-NOT-TABBABLE',
        severity: 'P0',
        page: '/tasks',
        observed: `Inline-editable cell <${sample.tag}> has tabindex=${sample.tabIndex} and is not a natively focusable element. Keyboard-only users cannot reach it.`,
        wcag: '2.1.1',
      })
    }
  }
}

async function auditSkipToContent(page: Page) {
  await go(page, '/portal/dashboard')
  await page.keyboard.press('Tab')
  const info: any = await page.evaluate(`(function(){
    var ae = document.activeElement;
    if (!ae || ae.tagName === 'BODY') return {found: false};
    var r = ae.getBoundingClientRect();
    var label = (ae.textContent||'').trim() || ae.getAttribute('aria-label') || '';
    return {
      found: true,
      tag: ae.tagName.toLowerCase(),
      label: label,
      visible: r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= -10
    };
  })()`)
  if (info.found && info.label.toLowerCase().includes('skip') && !info.visible) {
    record({
      id: 'SKIP-LINK-INVISIBLE-FOCUSED',
      severity: 'P0',
      page: '/dashboard',
      observed: `"Skip to content" link is the first Tab stop but renders at 1×1 or off-screen even when focused. Keyboard users see no indication it exists.`,
      wcag: '2.4.1 Bypass Blocks, 2.4.7 Focus Visible',
    })
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  console.log(`\n=== A11y Deep Audit @ ${BASE} ===\n`)

  const { ctx, page } = await setupPage(browser, 'dark')

  const pages = ['/portal/dashboard', '/portal/my-tasks', '/portal/my-tasks', '/portal/projects', '/portal/meetings', '/portal/personal', '/team']
  for (const p of pages) {
    try { await auditLandmarks(page, p) } catch (e: any) { console.log(`landmarks fail @ ${p}`, e.message?.slice(0, 100)) }
    try { await auditTableSemantics(page, p) } catch (e: any) { console.log(`table fail @ ${p}`, e.message?.slice(0, 100)) }
    try { await auditIconButtons(page, p) } catch (e: any) { console.log(`icons fail @ ${p}`, e.message?.slice(0, 100)) }
    try { await auditSkeletonsHiddenFromAT(page, p) } catch (e: any) { console.log(`skel fail @ ${p}`, e.message?.slice(0, 100)) }
    try { await auditAvatarAlt(page, p) } catch (e: any) { console.log(`alt fail @ ${p}`, e.message?.slice(0, 100)) }
    try { await auditLiveRegions(page, p) } catch (e: any) { console.log(`live fail @ ${p}`, e.message?.slice(0, 100)) }
  }

  try { await auditFocusVisibility(page, '/portal/my-tasks') } catch (e: any) { console.log('focus fail', e.message?.slice(0, 100)) }
  try { await auditFocusVisibility(page, '/portal/dashboard') } catch (e: any) { console.log('focus fail', e.message?.slice(0, 100)) }
  try { await auditCmdK(page) } catch (e: any) { console.log('cmdk fail', e.message?.slice(0, 100)) }
  try { await auditKbdInInputs(page) } catch (e: any) { console.log('kbd fail', e.message?.slice(0, 100)) }
  try { await auditDashDrag(page) } catch (e: any) { console.log('dash drag fail', e.message?.slice(0, 100)) }
  try { await auditAriaCurrent(page) } catch (e: any) { console.log('aria-current fail', e.message?.slice(0, 100)) }
  try { await auditMobileTabBar(page) } catch (e: any) { console.log('mobile tab fail', e.message?.slice(0, 100)) }
  try { await auditMobileTouchTargets(page) } catch (e: any) { console.log('touch fail', e.message?.slice(0, 100)) }
  try { await auditTaskDetailPanel(page) } catch (e: any) { console.log('panel fail', e.message?.slice(0, 100)) }
  try { await auditInlineEditableSemantics(page) } catch (e: any) { console.log('inline edit fail', e.message?.slice(0, 100)) }
  try { await auditSkipToContent(page) } catch (e: any) { console.log('skip link fail', e.message?.slice(0, 100)) }

  await ctx.close()
  await browser.close()

  const md = [
    `# A11y Deep Audit — ${BASE}`,
    `Run: ${RUN_ID}`,
    `Total findings: ${findings.length}`,
    '',
    '## By severity',
    '',
    `- P0: ${findings.filter((f) => f.severity === 'P0').length}`,
    `- P1: ${findings.filter((f) => f.severity === 'P1').length}`,
    `- P2: ${findings.filter((f) => f.severity === 'P2').length}`,
    `- INFO: ${findings.filter((f) => f.severity === 'INFO').length}`,
    '',
    '## All findings',
    '',
    ...findings.map((f) => `- **[${f.severity}] ${f.id}** @ \`${f.page}\` — ${f.observed}${f.wcag ? ` _(${f.wcag})_` : ''}`),
  ].join('\n')
  writeFileSync(join(OUT_DIR, 'findings.md'), md)
  writeFileSync(join(OUT_DIR, 'findings.json'), JSON.stringify(findings, null, 2))
  console.log(`\nFindings: P0=${findings.filter((f) => f.severity === 'P0').length} P1=${findings.filter((f) => f.severity === 'P1').length} P2=${findings.filter((f) => f.severity === 'P2').length}`)
  console.log(`Written to ${OUT_DIR}/findings.md`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
