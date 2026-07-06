#!/usr/bin/env node
// Runs a single Playwright journey spec against the local wrangler+vite stack.
//
// `npm run test:journeys -- <spec>` mis-routes the extra arg: npm appends it
// to the invoked binary (concurrently), not to the quoted playwright
// sub-command inside it, so the spec path is silently swallowed. This wrapper
// reads argv itself and builds the playwright sub-command explicitly.
import { spawn } from 'node:child_process'

const specArg = process.argv[2]
if (!specArg) {
  console.error('Usage: npm run test:journeys:one -- <spec-path>')
  process.exit(1)
}

const playwrightCmd =
  `wait-on http-get://localhost:5173 && npx playwright test ${specArg} --config=playwright.config.journeys.ts`

// { shell: true } on Windows joins the args array with plain spaces before
// handing it to cmd.exe — it does NOT auto-quote multi-word items the way a
// POSIX shell spawn would. Without explicit quotes here, cmd.exe splits each
// sub-command on its own spaces and concurrently receives "wrangler", "dev",
// "api/index.ts", ... as separate positional args instead of one command.
const child = spawn(
  'npx',
  [
    'concurrently', '-k', '-s', 'first',
    '"wrangler dev api/index.ts --local --config=wrangler.local.toml --port 8787"',
    '"vite --port 5173"',
    `"${playwrightCmd}"`,
  ],
  { stdio: 'inherit', shell: true },
)

child.on('exit', (code) => process.exit(code ?? 1))
