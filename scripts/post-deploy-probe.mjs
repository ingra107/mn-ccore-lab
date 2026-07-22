#!/usr/bin/env node
// scripts/post-deploy-probe.mjs — mandatory post-deploy prod endpoint assertion.
//
// Hits /api/health on the live prod Pages URL and asserts:
//   (1) HTTP 200
//   (2) response body has ok: true
//
// Then asserts the two halves of the #508 artifact origin split (Option A,
// shipped 2026-07-22 — this probe's original Option-D form, 3c6a50a7, watched
// the CSP on the Hub origin because that is where the HTML was served):
//   (3) HUB origin  /a/:id  → 301 to the cookieless artifact origin, no body.
//       This is the LOAD-BEARING assertion now: it proves the Hub's own host has
//       no path that emits stored artifact HTML. A refactor that "restores"
//       serving here silently reinstates the same-origin stored-XSS class.
//   (4) ARTIFACTS origin /a/:id → 200 + the exact hardened CSP that
//       api/routes/public-artifact.test.ts pins at the unit-test level. Since
//       the split this is defense-in-depth rather than the only control, but it
//       is cheap and nothing else watches the live edge for a Pages config /
//       header-stripping regression between deploys.
//
// Non-zero exit on any failure — wires into deploy:pages:gated and deploy-all.ps1
// so a broken deploy surfaces IMMEDIATELY instead of silently leaving prod broken.
//
// Usage:
//   node scripts/post-deploy-probe.mjs
//   node scripts/post-deploy-probe.mjs --url https://staging.mn-ccore-lab.pages.dev
//   node scripts/post-deploy-probe.mjs --artifacts-only   # after deploy:artifacts
//
// The probe retries up to MAX_RETRIES times with RETRY_DELAY_MS between each,
// because Cloudflare Pages propagation can take a few seconds after wrangler
// pages deploy returns.

import { execSync } from 'child_process';

const PROD_URL = 'https://mn-ccore-lab.pages.dev';
// The cookieless artifact origin (#508). MUST equal PUBLIC_ARTIFACT_ORIGIN in
// api/routes/public-artifact.ts — the redirect assertion below compares the live
// Location header against this literal, so a drift between the two fails loud.
const ARTIFACTS_URL = 'https://mn-ccore-artifacts.pages.dev';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 4000;

// handleGetPublicArtifact's notFound() helper does NOT set Content-Security-Policy
// — only the 200 success path does. A 404 for a made-up id therefore proves
// nothing about the header, and "just set the header on the 404 path too" would
// DELETE the coverage rather than stabilise it (the probe would pass on a 404
// while a 200-only regression sailed through). So this probe must hit a real,
// permanently-published artifact.
//
// It hits a SYSTEM-OWNED CANARY (schema-v101, backlog #531), not a user's
// artifact. Until 2026-07-22 it was pinned to art_b424399a… — Nick's LLM Ethics
// Workflow Map — which coupled deploy gating to one person's content lifecycle:
// unpublish it and every deploy went red for a non-security reason, which is
// exactly how a real CSP alarm gets trained into noise. The canary is inert
// static HTML with no task/project, and schema-v101 triggers make it
// undeletable and unable to leave visibility='public'/content_type='html', so a
// FAILURE HERE MEANS A REAL HEADER REGRESSION.
//
// If this ever 404s anyway, the row is missing from the D1 the artifacts origin
// binds — re-apply with:
//   bash scripts/wrangler-d1 d1 execute mnccore-lab --remote \
//     --file=api/schema-v101-public-artifact-canary.sql   (wrangler-d1-allowed)
const KNOWN_PUBLIC_ARTIFACT_ID = 'art_cafe0000cafe0000cafe0000cafe0000';
// Pinned to the exact string api/routes/public-artifact.test.ts:30-31 asserts —
// keep both in sync if the policy ever changes.
const EXPECTED_ARTIFACT_CSP =
  "sandbox allow-scripts; default-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; script-src 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; media-src data: blob:";

function parseArgs() {
  const idx = process.argv.indexOf('--url');
  return idx !== -1 ? process.argv[idx + 1] : PROD_URL;
}

const ARTIFACTS_ONLY = process.argv.includes('--artifacts-only');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function headCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function probe(baseUrl, attempt) {
  const url = `${baseUrl}/api/health`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const body = await res.json();
  return { status: res.status, body };
}

// #508: assert the live artifact route on the COOKIELESS origin still serves
// and still carries the hardened CSP. Returns { ok: true } or { ok: false,
// reason } — never throws for an expected-shape mismatch (a genuinely thrown
// network error still propagates to the caller's try/catch, same as probe()).
async function probeArtifactCsp(baseUrl) {
  const url = `${baseUrl}/a/${KNOWN_PUBLIC_ARTIFACT_ID}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (res.status !== 200) {
    return {
      ok: false,
      reason: `HTTP ${res.status} (expected 200) at ${url} — the known public artifact may have been unpublished/deleted, or the artifacts-origin route broke`,
    };
  }
  const csp = res.headers.get('Content-Security-Policy');
  if (csp !== EXPECTED_ARTIFACT_CSP) {
    return {
      ok: false,
      reason: `Content-Security-Policy mismatch at ${url} — got: ${csp === null ? '(header missing)' : JSON.stringify(csp)}`,
    };
  }
  return { ok: true };
}

// #508 LOAD-BEARING: the Hub's own origin must NOT serve artifact HTML. Assert
// the legacy path is a bodyless 301 pointing at the cookieless origin. A 200
// here means someone put user-authored HTML back on the cookie-scoping host.
async function probeLegacyRedirect(baseUrl) {
  const url = `${baseUrl}/a/${KNOWN_PUBLIC_ARTIFACT_ID}`;
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  if (res.status !== 301) {
    return {
      ok: false,
      reason: `HTTP ${res.status} (expected 301) at ${url} — the Hub origin must NOT serve artifact HTML (#508 origin split)`,
    };
  }
  const loc = res.headers.get('Location');
  const expected = `${ARTIFACTS_URL}/a/${KNOWN_PUBLIC_ARTIFACT_ID}`;
  if (loc !== expected) {
    return {
      ok: false,
      reason: `Location mismatch at ${url} — got ${loc === null ? '(header missing)' : JSON.stringify(loc)}, expected ${JSON.stringify(expected)}`,
    };
  }
  const body = await res.text();
  if (body !== '') {
    return { ok: false, reason: `the Hub-origin 301 emitted a body (${body.length} bytes) — it must be empty` };
  }
  return { ok: true };
}

