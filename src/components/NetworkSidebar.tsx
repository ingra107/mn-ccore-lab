import { motion, AnimatePresence } from 'framer-motion'
import { X, BookOpen, Users, ArrowRight } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import type { NetworkNode, NetworkEdge } from './CollaborationGraph'
import { directors, getAllMembers } from '../data/team'
import type { TeamMember, Director } from '../data/types'

interface NetworkSidebarProps {
  selectedNode: NetworkNode | null
  selectedEdge: NetworkEdge | null
  allNodes: NetworkNode[]
  allEdges: NetworkEdge[]
  onClose: () => void
}

function findTeamMember(authorName: string): (TeamMember | Director) | undefined {
  // Search directors first
  for (const d of directors) {
    if (authorName.includes(d.name.split(' ').pop()!)) return d
    // Match by author-style name
    const lastName = d.name.split(' ').pop()
    const firstInitial = d.name.charAt(0)
    if (authorName === `${lastName} ${firstInitial}` || authorName.includes(lastName!)) {
      return d
    }
  }

  // Then team members
  const members = getAllMembers()
  for (const m of members) {
    if (m.authorName && authorName.includes(m.authorName)) return m
    if (authorName.includes(m.name.split(' ').pop()!)) return m
  }
  return undefined
}

function getSlug(authorName: string): string | undefined {
  const member = findTeamMember(authorName)
  if (!member) return undefined
  if ('path' in member) return member.path.replace('/', '')
  return member.slug
}

function getPhotoUrl(authorName: string): string | undefined {
  const member = findTeamMember(authorName)
  return member?.photoUrl
}

function getInitials(authorName: string): string {
  const member = findTeamMember(authorName)
  if (member) return member.initials
  // Fallback: derive from author name (e.g., "Ingraham NE" -> "NI")
  const parts = authorName.split(' ')
  if (parts.length >= 2) {
    return (parts[1].charAt(0) + parts[0].charAt(0)).toUpperCase()
  }
  return authorName.substring(0, 2).toUpperCase()
}

function getRole(authorName: string): string {
  const member = findTeamMember(authorName)
  if (member) return member.role
  return 'Collaborator'
}

