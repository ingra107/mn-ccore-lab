import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Brain, Mic, Upload, FileText, CheckCircle2, Clock, ArrowRight,
  Sparkles, Users, Search,
} from 'lucide-react'
import { staggerContainer, staggerItem } from '../../lib/animations'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import MetricCard from '../../components/MetricCard'
import InlineSelect from '../../components/InlineSelect'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import { useMeetingsApi } from '../../hooks/useApiData'
import { formatMediumDate } from '../../lib/dateUtils'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { PATHS } from '../../constants/paths'

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
      m.date.includes(q)
    )
  }, [meetings, searchQuery])

  useListKeyboardNav({ itemCount: filteredMeetings.length, focusedIndex, setFocusedIndex })

  // Stats from meetings that have notes
  const processedCount = meetings.filter((m) => m.notes).length
  const totalCount = meetings.length

  if (isLoading) return <TableSkeleton rows={5} cols={3} />

  return (
    <div>
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
            <Upload size={16} />
            Upload Audio
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

      {/* How it works */}
      <div className="mt-6 rounded-xl border p-5" style={{ borderColor: 'var(--border-subtle)' }}>
        <h3 className="text-sm font-normal mb-3 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
          <Brain size={16} style={{ color: 'var(--teal)' }} />
          How Meeting Transcripts Work
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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
      </div>

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
    </div>
  )
}

// MiniStat removed — uses shared MetricCard component

// ── Transcript Modal ─────────────────────────────────────────

function TranscriptModal({ onClose, meetings }: { onClose: () => void; meetings: { id: string; title: string; date: string }[] }) {
  const [mode, setMode] = useState<'audio' | 'transcript'>('transcript')
  const [transcript, setTranscript] = useState('')
  const [meetingId, setMeetingId] = useState('')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<{ summary: string; actions: string[]; decisions: string[] } | null>(null)
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

  const handleProcess = async () => {
    if (!transcript.trim()) return
    setProcessing(true)

    try {
      // Send transcript to API for processing
      const res = await fetch('/api/meetings/process-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcript.trim(),
          meeting_id: meetingId || undefined,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setResult(data.data)
      } else {
        // Fallback: extract basic structure from transcript
        const lines = transcript.trim().split('\n').filter((l) => l.trim())
        setResult({
          summary: lines.slice(0, 3).join(' ').slice(0, 300),
          actions: lines.filter((l) => l.toLowerCase().includes('action') || l.toLowerCase().includes('todo') || l.toLowerCase().includes('follow up')),
          decisions: lines.filter((l) => l.toLowerCase().includes('decided') || l.toLowerCase().includes('agreed') || l.toLowerCase().includes('decision')),
        })
      }
    } catch {
      // Basic extraction fallback
      setResult({
        summary: 'Transcript uploaded. AI processing requires API key configuration.',
        actions: [],
        decisions: [],
      })
    }

    setProcessing(false)
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
          {/* Mode tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode('transcript')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border"
              style={{
                borderColor: mode === 'transcript' ? 'var(--teal)' : 'var(--border-subtle)',
                backgroundColor: mode === 'transcript' ? 'var(--teal-active)' : 'transparent',
                color: mode === 'transcript' ? 'var(--teal)' : 'var(--slate)',
                cursor: 'pointer',
              }}
            >
              <FileText size={14} />
              Paste Transcript
            </button>
            <button
              onClick={() => setMode('audio')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border"
              style={{
                borderColor: mode === 'audio' ? 'var(--teal)' : 'var(--border-subtle)',
                backgroundColor: mode === 'audio' ? 'var(--teal-active)' : 'transparent',
                color: mode === 'audio' ? 'var(--teal)' : 'var(--slate)',
                cursor: 'pointer',
              }}
            >
              <Mic size={14} />
              Upload Audio
            </button>
          </div>

          {/* Link to meeting */}
          <div>
            <label htmlFor="meeting-notes-link" className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>
              Link to Meeting (optional)
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
          {mode === 'transcript' ? (
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
          ) : (
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <Upload size={32} style={{ color: 'var(--slate)', opacity: 0.75, margin: '0 auto var(--sp-sm)' }} />
              <p className="text-sm" style={{ color: 'var(--slate)' }}>
                Click to upload audio file
              </p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--slate)', opacity: 0.75 }}>
                MP3, M4A, WAV, or MP4 (max 25MB)
              </p>
              <p className="text-[10px] mt-2 px-4 py-1.5 rounded-full inline-block" style={{ color: 'var(--gold)', backgroundColor: 'var(--gold-active)' }}>
                Audio upload requires AI API key — use "Paste Transcript" for now
              </p>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--teal)', backgroundColor: 'var(--teal-hover)' }}>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--teal)' }}>
                <Sparkles size={14} />
                AI Insights
              </h4>
              {result.summary && (
                <div className="mb-3">
                  <span style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>Summary</span>
                  <p className="text-sm mt-1" style={{ color: 'var(--ink)' }}>{result.summary}</p>
                </div>
              )}
              {result.actions.length > 0 && (
                <div className="mb-3">
                  <span style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>Action Items ({result.actions.length})</span>
                  <ul className="mt-1 flex flex-col gap-1">
                    {result.actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--ink)' }}>
                        <CheckCircle2 size={12} style={{ color: 'var(--teal)', marginTop: 3, flexShrink: 0 }} />
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.decisions.length > 0 && (
                <div>
                  <span style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>Decisions ({result.decisions.length})</span>
                  <ul className="mt-1 flex flex-col gap-1">
                    {result.decisions.map((d, i) => (
                      <li key={i} className="text-sm" style={{ color: 'var(--ink)' }}>• {d}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-md text-sm" style={{ color: 'var(--slate)', cursor: 'pointer', background: 'none', border: '1px solid var(--border-subtle)' }}>
              Cancel
            </button>
            <button
              onClick={handleProcess}
              disabled={!transcript.trim() || processing}
              className="px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2"
              style={{ backgroundColor: 'var(--teal-solid)', color: 'var(--ink-bright, #fff)', cursor: 'pointer', border: 'none', opacity: (!transcript.trim() || processing) ? 0.85 : 1 }}
            >
              {processing ? <Clock size={14} className="animate-spin" /> : <Brain size={14} />}
              {processing ? 'Processing...' : 'Process with AI'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
