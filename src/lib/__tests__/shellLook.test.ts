// Three of Nick's approved shell changes (2026-11-05 mock page), held as facts about
// the files: no dark-mode letter spacing, a warm light sidebar, a sidebar wordmark
// without the tagline. The public header keeps the logo with the tagline.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('shell look', () => {
  it('dark mode adds no letter spacing to every page, so it wraps as light does', () => {
    const css = read('src/index.css')
    const darkBlocks = css.split(/^\.dark \{$/m).slice(1).map((b) => b.slice(0, b.indexOf('\n}')))
    expect(darkBlocks.length).toBeGreaterThan(0)
    for (const b of darkBlocks) expect(b).not.toMatch(/^\s*letter-spacing:/m)
  })

  it('the light sidebar is warm off-white, one step under the page', () => {
    const css = read('src/index.css')
    const light = css.indexOf('--sidebar-bg: #ebe7e2;')
    const dark = css.indexOf('--sidebar-bg: color-mix(in oklch, var(--cream), black 12%);')
    expect(light).toBeGreaterThan(-1)
    // Dark mode does not change; its declaration comes after the light one.
    expect(dark).toBeGreaterThan(light)
  })

  it('the sidebar wordmarks have no tagline; the public logos keep it', () => {
    for (const f of ['mnccore-wordmark-dark.svg', 'mnccore-wordmark-primary.svg']) {
      const svg = read(`public/logos/${f}`)
      expect(svg).toContain('CCORE')
      expect(svg).not.toContain('MINNESOTA')
    }
    expect(read('public/logos/mnccore-logo-dark.svg')).toContain('MINNESOTA')
    const sidebar = read('src/components/Sidebar.tsx')
    expect(sidebar).toContain('/logos/mnccore-wordmark-dark.svg')
    expect(sidebar).toContain('/logos/mnccore-wordmark-primary.svg')
    expect(sidebar).not.toContain('mnccore-logo-dark.svg')
    expect(read('src/components/Layout.tsx')).toContain('mnccore-logo-dark.svg')
  })
})
