/**
 * memberHue.ts: one personal hue per member (color back pick 8).
 *
 * The load-bearing check is the collision test: it reads the four job colors
 * (red overdue, orange going stale, gold wants-you-now, teal accent) from
 * index.css in BOTH themes, converts them to OKLCH, and requires every hue
 * memberHue() can return to sit at least 45 degrees from each of them.
 *
 * Run: npx vitest run --config vitest.config.lib.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { memberHue, heatColor, MEMBER_HUE_MIN, MEMBER_HUE_SPAN } from '../memberHue'

const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf-8')

function srgbToOklchHue(hex: string): number {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16)))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
}

/** Every hex value a job token takes, light (:root) and dark (.dark). */
function jobHexes(token: string): string[] {
  const re = new RegExp(`${token}\\s*:\\s*(#[0-9A-Fa-f]{6})\\s*;`, 'g')
  return [...css.matchAll(re)].map((m) => m[1])
}

const angle = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

describe('memberHue', () => {
  it('is deterministic and stays inside the window', () => {
    for (const seed of ['casey-eddington', 'nick-ingraham', 'lianne-siegel', 'nathnael-mesfin', '', 'x']) {
      const h = memberHue(seed)
      expect(memberHue(seed)).toBe(h)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(MEMBER_HUE_MIN)
      expect(h).toBeLessThan(MEMBER_HUE_MIN + MEMBER_HUE_SPAN)
    }
  })

  it('gives different people different hues (spread, not one bucket)', () => {
    const seeds = ['casey-eddington', 'nick-ingraham', 'lianne-siegel', 'nathnael-mesfin', 'jared-huling', 'adams-dudley']
    expect(new Set(seeds.map(memberHue)).size).toBeGreaterThanOrEqual(4)
  })

  it('never lands within 45 degrees of red, orange, gold or teal, in either theme', () => {
    const tokens = ['--sk-od', '--sk-urg', '--sk-gold', '--sk-ac']
    for (const token of tokens) {
      const hexes = jobHexes(token)
      // :root and .dark each define the token: both themes are checked.
      expect(hexes.length, `${token} light + dark in index.css`).toBeGreaterThanOrEqual(2)
      for (const hex of hexes) {
        const job = srgbToOklchHue(hex)
        for (let h = MEMBER_HUE_MIN; h < MEMBER_HUE_MIN + MEMBER_HUE_SPAN; h++) {
          expect(angle(h, job), `hue ${h} vs ${token} ${hex} (${job.toFixed(1)})`).toBeGreaterThanOrEqual(45)
        }
      }
    }
  })

  it('index.css defines the member scope with both themes and the heat hook', () => {
    expect(css).toMatch(/\.member-hue\s*\{[^}]*--id:\s*oklch\([^)]*var\(--mh-h\)\)/)
    expect(css).toMatch(/\.dark \.member-hue\s*\{[^}]*--id:\s*oklch\([^)]*var\(--mh-h\)\)/)
    expect(css).toMatch(/\.member-hue\s*\{[^}]*--heat:\s*var\(--id\)/)
  })
})

describe('heatColor', () => {
  it('mixes the page heat color (the accent by default) and clamps strength', () => {
    expect(heatColor(1)).toBe('color-mix(in srgb, var(--heat, var(--job-accent)) 100%, transparent)')
    expect(heatColor(0.4)).toBe('color-mix(in srgb, var(--heat, var(--job-accent)) 40%, transparent)')
    expect(heatColor(2)).toContain(' 100%,')
    expect(heatColor(-1)).toContain(' 0%,')
  })
})
