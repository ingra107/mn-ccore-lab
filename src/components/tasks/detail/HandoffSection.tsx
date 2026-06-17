import { useState, useEffect, useRef } from 'react'
import {
  ArrowRightLeft, Check,
} from 'lucide-react'
import Avatar from '../../Avatar'
import { getPersonInfo } from '../../../data/team'
import { useTeam, useHandoffs } from '../../../hooks/useApiData'
import { useCreateHandoff, useAcknowledgeHandoff } from '../../../hooks/useMutations'
import { useToast } from '../../../hooks/useToast'
import { formatRelativeTime } from '../../../lib/dateUtils'
import { ICON_PROPS } from '../../../lib/iconProps'
import { ACCENT_GOLD, withAlpha } from '../../../lib/taskGrouping'

// ── Handoff Recipient Select ─────────────────────────────────

function HandoffRecipientSelect({ value, onChange, members }: { value: string; onChange: (v: string) => void; members: { slug?: string; name: string }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const person = value ? getPersonInfo(value) : null

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border px-2 py-1 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
        style={{ borderColor: 'rgba(45,138,138,0.25)', cursor: 'pointer', background: 'none' }}
      >
        {person ? (
          <>
            <div style={{ width: 24, height: 24 }}>
              <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="tight" variant="ice" />
            </div>
            <span className="text-sm" style={{ color: 'var(--ink)' }}>{person.name}</span>
          </>
        ) : (
          <span className="text-sm px-1" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>Select team member...</span>
        )}
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ color: 'var(--teal)', opacity: 0.85 }}><path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 rounded-lg shadow-lg border py-1 min-w-[200px] max-h-[200px] overflow-y-auto" style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-subtle)' }}>
          {members.map((m) => {
            const slug = m.slug!
            const mp = getPersonInfo(slug)
            const selected = slug === value
            return (
              <button
                type="button"
                key={slug}
                onClick={() => { onChange(slug); setOpen(false) }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{ color: 'var(--ink)', cursor: 'pointer', background: 'none', border: 'none' }}
              >
                <div style={{ width: 22, height: 22 }}>
                  <Avatar name={mp.name} initials={mp.initials} photoUrl={mp.photoUrl} size="sm-plus" variant="ice" />
                </div>
                <span className="flex-1">{m.name}</span>
                {selected && <Check {...ICON_PROPS} size={14} style={{ color: 'var(--teal)' }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Handoff Section ─────────────────────────────────────────

export function HandoffSection({ taskId, currentAssignee }: { taskId: string; currentAssignee: string }) {
  const [showForm, setShowForm] = useState(false)
  const [toSlug, setToSlug] = useState('')
  const [situation, setSituation] = useState('')
  const [background, setBackground] = useState('')
  const [assessment, setAssessment] = useState('')
  const [recommendation, setRecommendation] = useState('')

  const { data: team = [] } = useTeam()
  const { data: handoffs = [] } = useHandoffs(taskId)
  const createHandoff = useCreateHandoff(taskId)
  const acknowledgeHandoff = useAcknowledgeHandoff(taskId)
  const { showSuccess } = useToast()

  const members = team.filter((m) => m.slug && m.slug !== currentAssignee).sort((a, b) => a.name.localeCompare(b.name))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!toSlug || !situation.trim()) return
    createHandoff.mutate({
      to_slug: toSlug,
      situation: situation.trim(),
      background: background.trim() || undefined,
      assessment: assessment.trim() || undefined,
      recommendation: recommendation.trim() || undefined,
    }, {
      onSuccess: () => showSuccess('Handoff sent'),
    })
    setShowForm(false)
    setToSlug('')
    setSituation('')
    setBackground('')
    setAssessment('')
    setRecommendation('')
  }

  const inputStyle = {
    color: 'var(--ink)',
    borderColor: 'var(--border-subtle)',
    backgroundColor: 'var(--cream)',
    fontSize: 'var(--value-size)',
  }

  const labelStyle = {
    fontSize: 'var(--label-size)',
    fontWeight: 'var(--label-weight)',
    color: 'var(--slate)',
    opacity: 'var(--ink-label)',
    marginBottom: '4px',
    display: 'block',
  } as React.CSSProperties

  return (
    <div>
      {showForm ? (
        <form onSubmit={handleSubmit}>
          <div className="p-4 rounded-xl" style={{ background: 'var(--teal-hover)', border: '1px solid rgba(45,138,138,0.15)' }}>
            <div className="flex items-center gap-2 mb-3">
              <ArrowRightLeft {...ICON_PROPS} size={14} style={{ color: 'var(--teal)' }} />
              <span style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--teal)' }}>
                Handoff to...
              </span>
            </div>

            {/* To: team member dropdown */}
            <div className="mb-3">
              <label style={labelStyle}>To</label>
              <HandoffRecipientSelect value={toSlug} onChange={setToSlug} members={members} />
            </div>

            {/* Situation (required) */}
            <div className="mb-3">
              <label style={labelStyle}>Situation <span style={{ color: 'var(--maroon)' }}>*</span></label>
              <textarea
                value={situation}
                onChange={(e) => setSituation(e.target.value)}
                placeholder="What is the current state of this task?"
                required
                rows={2}
                className="w-full rounded-md border px-3 py-2 resize-none outline-none"
                style={inputStyle}
              />
            </div>

            {/* Background (optional) */}
            <div className="mb-3">
              <label style={labelStyle}>Background</label>
              <textarea
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                placeholder="What context does the next person need?"
                rows={2}
                className="w-full rounded-md border px-3 py-2 resize-none outline-none"
                style={inputStyle}
              />
            </div>

            {/* Assessment (optional) */}
            <div className="mb-3">
              <label style={labelStyle}>Assessment</label>
              <textarea
                value={assessment}
                onChange={(e) => setAssessment(e.target.value)}
                placeholder="What's your assessment of where things stand?"
                rows={2}
                className="w-full rounded-md border px-3 py-2 resize-none outline-none"
                style={inputStyle}
              />
            </div>

            {/* Recommendation (optional) */}
            <div className="mb-3">
              <label style={labelStyle}>Recommendation</label>
              <textarea
                value={recommendation}
                onChange={(e) => setRecommendation(e.target.value)}
                placeholder="What do you recommend as next steps?"
                rows={2}
                className="w-full rounded-md border px-3 py-2 resize-none outline-none"
                style={inputStyle}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={!toSlug || !situation.trim() || createHandoff.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
                style={{
                  backgroundColor: (!toSlug || !situation.trim()) ? 'var(--border-subtle)' : 'var(--teal)',
                  color: (!toSlug || !situation.trim()) ? 'var(--slate)' : 'var(--ink-bright, #fff)',
                  border: 'none',
                  cursor: (!toSlug || !situation.trim()) ? 'not-allowed' : 'pointer',
                  opacity: createHandoff.isPending ? 0.85 : 1,
                }}
              >
                <ArrowRightLeft {...ICON_PROPS} size={12} />
                {createHandoff.isPending ? 'Sending...' : 'Send Handoff'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 rounded-md text-xs"
                style={{ background: 'none', border: '1px solid var(--border-subtle)', cursor: 'pointer', color: 'var(--slate)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors"
          style={{
            color: 'var(--teal)',
            background: 'var(--teal-hover)',
            border: '1px solid rgba(45,138,138,0.15)',
            cursor: 'pointer',
            fontWeight: 'var(--label-weight)',
          }}
        >
          <ArrowRightLeft {...ICON_PROPS} size={12} />
          Hand Off
        </button>
      )}

      {/* Handoff History Timeline */}
      {handoffs.length > 0 && (
        <div className="mt-3">
          <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
            <ArrowRightLeft {...ICON_PROPS} size={10} />
            Handoff History ({handoffs.length})
          </label>
          <div className="flex flex-col gap-2">
            {handoffs.map((h) => {
              const from = getPersonInfo(h.from_slug)
              const to = getPersonInfo(h.to_slug)
              return (
                <div key={h.id} className="p-3 rounded-lg" style={{ background: 'var(--teal-hover)', borderLeft: '3px solid var(--teal)' }}>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <div className="flex items-center gap-1">
                      <div style={{ width: 20, height: 20 }}>
                        <Avatar name={from.name} initials={from.initials} photoUrl={from.photoUrl} size="xs" variant="ice" />
                      </div>
                      <span className="text-[11px] font-medium" style={{ color: 'var(--ink)' }}>{from.name}</span>
                    </div>
                    <ArrowRightLeft {...ICON_PROPS} size={10} style={{ color: 'var(--teal)', opacity: 'var(--ink-label)' }} />
                    <div className="flex items-center gap-1">
                      <div style={{ width: 20, height: 20 }}>
                        <Avatar name={to.name} initials={to.initials} photoUrl={to.photoUrl} size="xs" variant="ice" />
                      </div>
                      <span className="text-[11px] font-medium" style={{ color: 'var(--ink)' }}>{to.name}</span>
                    </div>
                    <span className="text-[10px] ml-auto" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
                      {formatRelativeTime(h.created_at)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 text-[12px]" style={{ color: 'var(--ink)' }}>
                    <p className="m-0"><span style={{ fontWeight: 600, color: 'var(--teal)', fontSize: '10px' }}>S:</span> {h.situation}</p>
                    {h.background && <p className="m-0"><span style={{ fontWeight: 600, color: 'var(--teal)', fontSize: '10px' }}>B:</span> {h.background}</p>}
                    {h.assessment && <p className="m-0"><span style={{ fontWeight: 600, color: 'var(--teal)', fontSize: '10px' }}>A:</span> {h.assessment}</p>}
                    {h.recommendation && <p className="m-0"><span style={{ fontWeight: 600, color: 'var(--teal)', fontSize: '10px' }}>R:</span> {h.recommendation}</p>}
                  </div>
                  <div className="mt-2">
                    {h.acknowledged ? (
                      <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--teal)' }}>
                        <Check {...ICON_PROPS} size={10} /> Acknowledged {h.acknowledged_at ? formatRelativeTime(h.acknowledged_at) : ''}
                      </span>
                    ) : (
                      <button
                        onClick={() => acknowledgeHandoff.mutate(h.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors"
                        style={{
                          color: 'var(--gold)',
                          background: 'var(--gold-active)',
                          border: `1px solid ${withAlpha(ACCENT_GOLD, 20)}`,
                          cursor: 'pointer',
                        }}
                      >
                        <Check {...ICON_PROPS} size={10} /> Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