async function main() {
  const baseUrl = parseArgs().replace(/\/$/, '');
  const commit = headCommit();

  console.log('');
  console.log(`[post-deploy-probe] HEAD: ${commit}`);
  if (ARTIFACTS_ONLY) {
    console.log(`[post-deploy-probe] Mode: --artifacts-only (cookieless origin, #508)`);
  } else {
    console.log(`[post-deploy-probe] Target: ${baseUrl}/api/health`);
    console.log(`[post-deploy-probe] Legacy 301 target: ${baseUrl}/a/${KNOWN_PUBLIC_ARTIFACT_ID}`);
  }
  console.log(`[post-deploy-probe] Artifact CSP target: ${ARTIFACTS_URL}/a/${KNOWN_PUBLIC_ARTIFACT_ID}`);
  console.log(`[post-deploy-probe] Max retries: ${MAX_RETRIES}, delay: ${RETRY_DELAY_MS}ms`);
  console.log('');

  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      let body = null;

      if (!ARTIFACTS_ONLY) {
        const health = await probe(baseUrl, attempt);
        body = health.body;
        if (health.status !== 200) {
          lastErr = `HTTP ${health.status} (expected 200)`;
          console.error(`  Attempt ${attempt}/${MAX_RETRIES}: FAIL — /api/health — ${lastErr}`);
          if (attempt < MAX_RETRIES) { console.log(`  Waiting ${RETRY_DELAY_MS}ms before retry...`); await sleep(RETRY_DELAY_MS); }
          continue;
        }
        if (!body.ok) {
          const failures = Array.isArray(body.failures) ? body.failures.join(', ') : JSON.stringify(body.failures);
          lastErr = `ok=false, failures: ${failures}`;
          console.error(`  Attempt ${attempt}/${MAX_RETRIES}: FAIL — /api/health — ${lastErr}`);
          if (attempt < MAX_RETRIES) { console.log(`  Waiting ${RETRY_DELAY_MS}ms before retry...`); await sleep(RETRY_DELAY_MS); }
          continue;
        }

        // #508: the Hub origin must be a bodyless 301, never a server of HTML.
        const legacy = await probeLegacyRedirect(baseUrl);
        if (!legacy.ok) {
          lastErr = legacy.reason;
          console.error(`  Attempt ${attempt}/${MAX_RETRIES}: FAIL — legacy /a/ 301 — ${lastErr}`);
          if (attempt < MAX_RETRIES) { console.log(`  Waiting ${RETRY_DELAY_MS}ms before retry...`); await sleep(RETRY_DELAY_MS); }
          continue;
        }
      }

      const csp = await probeArtifactCsp(ARTIFACTS_URL);
      if (!csp.ok) {
        lastErr = csp.reason;
        console.error(`  Attempt ${attempt}/${MAX_RETRIES}: FAIL — artifact CSP — ${lastErr}`);
        if (attempt < MAX_RETRIES) { console.log(`  Waiting ${RETRY_DELAY_MS}ms before retry...`); await sleep(RETRY_DELAY_MS); }
        continue;
      }

      console.log(`  Attempt ${attempt}/${MAX_RETRIES}: OK (${ARTIFACTS_ONLY ? 'artifact CSP' : 'health + legacy 301 + artifact CSP'})`);
      console.log('');
      console.log(`[post-deploy-probe] PASS — prod is live and healthy.`);
      if (body) {
        console.log(`  tasks=${body.checks?.tasks ?? '?'}, projects=${body.checks?.projects ?? '?'}, duration_ms=${body.checks?.duration_ms ?? '?'}`);
        console.log(`  legacy /a/ 301 -> ${ARTIFACTS_URL}: OK`);
      }
      console.log(`  artifact CSP: OK (${KNOWN_PUBLIC_ARTIFACT_ID} @ ${ARTIFACTS_URL})`);
      console.log('');
      return;
    } catch (e) {
      lastErr = e.message;
      console.error(`  Attempt ${attempt}/${MAX_RETRIES}: FAIL — ${lastErr}`);
      if (attempt < MAX_RETRIES) {
        console.log(`  Waiting ${RETRY_DELAY_MS}ms before retry...`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  console.error('');
  console.error(`[post-deploy-probe] FAIL after ${MAX_RETRIES} attempts: ${lastErr}`);
  console.error(`  Prod endpoint is NOT healthy after deploy.`);
  console.error(`  Check: wrangler pages deployment list --project-name mn-ccore-lab`);
  console.error(`     or: wrangler pages deployment list --project-name mn-ccore-artifacts`);
  console.error('');
  process.exit(1);
}

main();
