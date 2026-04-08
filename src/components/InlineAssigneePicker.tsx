import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import Avatar from './Avatar'
import HoverCard from './HoverCard'
import type { HoverCardData } from './HoverCard'
import { useHoverCard } from '../hooks/useHoverCard'
import { getPersonInfo, getMemberBySlug, directors, seniorMentors, facultyCollaborators, researchTeam } from '../data/team'

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
  const ref = useRef<HTMLDivElement>(null)
  const person = getPersonInfo(value)
  const members = getAssignableMembers()
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
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        ref={hoverCard.triggerRef as React.RefObject<HTMLButtonElement>}
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
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
          e.currentTarget.style.background = 'rgba(45,138,138,0.04)'
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
            size="sm"
            variant="ice"
            className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[6px]"
          />
        </div>
        {!compact && (
          <span style={{
            fontSize: '12px',
            color: 'var(--slate)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap' as const,
            maxWidth: '72px',
          }}>
            {person.name.split(' ')[0]}
          </span>
        )}
        <ChevronDown size={10} style={{ opacity: 0.3 }} />
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
            className="absolute z-50 mt-1 rounded-lg overflow-hidden"
            style={{
              top: '100%',
              left: 0,
              minWidth: '180px',
              maxHeight: '240px',
              overflowY: 'auto',
              background: 'var(--cream)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-card-hover)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {members.map((m) => {
              const isSelected = m.slug === value
              return (
                <button
                  key={m.slug}
                  onClick={(e) => { e.stopPropagation(); onChange(m.slug); setOpen(false) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '6px 12px',
                    border: 'none',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(45,138,138,0.06)' : 'none',
                    fontSize: '12px',
                    fontWeight: isSelected ? 500 : 400,
                    color: 'var(--ink)',
                    textAlign: 'left',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(45,138,138,0.08)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? 'rgba(45,138,138,0.06)' : 'none' }}
                >
                  <div style={{ width: 20, height: 20, flexShrink: 0 }}>
                    <Avatar
                      name={m.name}
                      initials={m.initials}
                      photoUrl={m.photoUrl}
                      size="sm"
                      variant="ice"
                      className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[6px]"
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
        </>
      )}
    </div>
  )
}
