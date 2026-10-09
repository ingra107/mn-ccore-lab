// ProfileSetupPrompt — "Set up your profile" on Today, for a person whose
// profile is still missing its title, bio or photo (rule and reasons:
// src/lib/profileCompleteness.ts). Replaces My Hub's 30-day onboarding
// checklist (nav redesign, 2026-10-09). Nick: "it prompts them to set up their
// profile, whether that's through a task or a pop-up or something, and then
// they can snooze that if they don't want to do it now."
//
// "Set up" opens My Profile. "Remind me tomorrow" hides it until tomorrow,
// per person, in this browser (localStorage; the spec allows it). It goes
// away for good the moment the profile is complete: ProfilePage's save
// invalidates the same ['team-raw'] query this reads.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { UserRound } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useTeamRaw } from '../../hooks/useTeamRaw'
import { missingProfileFields, PROFILE_FIELD_NAMES, snoozeKey, isSnoozed } from '../../lib/profileCompleteness'
import { todayKey, civilDatePlusDays } from '../../lib/taskGrouping'
import { PATHS } from '../../constants/paths'
import { ICON_PROPS } from '../../lib/iconProps'

function readSnooze(slug: string): string | null {
  try { return localStorage.getItem(snoozeKey(slug)) } catch { return null }
}

export function ProfileSetupPrompt() {
  const { user, isAuthenticated } = useAuth()
  const slug = user?.slug ?? ''
  const raw = useTeamRaw(isAuthenticated && !!slug)
  const [snoozedUntil, setSnoozedUntil] = useState<string | null>(() => (slug ? readSnooze(slug) : null))

  if (!slug || !raw.data) return null
  const row = raw.data.data.find((r) => r.slug === slug)
  const missing = missingProfileFields(row)
  if (missing.length === 0) return null
  if (isSnoozed(snoozedUntil ?? readSnooze(slug), todayKey())) return null

  const snooze = () => {
    const until = civilDatePlusDays(todayKey(), 1)
    try { localStorage.setItem(snoozeKey(slug), until) } catch { /* storage off: hides for this visit only */ }
    setSnoozedUntil(until)
  }
  const list = missing.map((f) => PROFILE_FIELD_NAMES[f])
  const what = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`

  return (
    <section
      data-testid="profile-setup-prompt"
      aria-label="Set up your profile"
      className="tk-panel"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        padding: '10px 14px',
        marginBottom: 14,
        borderLeft: '2px solid var(--sk-gold, var(--gold))',
      }}
    >
      <UserRound {...ICON_PROPS} size={16} aria-hidden style={{ color: 'var(--sk-gold, var(--gold))', flexShrink: 0 }} />
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sk-t1, var(--ink))' }}>Set up your profile</div>
        <div style={{ fontSize: 12, color: 'var(--sk-t2, var(--slate))' }}>
          Add your {what} so the team knows who you are.
        </div>
      </div>
      {/* The two actions stay together and drop under the text on a phone. */}
      <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
        <Link to={PATHS.profile} className="tk-btn" style={{ textDecoration: 'none' }}>Set up</Link>
        <button type="button" onClick={snooze} className="tk-btn" style={{ background: 'none' }}>
          Remind me tomorrow
        </button>
      </div>
    </section>
  )
}
