// MarkdownView — a small, dependency-free markdown renderer for the artifact
// page (Hermes Artifacts v1). The repo has NO markdown library installed and the
// activity feeds render plain pre-wrap text via LinkifiedText; an artifact's
// body_md is long-form and deserves real headings/lists/code, so this renders the
// common subset without pulling in react-markdown.
//
// Supported block constructs: ATX headings (#..######), fenced code (``` ),
// blockquotes (>), unordered lists (-, *, +), ordered lists (1.), horizontal
// rules (---), and paragraphs. Inline: **bold**, *italic*/_italic_, `code`, and
// [text](url) links. Bare URLs in plain runs chip through LinkifiedText (same
// link vocabulary as the rest of the Hub).
//
// Safety: we NEVER use dangerouslySetInnerHTML — every node is a real React
// element, so raw HTML in the markdown renders as literal text (no injection).

import React, { Fragment, type ReactNode } from 'react'
import LinkifiedText from './LinkifiedText'

interface Props {
  source: string
  className?: string
}

// ── inline parsing ──────────────────────────────────────────────────────────
// Tokenize a single line of inline markdown into React nodes. Order matters:
// inline code first (its content is opaque), then links, then bold, then italic.
// Anything left over is plain text → LinkifiedText (URL chips).

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // Split on inline code spans first; code content is rendered verbatim.
  const out: ReactNode[] = []
  const codeRe = /`([^`]+)`/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = codeRe.exec(text)) !== null) {
    if (m.index > last) {
      out.push(...renderInlineNoCode(text.slice(last, m.index), `${keyPrefix}-t${i}`))
    }
    out.push(
      <code
        key={`${keyPrefix}-c${i}`}
        style={{
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '0.875em',
          background: 'var(--surface-2, rgba(100,116,139,0.12))',
          borderRadius: 'var(--radius-sm)',
          padding: '1px 5px',
        }}
      >
        {m[1]}
      </code>,
    )
    last = m.index + m[0].length
    i++
  }
  if (last < text.length) {
    out.push(...renderInlineNoCode(text.slice(last), `${keyPrefix}-t${i}`))
  }
  return out
}

// Links → bold → italic → plain. Operates on a code-free run.
function renderInlineNoCode(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > last) out.push(...renderEmphasis(text.slice(last, m.index), `${keyPrefix}-e${i}`))
    const href = m[2]
    const isHttp = /^https?:\/\//i.test(href)
    out.push(
      <a
        key={`${keyPrefix}-l${i}`}
        href={href}
        target={isHttp ? '_blank' : undefined}
        rel={isHttp ? 'noopener noreferrer' : undefined}
        style={{ color: 'var(--teal)', textDecoration: 'underline' }}
      >
        {m[1]}
      </a>,
    )
    last = m.index + m[0].length
    i++
  }
  if (last < text.length) out.push(...renderEmphasis(text.slice(last), `${keyPrefix}-e${i}`))
  return out
}

// **bold** and *italic*/_italic_; remaining plain text → LinkifiedText.
function renderEmphasis(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  // Combined matcher: bold (**x** / __x__) OR italic (*x* / _x_).
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(<LinkifiedText key={`${keyPrefix}-p${i}`} text={text.slice(last, m.index)} />)
    }
    if (m[1]) {
      out.push(<strong key={`${keyPrefix}-b${i}`} style={{ fontWeight: 600 }}>{m[2]}</strong>)
    } else {
      out.push(<em key={`${keyPrefix}-i${i}`}>{m[4]}</em>)
    }
    last = m.index + m[0].length
    i++
  }
  if (last < text.length) {
    out.push(<LinkifiedText key={`${keyPrefix}-p${i}`} text={text.slice(last)} />)
  }
  return out
}

// ── block parsing ───────────────────────────────────────────────────────────

export default function MarkdownView({ source, className }: Props) {
  const blocks: ReactNode[] = []
  const lines = (source || '').replace(/\r\n/g, '\n').split('\n')
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block.
    const fence = line.match(/^```(\w*)\s*$/)
    if (fence) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i])
        i++
      }
      i++ // consume closing fence
      blocks.push(
        <pre
          key={`blk-${key++}`}
          style={{
            background: 'var(--surface-2, rgba(100,116,139,0.1))',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--sp-md, 12px)',
            overflowX: 'auto',
            fontSize: '0.85em',
            lineHeight: 1.5,
            margin: '0 0 1em',
          }}
        >
          <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>{codeLines.join('\n')}</code>
        </pre>,
      )
      continue
    }

    // Blank line → skip.
    if (line.trim() === '') { i++; continue }

    // Horizontal rule.
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={`blk-${key++}`} style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '1.5em 0' }} />)
      i++
      continue
    }

    // Heading.
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      const sizes = ['1.5em', '1.3em', '1.15em', '1.05em', '1em', '0.95em']
      // React.createElement avoids the `never` children type that a dynamic
      // JSX tag typed as keyof IntrinsicElements produces under strict TS.
      blocks.push(
        React.createElement(
          `h${Math.min(level, 6)}`,
          {
            key: `blk-${key++}`,
            style: {
              fontSize: sizes[level - 1],
              fontWeight: 600,
              color: 'var(--ink)',
              margin: level <= 2 ? '1.2em 0 0.5em' : '1em 0 0.4em',
              lineHeight: 1.3,
            },
          },
          renderInline(h[2], `h-${key}`),
        ),
      )
      i++
      continue
    }

    // Blockquote.
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      blocks.push(
        <blockquote
          key={`blk-${key++}`}
          style={{
            borderLeft: '3px solid var(--border-subtle)',
            paddingLeft: 'var(--sp-md, 12px)',
            margin: '0 0 1em',
            color: 'var(--slate)',
          }}
        >
          {renderInline(quoteLines.join(' '), `q-${key}`)}
        </blockquote>,
      )
      continue
    }

    // Lists (unordered or ordered) — collect consecutive item lines.
    const ulItem = line.match(/^\s*[-*+]\s+(.*)$/)
    const olItem = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ulItem || olItem) {
      const ordered = !!olItem
      const items: string[] = []
      while (i < lines.length) {
        const um = lines[i].match(/^\s*[-*+]\s+(.*)$/)
        const om = lines[i].match(/^\s*\d+\.\s+(.*)$/)
        if (ordered && om) items.push(om[1])
        else if (!ordered && um) items.push(um[1])
        else break
        i++
      }
      const ListTag = ordered ? 'ol' : 'ul'
      blocks.push(
        <ListTag
          key={`blk-${key++}`}
          style={{
            margin: '0 0 1em',
            paddingLeft: '1.5em',
            listStyleType: ordered ? 'decimal' : 'disc',
            color: 'var(--ink)',
          }}
        >
          {items.map((it, idx) => (
            <li key={idx} style={{ marginBottom: '0.25em', lineHeight: 1.55 }}>
              {renderInline(it, `li-${key}-${idx}`)}
            </li>
          ))}
        </ListTag>,
      )
      continue
    }

    // Paragraph — gather until a blank line or a block-starting line.
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      paraLines.push(lines[i])
      i++
    }
    blocks.push(
      <p key={`blk-${key++}`} style={{ margin: '0 0 1em', lineHeight: 1.6, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
        {renderInline(paraLines.join('\n'), `p-${key}`)}
      </p>,
    )
  }

  return (
    <div className={className} style={{ fontSize: 'var(--value-size, 15px)' }}>
      {blocks.map((b, idx) => (
        <Fragment key={idx}>{b}</Fragment>
      ))}
    </div>
  )
}
