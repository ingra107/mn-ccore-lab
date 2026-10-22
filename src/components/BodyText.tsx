import type React from 'react'
import LinkifiedText from './LinkifiedText'

/**
 * The ONE way to render user/Claude-authored free text (task/project/idea
 * description, notes, agenda or comment body). Raw http(s) URLs and markdown
 * `[text](url)` become clickable links (new tab, rel=noopener); line breaks
 * survive via pre-wrap.
 *
 * Rendering `x.description` / `x.notes` as a bare JSX child leaves URLs dead
 * (Nick 2026-10-22: "why any link in the description isn't a hyperlink i can
 * click"). The `local/body-text` ESLint rule (eslint.config.js) refuses that
 * shape, so a new surface cannot forget this component.
 */
export default function BodyText({
  text,
  className,
  style,
}: {
  text: string | null | undefined
  className?: string
  style?: React.CSSProperties
}) {
  if (!text) return null
  return <LinkifiedText text={text} className={className} style={{ whiteSpace: 'pre-wrap', ...style }} />
}
