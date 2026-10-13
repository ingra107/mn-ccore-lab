import { memo, useMemo } from 'react'
import { Link } from 'react-router-dom'
import BentoCard from './BentoCard'
import { usePublications } from '../../hooks/useApiData'
import { useDashboardMounted } from './dashboardMounted'
import { countPublications } from '../../lib/publicationCounts'
import { PUBLIC_PATHS } from '../../constants/paths'

interface Stage {
  label: string
  status: 'In Preparation' | 'In Review' | 'Published'
  count: number
  to: string
}

function PipelineCard() {
  const mounted = useDashboardMounted()
  const { data: publications = [] } = usePublications(undefined, { enabled: mounted })

  const stages = useMemo<Stage[]>(() => {
    const { inPreparation: prep, inReview: review, published } = countPublications(publications)
    return [
      { label: 'In preparation', status: 'In Preparation', count: prep, to: PUBLIC_PATHS.publications },
      { label: 'In review', status: 'In Review', count: review, to: PUBLIC_PATHS.publications },
      { label: 'Published', status: 'Published', count: published, to: `${PUBLIC_PATHS.publications}?status=Published` },
    ]
  }, [publications])

  // Wave 3 (Lab Overview option A): hero = manuscripts tracked, then the three
  // stages as plain count rows. The funnel bars, flow arrows and the repeated
  // total are gone; each stage still links to the filtered Publications list.
  return (
    <BentoCard
      title="Publications"
      hero={{ value: publications.length, label: 'manuscripts tracked', rule: 'none' }}
      size="span-2x2"
      uniform
      noLift
    >
      <div className="flex flex-col h-full">
        <div>
          {stages.map((stage) => (
            <Link
              key={stage.status}
              to={stage.to}
              className="bento-row"
            >
              <span className="bento-row-t" style={{ color: 'var(--sk-t2)' }}>{stage.label}</span>
              <b style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{stage.count}</b>
            </Link>
          ))}
        </div>
      </div>
    </BentoCard>
  )
}

export default memo(PipelineCard)
