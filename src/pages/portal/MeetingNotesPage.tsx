import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Brain, Mic, Upload, FileText, CheckCircle2, Clock, ArrowRight,
  Sparkles, Users,
} from 'lucide-react'
import SectionHeader from '../../components/SectionHeader'
import { useMeetingsApi } from '../../hooks/useApiData'
import { formatMediumDate } from '../../lib/dateUtils'

export default function MeetingNotesPage() {
  const [showCreate, setShowCreate] = useState(false)
  const { data: meetings = [] } = useMeetingsApi()

  // Stats from meetings that have notes
  const processedCount = meetings.filter((m) => m.notes).length
  const totalCount = meetings.length

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <SectionHeader
          title="AI Meeting Notes"
          subtitle="AI-powered transcription, summaries, and action items"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--teal)', color: 'white', border: 'none', cursor: 'pointer' }}
          >
            <Upload size={16} />
            Upload Audio
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat icon={Sparkles} label="Processed Meetings" value={processedCount} color="var(--gold)" />
        <MiniStat icon={CheckCircle2} label="With Notes" value={processedCount} color="var(--green, #22c55e)" />
        <MiniStat icon={Clock} label="Pending" value={totalCount - processedCount} color="var(--slate)" />
        <MiniStat icon={Users} label="Total Meetings" value={totalCount} color="var(--teal)" />
      </div>

      {/* How it works */}
      <div className="mt-6 rounded-xl border p-5" style={{ borderColor: 'var(--border-light)' }}>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
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
                <h4 className="text-xs font-semibold" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>{item.title}</h4>
                <p className="text-[10px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.7 }}>{item.desc}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent meetings with notes */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
          Recent Meetings
        </h3>
        <div className="flex flex-col gap-2">
          {meetings.slice(0, 10).map((m) => (
            <Link
              key={m.id}
              to={`/meetings/${m.id}`}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors hover:shadow-sm"
              style={{ borderColor: 'var(--border-light)', textDecoration: 'none' }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: m.notes ? 'rgba(34,197,94,0.08)' : 'rgba(100,116,139,0.06)' }}>
                {m.notes ? <CheckCircle2 size={16} style={{ color: 'var(--green, #22c55e)' }} /> : <FileText size={16} style={{ color: 'var(--slate)', opacity: 0.4 }} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>{m.title}</p>
                <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>
                  {formatMediumDate(m.date)}
                </span>
              </div>
              {m.notes ? (
                <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ fontFamily: 'var(--font-mono)', color: 'var(--green, #22c55e)', backgroundColor: 'rgba(34,197,94,0.08)' }}>
                  Notes available
                </span>
              ) : (
                <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', backgroundColor: 'rgba(100,116,139,0.06)' }}>
                  No notes
                </span>
              )}
              <ArrowRight size={14} style={{ color: 'var(--slate)', opacity: 0.3 }} />
            </Link>
          ))}
          {meetings.length === 0 && (
            <div className="text-center py-12 text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>
              No meetings yet. Create one from the Meetings page.
            </div>
          )}
        </div>
      </div>

      {/* Upload/Paste Modal */}
      {showCreate && <TranscriptModal onClose={() => setShowCreate(false)} meetings={meetings} />}
    </div>
  )
}

// ── Mini Stat Card ───────────────────────────────────────────

function MiniStat({ icon: Icon, label, value, color }: { icon: typeof Sparkles; label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border-light)' }}>
      <div className="flex items-center justify-between mb-1">
        <Icon size={14} style={{ color, opacity: 0.6 }} />
        <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>{value}</span>
      </div>
      <span className="text-[10px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.6 }}>{label}</span>
    </div>
  )
}

// ── Transcript Modal ─────────────────────────────────────────

function TranscriptModal({ onClose, meetings }: { onClose: () => void; meetings: { id: string; title: string; date: string }[] }) {
  const [mode, setMode] = useState<'audio' | 'transcript'>('transcript')
  const [transcript, setTranscript] = useState('')
  const [meetingId, setMeetingId] = useState('')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<{ summary: string; actions: string[]; decisions: string[] } | null>(null)

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
      <div className="rounded-xl shadow-xl border w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" style={{ backgroundColor: 'white', borderColor: 'var(--border-light)' }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-light)' }}>
          <h3 className="text-lg flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--ink)' }}>
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
                fontFamily: 'var(--font-sans)', cursor: 'pointer',
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
                fontFamily: 'var(--font-sans)', cursor: 'pointer',
              }}
            >
              <Mic size={14} />
              Upload Audio
            </button>
          </div>

          {/* Link to meeting */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}>
              Link to Meeting (optional)
            </label>
            <select
              value={meetingId}
              onChange={(e) => setMeetingId(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{ fontFamily: 'var(--font-sans)', borderColor: 'var(--border-light)', cursor: 'pointer' }}
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
              <label className="block text-xs font-medium mb-1" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}>
                Paste Transcript
              </label>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Paste your meeting transcript here..."
                rows={8}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none resize-none"
                style={{ fontFamily: 'var(--font-sans)', borderColor: 'var(--border-light)' }}
              />
            </div>
          ) : (
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors hover:bg-black/[0.02]"
              style={{ borderColor: 'var(--border-light)' }}
            >
              <Upload size={32} style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto 8px' }} />
              <p className="text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}>
                Click to upload audio file
              </p>
              <p className="text-[10px] mt-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.4 }}>
                MP3, M4A, WAV, or MP4 (max 25MB)
              </p>
              <p className="text-[10px] mt-2 px-4 py-1.5 rounded-full inline-block" style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)', backgroundColor: 'rgba(201,168,76,0.08)' }}>
                Audio upload requires AI API key — use "Paste Transcript" for now
              </p>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--teal)', backgroundColor: 'rgba(45,138,138,0.02)' }}>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ fontFamily: 'var(--font-display)', color: 'var(--teal)' }}>
                <Sparkles size={14} />
                AI Insights
              </h4>
              {result.summary && (
                <div className="mb-3">
                  <span className="text-[10px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>Summary</span>
                  <p className="text-sm mt-1" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>{result.summary}</p>
                </div>
              )}
              {result.actions.length > 0 && (
                <div className="mb-3">
                  <span className="text-[10px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>Action Items ({result.actions.length})</span>
                  <ul className="mt-1 flex flex-col gap-1">
                    {result.actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
                        <CheckCircle2 size={12} style={{ color: 'var(--teal)', marginTop: 3, flexShrink: 0 }} />
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.decisions.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>Decisions ({result.decisions.length})</span>
                  <ul className="mt-1 flex flex-col gap-1">
                    {result.decisions.map((d, i) => (
                      <li key={i} className="text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>• {d}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-md text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', cursor: 'pointer', background: 'none', border: '1px solid var(--border-light)' }}>
              Cancel
            </button>
            <button
              onClick={handleProcess}
              disabled={!transcript.trim() || processing}
              className="px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2"
              style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--teal)', color: 'white', cursor: 'pointer', border: 'none', opacity: (!transcript.trim() || processing) ? 0.5 : 1 }}
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