export default function NetworkSidebar({
  selectedNode,
  selectedEdge,
  allNodes,
  allEdges,
  onClose,
}: NetworkSidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null)
  const isOpen = !!(selectedNode || selectedEdge)

  // Click outside to close
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        // Don't close if clicking on canvas (that's handled by the canvas click handler)
        const target = e.target as HTMLElement
        if (target.tagName === 'CANVAS') return
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [isOpen, onClose])

  // Escape to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKey)
      return () => document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={sidebarRef}
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="absolute top-0 right-0 h-full overflow-y-auto"
          style={{
            width: 'min(380px, 90vw)',
            background: 'rgba(15, 25, 35, 0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderLeft: '1px solid rgba(201, 168, 76, 0.2)',
            zIndex: 'var(--z-dropdown)',
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg cursor-pointer transition-colors duration-200 hov-border hov-color"
            style={{
              background: 'var(--hover-light)',
              border: '1px solid rgba(201, 168, 76, 0.15)',
              color: 'rgba(255, 255, 255, 0.6)',
              zIndex: 'var(--z-dropdown)',
              '--hov-border': 'rgba(201, 168, 76, 0.4)',
              '--hov-color': 'rgba(255, 255, 255, 0.9)',
            } as React.CSSProperties}
            aria-label="Close panel"
          >
            <X size={16} />
          </button>

          <div className="p-6 pt-14">
            {selectedNode && (
              <NodeDetail
                node={selectedNode}
                allEdges={allEdges}
                allNodes={allNodes}
              />
            )}
            {selectedEdge && !selectedNode && (
              <EdgeDetail edge={selectedEdge} allNodes={allNodes} />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function NodeDetail({
  node,
  allEdges,
  allNodes,
}: {
  node: NetworkNode
  allEdges: NetworkEdge[]
  allNodes: NetworkNode[]
}) {
  const slug = getSlug(node.id)
  const photoUrl = getPhotoUrl(node.id)
  const initials = getInitials(node.id)
  const role = getRole(node.id)

  // Find co-authors (connected nodes)
  const connections = allEdges
    .filter((e) => e.source === node.id || e.target === node.id)
    .map((e) => {
      const otherId = e.source === node.id ? e.target : e.source
      const otherNode = allNodes.find((n) => n.id === otherId)
      return { node: otherNode, sharedPapers: e.weight, edge: e }
    })
    .filter((c) => c.node)
    .sort((a, b) => b.sharedPapers - a.sharedPapers)

  // Gather all unique papers
  const allPapers = new Map<string, { title: string; year: number }>()
  allEdges
    .filter((e) => e.source === node.id || e.target === node.id)
    .forEach((e) => {
      e.sharedPapers.forEach((p) => {
        allPapers.set(p.id, { title: p.title, year: p.year })
      })
    })

  const typeLabel = node.isMnccore
    ? 'MNCCORE'
    : node.isClif
      ? 'CLIF Consortium'
      : 'External Collaborator'

  const typeDotColor = node.isMnccore
    ? '#c9a84c'
    : node.isClif
      ? '#60a5b5'
      : '#64748b'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      {/* Avatar and name */}
      <div className="flex items-start gap-4 mb-6">
        <Avatar
          name={node.displayName}
          initials={initials}
          photoUrl={photoUrl}
          size="sm"
          variant="gold"
        />
        <div className="min-w-0">
          <h3
            className="text-lg leading-tight"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              color: '#ffffff',
            }}
          >
            {node.displayName}
          </h3>
          <p
            className="text-sm mt-0.5"
            style={{ color: 'rgba(255, 255, 255, 0.5)' }}
          >
            {role}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: typeDotColor }}
            />
            <span
              className="text-xs"
              style={{
                color: 'rgba(255, 255, 255, 0.4)',
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {typeLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div
        className="grid grid-cols-2 gap-3 mb-6 p-4 rounded-lg"
        style={{
          background: 'var(--hover-light)',
          border: '1px solid rgba(201, 168, 76, 0.1)',
        }}
      >
        <div className="text-center">
          <div
            className="text-xl font-bold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)' }}
          >
            {node.papers}
          </div>
          <div
            className="text-xs mt-0.5"
            style={{
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: '10px',
            }}
          >
            Papers
          </div>
        </div>
        <div className="text-center">
          <div
            className="text-xl font-bold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)' }}
          >
            {connections.length}
          </div>
          <div
            className="text-xs mt-0.5"
            style={{
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: '10px',
            }}
          >
            Co-authors
          </div>
        </div>
      </div>

      {/* Team page link */}
      {slug && (
        <Link
          to={slug === 'nick-ingraham' || slug === 'nate-mesfin' ? `/${slug}` : `/team/${slug}`}
          className="flex items-center gap-2 mb-6 px-4 py-3 rounded-lg transition-all duration-200 hov-bg hov-border"
          style={{
            background: 'var(--gold-active)',
            border: '1px solid rgba(201, 168, 76, 0.2)',
            color: 'var(--gold)',
            textDecoration: 'none',
            fontSize: '13px',
            fontWeight: 500,
            '--hov-bg': 'var(--gold-emphasis)',
            '--hov-border': 'rgba(201, 168, 76, 0.4)',
          } as React.CSSProperties}
        >
          <Users size={14} />
          View full profile
          <ArrowRight size={12} className="ml-auto" />
        </Link>
      )}

      {/* Co-authors */}
      {connections.length > 0 && (
        <div className="mb-6">
          <h4
            className="text-xs uppercase mb-3"
            style={{
              color: 'rgba(255, 255, 255, 0.4)',
              letterSpacing: '0.1em',
              fontSize: '10px',
            }}
          >
            Co-authors ({connections.length})
          </h4>
          <div className="space-y-2">
            {connections.map((c) => {
              if (!c.node) return null
              const cTypeDot = c.node.isMnccore
                ? '#c9a84c'
                : c.node.isClif
                  ? '#60a5b5'
                  : '#64748b'
              return (
                <div
                  key={c.node.id}
                  className="flex items-center justify-between px-3 py-2 rounded-md"
                  style={{
                    background: 'var(--hover-subtle)',
                    border: '1px solid rgba(201, 168, 76, 0.06)',
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: cTypeDot }}
                    />
                    <span
                      className="text-sm truncate"
                      style={{ color: 'rgba(255, 255, 255, 0.7)' }}
                    >
                      {c.node.displayName}
                    </span>
                  </div>
                  <span
                    className="text-xs flex-shrink-0 ml-2"
                    style={{
                      color: 'rgba(201, 168, 76, 0.6)',
                      fontSize: '10px',
                    }}
                  >
                    {c.sharedPapers} shared
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </motion.div>
  )
}

function EdgeDetail({
  edge,
  allNodes,
}: {
  edge: NetworkEdge
  allNodes: NetworkNode[]
}) {
  const sourceNode = allNodes.find((n) => n.id === edge.source)
  const targetNode = allNodes.find((n) => n.id === edge.target)
  if (!sourceNode || !targetNode) return null

  const uniquePapers = Array.from(
    new Map(edge.sharedPapers.map((p) => [p.id, p])).values()
  ).sort((a, b) => b.year - a.year)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      {/* Two-person header */}
      <div className="flex items-center gap-3 mb-6">
        <Avatar
          name={sourceNode.displayName}
          initials={getInitials(sourceNode.id)}
          photoUrl={getPhotoUrl(sourceNode.id)}
          size="sm"
          variant="gold"
        />
        <div className="flex flex-col items-center">
          <div
            className="w-8 h-px"
            style={{ background: 'rgba(201, 168, 76, 0.4)' }}
          />
          <span
            className="text-xs mt-1"
            style={{
              color: 'rgba(201, 168, 76, 0.6)',
              fontSize: '10px',
            }}
          >
            {uniquePapers.length}
          </span>
        </div>
        <Avatar
          name={targetNode.displayName}
          initials={getInitials(targetNode.id)}
          photoUrl={getPhotoUrl(targetNode.id)}
          size="sm"
          variant="gold"
        />
      </div>

      <h3
        className="text-base mb-1"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          color: '#ffffff',
        }}
      >
        {sourceNode.displayName} & {targetNode.displayName}
      </h3>
      <p
        className="text-sm mb-6"
        style={{ color: 'rgba(255, 255, 255, 0.5)' }}
      >
        {uniquePapers.length} shared publication{uniquePapers.length !== 1 ? 's' : ''}
      </p>

      {/* Shared papers list */}
      <div>
        <h4
          className="text-xs uppercase mb-3"
          style={{
            color: 'rgba(255, 255, 255, 0.4)',
            letterSpacing: '0.1em',
            fontSize: '10px',
          }}
        >
          <BookOpen size={12} className="inline mr-1.5" style={{ verticalAlign: '-2px' }} />
          Shared Publications
        </h4>
        <div className="space-y-3">
          {uniquePapers.map((paper) => (
            <div
              key={paper.id}
              className="p-3 rounded-lg"
              style={{
                background: 'var(--hover-subtle)',
                border: '1px solid rgba(201, 168, 76, 0.06)',
              }}
            >
              <p
                className="text-sm leading-relaxed"
                style={{ color: 'rgba(255, 255, 255, 0.7)' }}
              >
                {paper.title}
              </p>
              <span
                className="text-xs mt-1.5 inline-block"
                style={{
                  color: 'rgba(201, 168, 76, 0.5)',
                  fontSize: '10px',
                }}
              >
                {paper.year}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
