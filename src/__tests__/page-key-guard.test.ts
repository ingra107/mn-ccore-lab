// A page-wide key (Calendar's arrows and t) must stand down when the keystroke
// belongs to something else: a contenteditable, an open menu or list, a modal
// layer such as the command palette, or a modified key (Alt+Left is Back).
import { describe, it, expect, afterEach } from 'vitest'
import { shouldIgnorePageKey } from '../lib/editableTarget'

const made: HTMLElement[] = []
afterEach(() => { while (made.length) made.pop()!.remove() })
function add(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  made.push(host)
  return host.firstElementChild as HTMLElement
}
function key(target: EventTarget | null, init: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, ...init })
  Object.defineProperty(e, 'target', { value: target })
  return e
}

describe('shouldIgnorePageKey', () => {
  it('lets a plain key on the page body through', () => {
    expect(shouldIgnorePageKey(key(document.body))).toBe(false)
  })
  it('ignores typing in inputs and contenteditable', () => {
    expect(shouldIgnorePageKey(key(add('<input>')))).toBe(true)
    const ce = add('<div contenteditable="true">x</div>')
    Object.defineProperty(ce, 'isContentEditable', { value: true })
    expect(shouldIgnorePageKey(key(ce))).toBe(true)
  })
  it('ignores a key inside an open menu or list', () => {
    const item = add('<div role="menu"><button id="m">x</button></div>').querySelector('#m')!
    expect(shouldIgnorePageKey(key(item))).toBe(true)
  })
  it('ignores every key while a modal layer is open', () => {
    add('<div role="dialog" aria-modal="true"></div>')
    expect(shouldIgnorePageKey(key(document.body))).toBe(true)
  })
  it('ignores modified keys', () => {
    expect(shouldIgnorePageKey(key(document.body, { altKey: true }))).toBe(true)
    expect(shouldIgnorePageKey(key(document.body, { metaKey: true }))).toBe(true)
  })
})
