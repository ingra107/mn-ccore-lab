import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GitBranch, Plus, ArrowRight, Trash2 } from 'lucide-react'
import { useProjects, useProjectDependencies } from '../../hooks/useApiData'
import { useCreateDependency, useDeleteDependency } from '../../hooks/useMutations'
import type { Project } from '../../data/types'

interface ProjectDependenciesProps {
  project: Project
  isPi: boolean
}

const REL_COLORS: Record<string, string> = {
  feeds_into: 'var(--gold)',
  blocks: 'var(--maroon)',
  shares_data: 'var(--teal)',
  related_to: 'var(--slate)',
}

const REL_LABELS: Record<string, string> = {
  feeds_into: 'feeds into',
  blocks: 'blocks',
  shares_data: 'shares data with',
  related_to: 'related to',
}

const REL_OPTIONS = [
  { value: 'feeds_into', label: 'Feeds into' },
  { value: 'blocks', label: 'Blocks' },
  { value: 'shares_data', label: 'Shares data' },
  { value: 'related_to', label: 'Related to' },
]

export default function ProjectDependencies({ project, isPi }: ProjectDependenciesProps) {
  const { data: deps = [] } = useProjectDependencies(project.slug)
  const { data: allProjects = [] } = useProjects()
  const createDep = useCreateDependency()
  const deleteDep = useDeleteDependency()

  const [showAddForm, setShowAddForm] = useState(false)
  const [newTarget, setNewTarget] = useState('')
  const [newRelType, setNewRelType] = useState('feeds_into')
  const [newDirection, setNewDirection] = useState<'outgoing' | 'incoming'>('outgoing')
  const [newNote, setNewNote] = useState('')

  const outgoing = deps.filter((d) => d.from_slug === project.slug)
  const incoming = deps.filter((d) => d.to_slug === project.slug)

  const connectedSlugs = new Set(deps.map((d) => d.from_slug === project.slug ? d.to_slug : d.from_slug))
  const availableTargets = allProjects.filter(
    (p) => p.slug !== project.slug && !connectedSlugs.has(p.slug)
  )

  function handleAdd() {
    if (!newTarget) return
    const input = newDirection === 'outgoing'
      ? { from_slug: project.slug, to_slug: newTarget, relationship_type: newRelType, note: newNote || undefined }
      : { from_slug: newTarget, to_slug: project.slug, relationship_type: newRelType, note: newNote || undefined }

    createDep.mutate(input)
    setNewTarget('')
    setNewNote('')
    setShowAddForm(false)
  }

  function getProjectTitle(slug: string): string {
    const p = allProjects.find((pr) => pr.slug === slug)
    return p?.title || slug
  }

  return (
    <motion.div
      id="dependencies"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.15 }}
      style={{ marginBottom: '2.5rem', scrollMarginTop: '60px' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2
          style={{
            fontWeight: 500,
            fontSize: '16px',
            color: 'var(--ink)',
            margin: 0,
          }}
        >
          <GitBranch size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px', color: 'var(--teal)' }} />
          Dependencies
        </h2>
        {isPi && !showAddForm && (
          <motion.button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs"
            style={{
              fontSize: '11px',
              background: 'rgba(45, 138, 138, 0.08)',
              color: 'var(--teal)',
              border: '1px solid rgba(45, 138, 138, 0.2)',
            }}
            whileTap={{ scale: 0.95 }}
          >
            <Plus size={12} />
            Add dependency
          </motion.button>
        )}
      </div>

      {/* Add dependency form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', marginBottom: '12px' }}
          >
            <div
              style={{
                background: 'var(--ice)',
                borderRadius: '10px',
                padding: '14px 16px',
                border: '1px solid rgba(45, 138, 138, 0.15)',
              }}
              className="detail-card"
            >
              <div className="flex flex-wrap gap-2 items-end mb-3">
                {/* Direction */}
                <div>
                  <label
                    style={{
                      fontSize: '9px',
                      color: 'var(--slate)',
                      opacity: 0.6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      display: 'block',
                      marginBottom: '4px',
                    }}
                  >
                    Direction
                  </label>
                  <select
                    value={newDirection}
                    onChange={(e) => setNewDirection(e.target.value as 'outgoing' | 'incoming')}
                    style={{
                      fontSize: '12px',
                      color: 'var(--ink)',
                      background: 'var(--cream)',
                      border: '1px solid rgba(201, 168, 76, 0.15)',
                      borderRadius: '6px',
                      padding: '6px 8px',
                      outline: 'none',
                    }}
                  >
                    <option value="outgoing">This project ...</option>
                    <option value="incoming">... feeds this project</option>
                  </select>
                </div>

                {/* Relationship type */}
                <div>
                  <label
                    style={{
                      fontSize: '9px',
                      color: 'var(--slate)',
                      opacity: 0.6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      display: 'block',
                      marginBottom: '4px',
                    }}
                  >
                    Relationship
                  </label>
                  <select
                    value={newRelType}
                    onChange={(e) => setNewRelType(e.target.value)}
                    style={{
                      fontSize: '12px',
                      color: 'var(--ink)',
                      background: 'var(--cream)',
                      border: '1px solid rgba(201, 168, 76, 0.15)',
                      borderRadius: '6px',
                      padding: '6px 8px',
                      outline: 'none',
                    }}
                  >
                    {REL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Target project */}
                <div style={{ flex: 1, minWidth: '160px' }}>
                  <label
                    style={{
                      fontSize: '9px',
                      color: 'var(--slate)',
                      opacity: 0.6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      display: 'block',
                      marginBottom: '4px',
                    }}
                  >
                    Project
                  </label>
                  <select
                    value={newTarget}
                    onChange={(e) => setNewTarget(e.target.value)}
                    style={{
                      width: '100%',
                      fontSize: '12px',
                      color: 'var(--ink)',
                      background: 'var(--cream)',
                      border: '1px solid rgba(201, 168, 76, 0.15)',
                      borderRadius: '6px',
                      padding: '6px 8px',
                      outline: 'none',
                    }}
                  >
                    <option value="">Select a project...</option>
                    {availableTargets.map((p) => (
                      <option key={p.slug} value={p.slug}>{p.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Note */}
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Optional note..."
                style={{
                  width: '100%',
                  fontSize: '12px',
                  color: 'var(--ink)',
                  background: 'var(--cream)',
                  border: '1px solid rgba(201, 168, 76, 0.15)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  outline: 'none',
                  marginBottom: '10px',
                }}
              />

              <div className="flex items-center gap-2">
                <motion.button
                  type="button"
                  onClick={handleAdd}
                  disabled={!newTarget}
                  className="cursor-pointer px-3 py-1.5 rounded-md text-xs font-medium"
                  style={{
                    background: newTarget ? 'var(--teal)' : 'var(--ice)',
                    color: newTarget ? '#ffffff' : 'var(--slate)',
                    border: 'none',
                    opacity: newTarget ? 1 : 0.5,
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  Add
                </motion.button>
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setNewTarget(''); setNewNote('') }}
                  className="px-3 py-1.5 rounded-md text-xs"
                  style={{
                    color: 'var(--slate)',
                    background: 'none',
                    border: '1px solid var(--border-light)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dependency list */}
      <div
        style={{
          background: 'var(--ice)',
          borderRadius: '12px',
          padding: '16px 20px',
        }}
        className="detail-card"
      >
        {outgoing.length === 0 && incoming.length === 0 ? (
          <p
            style={{
              fontSize: '12px',
              color: 'var(--slate)',
              opacity: 0.4,
              textAlign: 'center',
              padding: '16px 0',
              margin: 0,
            }}
          >
            No dependencies linked to this project
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Outgoing */}
            {outgoing.map((dep) => (
              <div
                key={dep.id}
                className="flex items-center gap-3"
                style={{
                  padding: '8px 0',
                  borderBottom: '1px solid rgba(201, 168, 76, 0.08)',
                }}
              >
                <span
                  style={{
                    fontSize: '10px',
                    color: REL_COLORS[dep.relationship_type] || 'var(--slate)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {REL_LABELS[dep.relationship_type] || dep.relationship_type}
                </span>
                <ArrowRight size={12} style={{ color: 'var(--slate)', opacity: 0.4, flexShrink: 0 }} />
                <Link
                  to={`/projects/${dep.to_slug}`}
                  style={{
                    fontSize: '13px',
                    color: 'var(--ink)',
                    textDecoration: 'none',
                    flex: 1,
                  }}
                >
                  {getProjectTitle(dep.to_slug)}
                </Link>
                {dep.note && (
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--slate)',
                      opacity: 0.5,
                      maxWidth: '200px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {dep.note}
                  </span>
                )}
                {isPi && (
                  <motion.button
                    type="button"
                    onClick={() => deleteDep.mutate(dep.id)}
                    className="cursor-pointer flex-shrink-0 p-1 rounded"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--slate)',
                      opacity: 0.3,
                    }}
                    whileHover={{ opacity: 0.8 }}
                    whileTap={{ scale: 0.9 }}
                    title="Remove dependency"
                  >
                    <Trash2 size={12} />
                  </motion.button>
                )}
              </div>
            ))}

            {/* Incoming */}
            {incoming.map((dep) => (
              <div
                key={dep.id}
                className="flex items-center gap-3"
                style={{
                  padding: '8px 0',
                  borderBottom: '1px solid rgba(201, 168, 76, 0.08)',
                }}
              >
                <Link
                  to={`/projects/${dep.from_slug}`}
                  style={{
                    fontSize: '13px',
                    color: 'var(--ink)',
                    textDecoration: 'none',
                  }}
                >
                  {getProjectTitle(dep.from_slug)}
                </Link>
                <ArrowRight size={12} style={{ color: 'var(--slate)', opacity: 0.4, flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: '10px',
                    color: REL_COLORS[dep.relationship_type] || 'var(--slate)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {REL_LABELS[dep.relationship_type] || dep.relationship_type}
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    color: 'var(--slate)',
                    opacity: 0.6,
                    flex: 1,
                  }}
                >
                  this project
                </span>
                {dep.note && (
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--slate)',
                      opacity: 0.5,
                      maxWidth: '200px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {dep.note}
                  </span>
                )}
                {isPi && (
                  <motion.button
                    type="button"
                    onClick={() => deleteDep.mutate(dep.id)}
                    className="cursor-pointer flex-shrink-0 p-1 rounded"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--slate)',
                      opacity: 0.3,
                    }}
                    whileHover={{ opacity: 0.8 }}
                    whileTap={{ scale: 0.9 }}
                    title="Remove dependency"
                  >
                    <Trash2 size={12} />
                  </motion.button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
