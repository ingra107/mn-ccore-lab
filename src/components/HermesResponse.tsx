import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { PATHS } from '../constants/paths'

export type HermesCitation =
  | { type: 'project'; slug: string; title: string }
  | { type: 'publication'; slug?: string; title: string; url?: string }
  | { type: 'task'; id: string; title: string }
  | { type: 'meeting'; id: string; title: string }

export interface HermesFinding {
  value: string
  label: string
  detail?: string
}

interface ParsedHermes {
  prose: string
  citations: HermesCitation[]
  findings: HermesFinding[]
}

const FENCE_PATTERN = /\n*```hermes\s*\n([\s\S]*?)\n```\s*$/

export function parseHermesContent(raw: string): ParsedHermes {
  const match = raw.match(FENCE_PATTERN)
  if (!match) return { prose: raw, citations: [], findings: [] }

  try {
    const parsed = JSON.parse(match[1]) as { citations?: unknown; findings?: unknown }
    const citations = Array.isArray(parsed.citations) ? (parsed.citations as HermesCitation[]) : []
    const findings = Array.isArray(parsed.findings) ? (parsed.findings as HermesFinding[]) : []
    return {
      prose: raw.replace(FENCE_PATTERN, '').trimEnd(),
      citations,
      findings,
    }
  } catch {
    return { prose: raw, citations: [], findings: [] }
  }
}

function citationHref(c: HermesCitation): string | null {
  if (c.type === 'project' && c.slug) return PATHS.project(c.slug)
  if (c.type === 'task' && c.id) return `${PATHS.tasks}?focus=${encodeURIComponent(c.id)}`
  if (c.type === 'meeting' && c.id) return PATHS.meeting(c.id)
  if (c.type === 'publication') {
    if (c.url) return c.url
    if (c.slug) return `/publications#${encodeURIComponent(c.slug)}`
  }
  return null
}

export default function HermesResponse({ content }: { content: string }) {
  const { prose, citations, findings } = parseHermesContent(content)

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <p
        className="text-sm leading-relaxed"
        style={{ color: 'var(--ink)', margin: 0, whiteSpace: 'pre-wrap' }}
      >
        {prose}
      </p>

      {findings.length > 0 && (
        <div className="flex flex-col" style={{ gap: 6 }}>
          {findings.map((f, i) => (
            <div
              key={i}
              role="note"
              aria-label={`Operation finding: ${f.value} ${f.label}`}
              style={{
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--gold)',
                background: 'var(--gold-emphasis)',
                padding: 'var(--sp-sm) var(--sp-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--gold-on-emphasis)',
                  opacity: 0.85,
                }}
              >
                Operation Findings
              </span>
              <div className="flex items-baseline" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 700,
                    fontSize: 22,
                    color: 'var(--gold-on-emphasis)',
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.1,
                  }}
                >
                  {f.value}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: 'var(--ink)',
                    lineHeight: 1.4,
                  }}
                >
                  {f.label}
                </span>
              </div>
              {f.detail && (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)', lineHeight: 1.5 }}>
                  {f.detail}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {citations.length > 0 && (
        <div
          aria-label="Sources"
          className="flex flex-wrap items-center"
          style={{ gap: 6, marginTop: 2 }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--slate)',
              opacity: 0.7,
              marginRight: 2,
            }}
          >
            Sources
          </span>
          {citations.map((c, i) => {
            const href = citationHref(c)
            const inner = (
              <>
                <span style={{ opacity: 0.85 }}>{c.type}</span>
                <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{c.title}</span>
                {c.type === 'publication' && c.url && <ExternalLink size={10} aria-hidden="true" />}
              </>
            )
            const pillStyle: React.CSSProperties = {
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              borderRadius: 'var(--radius-full)',
              fontSize: 11,
              border: '1px solid var(--border-subtle)',
              background: 'var(--cream)',
              color: 'var(--slate)',
              textDecoration: 'none',
              maxWidth: 240,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }
            if (!href) {
              return (
                <span key={i} style={pillStyle}>
                  {inner}
                </span>
              )
            }
            if (href.startsWith('http')) {
              return (
                <a key={i} href={href} target="_blank" rel="noopener noreferrer" style={pillStyle}>
                  {inner}
                </a>
              )
            }
            return (
              <Link key={i} to={href} style={pillStyle}>
                {inner}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
