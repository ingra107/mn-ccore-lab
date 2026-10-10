import { describe, expect, it } from 'vitest'
import { STATUS_FILLS } from '../../lib/projectHealthFills'

// F106: the heatmap fills are oklch literals, so check the colors the browser
// actually computes, per theme. Chromium resolves a canvas fillStyle to sRGB
// bytes; the card surface and ink are the opaque values index.css resolves to
// (light: #ffffff card, ink oklch(0.15 .02 250); dark: #181c21 card, ink
// oklch(0.92 .01 250)). The cell hairline is ink at 24% over the fill.
const THEMES = {
  light: { card: '#ffffff', ink: 'oklch(0.15 0.02 250)' },
  dark: { card: '#181c21', ink: 'oklch(0.92 0.01 250)' },
} as const

type RGB = [number, number, number]

function toRgb(css: string): RGB {
  const c = document.createElement('canvas')
  c.width = c.height = 1
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  ctx.fillStyle = '#000'
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  return [d[0], d[1], d[2]]
}

function lum([r, g, b]: RGB): number {
  const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const mix = (top: RGB, bottom: RGB, a: number): RGB => top.map((v, i) => Math.round(v * a + bottom[i] * (1 - a))) as RGB

describe('project health heatmap fills (computed colors)', () => {
  const statuses = Object.keys(STATUS_FILLS)
  const fills = Object.fromEntries(statuses.map(s => [s, toRgb(STATUS_FILLS[s])])) as Record<string, RGB>

  it('resolves every fill to a real color, not the black fallback', () => {
    for (const s of statuses) expect(fills[s], s).not.toEqual([0, 0, 0])
    console.info('computed fills', JSON.stringify(fills))
  })

  it('severity steps clearly in lightness, so it reads without hue', () => {
    const order = ['Needs Attention', 'Healthy', 'At Risk', 'Critical']
    for (let i = 1; i < order.length; i++) {
      expect(contrast(fills[order[i - 1]], fills[order[i]]), `${order[i - 1]} vs ${order[i]}`).toBeGreaterThanOrEqual(1.3)
    }
  })

  for (const [theme, { card, ink }] of Object.entries(THEMES)) {
    it(`${theme}: every cell has a visible edge against the card`, () => {
      const cardRgb = toRgb(card)
      const inkRgb = toRgb(ink)
      const report: Record<string, string> = {}
      for (const s of statuses) {
        const fillVsCard = contrast(fills[s], cardRgb)
        const edge = mix(inkRgb, fills[s], 0.24)
        const edgeVsCard = contrast(edge, cardRgb)
        report[s] = `fill ${fillVsCard.toFixed(2)}:1, edge ${edgeVsCard.toFixed(2)}:1`
        // Either the fill itself or its ink hairline must separate from the card.
        expect(Math.max(fillVsCard, edgeVsCard), `${theme} ${s}`).toBeGreaterThanOrEqual(1.5)
      }
      console.info(theme, JSON.stringify(report))
    })
  }
})
