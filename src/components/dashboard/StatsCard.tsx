import { Users, FlaskConical, FileText, Award } from 'lucide-react'
import { useCountUp } from '../../hooks/useCountUp'
import BentoCard from './BentoCard'
import { publications } from '../../data/publications'
import { projects } from '../../data/projects'
import { directors, seniorMentors, facultyCollaborators, researchTeam } from '../../data/team'
import type { LucideIcon } from 'lucide-react'

interface StatItem {
  icon: LucideIcon
  value: number
  label: string
  suffix?: string
}

function MiniStat({ icon: Icon, value, label, suffix = '', delay }: StatItem & { delay: number }) {
  const { count, ref } = useCountUp(value, 1800 + delay)

  return (
    <div ref={ref} className="flex items-center gap-2.5 py-2">
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(201, 168, 76, 0.08)',
          flexShrink: 0,
        }}
      >
        <Icon size={15} style={{ color: 'var(--gold)' }} />
      </div>
      <div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '22px',
            fontWeight: 700,
            color: 'var(--ink)',
            lineHeight: 1.1,
          }}
        >
          {count}{suffix}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            color: 'var(--slate)',
            opacity: 0.7,
            lineHeight: 1.2,
          }}
        >
          {label}
        </div>
      </div>
    </div>
  )
}

export default function StatsCard() {
  const teamSize = directors.length + seniorMentors.length + facultyCollaborators.length + researchTeam.length
  const activeProjects = projects.filter((p) => p.status === 'Active').length
  const inReview = publications.filter((p) => p.status === 'In Review').length
  // Scholar stats from team.ts comments: Nick 2626 citations
  const totalCitations = 2626

  const stats: StatItem[] = [
    { icon: Users, value: teamSize, label: 'Team members' },
    { icon: FlaskConical, value: activeProjects, label: 'Active projects' },
    { icon: FileText, value: inReview, label: 'Papers in review' },
    { icon: Award, value: totalCitations, label: 'Total citations', suffix: '+' },
  ]

  return (
    <BentoCard title="At a Glance" size="span-1">
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {stats.map((stat, i) => (
          <MiniStat key={stat.label} {...stat} delay={i * 120} />
        ))}
      </div>
    </BentoCard>
  )
}
