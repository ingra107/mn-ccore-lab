/**
 * cors.json (the R2 bucket CORS rules, applied by hand) and ALLOWED_ORIGINS
 * (api/helpers.ts, the Worker's reflect list) are two copies of one origin
 * list. They differ in one place on purpose: wrangler dev (:8787) calls the
 * Worker, never the bucket, so cors.json leaves it out.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ALLOWED_ORIGINS } from './helpers'

const WORKER_ONLY = new Set(['http://localhost:8787'])

describe('cors.json vs ALLOWED_ORIGINS', () => {
  it('lists the same origins, bar the worker-only dev origin', () => {
    const cors = JSON.parse(readFileSync(new URL('../cors.json', import.meta.url), 'utf8')) as {
      rules: { allowed: { origins: string[] } }[]
    }
    const bucket = new Set(cors.rules.flatMap((r) => r.allowed.origins))
    const expected = new Set([...ALLOWED_ORIGINS].filter((o) => !WORKER_ONLY.has(o)))
    expect([...bucket].sort()).toEqual([...expected].sort())
  })
})
