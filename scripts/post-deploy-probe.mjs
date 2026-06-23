#!/usr/bin/env node
// scripts/post-deploy-probe.mjs — mandatory post-deploy prod endpoint assertion.
//
// Hits /api/health on the live prod Pages URL and asserts:
//   (1) HTTP 200
//   (2) response body has ok: true
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

async function main() {
  const baseUrl = parseArgs().replace(/\/$/, '');
  const commit = headCommit();

  console.log('');
  console.log(`[post-deploy-probe] HEAD: ${commit}`);
  console.log(`[post-deploy-probe] Target: ${baseUrl}/api/health`);
  console.log(`[post-deploy-probe] Max retries: ${MAX_RETRIES}, delay: ${RETRY_DELAY_MS}ms`);
  console.log('');

  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { status, body } = await probe(baseUrl, attempt);

      if (status !== 200) {
        lastErr = `HTTP ${status} (expected 200)`;
        console.error(`  Attempt ${attempt}/${MAX_RETRIES}: FAIL — ${lastErr}`);
      } else if (!body.ok) {
        const failures = Array.isArray(body.failures) ? body.failures.join(', ') : JSON.stringify(body.failures);
        lastErr = `ok=false, failures: ${failures}`;
        console.error(`  Attempt ${attempt}/${MAX_RETRIES}: FAIL — ${lastErr}`);
      } else {
        console.log(`  Attempt ${attempt}/${MAX_RETRIES}: OK`);
        console.log('');
        console.log(`[post-deploy-probe] PASS — prod is live and healthy.`);
        console.log(`  tasks=${body.checks?.tasks ?? '?'}, projects=${body.checks?.projects ?? '?'}, duration_ms=${body.checks?.duration_ms ?? '?'}`);
        console.log('');
        return;
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
