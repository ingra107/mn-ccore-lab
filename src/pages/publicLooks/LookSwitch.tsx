import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import HomeLook from './HomeLooks'
import TeamLook from './TeamLooks'
import { LOOKS, type Look } from './lab'

/** Throwaway: ?look=a|b|c|d swaps the page for a mockup variant; no param = the live page. */
export default function LookSwitch({ page, children }: { page: 'home' | 'team'; children: ReactNode }) {
  const [sp] = useSearchParams()
  const look = sp.get('look') as Look | null
  if (!look || !LOOKS.includes(look)) return <>{children}</>
  return page === 'home' ? <HomeLook look={look} /> : <TeamLook look={look} />
}
