import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: '.', testMatch: 'tmp-perf-static.spec.ts', workers: 1, retries: 0, reporter: [['list']], use: { headless: true } })
