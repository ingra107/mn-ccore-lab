import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Brain, Upload, FileText, CheckCircle2, Clock, ArrowRight,
  Sparkles, Users, Search,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { staggerContainer, staggerItem } from '../../lib/animations'
import PageHeader from '../../components/PageHeader'
import PageContainer from '../../components/PageContainer'
import EmptyState from '../../components/EmptyState'
import MetricCard from '../../components/MetricCard'
import InlineSelect from '../../components/InlineSelect'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import { useUndoToast } from '../../components/UndoToast'
import { useMeetingsApi } from '../../hooks/useApiData'
import { formatMediumDate } from '../../lib/dateUtils'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { PATHS } from '../../constants/paths'

const HOWTO_STORAGE_KEY = 'mnccore-meeting-transcripts-howto-expanded'

// schema-v72: parse the JSON `tags` array (discussed projects/topics) off a
// meeting row. Tolerant of null / malformed values.
function parseTags(tags: string | null | undefined): string[] {
  if (!tags) return []
  try {
    const v = JSON.parse(tags)
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

function tagLabel(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function HowTranscriptsWorkPanel({ collapsedByDefault }: { collapsedByDefault: boolean }) {
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(HOWTO_STORAGE_KEY)
      if (stored !== null) return stored === '1'
    } catch { /* noop */ }
    return !collapsedByDefault
  })
  const toggle = () => {
    const next = !expanded
    setExpanded(next)
    try { localStorage.setItem(HOWTO_STORAGE_KEY, next ? '1' : '0') } catch { /* noop */ }
  }
  return (
    <div className="mt-6 rounded-xl border" style={{ borderColor: 'var(--border-subtle)' }}>
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between p-4 text-left"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        aria-expanded={expanded}
      >
        <h3 className="text-sm font-normal flex items-center gap-2" style={{ color: 'var(--ink)' }}>
          <Brain size={16} style={{ color: 'var(--teal)' }} />
          How Meeting Transcripts Work
        </h3>
        <span className="text-xs" style={{ color: 'var(--slate)', opacity: 0.75 }}>
          {expanded ? 'Hide' : 'What is this?'}
        </span>
      </button>
      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 px-5 pb-5">
          {[
            { step: '1', icon: Upload, title: 'Upload or Paste', desc: 'Upload audio (MP3/WAV/M4A) or paste a transcript' },
            { step: '2', icon: Brain, title: 'AI Processing', desc: 'Claude analyzes your meeting content' },
            { step: '3', icon: Sparkles, title: 'Extract Insights', desc: 'Get summaries, action items, and decisions' },
            { step: '4', icon: CheckCircle2, title: 'Track Progress', desc: 'Action items flow to your task board' },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div key={item.step} className="flex flex-col items-center text-center gap-2 p-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--teal-active)' }}>
                  <Icon size={18} style={{ color: 'var(--teal)' }} />
                </div>
                <h4 className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{item.title}</h4>
                <p className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.85 }}>{item.desc}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function MeetingNotesPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { data: meetings = [], isLoading } = useMeetingsApi()
  const [focusedIndex, setFocusedIndex] = useState(-1)

  const filteredMeetings = useMemo(() => {
    if (!searchQuery.trim()) return meetings
    const q = searchQuery.toLowerCase()
    return meetings.filter(m =>
      m.title.toLowerCase().includes(q) ||
      (m.notes || '').toLowerCase().includes(q) ||
      parseTags(m.tags).some(t => t.toLowerCase().includes(q)) ||
      m.date.includes(q)
    )
  }, [meetings, searchQuery])

  useListKeyboardNav({ itemCount: filteredMeetings.length, focusedIndex, setFocusedIndex })

  // Stats from meetings that have notes
  const processedCount = meetings.filter((m) => m.notes).length
  const totalCount = meetings.length

  if (isLoading) return <TableSkeleton rows={5} cols={3} />

  return (
    <PageContainer>
      <PageHeader
        icon={<FileText size={20} />}
        title="Meeting Transcripts"
        subtitle="Transcription, summaries, and action items"
        count={processedCount}
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: 'var(--teal-solid)', color: 'var(--ink-bright, #fff)', border: 'none', cursor: 'pointer' }}
          >
            <FileText size={16} />
            Add Transcript
          </button>
        }
      />

      {/* Stats */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard icon={Sparkles} label="Processed Meetings" value={processedCount} color="var(--gold)" />
        <MetricCard icon={CheckCircle2} label="With Notes" value={processedCount} color="var(--green)" />
        <MetricCard icon={Clock} label="Pending" value={totalCount - processedCount} color="var(--slate)" />
        <MetricCard icon={Users} label="Total Meetings" value={totalCount} color="var(--teal)" />
      </div>

      {/* How it works — auto-collapsed after 3+ transcripts exist */}
      <HowTranscriptsWorkPanel collapsedByDefault={processedCount >= 3} />

      {/* Search + Recent meetings */}
      <div className="mt-6">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-normal" style={{ color: 'var(--ink)' }}>
            Recent Meetings
          </h3>
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--slate)', opacity: 0.75 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search meetings..."
              className="w-full rounded-lg border pl-8 pr-3 py-1.5 text-xs outline-none"
              style={{ color: 'var(--ink)', borderColor: 'var(--border-subtle)', background: 'var(--cream)' }}
            />
          </div>
        </div>
        <motion.div className="flex flex-col gap-2" variants={staggerContainer} initial="hidden" animate="visible">
          {filteredMeetings.slice(0, 20).map((m) => (
            <motion.div key={m.id} variants={staggerItem}>
              <Link
                to={PATHS.meeting(m.id)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors hover:shadow-sm"
                style={{ borderColor: 'var(--border-subtle)', textDecoration: 'none' }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: m.notes ? 'var(--green-hover)' : 'rgba(100,116,139,0.06)' }}>
                  {m.notes ? <CheckCircle2 size={16} style={{ color: 'var(--green)' }} /> : <FileText size={16} style={{ color: 'var(--slate)', opacity: 0.75 }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{m.title}</p>
                  <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                    {formatMediumDate(m.date)}
                  </span>
                  {/* schema-v72: discussed-project / topic tag chips */}
                  {parseTags(m.tags).length > 0 && (
                    <span className="flex flex-wrap items-center gap-1 mt-1">
                      {parseTags(m.tags).slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="text-[9px] px-1.5 py-0.5 rounded-full truncate max-w-[10rem]"
                          style={{ color: 'var(--teal)', backgroundColor: 'var(--teal-active)' }}
                        >
                          {tagLabel(t)}
                        </span>
                      ))}
                      {parseTags(m.tags).length > 4 && (
                        <span className="text-[9px]" style={{ color: 'var(--slate)', opacity: 0.75 }}>
                          +{parseTags(m.tags).length - 4}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                {m.notes ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: 'var(--green)', backgroundColor: 'var(--green-hover)' }}>
                    Notes available
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: 'var(--slate)', backgroundColor: 'rgba(100,116,139,0.06)' }}>
                    No notes
                  </span>
                )}
                <ArrowRight size={14} style={{ color: 'var(--slate)', opacity: 0.75 }} />
              </Link>
            </motion.div>
          ))}
          {filteredMeetings.length === 0 && (
            <EmptyState
              icon={<FileText size={40} />}
              title="No meetings recorded yet"
              subtitle="Meeting notes, decisions, and action items live here. Once the first meeting is logged, this becomes the lab's institutional memory."
            />
          )}
        </motion.div>
      </div>

      {/* Upload/Paste Modal */}
      {showCreate && <TranscriptModal onClose={() => setShowCreate(false)} meetings={meetings} />}
    </PageContainer>
  )
}

