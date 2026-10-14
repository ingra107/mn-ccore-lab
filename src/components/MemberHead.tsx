import type { ComponentProps } from 'react'
import { useLocation } from 'react-router-dom'
import SectionHead from './ui/SectionHead'
import { SecHead } from './public/PublicParts'

/** The one section head on a team member page. The page serves the public
 *  site and the portal: the public gets the serif head (SecHead), the portal
 *  keeps ui/SectionHead. Every section on the page uses this, so the heads
 *  match; "Projects", "All papers" and the dashboard used to draw large display
 *  heads of their own beside the small ones (overnight audit 2026-10-14, G9-10;
 *  rules-ui-design principle 11, consistency). */
export default function MemberHead(props: ComponentProps<typeof SectionHead>) {
  const { pathname } = useLocation()
  if (pathname.startsWith('/portal/')) return <SectionHead {...props} />
  return <SecHead title={props.title} count={props.count} right={props.right} id={props.id} />
}
