// JoinPage — where the public "Member Hub" tab sends someone who is signed in
// with a UMN account but is not a lab member yet (nav redesign, 2026-10-09).
// Nick: "if they are not a member it kindly instructs them about it."
//
// Three steps (Nick's draft): talk to Nick or Nate about a project, finish
// CITI training, get added. "Request to join" opens an email to Nick through
// the same prefilled mailto the members-only wall uses (lib/accessRequest.ts):
// there is no join-request route in the Worker yet (the reconciled plan
// 2026-10-08-join-request-reconciled.md is unbuilt), so this is the honest
// channel today. Swap the href when that route lands.

import { Link } from 'react-router-dom'
import { Mail, MessageCircle, GraduationCap, UserPlus } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { usePageMeta } from '../hooks/usePageMeta'
import { accessRequestHref, ACCESS_CONTACT } from '../lib/accessRequest'
import { PATHS } from '../constants/paths'
import { ICON_PROPS } from '../lib/iconProps'

const STEPS = [
  {
    icon: MessageCircle,
    title: 'Talk to Nick or Nate about a project',
    body: 'Every member joins through a project. Reach out to Dr. Nick Ingraham or Dr. Nate Mesfin about the work you want to do with the lab.',
  },
  {
    icon: GraduationCap,
    title: 'Finish your CITI training',
    body: 'Complete your CITI human subjects research training.',
  },
  {
    icon: UserPlus,
    title: 'Get added',
    body: 'Once you are on a project, Nick adds your UMN email to the Hub. The Member Hub tab then opens your Today page.',
  },
] as const

export default function JoinPage() {
  usePageMeta('Join MN-CCORE · MN-CCORE', 'How to join the MN-CCORE lab and its Member Hub.')
  const { user, isAuthenticated } = useAuth()
  const email = user?.email ?? ''
  const name = user?.name ?? ''
  const isMember = isAuthenticated && user?.isMember

  return (
    <div className="content-container" style={{ paddingTop: '3rem', paddingBottom: '4rem', maxWidth: 720 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '2rem', color: 'var(--ink)', margin: 0 }}>
        Join the lab
      </h1>
      <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6, color: 'var(--slate)', maxWidth: 560 }}>
        The Member Hub is where MN-CCORE members run their projects, meetings and tasks.
        {isAuthenticated && !isMember && email
          ? <> You are signed in as <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>{email}</strong>, which is not on a lab project yet. Here is how to join.</>
          : <> Here is how to join.</>}
      </p>

      {isMember && (
        <p style={{ marginTop: 16, fontSize: 14 }}>
          You are already a member. <Link to={PATHS.dashboard} style={{ color: 'var(--teal)' }}>Go to Today</Link>
        </p>
      )}

      <ol style={{ listStyle: 'none', padding: 0, margin: '2rem 0 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {STEPS.map((step, i) => {
          const Icon = step.icon
          return (
            <li
              key={step.title}
              className="rounded-xl border"
              style={{ display: 'flex', gap: 14, padding: '16px 18px', borderColor: 'var(--border-subtle)', background: 'var(--surface-1)' }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 28, height: 28, borderRadius: 999, flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 600, color: 'var(--gold)', border: '1px solid var(--gold)',
                }}
              >
                {i + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
                  <Icon {...ICON_PROPS} size={15} style={{ color: 'var(--slate)' }} />
                  {step.title}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--slate)' }}>{step.body}</p>
              </div>
            </li>
          )
        })}
      </ol>

      <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <a
          href={accessRequestHref(email, name)}
          data-testid="join-request"
          className="inline-flex items-center gap-2 rounded-lg"
          style={{
            // The fixed gold of the sign-in walls (RequireAuth.tsx), not var(--gold):
            // the light theme's darker gold fails contrast under dark text.
            padding: '10px 18px', background: '#c9a84c', color: '#1a1a1a', fontSize: 14, fontWeight: 500,
            textDecoration: 'none', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 2px rgba(0,0,0,0.15)',
          }}
        >
          <Mail {...ICON_PROPS} size={15} />
          Request to join
        </a>
        <span style={{ fontSize: 14, color: 'var(--slate)' }}>
          Questions? Email <a href={`mailto:${ACCESS_CONTACT}`} style={{ color: 'var(--teal)' }}>{ACCESS_CONTACT}</a>
        </span>
      </div>
    </div>
  )
}
