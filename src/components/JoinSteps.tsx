// JoinSteps — the ONE copy of "how to join the lab" (2026-10-09). Nick: "if
// they are not a member it kindly instructs them about it." Rendered by the
// public /join page (the Member Hub tab's page for a signed-in non-member) and
// by RequireAuth's members-only wall (a non-member who opens /portal/*), so
// the two doors cannot drift apart.
//
// Three steps (Nick's draft): talk to Nick or Nate about a project, finish
// CITI training, get added. "Request to join" is the prefilled mailto in
// lib/accessRequest.ts: there is no join-request route in the Worker yet
// (plan 2026-10-08-join-request-reconciled.md is unbuilt). Swap the href when
// that route lands.
//
// tone="page" uses the theme tokens (the public site); tone="dark" uses the
// fixed light-on-dark palette of the sign-in walls, which ignore the theme.

import { Mail, MessageCircle, GraduationCap, UserPlus } from 'lucide-react'
import { accessRequestHref, ACCESS_CONTACT } from '../lib/accessRequest'
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

const TONES = {
  page: { ink: 'var(--ink)', muted: 'var(--slate)', card: 'var(--surface-1)', line: 'var(--border-subtle)', link: 'var(--teal)' },
  dark: { ink: '#e2e8f0', muted: 'rgba(226,232,240,0.75)', card: 'rgba(255,255,255,0.04)', line: 'rgba(255,255,255,0.08)', link: '#5cbcb4' },
} as const

export default function JoinSteps({ email, name, tone = 'page' }: { email: string; name: string; tone?: 'page' | 'dark' }) {
  const c = TONES[tone]
  return (
    <div data-testid="join-steps" style={{ width: '100%', textAlign: 'left' }}>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {STEPS.map((step, i) => {
          const Icon = step.icon
          return (
            <li
              key={step.title}
              style={{ display: 'flex', gap: 14, padding: '16px 18px', borderRadius: 12, border: `1px solid ${c.line}`, background: c.card }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 28, height: 28, borderRadius: 999, flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 600, color: '#c9a84c', border: '1px solid #c9a84c',
                }}
              >
                {i + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: c.ink }}>
                  <Icon {...ICON_PROPS} size={15} style={{ color: c.muted }} />
                  {step.title}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.55, color: c.muted }}>{step.body}</p>
              </div>
            </li>
          )
        })}
      </ol>

      <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <a
          href={accessRequestHref(email, name)}
          data-testid="join-request"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 8,
            // The fixed gold of the sign-in walls, not var(--gold): the light
            // theme's darker gold fails contrast under dark text.
            padding: '10px 18px', background: '#c9a84c', color: '#1a1a1a', fontSize: 14, fontWeight: 500,
            textDecoration: 'none', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 2px rgba(0,0,0,0.15)',
          }}
        >
          <Mail {...ICON_PROPS} size={15} />
          Request to join
        </a>
        <span style={{ fontSize: 14, color: c.muted }}>
          Questions? Email <a href={`mailto:${ACCESS_CONTACT}`} style={{ color: c.link }}>{ACCESS_CONTACT}</a>
        </span>
      </div>
    </div>
  )
}
