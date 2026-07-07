#!/usr/bin/env node
// scripts/post-deploy-probe.mjs — mandatory post-deploy prod endpoint assertion.
//
// Hits /api/health on the live prod Pages URL and asserts:
//   (1) HTTP 200
//   (2) response body has ok: true
//
// Also probes the live public-artifact route (#508 interim, 2026-07-07 — Option
// D from the security memo; the origin-split itself is still Nick's decision)
// and asserts the exact hardened Content-Security-Policy header
// api/routes/public-artifact.test.ts:30 pins at the unit-test level. The unit
// test guards against a code change accidentally dropping the header; nothing
// previously watched the LIVE edge for a Cloudflare Pages config / header-
// stripping regression between deploys — this closes that window.
//
// Non-zero exit on any failure — wires into deploy:pages:gated and deploy-all.ps1
// so a broken deploy surfaces IMMEDIATELY instead of silently leaving prod broken.
//
// Usage:
//   node scripts/post-deploy-probe.mjs
//   node scripts/post-deploy-probe.mjs --url https://staging.mn-ccore-lab.pages.dev
//
// The probe retries up to MAX_RETRIES times with RETRY_DELAY_MS between each,
// because Cloudflare Pages propagation can take a few seconds after wrangler
// pages deploy returns.

import { execSync } from 'child_process';

const PROD_URL = 'https://mn-ccore-lab.pages.dev';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 4000;

// handleGetPublicArtifact's notFound() helper does NOT set Content-Security-Policy
// — only the 200 success path does (api/routes/public-artifact.ts:78-94). A 404
// for a made-up id would therefore prove nothing about the header, so this probe
// is COUPLED to one known-live public artifact rather than an existence-
// independent id. If this artifact is ever unpublished or deleted, this probe
// starts failing for that reason, not a real header regression — query the
// artifacts table's visibility column for this id via the sanctioned D1
// wrapper (scripts/wrangler-d1) before assuming the CSP itself broke.
const KNOWN_PUBLIC_ARTIFACT_ID = 'art_b424399a8dfbdd6bcf59ac9563ce8f62';
// Pinned to the exact string api/routes/public-artifact.test.ts:30-31 asserts —
// keep both in sync if the policy ever changes.
const EXPECTED_ARTIFACT_CSP =
  "sandbox allow-scripts; default-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; script-src 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; media-src data: blob:";

function parseArgs() {
  const idx = process.argv.indexOf('--url');
  return idx !== -1 ? process.argv[idx + 1] : PROD_URL;
}

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

// #508 interim: assert the live artifact route still carries the hardened CSP.
// Returns { ok: true } or { ok: false, reason } — never throws for an
// expected-shape mismatch (a genuinely thrown network error still propagates
// to the caller's try/catch, same as probe() above).
async function probeArtifactCsp(baseUrl) {
  const url = `${baseUrl}/a/${KNOWN_PUBLIC_ARTIFACT_ID}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (res.status !== 200) {
    return {
      ok: false,
      reason: `HTTP ${res.status} (expected 200) — the known public artifact may have been unpublished/deleted, or the route broke`,
    };
  }
  const csp = res.headers.get('Content-Security-Policy');
  if (csp !== EXPECTED_ARTIFACT_CSP) {
    return {
      ok: false,
      reason: `Content-Security-Policy mismatch — got: ${csp === null ? '(header missing)' : JSON.stringify(csp)}`,
    };
  }
  return { ok: true };
}

async function main() {
  const baseUrl = parseArgs().replace(/\/$/, '');
  const commit = headCommit();

  console.log('');
  console.log(`[post-deploy-probe] HEAD: ${commit}`);
  console.log(`[post-deploy-probe] Target: ${baseUrl}/api/health`);
  console.log(`[post-deploy-probe] Artifact CSP target: ${baseUrl}/a/${KNOWN_PUBLIC_ARTIFACT_ID}`);
  console.log(`[post-deploy-probe] Max retries: ${MAX_RETRIES}, delay: ${RETRY_DELAY_MS}ms`);
  console.log('');

  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { status, body } = await probe(baseUrl, attempt);

      if (status !== 200) {
        lastErr = `HTTP ${status} (expected 200)`;
        console.error(`  Attempt ${attempt}/${MAX_RETRIES}: FAIL — /api/health — ${lastErr}`);
      } else if (!body.ok) {
        const failures = Array.isArray(body.failures) ? body.failures.join(', ') : JSON.stringify(body.failures);
        lastErr = `ok=false, failures: ${failures}`;
        console.error(`  Attempt ${attempt}/${MAX_RETRIES}: FAIL — /api/health — ${lastErr}`);
      } else {
        const csp = await probeArtifactCsp(baseUrl);
        if (!csp.ok) {
          lastErr = csp.reason;
          console.error(`  Attempt ${attempt}/${MAX_RETRIES}: FAIL — artifact CSP — ${lastErr}`);
        } else {
          console.log(`  Attempt ${attempt}/${MAX_RETRIES}: OK (health + artifact CSP)`);
          console.log('');
          console.log(`[post-deploy-probe] PASS — prod is live and healthy.`);
          console.log(`  tasks=${body.checks?.tasks ?? '?'}, projects=${body.checks?.projects ?? '?'}, duration_ms=${body.checks?.duration_ms ?? '?'}`);
          console.log(`  artifact CSP: OK (${KNOWN_PUBLIC_ARTIFACT_ID})`);
          console.log('');
          return;
        }
      }
    } catch (e) {
      lastErr = e.message;
      console.error(`  Attempt ${attempt}/${MAX_RETRIES}: FAIL — ${lastErr}`);
    }

    if (attempt < MAX_RETRIES) {
      console.log(`  Waiting ${RETRY_DELAY_MS}ms before retry...`);
      await sleep(RETRY_DELAY_MS);
    }
  }

  console.error('');
  console.error(`[post-deploy-probe] FAIL after ${MAX_RETRIES} attempts: ${lastErr}`);
  console.error(`  Prod endpoint is NOT healthy after deploy.`);
  console.error(`  Check: wrangler pages deployment list --project-name mn-ccore-lab`);
  console.error('');
  process.exit(1);
}

main();
