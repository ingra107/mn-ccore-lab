import { describe, expect, it } from 'vitest'
import { withShims } from '../lib/artifactBlob'

const SHIM = '<script>/*shim*/</script>'

describe('withShims', () => {
  it('puts shims after a leading doctype so the page keeps standards mode', () => {
    const html = '<!DOCTYPE html>\n<meta charset="utf-8">\n<p>x</p>'
    expect(withShims(html, SHIM)).toBe('<!DOCTYPE html>' + SHIM + '\n<meta charset="utf-8">\n<p>x</p>')
  })

  it('matches the doctype case-insensitively and after leading whitespace', () => {
    expect(withShims('  <!doctype html><p>x</p>', SHIM)).toBe('  <!doctype html>' + SHIM + '<p>x</p>')
  })

  it('prepends when there is no doctype', () => {
    expect(withShims('<style></style><p>x</p>', SHIM)).toBe(SHIM + '<style></style><p>x</p>')
  })

  it('does not treat a doctype later in the body as leading', () => {
    const html = '<p>see <!DOCTYPE html></p>'
    expect(withShims(html, SHIM)).toBe(SHIM + html)
  })
})
