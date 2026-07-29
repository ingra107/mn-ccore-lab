#!/usr/bin/env node
/**
 * check-artifacts-origin-minimal.mjs — the cookieless artifact origin's
 * minimality gate (PB backlog #883, ethos #7: doctrine must be executable).
 *
 * WHY. The #508 origin split (artifacts-site/ -> mn-ccore-artifacts.pages.dev)
 * makes stored-XSS-to-Hub-session-takeover unrepresentable ONLY while that
 * origin stays authority-free: one read-only Function route, one code-owned D1
 * binding, no /api/*, no secrets, no crons, no service bindings. Until this
 * gate, that constraint lived in prose (artifacts-site/wrangler.toml header +
 * CLAUDE.md "Deploy mode") and NOTHING failed if a later change quietly
 * re-imported authority — the exact "documented rule that drifts" shape.
 *
 * WHAT IT ASSERTS (allowlist, so an unknown new capability FAILS CLOSED):
 *   1. artifacts-site/functions/ contains EXACTLY one function: a/[id].ts.
 *   2. That function imports the SHARED handler (api/routes/public-artifact)
 *      — one implementation, one test file, never forked.
 *   3. artifacts-site/wrangler.toml declares ONLY:
 *        top level : name (= mn-ccore-artifacts), compatibility_date,
 *                    pages_build_output_dir
 *        sections  : exactly one [[d1_databases]] with binding = DB,
 *                    database_name = mnccore-lab (+ database_id)
 *      Anything else — [vars], [env.*], [[kv_namespaces]], [[r2_buckets]],
 *      [[services]], [triggers], [[queues.*]], [[durable_objects.*]], [ai],
 *      secrets-store sections, etc. — is a violation by construction.
 *   4. artifacts-site/public/ carries no capability-bearing special file
 *      (_worker.js advanced-mode script, _routes.json routing override,
 *      _redirects rewrites). Plain static assets are fine: static bytes can't
 *      hold Hub authority; those three files can change what EXECUTES.
 *
 * COVERAGE BOUNDARY (ethos #9 — name what this does NOT cover): dashboard-side
 * state is invisible to git. Attaching a Cloudflare Access application to the
 * project, `wrangler pages secret put`, or hand-editing bindings in the
 * dashboard would not trip this gate. Its teeth come from the fact that the
 * artifacts project's bindings are CODE-OWNED (wrangler.toml declares
 * pages_build_output_dir, so `npm run deploy:artifacts` applies THIS file's
 * bindings to the deployment) — the repo surface this gate freezes is the
 * surface the sanctioned deploy actually ships.
 *
 * WIRED AT (both chokepoints):
 *   - .githooks/pre-commit — fires when artifacts-site/** (or this script) is
 *     staged; before this gate NOTHING in pre-commit covered artifacts-site/.
 *   - package.json deploy:artifacts — runs before wrangler pages deploy, so a
 *     non-minimal origin is undeployable via the sanctioned path.
 *
 * Usage:
 *   node scripts/check-artifacts-origin-minimal.mjs [--root <dir>]
 * --root exists so the failure paths are testable against a mutated fixture
 * copy without touching the real tree.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const rootFlag = argv.indexOf('--root');
const REPO_ROOT = rootFlag !== -1 && argv[rootFlag + 1]
  ? path.resolve(argv[rootFlag + 1])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SITE = path.join(REPO_ROOT, 'artifacts-site');
const violations = [];

// ── 1 + 2. Exactly one Function route, importing the shared handler ──────────

const ALLOWED_FUNCTIONS = ['a/[id].ts'];

function walk(dir, base) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full).replace(/\\/g, '/'));
  }
  return out;
}

const fnDir = path.join(SITE, 'functions');
const fnFiles = walk(fnDir, fnDir).sort();

if (fnFiles.join('|') !== ALLOWED_FUNCTIONS.join('|')) {
  violations.push(
    `functions/ must contain EXACTLY [${ALLOWED_FUNCTIONS.join(', ')}]; found [${fnFiles.join(', ') || 'nothing'}]. ` +
    `Every additional file under artifacts-site/functions/ is a new ROUTE on the cookieless origin.`,
  );
} else {
  const fnSource = fs.readFileSync(path.join(fnDir, 'a', '[id].ts'), 'utf8');
  if (!/from\s+['"][^'"]*api\/routes\/public-artifact['"]/.test(fnSource)) {
    violations.push(
      `functions/a/[id].ts no longer imports the shared handler (api/routes/public-artifact) — ` +
      `the one-implementation/two-surfaces contract is broken (never fork it).`,
    );
  }
}

// ── 3. wrangler.toml allowlist ───────────────────────────────────────────────

const ALLOWED_TOP_KEYS = new Set(['name', 'compatibility_date', 'pages_build_output_dir']);
const ALLOWED_D1_KEYS = new Set(['binding', 'database_name', 'database_id']);

function stripComment(line) {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inString = !inString;
    else if (ch === '#' && !inString) return line.slice(0, i);
  }
  return line;
}

const tomlPath = path.join(SITE, 'wrangler.toml');
if (!fs.existsSync(tomlPath)) {
  violations.push('artifacts-site/wrangler.toml is missing — bindings must stay CODE-OWNED here.');
} else {
  let section = null; // null = top level
  let d1Sections = 0;
  const values = {}; // top-level + d1 key values (unquoted)

  for (const rawLine of fs.readFileSync(tomlPath, 'utf8').split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (!line) continue;

    const dbl = line.match(/^\[\[([^\]]+)\]\]$/);
    const sgl = dbl ? null : line.match(/^\[([^\]]+)\]$/);
    if (dbl) {
      section = dbl[1].trim();
      if (section === 'd1_databases') {
        d1Sections++;
        if (d1Sections > 1) violations.push('wrangler.toml declares MORE than one [[d1_databases]] binding.');
      } else {
        violations.push(`wrangler.toml declares a forbidden section [[${section}]] — the ONLY allowed binding is one [[d1_databases]].`);
      }
      continue;
    }
    if (sgl) {
      section = sgl[1].trim();
      violations.push(`wrangler.toml declares a forbidden section [${section}] — no [vars]/[env.*]/[triggers]/etc. on the cookieless origin.`);
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.*)$/);
    if (!kv) {
      violations.push(`wrangler.toml has an unparseable line: ${JSON.stringify(rawLine.trim())}`);
      continue;
    }
    const key = kv[1];
    const value = kv[2].trim().replace(/^"(.*)"$/, '$1');

    if (section === null) {
      if (!ALLOWED_TOP_KEYS.has(key)) {
        violations.push(`wrangler.toml top-level key "${key}" is not in the allowlist [${[...ALLOWED_TOP_KEYS].join(', ')}].`);
      } else {
        values[key] = value;
      }
    } else if (section === 'd1_databases') {
      if (!ALLOWED_D1_KEYS.has(key)) {
        violations.push(`wrangler.toml [[d1_databases]] key "${key}" is not in the allowlist [${[...ALLOWED_D1_KEYS].join(', ')}].`);
      } else {
        values[`d1.${key}`] = value;
      }
    }
    // Keys inside a forbidden section: the section itself was already reported.
  }

  if (values['name'] !== undefined && values['name'] !== 'mn-ccore-artifacts') {
    violations.push(`wrangler.toml name = "${values['name']}" — must stay "mn-ccore-artifacts" (a rename re-points the deploy).`);
  }
  if (d1Sections === 1) {
    if (values['d1.binding'] !== 'DB') violations.push(`[[d1_databases]] binding = "${values['d1.binding']}" — must be "DB" (the shared handler's contract).`);
    if (values['d1.database_name'] !== 'mnccore-lab') violations.push(`[[d1_databases]] database_name = "${values['d1.database_name']}" — must be "mnccore-lab" (artifact bodies live there).`);
  } else if (d1Sections === 0) {
    violations.push('wrangler.toml declares no [[d1_databases]] binding — the /a/:id handler needs its read path.');
  }
}

// ── 4. No capability-bearing special files in public/ ────────────────────────

const FORBIDDEN_PUBLIC = ['_worker.js', '_routes.json', '_redirects'];
for (const name of FORBIDDEN_PUBLIC) {
  if (fs.existsSync(path.join(SITE, 'public', name))) {
    violations.push(
      `artifacts-site/public/${name} exists — that file changes what EXECUTES/routes on the cookieless origin ` +
      `(advanced-mode worker / route override / rewrites) and is forbidden here.`,
    );
  }
}

// ── verdict ──────────────────────────────────────────────────────────────────

if (violations.length > 0) {
  console.error('[artifacts-origin-minimal] FAIL — the cookieless artifact origin is no longer minimal (#508/#883):\n');
  for (const v of violations) console.error(`  - ${v}`);
  console.error(
    '\nThe ENTIRE security value of the origin split is that this project has no authority.' +
    '\nIf a change here is genuinely intended, it needs a deliberate decision (see' +
    '\nartifacts-site/wrangler.toml header + CLAUDE.md "Deploy mode" surface 3), and this' +
    '\ngate updated in the same commit.',
  );
  process.exit(1);
}

console.log('[artifacts-origin-minimal] OK — one route, one code-owned D1 read binding, nothing else.');
