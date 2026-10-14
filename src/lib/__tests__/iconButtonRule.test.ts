// icon/icon-button (eslint-rules/icon-button.mjs): an icon-only control can
// only be built as <Button size="icon">, whose type requires an aria-label and
// whose .btn-icon class carries the 24px box (44px on touch). PB backlog #1366.

import { describe, it, expect } from 'vitest'
import { Linter } from 'eslint'
import tseslint from 'typescript-eslint'
import iconButton from '../../../eslint-rules/icon-button.mjs'

const linter = new Linter({ configType: 'flat' })
const config = [{
  files: ['**/*.tsx'],
  languageOptions: { parser: tseslint.parser },
  plugins: { icon: { rules: { 'icon-button': iconButton } } },
  rules: { 'icon/icon-button': 'error' as const },
}]

function ids(code: string): string[] {
  const src = `import { X, Trash2 } from 'lucide-react'\n${code}`
  return linter.verify(src, config, 'site.tsx').map((m) => m.messageId ?? m.message)
}

describe('icon/icon-button', () => {
  it('refuses a raw <button> holding only a lucide icon', () => {
    expect(ids('const a = <button aria-label="Close" onClick={f}><X size={14} /></button>')).toEqual(['raw'])
  })

  it('refuses a raw glyph button and a conditional icon pair', () => {
    expect(ids('const a = <button onClick={f}>×</button>')).toEqual(['raw'])
    expect(ids('const a = <button>{open ? <X /> : <Trash2 />}</button>')).toEqual(['raw'])
    expect(ids('const a = <button><svg width="12" /></button>')).toEqual(['raw'])
  })

  it('refuses an icon-only <Button> at a text size', () => {
    expect(ids('const a = <Button variant="ghost" aria-label="Close"><X /></Button>')).toEqual(['size'])
  })

  it('treats 1-2 letter or digit text as text, not an icon', () => {
    expect(ids('const a = <button>OK</button>')).toEqual([])
    expect(ids('const a = <button>Go</button>')).toEqual([])
    expect(ids('const a = <button>12</button>')).toEqual([])
    expect(ids('const a = <button>NI</button>')).toEqual([])
    expect(ids('const a = <button>{"OK"}</button>')).toEqual([])
    expect(ids('const a = <Button variant="ghost">OK</Button>')).toEqual([])
  })

  it('still refuses a symbol glyph button', () => {
    expect(ids('const a = <button>+</button>')).toEqual(['raw'])
    expect(ids('const a = <button>{"×"}</button>')).toEqual(['raw'])
  })

  it('accepts Button size="icon" and any button with words', () => {
    expect(ids('const a = <Button size="icon" aria-label="Close"><X /></Button>')).toEqual([])
    expect(ids('const a = <button><X /> Close</button>')).toEqual([])
    expect(ids('const a = <button>{label}</button>')).toEqual([])
    expect(ids('const a = <button><span>Save</span></button>')).toEqual([])
  })
})
