# deploy-all.ps1 - one-shot deploy for the Hub Pages frontend + bundled /api Functions.
#
# Cloudflare Pages on mn-ccore-lab has NO git integration
# (`wrangler pages project list` -> "Git Provider: No").
# git push does NOT auto-deploy Pages. Run this script (or `npm run
# deploy:pages:gated`) after any Hub change that needs to land on production.
#
# The standalone `mn-ccore-lab-api` Worker was RETIRED 2026-06-20 (zero consumers;
# all /api traffic is served by the Pages-bundled Worker). This script no longer
# deploys it. See Context/Topics/infrastructure-registry.md.
#
# Usage (from mn-ccore-lab dir):
#   pwsh scripts/deploy-all.ps1            # full build + Pages + probe
#   pwsh scripts/deploy-all.ps1 -SkipBuild # reuse existing dist/
#   pwsh scripts/deploy-all.ps1 -SkipProbe # skip post-deploy health probe
#
# Dependencies: node_modules installed. wrangler authed (`wrangler whoami`).

param(
    [switch]$SkipBuild,
    [switch]$SkipProbe
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ''
Write-Host '=== Hub deploy script ===' -ForegroundColor Cyan
Write-Host ''

# 0-1b. Deploy gate: the same `gate:deploy` that deploy:pages:gated and
#     deploy:worker run (identity, lint:activity-reads, typecheck:api, build,
#     member page sweep). With -SkipBuild the build step is left out and the
#     sweep serves the existing dist/, so it sweeps what step 2 deploys.
Write-Host '[0-1/3] Deploy gate...' -ForegroundColor Yellow
if (-not $SkipBuild) {
    npm run gate:deploy
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'DEPLOY GATE FAILED - aborting deploy.' -ForegroundColor Red
        exit 1
    }
} else {
    foreach ($step in @('predeploy:identity', 'lint:activity-reads', 'typecheck:api', 'test:journeys:sweep:gate')) {
        npm run $step
        if ($LASTEXITCODE -ne 0) {
            Write-Host "DEPLOY GATE FAILED at $step - aborting deploy." -ForegroundColor Red
            exit 1
        }
    }
}
Write-Host '  Gate OK.' -ForegroundColor Green

# 2. Pages deploy (frontend + bundled /api Functions Worker)
Write-Host ''
Write-Host '[2/3] Deploying Pages (mn-ccore-lab frontend + Functions)...' -ForegroundColor Yellow
npx --no-install wrangler pages deploy dist --project-name=mn-ccore-lab --commit-dirty=true --branch=main
if ($LASTEXITCODE -ne 0) {
    Write-Host 'PAGES DEPLOY FAILED.' -ForegroundColor Red
    exit 1
}
Write-Host '  Pages deployed.' -ForegroundColor Green

# 3. Post-deploy prod endpoint probe (mandatory — asserts new code is live)
if (-not $SkipProbe) {
    Write-Host ''
    Write-Host '[3/3] Post-deploy probe (asserting /api/health on prod)...' -ForegroundColor Yellow
    node scripts/post-deploy-probe.mjs
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'PROD PROBE FAILED - deploy may not have propagated or prod is broken.' -ForegroundColor Red
        Write-Host '  Check: wrangler pages deployment list --project-name mn-ccore-lab' -ForegroundColor Yellow
        exit 1
    }
    Write-Host '  Probe OK.' -ForegroundColor Green
} else {
    Write-Host ''
    Write-Host '[3/3] Skipping probe (-SkipProbe).' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '=== Deploy complete ===' -ForegroundColor Cyan
