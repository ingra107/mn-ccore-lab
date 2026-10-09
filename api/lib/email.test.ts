import { describe, it, expect, vi, afterEach } from 'vitest'
import { html, raw, taskAssignmentEmail, sendEmail, isDigestRecipient, HUB_URL } from './email'

const HOSTILE = `<img src=x onerror=alert(1)> "q" 'a' & <script>`

describe('html tag', () => {
  it('escapes every interpolated string', () => {
    const out = html`<p>${HOSTILE}</p>`.value
    expect(out).not.toContain('<img')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;img')
    expect(out).toContain('&amp;')
    expect(out).toContain('&quot;q&quot;')
  })

  it('passes raw() and nested html through unescaped, escapes numbers and null', () => {
    expect(html`<b>${raw('<i>x</i>')}</b>`.value).toBe('<b><i>x</i></b>')
    expect(html`<b>${html`<i>${'<'}</i>`}</b>`.value).toBe('<b><i>&lt;</i></b>')
    expect(html`<b>${null}${undefined}${3}</b>`.value).toBe('<b>3</b>')
    expect(html`<ul>${['a', 'b'].map((s) => html`<li>${s}</li>`)}</ul>`.value).toBe('<ul><li>a</li><li>b</li></ul>')
  })
})

describe('taskAssignmentEmail', () => {
  it('escapes hostile task title and assigner name in the HTML', () => {
    const e = taskAssignmentEmail(HOSTILE, HOSTILE, 'task_1')
    expect(e.html.value).not.toContain('<img')
    expect(e.html.value).not.toContain('<script>')
    expect(e.html.value).toContain('&lt;img')
  })

  it('links to the mnccore.org portal and encodes the id', () => {
    const e = taskAssignmentEmail('Nick', 'Do it', 'a b&c')
    expect(HUB_URL).toBe('https://mnccore.org')
    expect(e.html.value).toContain('href="https://mnccore.org/portal/my-tasks?open=a%20b%26c"')
    expect(e.html.value).not.toContain('pages.dev')
  })

  it('keeps line breaks out of the subject', () => {
    const e = taskAssignmentEmail('Nick', 'a\r\nBcc: x@y.z', 'id')
    expect(e.subject).not.toMatch(/[\r\n]/)
  })
})

describe('sendEmail', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts the SafeHtml value to Resend and reports failure', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await sendEmail('k', { to: 'a@b.c', subject: 's', html: raw('<p>x</p>') })).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(JSON.parse(String(init.body)).html).toBe('<p>x</p>')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 403 })))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await sendEmail('k', { to: 'a@b.c', subject: 's', html: raw('') })).toBe(false)
  })
})

describe('isDigestRecipient', () => {
  it('defaults to Nick only', () => {
    expect(isDigestRecipient('nick-ingraham', {})).toBe(true)
    expect(isDigestRecipient('nate-mesfin', {})).toBe(false)
    expect(isDigestRecipient('casey-eddington', { DIGEST_RECIPIENTS: '' })).toBe(false)
  })

  it('widens by comma list or "all"', () => {
    expect(isDigestRecipient('nate-mesfin', { DIGEST_RECIPIENTS: 'nick-ingraham, nate-mesfin' })).toBe(true)
    expect(isDigestRecipient('casey-eddington', { DIGEST_RECIPIENTS: 'nick-ingraham, nate-mesfin' })).toBe(false)
    expect(isDigestRecipient('anyone', { DIGEST_RECIPIENTS: 'all' })).toBe(true)
  })
})
