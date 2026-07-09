import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import Avatar from './Avatar'
import CategoryIcon from './CategoryIcon'
import { getPersonInfo } from '../data/team'
import { displayName } from '../lib/nameUtils'
import type { Project } from '../data/types'
import { PATHS } from '../constants/paths'

interface ProjectCardProps {
  project: Project
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const pi = getPersonInfo(project.pi)

  const cardContent = (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="project-card"
      style={{
        // Recipe A: .project-card has no base lift — lift cream→surface-2 so
        // the kanban card reads above the dark page bg (shadow-card = the edge).
        background: 'var(--surface-2)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--sp-lg)',
        cursor: 'pointer',
        boxShadow: 'var(--shadow-card)',
        transition: 'box-shadow 0.2s ease, background 0.15s ease',
      }}
    >
      {/* Title with category icon */}
      <div className="flex items-start gap-2">
        <span style={{ flexShrink: 0, marginTop: '2px', opacity: 0.85 }}>
          <CategoryIcon category={project.category} size={14} />
        </span>
        <h4
          style={{
            fontWeight: 600,
            fontSize: '13px',
            color: 'var(--ink)',
            lineHeight: 1.4,
            margin: 0,
          }}
        >
          {project.title}
        </h4>
      </div>

      {/* PI — small, muted */}
      <div
        className="flex items-center gap-1.5"
        style={{ marginTop: '8px', marginLeft: '16px' }}
      >
        <div style={{ width: 18, height: 18, flexShrink: 0 }}>
          <Avatar
            name={pi.name}
            initials={pi.initials}
            photoUrl={pi.photoUrl}
            variant="ice"
            size="sm-icon"
          />
        </div>
        <span
          style={{
            fontSize: '11px',
            color: 'var(--slate)',
            opacity: 0.75,
          }}
        >
          {project.pi ? displayName(project.pi, 'short') : pi.name}
        </span>
      </div>
    </motion.div>
  )

  if (project.slug) {
    return (
      <Link
        to={PATHS.project(project.slug)}
        style={{ textDecoration: 'none', display: 'block' }}
      >
        {cardContent}
      </Link>
    )
  }

  return cardContent
}
