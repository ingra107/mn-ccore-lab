import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import Avatar from './Avatar'
import StageSelector from './StageSelector'
import { directors } from '../data/team'
import { getAllMembers } from '../data/team'
import type { Project } from '../data/types'
import type { Stage } from './StageSelector'

const CATEGORY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  clif: { bg: 'var(--maroon)', text: '#faf8f3', label: 'CLIF' },
  lab: { bg: 'var(--teal)', text: '#faf8f3', label: 'Lab' },
  nate: { bg: 'var(--gold)', text: '#0f1923', label: 'Mesfin' },
}

function getPiInfo(slug: string) {
  const director = directors.find((d) => d.slug === slug)
  if (director) {
    return { name: director.name, initials: director.initials, photoUrl: director.photoUrl }
  }
  const member = getAllMembers().find((m) => m.slug === slug)
  if (member) {
    return { name: member.name, initials: member.initials, photoUrl: member.photoUrl }
  }
  return { name: slug, initials: slug.slice(0, 2).toUpperCase(), photoUrl: undefined }
}

interface ProjectCardProps {
  project: Project
  onStageChange?: (newStage: Stage) => void
}

export default function ProjectCard({ project, onStageChange }: ProjectCardProps) {
  const cat = CATEGORY_COLORS[project.category] ?? { bg: 'var(--slate)', text: '#faf8f3', label: project.category }
  const pi = getPiInfo(project.pi)

  const cardContent = (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="project-card group"
      style={{
        background: 'var(--cream)',
        borderRadius: '12px',
        borderLeft: '2px solid var(--gold)',
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
      }}
      whileHover={{
        y: -2,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
      }}
    >
      {/* Header: category badge + stage move + PI avatar */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className="inline-block px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
          style={{
            background: cat.bg,
            color: cat.text,
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.04em',
          }}
        >
          {cat.label}
        </span>
        <div className="flex items-center gap-2">
          {/* Stage change button */}
          {onStageChange && project.stage && (
            <div
              onClick={(e) => {
                // Prevent Link navigation when interacting with stage selector
                e.preventDefault()
                e.stopPropagation()
              }}
            >
              <StageSelector
                currentStage={project.stage}
                onChange={onStageChange}
                mode="compact"
              />
            </div>
          )}
          <div className="flex-shrink-0" style={{ width: 28, height: 28 }}>
            <Avatar
              name={pi.name}
              initials={pi.initials}
              photoUrl={pi.photoUrl}
              size="sm"
              variant="ice"
              className="!w-7 !h-7 !min-w-0 !min-h-0"
            />
          </div>
        </div>
      </div>

      {/* Title */}
      <h4
        className="text-sm font-semibold leading-snug mb-1"
        style={{
          fontFamily: 'var(--font-body)',
          color: 'var(--ink)',
          lineHeight: 1.35,
        }}
      >
        {project.title}
      </h4>

      {/* Description (truncated to 2 lines) */}
      {project.description && (
        <p
          className="text-xs leading-relaxed"
          style={{
            fontFamily: 'var(--font-body)',
            color: 'var(--slate)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {project.description}
        </p>
      )}

      {/* Hover-reveal details: strategic context + team */}
      <div
        className="project-card-details"
        style={{ maxHeight: 0, opacity: 0, overflow: 'hidden', transition: 'opacity 0.2s ease, max-height 0.3s ease' }}
      >
        {/* Strategic context preview */}
        {project.strategic_context && (
          <p
            className="text-xs leading-relaxed mt-1.5"
            style={{
              fontFamily: 'var(--font-body)',
              color: 'var(--gold)',
              fontStyle: 'italic',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              opacity: 0.85,
            }}
          >
            {project.strategic_context}
          </p>
        )}

        {/* Team avatars row */}
        {project.team && project.team.length > 1 && (
          <div className="flex items-center gap-1 mt-2">
            <span
              className="text-xs mr-1"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                color: 'var(--slate)',
                opacity: 0.6,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Team
            </span>
            {project.team.slice(0, 4).map((slug) => {
              const info = getPiInfo(slug)
              return (
                <div key={slug} style={{ width: 20, height: 20 }}>
                  <Avatar
                    name={info.name}
                    initials={info.initials}
                    photoUrl={info.photoUrl}
                    size="sm"
                    variant="ice"
                    className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[8px]"
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )

  // Wrap in Link if project has a slug
  if (project.slug) {
    return (
      <Link
        to={`/projects/${project.slug}`}
        style={{ textDecoration: 'none', display: 'block' }}
      >
        {cardContent}
      </Link>
    )
  }

  return cardContent
}
