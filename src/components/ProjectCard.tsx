import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import Avatar from './Avatar'
import { directors } from '../data/team'
import { getAllMembers } from '../data/team'
import type { Project } from '../data/types'

const CATEGORY_DOT: Record<string, string> = {
  clif: 'var(--maroon)',
  lab: 'var(--teal)',
  nate: 'var(--gold)',
  mentee: 'var(--slate)',
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
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const pi = getPiInfo(project.pi)
  const dotColor = CATEGORY_DOT[project.category] ?? 'var(--slate)'

  const cardContent = (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="project-card"
      style={{
        background: 'var(--cream)',
        borderRadius: '8px',
        padding: '16px 18px',
        cursor: 'pointer',
        boxShadow: '0 1px 2px rgba(15, 25, 35, 0.04)',
        transition: 'box-shadow 0.2s ease, background 0.15s ease',
      }}
    >
      {/* Title with category dot */}
      <div className="flex items-start gap-2">
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: dotColor,
            flexShrink: 0,
            opacity: 0.7,
            marginTop: '6px',
          }}
        />
        <h4
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: '13.5px',
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
        style={{ marginTop: '8px', marginLeft: '14px' }}
      >
        <div style={{ width: 18, height: 18, flexShrink: 0 }}>
          <Avatar
            name={pi.name}
            initials={pi.initials}
            photoUrl={pi.photoUrl}
            size="sm"
            variant="ice"
            className="!w-[18px] !h-[18px] !min-w-0 !min-h-0 !text-[7px]"
          />
        </div>
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            color: 'var(--slate)',
            opacity: 0.6,
          }}
        >
          {pi.name.split(' ').pop()}
        </span>
      </div>
    </motion.div>
  )

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
