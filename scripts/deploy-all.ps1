# deploy-all.ps1 — one-shot deploy for Hub Worker + Pages frontend.
#
# Cloudflare Pages on mn-ccore-lab has NO git integration
# (`wrangler pages project list` → "Git Provider: No").
# git push does NOT auto-deploy Pages. Runs this script after any Hub
# API change that needs to land on production.
#
# Usage (from mn-ccore-lab dir):
#   pwsh scripts/deploy-all.ps1             # full build + Worker + Pages
#   pwsh scripts/deploy-all.ps1 -WorkerOnly # skip Pages (API-only change)
#   pwsh scripts/deploy-all.ps1 -PagesOnly  # skip Worker (frontend-only change)
#
# Dependencies: node_modules installed. wrangler authed (`wrangler whoami`).

param(
    [switch]$WorkerOnly,
    [switch]$PagesOnly,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ''
Write-Host '=== Hub deploy script ===' -ForegroundColor Cyan
Write-Host ''

# 1. Build dist (required for Pages; also catches TS errors before Worker deploy)
if (-not $SkipBuild) {
    Write-Host '[1/3] Building dist (tsc + vite)...' -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'BUILD FAILED — aborting deploy.' -ForegroundColor Red
        exit 1
    }
    Write-Host '  Build OK.' -ForegroundColor Green
} else {
    Write-Host '[1/3] Skipping build (--SkipBuild).' -ForegroundColor DarkGray
}

# 2. Worker deploy
if (-not $PagesOnly) {
    Write-Host ''
    Write-Host '[2/3] Deploying Worker (mn-ccore-lab-api)...' -ForegroundColor Yellow
    npx --no-install wrangler deploy
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'WORKER DEPLOY FAILED.' -ForegroundColor Red
        exit 1
    }
    Write-Host '  Worker deployed.' -ForegroundColor Green
} else {
    Write-Host '[2/3] Skipping Worker (--PagesOnly).' -ForegroundColor DarkGray
}

# 3. Pages deploy
if (-not $WorkerOnly) {
    Write-Host ''
    Write-Host '[3/3] Deploying Pages (mn-ccore-lab frontend + Functions)...' -ForegroundColor Yellow
    npx --no-install wrangler pages deploy dist --project-name=mn-ccore-lab --commit-dirty=true --branch=main
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'PAGES DEPLOY FAILED.' -ForegroundColor Red
        exit 1
    }
    Write-Host '  Pages deployed.' -ForegroundColor Green
} else {
    Write-Host '[3/3] Skipping Pages (--WorkerOnly).' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '=== Deploy complete ===' -ForegroundColor Cyan
Write-Host 'Verify at https://mn-ccore-lab.pages.dev/api/health'
