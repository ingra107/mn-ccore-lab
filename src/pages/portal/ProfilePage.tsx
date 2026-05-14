// Profile page — what every user sees at /portal/profile. Lets them
// update their own team_members fields (preferred_name, full_name, title,
// bio, photo_url, scholar_id, credentials) and manage their iCal feed
// integrations. role + member_type are admin-only and rendered read-only here.

import { useState, useEffect } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { User, Save, Calendar as CalendarIcon, Settings as SettingsIcon, ExternalLink } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { emailToSlug } from '../../lib/emailSlug'
import { useTeam } from '../../hooks/useApiData'
import PageHeader from '../../components/PageHeader'
import Avatar from '../../components/Avatar'
import { TextSkeleton } from '../../components/LoadingSkeleton'
import CalendarFeedsPanel from '../../components/CalendarFeedsPanel'

interface ProfileForm {
  preferred_name: string
  full_name: string
  credentials: string
  title: string
  department: string
  bio: string
  photo_url: string
  scholar_id: string
}

const FIELD_LABELS: Record<keyof ProfileForm, string> = {
  preferred_name: 'Preferred name',
  full_name: 'Full name',
  credentials: 'Credentials (e.g. MD, PhD)',
  title: 'Title',
  department: 'Department',
  bio: 'Short bio',
  photo_url: 'Profile photo URL',
  scholar_id: 'Google Scholar user ID',
}

