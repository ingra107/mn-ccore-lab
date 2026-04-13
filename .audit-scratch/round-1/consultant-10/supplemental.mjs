#!/usr/bin/env node
/**
 * Consultant 10 Round 1 supplemental checks.
 * Standalone (ESM, native fetch) — bypasses broken playwright.config.ts.
 * Audit-only: performs no writes unless explicitly noted.
 */

const BASE = 'https://mn-ccore-lab.pages.dev';
const H = { 'X-Test-Mode': 'true' };
const results = [];
let passed = 0, failed = 0;

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (ok) passed++; else failed++;
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function jget(path) {
  const res = await fetch(`${BASE}${path}`, { headers: H });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json, headers: res.headers };
}

async function htmlGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: H });
  return { status: res.status, html: await res.text() };
}

// ── Round 0 BUG A: /api/version 500 under X-Test-Mode ────────────────────────
{
  const r = await jget('/api/version');
  const ok = r.status === 200 && r.json && typeof r.json.version !== 'undefined';
  record('BUG-A /api/version returns 200 with X-Test-Mode',
    ok, `status=${r.status} body=${r.text.slice(0, 80)}`);
}

// ── Round 0 BUG B: Test D1 seed data present ─────────────────────────────────
{
  const t = await jget('/api/tasks?limit=50');
  const p = await jget('/api/projects?limit=20');
  const i = await jget('/api/ideas?limit=20');
  const d = await jget('/api/decisions?limit=20');
  const m = await jget('/api/meetings?limit=20');

  const tCount = t.json?.data?.length ?? 0;
  const pCount = p.json?.data?.length ?? 0;
  const iCount = i.json?.data?.length ?? 0;
  const dCount = d.json?.data?.length ?? 0;
  const mCount = m.json?.data?.length ?? 0;

  record('BUG-B Test D1 tasks populated',
    tCount >= 15, `count=${tCount} (expected >=15)`);
  record('BUG-B Test D1 projects populated',
    pCount >= 3, `count=${pCount} (expected >=3)`);
  record('BUG-B Test D1 ideas populated',
    iCount >= 5, `count=${iCount} (expected >=5)`);
  record('BUG-B Test D1 decisions populated',
    dCount >= 4, `count=${dCount} (expected >=4)`);
  record('BUG-B Test D1 meetings populated',
    mCount >= 2, `count=${mCount} (expected >=2)`);
}

// ── Dashboard: h1/h2 (BUG D) ─────────────────────────────────────────────────
{
  const r = await htmlGet('/dashboard');
  const hasH1 = /<h1[\s>]/i.test(r.html);
  const hasH2 = /<h2[\s>]/i.test(r.html);
  // SPA so most content is JS-rendered; server HTML has only shell. We can only
  // verify the route serves 200 + script bundle; runtime heading check requires
  // a real browser. Flag as LIMITED.
  record('BUG-D /dashboard route serves 200',
    r.status === 200, `status=${r.status}`);
  record('BUG-D /dashboard static HTML has <h1/h2> (SPA limited)',
    hasH1 || hasH2, `h1=${hasH1} h2=${hasH2} (SPA may render at runtime)`);
}

// ── Page route smoke (BUG C + supplementals) ─────────────────────────────────
for (const route of [
  '/', '/dashboard', '/my-tasks', '/tasks', '/personal',
  '/projects', '/ideas', '/decisions', '/deadlines',
  '/meetings', '/manuscripts', '/team', '/activity',
]) {
  const r = await htmlGet(route);
  record(`route ${route} serves 200`, r.status === 200, `status=${r.status}`);
}

// ── API endpoint smoke ────────────────────────────────────────────────────────
for (const ep of [
  '/api/version', '/api/tasks?limit=1', '/api/projects?limit=1',
  '/api/ideas?limit=1', '/api/decisions?limit=1', '/api/meetings?limit=1',
  '/api/deadlines?limit=1', '/api/members',
]) {
  const r = await jget(ep);
  record(`API ${ep} returns 2xx`,
    r.status >= 200 && r.status < 300, `status=${r.status}`);
}

// ── Print summary ────────────────────────────────────────────────────────────
console.log(`\n====\nPASSED: ${passed}\nFAILED: ${failed}\nTOTAL: ${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
