import { useState } from 'react'
import { ExternalLink, ChevronDown, ClipboardCopy, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Publication } from '../data/types'

const TOPIC_DISPLAY: Record<string, string> = {
  clif: 'CLIF',
  covid: 'COVID-19',
  ventilation: 'Ventilation',
  'decision-making': 'Decision-Making',
  quality: 'Quality',
  sepsis: 'Sepsis',
  disparities: 'Disparities',
}

const TOPIC_COLORS: Record<string, { bg: string; color: string }> = {
  clif: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' },
  covid: { bg: 'rgba(239, 68, 68, 0.1)', color: '#dc2626' },
  ventilation: { bg: 'rgba(34, 197, 94, 0.1)', color: '#16a34a' },
  'decision-making': { bg: 'rgba(168, 85, 247, 0.1)', color: '#9333ea' },
  quality: { bg: 'rgba(245, 158, 11, 0.1)', color: '#d97706' },
  sepsis: { bg: 'rgba(236, 72, 153, 0.1)', color: '#db2777' },
  disparities: { bg: 'rgba(14, 165, 233, 0.1)', color: '#0284c7' },
}

function topicLabel(topic: string): string {
  return TOPIC_DISPLAY[topic] ?? topic.charAt(0).toUpperCase() + topic.slice(1)
}

function topicColor(topic: string) {
  return (
    TOPIC_COLORS[topic] ?? {
      bg: 'rgba(201, 168, 76, 0.1)',
      color: 'var(--gold)',
    }
  )
}

function formatCitation(pub: Publication): string {
  const doiStr = pub.doi ? ` ${pub.doi}` : ''
  return `${pub.authors} (${pub.year}). ${pub.title}. ${pub.journal}.${doiStr}`
}

export default function PublicationCard({ pub }: { pub: Publication }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const formatAuthors = (authors: string) => {
    const parts = authors.split(/(Ingraham NE|Mesfin N)/g)
    return parts.map((part, i) =>
      part === 'Ingraham NE' || part === 'Mesfin N' ? (
        <strong key={i} style={{ color: 'var(--ink)', fontWeight: 600 }}>
          {part}
        </strong>
      ) : (
        <span key={i}>{part}</span>
      )
    )
  }

  const statusColor = () => {
    switch (pub.status) {
      case 'Published':
        return { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }
      case 'In Review':
        return { bg: 'rgba(245, 158, 11, 0.12)', color: '#d97706' }
      case 'In Preparation':
        return { bg: 'rgba(100, 116, 139, 0.1)', color: 'var(--slate)' }
      default:
        return { bg: 'rgba(201, 168, 76, 0.15)', color: 'var(--gold)' }
    }
  }

  const sc = statusColor()

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(formatCitation(pub))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback for non-secure contexts
      const textarea = document.createElement('textarea')
      textarea.value = formatCitation(pub)
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div
      className="card overflow-hidden cursor-pointer"
      onClick={() => setExpanded(!expanded)}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setExpanded(!expanded)
        }
      }}
    >
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
          {/* Year + Status */}
          <div className="flex sm:flex-col items-center sm:items-start gap-2 sm:w-32 flex-shrink-0">
            <span
              className="text-xs font-medium px-2 py-1 rounded"
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'rgba(201, 168, 76, 0.1)',
                color: 'var(--gold)',
              }}
            >
              {pub.year}
            </span>
            {pub.status && (
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{
                  fontFamily: 'var(--font-mono)',
                  background: sc.bg,
                  color: sc.color,
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                }}
              >
                {pub.status}
              </span>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p
              className="text-xs sm:text-sm mb-1.5"
              style={{ color: 'var(--slate)' }}
            >
              {formatAuthors(pub.authors)}
            </p>
            <h3
              className="text-sm sm:text-base font-semibold leading-tight mb-1.5"
              style={{
                fontFamily: 'var(--font-body)',
                color: 'var(--ink)',
              }}
            >
              {pub.title}
            </h3>
            <p
              className="text-xs"
              style={{
                fontFamily: 'var(--font-body)',
                fontStyle: 'italic',
                color: 'var(--slate)',
              }}
            >
              {pub.journal}
            </p>
          </div>

          {/* Expand chevron */}
          <div className="flex-shrink-0 self-center">
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown
                size={18}
                style={{ color: 'var(--slate)' }}
              />
            </motion.div>
          </div>
        </div>
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div
              className="px-4 sm:px-6 pb-4 sm:pb-6 pt-0"
              style={{
                borderTop: '1px solid rgba(201, 168, 76, 0.15)',
              }}
            >
              <div className="pt-3 sm:pt-4 sm:pl-36">
                {pub.abstract && (
                  <p
                    className="text-sm leading-relaxed mb-3 sm:mb-4"
                    style={{ color: 'var(--slate)' }}
                  >
                    {pub.abstract}
                  </p>
                )}

                {/* Topic chips */}
                {pub.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3 sm:mb-4">
                    {pub.topics.map((t) => {
                      const tc = topicColor(t)
                      return (
                        <span
                          key={t}
                          className="inline-flex items-center px-2 py-0.5 rounded-full"
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '10px',
                            background: tc.bg,
                            color: tc.color,
                          }}
                        >
                          {topicLabel(t)}
                        </span>
                      )
                    })}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 sm:gap-3">
                  {pub.doi && (
                    <a
                      href={pub.doi}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        background: 'rgba(201, 168, 76, 0.1)',
                        color: 'var(--gold)',
                        border: '1px solid rgba(201, 168, 76, 0.2)',
                        minHeight: '32px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      DOI <ExternalLink size={10} aria-hidden="true" />
                    </a>
                  )}
                  {pub.pubmed && (
                    <a
                      href={pub.pubmed}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        background: 'rgba(201, 168, 76, 0.08)',
                        color: 'var(--gold)',
                        border: '1px solid rgba(201, 168, 76, 0.15)',
                        minHeight: '32px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      PubMed <ExternalLink size={10} aria-hidden="true" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      background: 'transparent',
                      color: copied ? '#16a34a' : 'var(--slate)',
                      border: '1px solid rgba(201, 168, 76, 0.15)',
                      minHeight: '32px',
                    }}
                  >
                    {copied ? (
                      <>
                        <Check size={10} aria-hidden="true" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <ClipboardCopy size={10} aria-hidden="true" />
                        Copy Citation
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