// MiniStat removed — uses shared MetricCard component

// ── Transcript Modal ─────────────────────────────────────────

function TranscriptModal({ onClose, meetings }: { onClose: () => void; meetings: { id: string; title: string; date: string }[] }) {
  const [transcript, setTranscript] = useState('')
  const [meetingId, setMeetingId] = useState('')
  const [saving, setSaving] = useState(false)
  const { showSuccess } = useUndoToast()
  const queryClient = useQueryClient()
  const modalRef = useRef<HTMLDivElement>(null)

  // Focus trap + Escape
  useEffect(() => {
    if (!modalRef.current) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const focusable = modalRef.current!.querySelectorAll<HTMLElement>('input, select, textarea, button, [tabindex]:not([tabindex="-1"])')
      if (focusable.length === 0) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // P1-5: AI processing isn't wired yet, so the honest, useful action is to
  // SAVE the pasted transcript as the meeting's notes. Optimistic close.
  const handleProcess = async () => {
    if (!transcript.trim() || !meetingId || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/meetings/${meetingId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: transcript.trim() }),
      })
      if (!res.ok) throw new Error(`/api/meetings/${meetingId}/notes ${res.status}`)
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
      showSuccess('Transcript saved to meeting notes')
      onClose()
    } catch (err) {
      console.error('Save transcript failed:', err)
      showSuccess('Saving transcript failed — please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(15,25,35,0.5)' }} onClick={onClose}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Process Meeting Notes" className="rounded-xl shadow-xl border w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-subtle)' }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-lg flex items-center gap-2" style={{ fontWeight: 500, color: 'var(--ink)' }}>
            <Brain size={18} style={{ color: 'var(--teal)' }} />
            Process Meeting
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)' }}>
            &times;
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* P1-5: Audio tab removed (AI not wired). Pasting a transcript saves
              it as the meeting's notes — the honest, useful action. */}

          {/* Link to meeting — required, since this is the save target */}
          <div>
            <label htmlFor="meeting-notes-link" className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>
              Link to Meeting
            </label>
            <InlineSelect
              value={meetingId}
              options={[
                { value: '', label: 'Select meeting...' },
                ...meetings.map((m) => ({ value: m.id, label: `${m.title} (${formatMediumDate(m.date)})` })),
              ]}
              onChange={setMeetingId}
              size="md"
              alwaysShowChevron
            />
          </div>

          {/* Input area */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>
              Paste Transcript
            </label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste your meeting transcript here..."
              rows={8}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none resize-none"
              style={{ borderColor: 'var(--border-subtle)' }}
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-md text-sm" style={{ color: 'var(--slate)', cursor: 'pointer', background: 'none', border: '1px solid var(--border-subtle)' }}>
              Cancel
            </button>
            <button
              onClick={handleProcess}
              disabled={!transcript.trim() || !meetingId || saving}
              className="px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2"
              style={{ backgroundColor: 'var(--teal-solid)', color: 'var(--ink-bright, #fff)', cursor: (!transcript.trim() || !meetingId || saving) ? 'not-allowed' : 'pointer', border: 'none', opacity: (!transcript.trim() || !meetingId || saving) ? 0.85 : 1 }}
            >
              <FileText size={14} />
              {saving ? 'Saving…' : 'Save Transcript'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
