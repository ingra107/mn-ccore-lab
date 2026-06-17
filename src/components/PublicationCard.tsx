import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, ChevronDown, ClipboardCopy, Check, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Publication } from '../data/types'
import { ICON_PROPS } from '../lib/iconProps'
import { ACCENT_GOLD, withAlpha } from '../lib/taskGrouping'

const TOPIC_DISPLAY: Record<string, string> = {
  clif: 'CLIF',
  covid: 'COVID-19',
  ventilation: 'Ventilation',
  'decision-making': 'Decision-Making',
  quality: 'Quality',
  sepsis: 'Sepsis',
  disparities: 'Disparities',
}

const TOPIC_COLORS: Record<string, { bg: string; color: string; darkBg: string; darkColor: string }> = {
  clif: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', darkBg: 'rgba(96, 165, 250, 0.15)', darkColor: '#60a5fa' },
  covid: { bg: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', darkBg: 'rgba(248, 113, 113, 0.15)', darkColor: '#f87171' },
  ventilation: { bg: 'rgba(34, 197, 94, 0.1)', color: 'var(--green)', darkBg: 'rgba(74, 222, 128, 0.15)', darkColor: 'var(--green-light)' },
  'decision-making': { bg: 'rgba(168, 85, 247, 0.1)', color: '#9333ea', darkBg: 'rgba(192, 132, 252, 0.15)', darkColor: '#c084fc' },
  quality: { bg: 'rgba(245, 158, 11, 0.1)', color: '#d97706', darkBg: 'rgba(251, 191, 36, 0.15)', darkColor: '#fbbf24' },
  sepsis: { bg: 'rgba(236, 72, 153, 0.1)', color: '#db2777', darkBg: 'rgba(244, 114, 182, 0.15)', darkColor: '#f472b6' },
  disparities: { bg: 'rgba(14, 165, 233, 0.1)', color: '#0284c7', darkBg: 'rgba(56, 189, 248, 0.15)', darkColor: '#38bdf8' },
}

const mnccoreMembers = [
  'Ingraham NE',
  'Mesfin N',
  'Eddington C',
  'Bromley E',
  'Collins C',
  'Shyu D',
  'Fitzgerald B',
  'Pendleton KM',
  'Chipman JG',
  'Dudley RA',
  'Wacker DA',
  'Wacker D',
  'Trujeque J',
  'McEachron K',
  'Safadi S',
  'Kalinoski M',
  'MacDonald DM',
  'Henkle BE',
  'Begnaud A',
]

const clifMembers = [
  'Hayek SS', 'Parker WF', 'Churpek MM', 'Gombar S', 'Dligach D',
  'Afshar M', 'Mayampurath A', 'Maddali MV', 'Siuba MT', 'Blair PW',
  'Weissman GE', 'Sinha P', 'Calfee CS', 'Rojas JC', 'Hochberg C',
  'Chhikara K', 'Chaudhari V', 'Lyons PG', 'Gao CA', 'Buell KG',
  'Barker AK', 'Amagai S', 'Nour M',
]

function topicLabel(topic: string): string {
  return TOPIC_DISPLAY[topic] ?? topic.charAt(0).toUpperCase() + topic.slice(1)
}

function topicColor(topic: string, isDark: boolean) {
  const tc = TOPIC_COLORS[topic]
  if (!tc) return { bg: 'var(--gold-active)', color: 'var(--gold)' }
  return isDark
    ? { bg: tc.darkBg, color: tc.darkColor }
    : { bg: tc.bg, color: tc.color }
}

function formatCitation(pub: Publication): string {
  const doiStr = pub.doi ? ` ${pub.doi}` : ''
  return `${pub.authors} (${pub.year}). ${pub.title}. ${pub.journal}.${doiStr}`
}

function formatAuthors(authors: string): React.ReactNode[] {
  const raw = authors.replace(/\.$/, '')
  const segments = raw.split(',').map((s) => s.trim()).filter(Boolean)

  const isMnccore = (seg: string) => mnccoreMembers.some((m) => seg.includes(m))
  const isClif = (seg: string) => clifMembers.some((m) => seg.includes(m))
  const isHighlighted = (seg: string) => isMnccore(seg) || isClif(seg)

  const renderSeg = (seg: string, key: string, prefix = ', '): React.ReactNode => {
    const text = key === 'f0' ? seg : `${prefix}${seg}`
    return isMnccore(seg) ? (
      <strong key={key} style={{ color: 'var(--ink)', fontWeight: 600 }}>
        {text}
      </strong>
    ) : isClif(seg) ? (
      <strong key={key} style={{ color: 'var(--ink)', fontWeight: 500 }}>
        {text}
      </strong>
    ) : (
      <span key={key}>{text}</span>
    )
  }

  // ≤10 authors: show all
  if (segments.length <= 10) {
    return segments.map((seg, i) => renderSeg(seg, i === 0 ? 'f0' : `f${i}`))
  }

  // >10 authors: first 3 + MNCCORE/CLIF members + last 3
  const firstThree = segments.slice(0, 3)
  const lastThree = segments.slice(-3)
  const middle = segments.slice(3, segments.length - 3)

  // Get highlighted middle members (MNCCORE first priority, then CLIF)
  let middleHighlighted = middle.filter(isHighlighted)

  // If >10 highlighted members in the middle, focus on MNCCORE only
  if (middleHighlighted.length > 10) {
    middleHighlighted = middle.filter(isMnccore)
  }

  const result: React.ReactNode[] = [
    ...firstThree.map((seg, i) => renderSeg(seg, i === 0 ? 'f0' : `f${i}`)),
  ]

  if (middleHighlighted.length > 0) {
    result.push(<span key="e1">, ...</span>)
    middleHighlighted.forEach((seg, i) => {
      result.push(renderSeg(seg, `m${i}`))
    })
    result.push(<span key="e2">, ...</span>)
  } else {
    result.push(<span key="e1">, ...</span>)
  }

  lastThree.forEach((seg, i) => {
    result.push(renderSeg(seg, `l${i}`))
  })

  return result
}

export default function PublicationCard({ pub }: { pub: Publication }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const isDark = document.documentElement.classList.contains('dark')

  const statusBadgeClass = () => {
    switch (pub.status) {
      case 'Published':
        return 'badge badge-published'
      case 'In Review':
        return 'badge badge-review'
      case 'In Preparation':
        return 'badge badge-preparation'
      default:
        return 'badge badge-active'
    }
  }

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
      <div className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
          {/* Year + Status */}
          <div className="flex sm:flex-col items-center sm:items-start gap-2 sm:w-32 flex-shrink-0">
            <span
              className="text-xs font-medium px-2 py-1 rounded"
              style={{
                background: 'var(--gold-active)',
                color: 'var(--gold)',
              }}
            >
              {pub.year}
            </span>
            {pub.status && (
              <span
                className={statusBadgeClass()}
                style={{
                  fontSize: '10px',
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
              className="text-sm sm:text-base font-normal leading-tight mb-1.5"
              style={{
                color: 'var(--ink)',
              }}
            >
              {pub.title}
            </h3>
            <p
              className="text-xs"
              style={{
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
              <ChevronDown {...ICON_PROPS}
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
                borderTop: `1px solid ${withAlpha(ACCENT_GOLD, 30)}`,
              }}
            >
              <div className="pt-4 sm:pt-5 sm:pl-36">
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
                  <div className="flex flex-wrap gap-2 mb-3 sm:mb-4">
                    {pub.topics.map((t) => {
                      const tc = topicColor(t, isDark)
                      return (
                        <span
                          key={t}
                          className="inline-flex items-center px-2.5 py-1 rounded-full"
                          style={{
                            fontSize: '11px',
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
                        background: 'var(--gold-active)',
                        color: 'var(--gold)',
                        border: `1px solid ${withAlpha(ACCENT_GOLD, 20)}`,
                        minHeight: '32px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      DOI <ExternalLink {...ICON_PROPS} size={10} aria-hidden="true" />
                    </a>
                  )}
                  {pub.pubmed && (
                    <a
                      href={pub.pubmed}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200"
                      style={{
                        background: 'var(--gold-active)',
                        color: 'var(--gold)',
                        border: `1px solid ${withAlpha(ACCENT_GOLD, 15)}`,
                        minHeight: '32px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      PubMed <ExternalLink {...ICON_PROPS} size={10} aria-hidden="true" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200"
                    style={{
                      background: 'transparent',
                      color: copied ? 'var(--green)' : 'var(--slate)',
                      border: `1px solid ${withAlpha(ACCENT_GOLD, 15)}`,
                      minHeight: '32px',
                    }}
                  >
                    {copied ? (
                      <>
                        <Check {...ICON_PROPS} size={10} aria-hidden="true" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <ClipboardCopy {...ICON_PROPS} size={10} aria-hidden="true" />
                        Copy Citation
                      </>
                    )}
                  </button>
                  <Link
                    to={`/publications/${encodeURIComponent(pub.id)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200"
                    style={{
                      background: 'transparent',
                      color: 'var(--teal)',
                      border: '1px solid rgba(45, 138, 138, 0.15)',
                      textDecoration: 'none',
                      minHeight: '32px',
                    }}
                  >
                    View details <ArrowRight {...ICON_PROPS} size={10} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
