import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { UserPlus, X } from 'lucide-react'
import { Button } from './ui/Button'
import { ICON_PROPS } from '../lib/iconProps'
import { addTeamMember } from '../lib/teamApi'
import { slugFromName, MEMBER_SLUG, UMN_EMAIL } from '../../shared/memberSlug'

/**
 * PI-only "Add member" on the Team page (2026-10-08). Sign-in no longer
 * creates team_members rows (any @umn.edu could sign in and became a member),
 * so this is how a new person gets in: name + UMN email -> POST /api/team.
 * The profile slug is first-last from the name, shown so the PI sees it, and
 * editable when the server says it is taken. Opens in place under the button.
 */

// The roles research_team rows carry today (prod, 2026-10-08), offered as
// suggestions; the field is free text and may stay blank.
const ROLE_SUGGESTIONS = ['Research Coordinator', 'Data Analyst', 'Critical Care Fellow', 'Medical Student Researcher']
const MEMBER_TYPES: Array<{ value: string; label: string }> = [
  { value: 'research_team', label: 'Research team' },
  { value: 'faculty', label: 'Faculty collaborator' },
  { value: 'senior_mentor', label: 'Senior mentor' },
  { value: 'director', label: 'Co-director' },
]

const inputStyle = { borderColor: 'var(--border-subtle)', background: 'var(--surface-0)', color: 'var(--ink)' } as const
// 16px text keeps iOS Safari from zooming into a focused field; 44px tall
// meets the touch-target floor.
const inputClass = 'w-full rounded-md border px-3 text-base sm:text-sm outline-none min-h-[44px] sm:min-h-[36px]'

export default function AddMemberPanel() {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        data-testid="add-member-open"
        className="inline-flex items-center gap-1.5"
        style={{ padding: '8px 14px', fontSize: '0.875rem', borderRadius: 'var(--radius-lg)', minHeight: 40 }}
      >
        <UserPlus {...ICON_PROPS} size={15} />
        Add member
      </Button>
    )
  }
  return <AddMemberForm onClose={() => setOpen(false)} />
}

function AddMemberForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const ids = useId()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [memberType, setMemberType] = useState('research_team')
  const [role, setRole] = useState('')
  // null = follow the name; a string = the PI typed one (shown after a clash).
  const [slugEdit, setSlugEdit] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ field: 'email' | 'slug' | 'form'; text: string } | null>(null)
  const [added, setAdded] = useState<{ name: string; email: string; slug: string } | null>(null)

  const slug = slugEdit ?? slugFromName(name)
  const emailNorm = email.trim().toLowerCase()
  const canSubmit = !busy && name.trim() !== '' && UMN_EMAIL.test(emailNorm) && MEMBER_SLUG.test(slug)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    const result = await addTeamMember({
      name: name.trim(), email: emailNorm, slug, member_type: memberType, role: role.trim() || undefined,
    })
    setBusy(false)
    if (result.ok) {
      setAdded({ name: result.member.name, email: result.member.email ?? emailNorm, slug: result.member.slug ?? slug })
      setName(''); setEmail(''); setRole(''); setSlugEdit(null); setMemberType('research_team')
      queryClient.invalidateQueries({ queryKey: ['team'] })
      return
    }
    if (result.code === 'slug_taken') {
      setSlugEdit(slug)
      setError({ field: 'slug', text: `“${slug}” is already someone's profile. Change it below.` })
    } else if (result.code === 'email_taken') {
      setError({ field: 'email', text: result.slug ? `That email already belongs to ${result.slug}.` : result.error })
    } else {
      setError({ field: 'form', text: result.error })
    }
  }

  const label = (text: string, htmlFor: string, hint?: string) => (
    <label htmlFor={htmlFor} className="block text-xs mb-1" style={{ color: 'var(--slate)', fontWeight: 500 }}>
      {text}{hint && <span style={{ fontWeight: 400, opacity: 0.85 }}> {hint}</span>}
    </label>
  )

  return (
    <form
      onSubmit={submit}
      data-testid="add-member-form"
      className="card p-4 sm:p-5 mt-4 w-full"
      style={{ maxWidth: 560, borderTop: '3px solid var(--gold)' }}
      noValidate
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base" style={{ fontWeight: 600, color: 'var(--ink)' }}>Add a member</h2>
        <Button
          variant="ghost"
          type="button"
          onClick={onClose}
          aria-label="Close add member"
          style={{ padding: 8, minWidth: 40, minHeight: 40 }}
        >
          <X {...ICON_PROPS} size={16} />
        </Button>
      </div>

      {added && (
        <p role="status" data-testid="add-member-added" className="text-sm mb-3 rounded-md px-3 py-2" style={{ background: 'var(--teal-active)', color: 'var(--ink)' }}>
          Added {added.name}. They can sign in now with {added.email}.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          {label('Name', `${ids}-name`)}
          <input
            id={`${ids}-name`} name="name" type="text" value={name} autoComplete="off" autoCapitalize="words"
            onChange={(e) => { setName(e.target.value); setAdded(null) }}
            className={inputClass} style={inputStyle} placeholder="Jane Doe" required
          />
          {slug && (
            <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>
              Profile: /team/<span data-testid="add-member-slug" style={{ color: 'var(--ink)' }}>{slug}</span>
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          {label('UMN email', `${ids}-email`, '(the address they sign in with)')}
          <input
            id={`${ids}-email`} name="email" type="email" inputMode="email" value={email}
            autoComplete="off" autoCapitalize="none" spellCheck={false}
            onChange={(e) => { setEmail(e.target.value); if (error?.field === 'email') setError(null) }}
            className={inputClass} style={inputStyle} placeholder="netid@umn.edu" required
            aria-invalid={error?.field === 'email' || (email !== '' && !UMN_EMAIL.test(emailNorm))}
          />
          {email !== '' && !UMN_EMAIL.test(emailNorm) && (
            <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Use their @umn.edu address.</p>
          )}
          {error?.field === 'email' && <p role="alert" className="text-xs mt-1" style={{ color: 'var(--red, #b42318)' }}>{error.text}</p>}
        </div>

        <div>
          {label('Group', `${ids}-type`)}
          <select
            id={`${ids}-type`} value={memberType} onChange={(e) => setMemberType(e.target.value)}
            className={inputClass} style={inputStyle}
          >
            {MEMBER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div>
          {label('Role', `${ids}-role`, '(optional)')}
          <input
            id={`${ids}-role`} type="text" value={role} list={`${ids}-roles`} autoComplete="off"
            onChange={(e) => setRole(e.target.value)}
            className={inputClass} style={inputStyle} placeholder="Research Coordinator"
          />
          <datalist id={`${ids}-roles`}>
            {ROLE_SUGGESTIONS.map((r) => <option key={r} value={r} />)}
          </datalist>
        </div>

        {slugEdit !== null && (
          <div className="sm:col-span-2">
            {label('Profile name', `${ids}-slug`, '(lowercase, hyphens)')}
            <input
              id={`${ids}-slug`} type="text" value={slugEdit} autoComplete="off" autoCapitalize="none" spellCheck={false}
              onChange={(e) => { setSlugEdit(e.target.value.toLowerCase()); if (error?.field === 'slug') setError(null) }}
              className={inputClass} style={inputStyle} aria-invalid={!MEMBER_SLUG.test(slugEdit)}
            />
            {error?.field === 'slug' && <p role="alert" className="text-xs mt-1" style={{ color: 'var(--red, #b42318)' }}>{error.text}</p>}
          </div>
        )}
      </div>

      {error?.field === 'form' && <p role="alert" className="text-sm mt-3" style={{ color: 'var(--red, #b42318)' }}>{error.text}</p>}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4">
        <Button
          variant="secondary" type="button" onClick={onClose}
          style={{ padding: '8px 14px', fontSize: '0.875rem', borderRadius: 'var(--radius-lg)', minHeight: 44 }}
        >
          Done
        </Button>
        <Button
          variant="primary" type="submit" disabled={!canSubmit} data-testid="add-member-submit"
          style={{ padding: '8px 14px', fontSize: '0.875rem', fontWeight: 500, borderRadius: 'var(--radius-lg)', minHeight: 44 }}
        >
          {busy ? 'Adding…' : 'Add member'}
        </Button>
      </div>
    </form>
  )
}
