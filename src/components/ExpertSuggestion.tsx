import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Search, User } from 'lucide-react'
import { useExpertSuggestions } from '../hooks/useApiData'
import { getPersonInfo } from '../data/team'

interface ExpertSuggestionProps {
  /** Pre-filled topic (e.g., from task category or question). Leave empty for search mode. */
  topic?: string
  /** Compact mode hides the search input (just shows results for given topic) */
  compact?: boolean
}

export default function ExpertSuggestion({ topic: initialTopic = '', compact = false }: ExpertSuggestionProps) {
  const [query, setQuery] = useState(initialTopic)
  const searchTopic = query.trim()
  const { data: suggestions = [], isLoading } = useExpertSuggestions(searchTopic)

  return (
    <div>
      {!compact && (
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} style={{ color: 'var(--gold)' }} />
          <h3
            className="text-sm font-normal"
            style={{ color: 'var(--ink)' }}
          >
            Who can help?
          </h3>
        </div>
      )}

      {!compact && (
        <div className="relative mb-3">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--slate)', opacity: 0.5 }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by topic, e.g. ventilation, sepsis..."
            className="w-full pl-8 pr-3 py-2 rounded-md text-sm"
            style={{
              background: 'var(--ice)',
              color: 'var(--ink)',
              border: '1px solid rgba(201,168,76,0.15)',
              outline: 'none',
            }}
          />
        </div>
      )}

      <AnimatePresence mode="wait">
        {isLoading && searchTopic.length >= 2 && (
          <motion.p
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs"
            style={{ color: 'var(--slate)' }}
          >
            Searching...
          </motion.p>
        )}

        {!isLoading && searchTopic.length >= 2 && suggestions.length === 0 && (
          <motion.p
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs"
            style={{ color: 'var(--muted)' }}
          >
            No experts found for "{searchTopic}"
          </motion.p>
        )}

        {suggestions.length > 0 && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="space-y-1.5"
          >
            {suggestions.map((expert) => {
              const person = getPersonInfo(expert.slug)
              return (
                <Link
                  key={expert.slug}
                  to={`/team/${expert.slug}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200"
                  style={{
                    background: 'var(--ice)',
                    border: '1px solid transparent',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(201,168,76,0.25)'
                    e.currentTarget.style.background = 'var(--gold-hover)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'transparent'
                    e.currentTarget.style.background = 'var(--ice)'
                  }}
                >
                  {person.photoUrl ? (
                    <img
                      src={person.photoUrl}
                      alt=""
                      className="w-7 h-7 rounded-full object-cover"
                      style={{ border: '1.5px solid rgba(201,168,76,0.2)' }}
                    />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center"
                      style={{
                        background: 'var(--gold-emphasis)',
                        color: 'var(--gold)',
                        fontSize: '10px',
                        fontWeight: 600,
                      }}
                    >
                      {person.initials || <User size={12} />}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-medium truncate"
                      style={{ color: 'var(--ink)' }}
                    >
                      {person.name}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {expert.sources.map((source, i) => (
                        <span
                          key={i}
                          className="text-[10px] px-1.5 py-0 rounded-full"
                          style={{
                            background: source === 'publications'
                              ? 'rgba(59,130,246,0.08)'
                              : 'var(--gold-active)',
                            color: source === 'publications'
                              ? '#3b82f6'
                              : 'var(--gold)',
                          }}
                        >
                          {source}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Confidence indicator */}
                  <div
                    className="flex items-center gap-1"
                    title={`Confidence: ${Math.round(expert.confidence * 100)}%`}
                  >
                    <div
                      className="h-1 rounded-full"
                      style={{
                        width: `${Math.max(16, expert.confidence * 40)}px`,
                        background: expert.confidence >= 0.8
                          ? 'var(--gold)'
                          : expert.confidence >= 0.5
                            ? 'rgba(201,168,76,0.5)'
                            : 'rgba(201,168,76,0.25)',
                      }}
                    />
                  </div>
                </Link>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
