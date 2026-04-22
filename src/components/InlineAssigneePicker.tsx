import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import Avatar from './Avatar'
import HoverCard from './HoverCard'
import type { HoverCardData } from './HoverCard'
import { useHoverCard } from '../hooks/useHoverCard'
import { getPersonInfo, getMemberBySlug, directors, seniorMentors, facultyCollaborators, researchTeam } from '../data/team'
import { displayName } from '../lib/nameUtils'

interface InlineAssigneePickerProps {
  value: string
  onChange: (slug: string) => void
  compact?: boolean
}

// Build member list from team data
function getAssignableMembers() {
  const all = [
    ...directors.map((d) => ({ slug: d.slug, name: d.name, initials: d.initials, photoUrl: d.photoUrl })),
    ...seniorMentors.filter((m) => m.slug).map((m) => ({ slug: m.slug!, name: m.name, initials: m.initials, photoUrl: m.photoUrl })),
    ...facultyCollaborators.filter((m) => m.slug).map((m) => ({ slug: m.slug!, name: m.name, initials: m.initials, photoUrl: m.photoUrl })),
    ...researchTeam.filter((m) => m.slug).map((m) => ({ slug: m.slug!, name: m.name, initials: m.initials, photoUrl: m.photoUrl })),
  ]
  // Deduplicate by slug
  const seen = new Set<string>()
  return all.filter((m) => {
    if (seen.has(m.slug)) return false
    seen.add(m.slug)
    return true
  })
}

export default function InlineAssigneePicker({ value, onChange, compact }: InlineAssigneePickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const person = getPersonInfo(value)
  const allMembers = getAssignableMembers()
  const q = search.toLowerCase()
  const members = q ? allMembers.filter(m => m.name.toLowerCase().includes(q) || m.slug.toLowerCase().includes(q)) : allMembers
  const hoverCard = useHoverCard()

  // Build member HoverCard data
  const memberData: HoverCardData | null = (() => {
    if (!value) return null
    const dir = directors.find(d => d.slug === value)
    const member = getMemberBySlug(value)
    const role = dir?.role || member?.role
    return {
      type: 'member' as const,
      name: person.name,
      role,
      photoUrl: person.photoUrl,
      initials: person.initials,
    }
  })()

  useEffect(() => {
    if (!open) return
    setSearch('')
    setFocusedIdx(-1)
    setTimeout(() => searchRef.current?.focus(), 0)
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx(i => Math.min(i + 1, members.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const idx = focusedIdx >= 0 ? focusedIdx : 0
      const pick = members[idx]
      if (pick) { onChange(pick.slug); setOpen(false) }
    }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        ref={hoverCard.triggerRef as React.RefObject<HTMLButtonElement>}
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        aria-label={`Assignee: ${person.name || value || 'unassigned'} — click to change`}
        className="inline-flex items-center gap-1.5 rounded-md transition-colors inline-assignee-btn"
        style={{
          padding: '2px 6px',
          border: '1px solid transparent',
          background: 'none',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 400,
          color: 'var(--ink)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-subtle)'
          e.currentTarget.style.background = 'var(--teal-hover)'
          if (!open && memberData) hoverCard.handlers.onMouseEnter()
        }}
        onMouseLeave={(e) => {
          if (!open) { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'none' }
          hoverCard.handlers.onMouseLeave()
        }}
      >
        <div style={{ width: 20, height: 20, flexShrink: 0 }}>
          <Avatar
            name={person.name}
            initials={person.initials}
            photoUrl={person.photoUrl}
            variant="ice"
            size="xs"
          />
        </div>
        {!compact && (
          <span style={{
            fontSize: 'var(--text-small)',
            color: 'var(--slate)',
            opacity: 0.75,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap' as const,
            maxWidth: '72px',
          }}>
            {value ? displayName(value, 'short') : person.name.split(' ')[0]}
          </span>
        )}
        <ChevronDown size={10} style={{ opacity: 0.85 }} />
      </button>

      {memberData && !open && (
        <HoverCard
          data={memberData}
          isVisible={hoverCard.isVisible}
          position={hoverCard.position}
          cardRef={hoverCard.cardRef}
          cardHandlers={hoverCard.cardHandlers}
        />
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
          <div
            className="absolute z-50 mt-1 rounded-lg"
            role="listbox"
            aria-label="Select assignee"
            style={{
              top: '100%',
              left: 0,
              minWidth: '220px',
              background: 'var(--cream)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-card-hover)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setFocusedIdx(0) }}
                onKeyDown={handleKeyDown}
                placeholder="Filter people..."
                className="w-full text-sm bg-transparent outline-none px-2 py-1"
                style={{ color: 'var(--ink)' }}
              />
            </div>
            <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
            {members.length === 0 && (
              <div style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>No matches</div>
            )}
            {members.map((m, idx) => {
              const isSelected = m.slug === value
              const focused = idx === focusedIdx
              return (
                <button
                  key={m.slug}
                  role="option"
                  aria-selected={isSelected ? "true" : "false"}
                  onClick={(e) => { e.stopPropagation(); onChange(m.slug); setOpen(false) }}
                  onMouseEnter={() => setFocusedIdx(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '6px 12px',
                    border: 'none',
                    cursor: 'pointer',
                    background: focused ? 'var(--teal-active)' : (isSelected ? 'var(--teal-hover)' : 'none'),
                    fontSize: '12px',
                    fontWeight: isSelected ? 500 : 400,
                    color: 'var(--ink)',
                    textAlign: 'left',
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{ width: 20, height: 20, flexShrink: 0 }}>
                    <Avatar
                      name={m.name}
                      initials={m.initials}
                      photoUrl={m.photoUrl}
                      variant="ice"
                      size="xs"
                    />
                  </div>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name}
                  </span>
                  {isSelected && (
                    <span style={{ color: 'var(--teal)', fontSize: '13px', lineHeight: 1 }}>&#10003;</span>
                  )}
                </button>
              )
            })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
