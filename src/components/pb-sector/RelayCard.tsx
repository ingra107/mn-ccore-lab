import { useState, useMemo } from 'react'
import { Radio, Send, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRelayMessages, useCreateRelay, useCompleteRelay } from '../../hooks/usePBRelay'

export default function RelayCard() {
  const { data: messages = [], isLoading } = useRelayMessages()
  const createRelay = useCreateRelay()
  const completeRelay = useCompleteRelay()
  const [formOpen, setFormOpen] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [topic, setTopic] = useState('')
  const [prompt, setPrompt] = useState('')
  const [from, setFrom] = useState('work')
  const [to, setTo] = useState('home')

  const pending = useMemo(() => messages.filter((m: any) => m.status === 'pending'), [messages])
  const completed = useMemo(() => messages.filter((m: any) => m.status === 'completed'), [messages])

  const handleSend = () => {
    if (!topic.trim() || !prompt.trim()) return
    createRelay.mutate({ from, to, topic: topic.trim(), prompt: prompt.trim() })
    setTopic('')
    setPrompt('')
    setFormOpen(false)
  }

  if (isLoading) {
    return (
      <div
        className="rounded-lg overflow-hidden animate-pulse"
        style={{
          border: '1px solid rgba(201,168,76,0.1)',
          background: 'rgba(201,168,76,0.02)',
          height: 80,
        }}
      />
    )
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        border: '1px solid rgba(201,168,76,0.1)',
        background: 'rgba(201,168,76,0.02)',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-3 py-2"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <Radio size={12} style={{ color: 'var(--teal)', opacity: 0.7 }} />
        <span style={{
          fontSize: '10px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--teal)',
        }}>
          Relay
        </span>
        {pending.length > 0 && (
          <span style={{
            fontSize: '9px',
            fontWeight: 700,
            color: 'var(--cream)',
            background: 'var(--teal)',
            borderRadius: 8,
            padding: '1px 6px',
            marginLeft: 2,
          }}>
            {pending.length}
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          {expanded
            ? <ChevronUp size={12} style={{ color: 'var(--slate)', opacity: 0.3 }} />
            : <ChevronDown size={12} style={{ color: 'var(--slate)', opacity: 0.3 }} />
          }
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-3 pb-2.5 flex flex-col gap-1.5">
              {/* Pending messages */}
              {pending.length === 0 && !formOpen && (
                <div style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-label)', padding: '2px 0' }}>
                  No pending relay messages
                </div>
              )}
              {pending.map((msg: any, i: number) => {
                const originalIndex = messages.indexOf(msg)
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2"
                    style={{ fontSize: '10px' }}
                  >
                    <span style={{
                      color: 'var(--teal)',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}>
                      {msg.from}
                    </span>
                    <span style={{ color: 'var(--slate)', opacity: 0.4 }}>-&gt;</span>
                    <span style={{
                      color: 'var(--teal)',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}>
                      {msg.to}
                    </span>
                    <span className="truncate" style={{ color: 'var(--ink)', flex: 1 }}>
                      {msg.topic}
                    </span>
                    <button
                      onClick={() => completeRelay.mutate(originalIndex)}
                      className="flex-shrink-0 hover:scale-110 transition-transform"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      title="Mark completed"
                    >
                      <Check size={12} style={{ color: '#22c55e', opacity: 0.6 }} />
                    </button>
                  </div>
                )
              })}

              {/* Completed (dimmed, last 3) */}
              {completed.slice(-3).map((msg: any, i: number) => (
                <div
                  key={`done-${i}`}
                  className="flex items-center gap-2"
                  style={{ fontSize: '10px', opacity: 0.3 }}
                >
                  <Check size={10} style={{ color: '#22c55e', flexShrink: 0 }} />
                  <span style={{ color: 'var(--slate)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {msg.from}-&gt;{msg.to}
                  </span>
                  <span className="truncate" style={{ color: 'var(--slate)' }}>
                    {msg.topic}
                  </span>
                </div>
              ))}

              {/* Divider before form */}
              {(pending.length > 0 || completed.length > 0) && formOpen && (
                <div style={{ borderTop: '1px solid rgba(201,168,76,0.08)', margin: '2px 0' }} />
              )}

              {/* Inline form */}
              <AnimatePresence>
                {formOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="flex flex-col gap-1.5"
                  >
                    <div className="flex gap-1.5">
                      <select
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        style={{
                          fontSize: '10px', padding: '3px 4px', borderRadius: 4,
                          border: '1px solid var(--border-subtle)', background: 'var(--cream)',
                          color: 'var(--ink)', flex: 1,
                        }}
                      >
                        <option value="work">work</option>
                        <option value="home">home</option>
                      </select>
                      <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.4, alignSelf: 'center' }}>-&gt;</span>
                      <select
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        style={{
                          fontSize: '10px', padding: '3px 4px', borderRadius: 4,
                          border: '1px solid var(--border-subtle)', background: 'var(--cream)',
                          color: 'var(--ink)', flex: 1,
                        }}
                      >
                        <option value="home">home</option>
                        <option value="work">work</option>
                      </select>
                    </div>
                    <input
                      type="text"
                      placeholder="Topic"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      style={{
                        fontSize: '10px', padding: '4px 6px', borderRadius: 4,
                        border: '1px solid var(--border-subtle)', background: 'var(--cream)',
                        color: 'var(--ink)', outline: 'none', width: '100%',
                      }}
                    />
                    <textarea
                      placeholder="Prompt / message"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={2}
                      style={{
                        fontSize: '10px', padding: '4px 6px', borderRadius: 4,
                        border: '1px solid var(--border-subtle)', background: 'var(--cream)',
                        color: 'var(--ink)', outline: 'none', resize: 'vertical', width: '100%',
                        fontFamily: 'inherit',
                      }}
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={handleSend}
                        disabled={!topic.trim() || !prompt.trim() || createRelay.isPending}
                        className="flex items-center gap-1 px-2 py-1 rounded"
                        style={{
                          fontSize: '10px', fontWeight: 600,
                          background: 'var(--teal)', color: 'var(--cream)',
                          border: 'none', cursor: 'pointer',
                          opacity: (!topic.trim() || !prompt.trim()) ? 0.4 : 1,
                        }}
                      >
                        <Send size={9} /> Send
                      </button>
                      <button
                        onClick={() => setFormOpen(false)}
                        className="px-2 py-1 rounded"
                        style={{
                          fontSize: '10px', background: 'none',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--slate)', cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Send Request button */}
              {!formOpen && (
                <button
                  onClick={() => setFormOpen(true)}
                  className="flex items-center gap-1 mt-0.5"
                  style={{
                    fontSize: '10px', color: 'var(--teal)', opacity: 0.6,
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  }}
                >
                  <Send size={9} /> Send Request
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
