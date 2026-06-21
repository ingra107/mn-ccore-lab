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
#   pwsh scripts/deploy-all.ps1            # full build + Pages
#   pwsh scripts/deploy-all.ps1 -SkipBuild # reuse existing dist/
#
# Dependencies: node_modules installed. wrangler authed (`wrangler whoami`).

param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ''
Write-Host '=== Hub deploy script ===' -ForegroundColor Cyan
Write-Host ''

# 1. Build dist (required for Pages; also catches TS errors)
if (-not $SkipBuild) {
    Write-Host '[1/2] Building dist (tsc + vite)...' -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'BUILD FAILED - aborting deploy.' -ForegroundColor Red
        exit 1
    }
    Write-Host '  Build OK.' -ForegroundColor Green
} else {
    Write-Host '[1/2] Skipping build (--SkipBuild).' -ForegroundColor DarkGray
}

# 2. Pages deploy (frontend + bundled /api Functions Worker)
Write-Host ''
Write-Host '[2/2] Deploying Pages (mn-ccore-lab frontend + Functions)...' -ForegroundColor Yellow
npx --no-install wrangler pages deploy dist --project-name=mn-ccore-lab --commit-dirty=true --branch=main
if ($LASTEXITCODE -ne 0) {
    Write-Host 'PAGES DEPLOY FAILED.' -ForegroundColor Red
    exit 1
}
Write-Host '  Pages deployed.' -ForegroundColor Green

Write-Host ''
Write-Host '=== Deploy complete ===' -ForegroundColor Cyan
Write-Host 'Verify at https://mn-ccore-lab.pages.dev/api/health'
