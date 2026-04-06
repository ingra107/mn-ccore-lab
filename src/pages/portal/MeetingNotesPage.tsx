import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Brain, Mic, Upload, FileText, CheckCircle2, Clock, ArrowRight,
  Sparkles, Users,
} from 'lucide-react'
import { staggerContainer, staggerItem } from '../../lib/animations'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import MetricCard from '../../components/MetricCard'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import { useMeetingsApi } from '../../hooks/useApiData'
import { formatMediumDate } from '../../lib/dateUtils'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'

export default function MeetingNotesPage() {
  const [showCreate, setShowCreate] = useState(false)
  const { data: meetings = [], isLoading } = useMeetingsApi()
  const [focusedIndex, setFocusedIndex] = useState(-1)
  useListKeyboardNav({ itemCount: meetings.length, focusedIndex, setFocusedIndex })

  // Stats from meetings that have notes
  const processedCount = meetings.filter((m) => m.notes).length
  const totalCount = meetings.length

  if (isLoading) return <TableSkeleton rows={5} cols={3} />

  return (
    <div>
      <PageHeader
        icon={<FileText size={20} />}
        title="AI Meeting Notes"
        subtitle="Transcription, summaries, and action items"
        count={processedCount}
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: 'var(--teal)', color: 'white', border: 'none', cursor: 'pointer' }}
          >
            <Upload size={16} />
            Upload Audio
          </button>
        }
      />

      {/* Stats */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard icon={Sparkles} label="Processed Meetings" value={processedCount} color="var(--gold)" />
        <MetricCard icon={CheckCircle2} label="With Notes" value={processedCount} color="var(--green, #22c55e)" />
        <MetricCard icon={Clock} label="Pending" value={totalCount - processedCount} color="var(--slate)" />
        <MetricCard icon={Users} label="Total Meetings" value={totalCount} color="var(--teal)" />
      </div>

      {/* How it works */}
      <div className="mt-6 rounded-xl border p-5" style={{ borderColor: 'var(--border-light)' }}>
        <h3 className="text-sm font-normal mb-3 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
          <Brain size={16} style={{ color: 'var(--teal)' }} />
          How AI Meeting Notes Works
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
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(45,138,138,0.08)' }}>
                  <Icon size={18} style={{ color: 'var(--teal)' }} />
                </div>
                <h4 className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{item.title}</h4>
                <p className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.7 }}>{item.desc}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent meetings with notes */}
      <div className="mt-6">
        <h3 className="text-sm font-normal mb-3" style={{ color: 'var(--ink)' }}>
          Recent Meetings
        </h3>
        <motion.div className="flex flex-col gap-2" variants={staggerContainer} initial="hidden" animate="visible">
          {meetings.slice(0, 10).map((m) => (
            <motion.div key={m.id} variants={staggerItem}>
              <Link
                to={`/meetings/${m.id}`}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors hover:shadow-sm"
                style={{ borderColor: 'var(--border-light)', textDecoration: 'none' }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: m.notes ? 'rgba(34,197,94,0.08)' : 'rgba(100,116,139,0.06)' }}>
                  {m.notes ? <CheckCircle2 size={16} style={{ color: 'var(--green, #22c55e)' }} /> : <FileText size={16} style={{ color: 'var(--slate)', opacity: 0.4 }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{m.title}</p>
                  <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.5 }}>
                    {formatMediumDate(m.date)}
                  </span>
                </div>
                {m.notes ? (
                  <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ color: 'var(--green, #22c55e)', backgroundColor: 'rgba(34,197,94,0.08)' }}>
                    Notes available
                  </span>
                ) : (
                  <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ color: 'var(--slate)', backgroundColor: 'rgba(100,116,139,0.06)' }}>
                    No notes
                  </span>
                )}
                <ArrowRight size={14} style={{ color: 'var(--slate)', opacity: 0.3 }} />
              </Link>
            </motion.div>
          ))}
          {meetings.length === 0 && (
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
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Process Meeting Notes" className="rounded-xl shadow-xl border w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-light)' }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-light)' }}>
          <h3 className="text-lg flex items-center gap-2" style={{ fontWeight: 400, color: 'var(--ink)' }}>
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
                borderColor: mode === 'transcript' ? 'var(--teal)' : 'var(--border-light)',
                backgroundColor: mode === 'transcript' ? 'rgba(45,138,138,0.1)' : 'transparent',
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
                borderColor: mode === 'audio' ? 'var(--teal)' : 'var(--border-light)',
                backgroundColor: mode === 'audio' ? 'rgba(45,138,138,0.1)' : 'transparent',
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
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>
              Link to Meeting (optional)
            </label>
            <select
              value={meetingId}
              onChange={(e) => setMeetingId(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--border-light)', cursor: 'pointer' }}
            >
              <option value="">Select meeting...</option>
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>{m.title} ({formatMediumDate(m.date)})</option>
              ))}
            </select>
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
                style={{ borderColor: 'var(--border-light)' }}
              />
            </div>
          ) : (
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
              style={{ borderColor: 'var(--border-light)' }}
            >
              <Upload size={32} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto 8px' }} />
              <p className="text-sm" style={{ color: 'var(--slate)' }}>
                Click to upload audio file
              </p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--slate)', opacity: 0.4 }}>
                MP3, M4A, WAV, or MP4 (max 25MB)
              </p>
              <p className="text-[10px] mt-2 px-4 py-1.5 rounded-full inline-block" style={{ color: 'var(--gold)', backgroundColor: 'rgba(201,168,76,0.08)' }}>
                Audio upload requires AI API key — use "Paste Transcript" for now
              </p>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--teal)', backgroundColor: 'rgba(45,138,138,0.02)' }}>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--teal)' }}>
                <Sparkles size={14} />
                AI Insights
              </h4>
              {result.summary && (
                <div className="mb-3">
                  <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--slate)', opacity: 0.65 }}>Summary</span>
                  <p className="text-sm mt-1" style={{ color: 'var(--ink)' }}>{result.summary}</p>
                </div>
              )}
              {result.actions.length > 0 && (
                <div className="mb-3">
                  <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--slate)', opacity: 0.65 }}>Action Items ({result.actions.length})</span>
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
                  <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--slate)', opacity: 0.65 }}>Decisions ({result.decisions.length})</span>
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
            <button onClick={onClose} className="px-4 py-2 rounded-md text-sm" style={{ color: 'var(--slate)', cursor: 'pointer', background: 'none', border: '1px solid var(--border-light)' }}>
              Cancel
            </button>
            <button
              onClick={handleProcess}
              disabled={!transcript.trim() || processing}
              className="px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2"
              style={{ backgroundColor: 'var(--teal)', color: 'white', cursor: 'pointer', border: 'none', opacity: (!transcript.trim() || processing) ? 0.5 : 1 }}
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