export default function ProfilePage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const slug = emailToSlug(user?.email)

  // Read the user's row from the cached team list. useTeam runs the
  // existing rowToTeamMember mapper which strips full_name/preferred_name
  // (those aren't on the public TeamMember shape), so we ALSO need the
  // raw row. Cheap second fetch since it shares the cache layer; we can
  // promote this to a single endpoint later if it matters.
  const teamQuery = useTeam()
  const member = (teamQuery.data ?? []).find((m) => m.slug === slug)

  // Server-side fetch to get the full row including full_name/preferred_name
  // which the public TeamMember shape doesn't carry. This piggybacks on
  // the same /api/team response — we just dig into it post-fetch.
  const rawRow = (queryClient.getQueryData<{ data: Array<Record<string, unknown>> } | undefined>(['team-raw'])?.data ?? [])
    .find((r) => r.slug === slug)

  // Pull the full row directly via fetch to get preferred_name + full_name.
  // Stored on a separate cache key so it doesn't compete with the public
  // useTeam mapping.
  useEffect(() => {
    if (!slug) return
    if (rawRow) return
    fetch('/api/team').then((r) => r.ok ? r.json() : null).then((j) => {
      if (j) queryClient.setQueryData(['team-raw'], j)
    }).catch(() => { /* ignore */ })
  }, [slug, rawRow, queryClient])

  const [form, setForm] = useState<ProfileForm>({
    preferred_name: '', full_name: '', credentials: '', title: '',
    department: '', bio: '', photo_url: '', scholar_id: '',
  })
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Hydrate form when row loads.
  useEffect(() => {
    if (!rawRow) return
    setForm({
      preferred_name: (rawRow.preferred_name as string | null) ?? '',
      full_name: (rawRow.full_name as string | null) ?? (rawRow.name as string | null) ?? '',
      credentials: (rawRow.credentials as string | null) ?? '',
      title: (rawRow.title as string | null) ?? '',
      department: (rawRow.department as string | null) ?? '',
      bio: (rawRow.bio as string | null) ?? '',
      photo_url: (rawRow.photo_url as string | null) ?? '',
      scholar_id: (rawRow.scholar_id as string | null) ?? '',
    })
  }, [rawRow])

  const save = useMutation({
    mutationFn: async (patch: Partial<ProfileForm>) => {
      const res = await fetch(`/api/team/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      return res.json()
    },
    onSuccess: () => {
      setSavedAt(Date.now())
      queryClient.invalidateQueries({ queryKey: ['team'] })
      queryClient.invalidateQueries({ queryKey: ['team-raw'] })
    },
  })

  if (authLoading) return <TextSkeleton lines={6} />
  if (!isAuthenticated) return <Navigate to="/portal/dashboard" replace />
  if (!slug) {
    return (
      <div className="content-container">
        <PageHeader icon={<User size={20} />} title="Profile" subtitle="Sign in to view your profile" />
      </div>
    )
  }
  if (teamQuery.isLoading || !rawRow) return <TextSkeleton lines={8} />
  if (!member || !rawRow) {
    return (
      <div className="content-container">
        <PageHeader icon={<User size={20} />} title="Profile" subtitle="No profile yet" />
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Your team_members row hasn't been provisioned yet. Visit any portal page to trigger auto-create,
          then return here.
        </p>
      </div>
    )
  }

  const m = member
  const showSavedHint = savedAt && (Date.now() - savedAt) < 3000

  return (
    <div className="content-container">
      <PageHeader icon={<User size={20} />} title="My Profile" subtitle="Update your profile and connect your calendar." />

      {/* Identity card — read-only avatar + name + email */}
      <div
        className="flex items-start gap-4 mb-6 p-4 rounded-lg border"
        style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-1)' }}
      >
        <Avatar
          name={m.name}
          initials={m.initials}
          photoUrl={m.photoUrl}
          size="lg"
          variant="ice"
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>{m.name}</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{user?.email}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {m.role && (
              <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: 'rgba(201,168,76,0.14)', color: 'var(--gold)' }}>
                {m.role}
              </span>
            )}
            {rawRow.member_type ? (
              <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--slate)' }}>
                {String(rawRow.member_type)}
              </span>
            ) : null}
            <Link
              to={`/portal/team/${slug}`}
              className="inline-flex items-center gap-1 text-[11px]"
              style={{ color: 'var(--teal)' }}
            >
              View public profile <ExternalLink size={11} />
            </Link>
          </div>
        </div>
      </div>

      {/* Editable fields */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>About you</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.keys(FIELD_LABELS) as Array<keyof ProfileForm>).map((field) => (
            <ProfileField
              key={field}
              label={FIELD_LABELS[field]}
              value={form[field]}
              onChange={(v) => setForm((f) => ({ ...f, [field]: v }))}
              onBlur={() => {
                const original = (rawRow?.[field] as string | null) ?? ''
                if (form[field] !== original) save.mutate({ [field]: form[field] })
              }}
              multiline={field === 'bio'}
            />
          ))}
        </div>
        {save.isError && (
          <p className="text-[11px] mt-2" style={{ color: 'var(--maroon)' }}>
            {(save.error as Error).message}
          </p>
        )}
        {showSavedHint && (
          <p className="text-[11px] mt-2 inline-flex items-center gap-1" style={{ color: 'var(--green)' }}>
            <Save size={11} /> Saved
          </p>
        )}
      </section>

      {/* Calendar feeds */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <CalendarIcon size={16} style={{ color: 'var(--teal)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Calendar feeds</h3>
        </div>
        <p className="text-[11px] mb-3" style={{ color: 'var(--muted)', lineHeight: 1.5 }}>
          Connect your personal calendar so events appear on the Today timeline alongside team meetings.
          Read-only — Hub never writes back to your calendar.
        </p>
        <CalendarFeedsPanel />
      </section>

      {/* Settings link */}
      <section>
        <Link
          to="/portal/settings"
          className="inline-flex items-center gap-2 text-xs"
          style={{ color: 'var(--teal)' }}
        >
          <SettingsIcon size={14} /> Open full Settings (theme, lab thresholds, etc.)
        </Link>
      </section>
    </div>
  )
}

function ProfileField({ label, value, onChange, onBlur, multiline }: {
  label: string; value: string; onChange: (v: string) => void; onBlur: () => void; multiline?: boolean
}) {
  return (
    <div className={multiline ? 'md:col-span-2' : ''}>
      <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--slate)' }}>{label}</label>
      {multiline ? (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className="w-full rounded-md border px-2 py-1.5 text-sm outline-none"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-0)', color: 'var(--ink)', resize: 'vertical' }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className="w-full rounded-md border px-2 py-1.5 text-sm outline-none"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-0)', color: 'var(--ink)' }}
        />
      )}
    </div>
  )
}
