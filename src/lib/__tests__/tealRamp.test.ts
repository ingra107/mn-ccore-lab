// The teal data ramp (color back pick 7, Nick 2026-10-11): stages run from the
// dim end to the full accent, and funded grant bars are teal with white text.
import { describe, it, expect } from 'vitest'
import { tealRamp, rampStep, litFill, rampBar, BAR_TRACK, LIT_EDGE, TEAL_STABLE } from '../tealRamp'
import { GRANT_BAR_FILL, GRANT_BAR_TOP, GRANT_BAR_LIT } from '../grantBar'

describe('tealRamp', () => {
  it('runs from the dim end (0) to the bright end (1)', () => {
    expect(tealRamp(0)).toBe('color-mix(in srgb, var(--sk-ramp-hi) 0%, var(--sk-ramp-dim))')
    expect(tealRamp(0.5)).toBe('color-mix(in srgb, var(--sk-ramp-hi) 50%, var(--sk-ramp-dim))')
    expect(tealRamp(1)).toBe('color-mix(in srgb, var(--sk-ramp-hi) 100%, var(--sk-ramp-dim))')
  })

  it('clamps out-of-range and non-finite input instead of emitting a broken color', () => {
    expect(tealRamp(-2)).toBe(tealRamp(0))
    expect(tealRamp(7)).toBe(tealRamp(1))
    expect(tealRamp(Number.NaN)).toBe(tealRamp(1))
  })

  it('spaces n stages evenly, and a lone stage is the bright end', () => {
    expect([0, 1, 2].map((i) => rampStep(i, 3))).toEqual([0, 0.5, 1])
    expect(rampStep(0, 1)).toBe(1)
  })

  it('a lit fill keeps the color below a lighter top edge', () => {
    expect(litFill('red')).toBe('linear-gradient(180deg, color-mix(in srgb, red 84%, #fff) 0%, red 70%)')
  })

  it('rampBar is the lit ramp color plus its top highlight; the track is the shared token', () => {
    expect(rampBar(0.5)).toEqual({ background: litFill(tealRamp(0.5)), boxShadow: LIT_EDGE })
    expect(BAR_TRACK).toBe('var(--sk-bar-track)')
  })
})

// sRGB relative luminance + WCAG contrast, for the white label on a funded bar.
function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contrastWithWhite = (hex: string) => 1.05 / (lum(hex) + 0.05)

describe('grant bars', () => {
  it('funded bars are the theme-stable teal, lit, and hold white text at AA', () => {
    expect(GRANT_BAR_FILL).toBe(TEAL_STABLE)
    expect(GRANT_BAR_LIT).toBe(litFill(TEAL_STABLE, 90))
    expect(contrastWithWhite(GRANT_BAR_FILL)).toBeGreaterThanOrEqual(4.5)
    // the top edge is the lightest part of the bar; the label still clears AA there
    expect(contrastWithWhite(GRANT_BAR_TOP)).toBeGreaterThanOrEqual(4.5)
  })

  it('GRANT_BAR_TOP is TEAL_STABLE mixed 90/10 with white, as litFill(.., 90) draws it', () => {
    const mix = [1, 3, 5].map((i) => Math.round(parseInt(TEAL_STABLE.slice(i, i + 2), 16) * 0.9 + 255 * 0.1))
    const hex = '#' + mix.map((v) => v.toString(16).padStart(2, '0')).join('')
    expect(GRANT_BAR_TOP).toBe(hex)
  })
})
