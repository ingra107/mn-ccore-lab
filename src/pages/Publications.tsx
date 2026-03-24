import { useState } from 'react'
import { ExternalLink, ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useScrollRevealGroup } from '../hooks/useScrollReveal'
import SectionDivider from '../components/SectionDivider'
import { usePageMeta } from '../hooks/usePageMeta'

interface Publication {
  authors: string
  title: string
  journal: string
  year: number
  status?: 'Published' | 'In Review' | 'In Preparation'
  doi?: string
  pubmed?: string
  abstract?: string
}

const publications: Publication[] = [
  // 2026
  {
    authors: 'Ingraham NE, Bromley E, et al.',
    title: 'Association of General Decision-Making Style with Lung-Protective Ventilation Adherence',
    journal: 'In preparation',
    year: 2026,
    status: 'In Preparation',
    abstract: 'This study examines the relationship between physicians\' general decision-making styles, measured by the GDMS instrument, and their adherence to lung-protective ventilation protocols in the ICU. By linking survey data with clinical EHR data across multiple centers, we characterize how rational, intuitive, dependent, avoidant, and spontaneous decision-making styles predict evidence-based practice adherence.',
  },
  {
    authors: 'Ingraham NE, et al.',
    title: 'ICU Quality Metrics Using Multi-Center EHR Data',
    journal: 'In preparation',
    year: 2026,
    status: 'In Preparation',
    abstract: 'Development and validation of process-based and outcome-based quality measures for ICU care using the CLIF multi-center dataset. This work establishes benchmarking methodology for critical care quality assessment across diverse hospital settings.',
  },
  {
    authors: 'Mesfin N, et al.',
    title: 'DNR Order Variation Across Providers',
    journal: 'In preparation',
    year: 2026,
    status: 'In Preparation',
    abstract: 'Characterizing provider-level variation in DNR order documentation patterns and their association with patient outcomes and goals-of-care conversations.',
  },
  {
    authors: 'Mesfin N, et al.',
    title: 'In-Hospital Cardiac Arrest Survivability',
    journal: 'In preparation',
    year: 2026,
    status: 'In Preparation',
    abstract: 'A predictive modeling study examining factors that influence survivability after in-hospital cardiac arrest, with the goal of improving prognostication and clinical decision-making.',
  },
  // 2025
  {
    authors: 'Ingraham NE, Collins C, Dudley RA, et al.',
    title: 'Provider-Level Variation in Lung-Protective Ventilation Practices in the ICU',
    journal: 'American Journal of Respiratory and Critical Care Medicine',
    year: 2025,
    status: 'In Review',
    abstract: 'Using multi-center CLIF data, this study quantifies the extent to which provider identity explains variation in lung-protective ventilation adherence beyond patient-level factors. We demonstrate substantial provider-level variation that persists after risk adjustment, suggesting targets for provider-focused quality improvement interventions.',
  },
  {
    authors: 'Ingraham NE, Tignanelli CJ, et al.',
    title: 'Ventilation Mode Transitions and Outcomes in Mechanically Ventilated ICU Patients',
    journal: 'JAMIA',
    year: 2025,
    status: 'In Review',
    abstract: 'A multi-center observational study examining how transitions between ventilation modes (volume control, pressure control, pressure support) relate to patient outcomes. Leveraging granular CLIF respiratory data, we characterize ventilation mode "waterfall" patterns and their prognostic significance.',
  },
  {
    authors: 'Mesfin N, Ingraham NE, et al.',
    title: 'Chronic Critical Illness in ARDS: Incidence, Risk Factors, and Outcomes',
    journal: 'CHEST',
    year: 2025,
    status: 'In Review',
    abstract: 'This study characterizes the incidence and risk factors for chronic critical illness (CCI) among patients with acute respiratory distress syndrome (ARDS) using multi-center ICU data. We identify distinct clinical trajectories and modifiable risk factors that may inform early intervention strategies.',
  },
  // 2024
  {
    authors: 'Ingraham NE, Hayek SS, Parker WF, et al.',
    title: 'Common Longitudinal ICU data Format (CLIF) -- A Multicenter ICU Data Standard',
    journal: 'JAMIA Open',
    year: 2024,
    status: 'Published',
    doi: 'https://doi.org/10.1093/jamiaopen/ooae114',
    abstract: 'This paper introduces the Common Longitudinal ICU data Format (CLIF), a standardized data model designed to enable multi-center ICU research using electronic health record data. CLIF defines a common schema for key ICU clinical domains including vitals, labs, respiratory support, medications, and assessments. The consortium includes 13 academic medical centers and has been used to support multiple ongoing research projects.',
  },
  {
    authors: 'Ingraham NE, Lotfi-Emran S, Engstrom A, et al.',
    title: 'Immunomodulation in COVID-19: A Systematic Review and Meta-Analysis',
    journal: 'Lancet Respiratory Medicine',
    year: 2024,
    status: 'Published',
    abstract: 'A comprehensive systematic review and meta-analysis evaluating immunomodulatory therapies in COVID-19 patients. This updated analysis synthesizes evidence across corticosteroids, IL-6 inhibitors, JAK inhibitors, and other immunomodulators, quantifying treatment effects on mortality and other clinical outcomes across disease severity strata.',
  },
  // 2023
  {
    authors: 'Ingraham NE, Jones AE, Shapiro NI, et al.',
    title: 'Definitions of Sepsis: A Systematic Review and Voting Process',
    journal: 'Critical Care Medicine',
    year: 2023,
    status: 'Published',
    abstract: 'A systematic review of sepsis definitions used across the clinical and research landscape, followed by a structured consensus process. This work highlights the heterogeneity of sepsis definitions in practice and proposes a framework for harmonizing clinical and research definitions.',
  },
  // 2022
  {
    authors: 'Ingraham NE, Purcell LN, Karam BS, et al.',
    title: 'Racial/Ethnic Disparities in Hospital Admissions from COVID-19 and the Role of Neighborhood Deprivation and Primary Language',
    journal: 'BMC Public Health',
    year: 2022,
    status: 'Published',
    abstract: 'This study examines racial and ethnic disparities in COVID-19 hospital admissions and their relationship to neighborhood-level social determinants of health. Using geocoded data linked to area deprivation indices, we demonstrate how structural factors including neighborhood deprivation and primary language contribute to observed disparities in COVID-19 outcomes.',
  },
  // 2021
  {
    authors: 'Ingraham NE, Lotfi-Emran S, Thielen BK, et al.',
    title: 'Immunomodulation in COVID-19',
    journal: 'Lancet Respiratory Medicine',
    year: 2021,
    status: 'Published',
    abstract: 'An early systematic review of immunomodulatory approaches to treating COVID-19, synthesizing evidence for corticosteroids, anti-cytokine therapies, convalescent plasma, and other immunologic interventions. This work helped inform clinical practice during the early phases of the pandemic.',
  },
  // 2020
  {
    authors: 'Ingraham NE, Barakat AG, Reilkoff R, et al.',
    title: 'Understanding the Renin-Angiotensin-Aldosterone-SARS-CoV Connection: A Review',
    journal: 'Hypertension',
    year: 2020,
    status: 'Published',
    abstract: 'A mechanistic review of the interplay between SARS-CoV-2 and the renin-angiotensin-aldosterone system (RAAS). This paper examines ACE2 receptor biology, the theoretical implications of RAAS inhibitor use during COVID-19 infection, and the clinical evidence for or against modification of these therapies.',
  },
  {
    authors: 'Ingraham NE, Tignanelli CJ.',
    title: 'Fact vs Science Fiction: Fighting Coronavirus Disease 2019 Requires the Wisdom of Solomon, Not the Sword',
    journal: 'Critical Care Explorations',
    year: 2020,
    status: 'Published',
    abstract: 'An editorial commentary on the challenge of evidence-based decision-making during the early COVID-19 pandemic, emphasizing the need for rigorous clinical trial evidence over untested therapeutic interventions and the importance of clinical equipoise.',
  },
]

function PublicationCard({ pub }: { pub: Publication }) {
  const [expanded, setExpanded] = useState(false)

  // Bold "Ingraham NE" and "Mesfin N" in author string
  const formatAuthors = (authors: string) => {
    const parts = authors.split(/(Ingraham NE|Mesfin N)/g)
    return parts.map((part, i) =>
      part === 'Ingraham NE' || part === 'Mesfin N' ? (
        <strong key={i} style={{ color: 'var(--ink)', fontWeight: 600 }}>
          {part}
        </strong>
      ) : (
        <span key={i}>{part}</span>
      )
    )
  }

  const statusColor = () => {
    switch (pub.status) {
      case 'Published':
        return { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }
      case 'In Review':
        return { bg: 'rgba(245, 158, 11, 0.12)', color: '#d97706' }
      case 'In Preparation':
        return { bg: 'rgba(100, 116, 139, 0.1)', color: 'var(--slate)' }
      default:
        return { bg: 'rgba(201, 168, 76, 0.15)', color: 'var(--gold)' }
    }
  }

  const sc = statusColor()

  return (
    <div
      className="card overflow-hidden cursor-pointer"
      onClick={() => setExpanded(!expanded)}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setExpanded(!expanded)
        }
      }}
    >
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
          {/* Year + Status */}
          <div className="flex sm:flex-col items-center sm:items-start gap-2 sm:w-32 flex-shrink-0">
            <span
              className="text-xs font-medium px-2 py-1 rounded"
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'rgba(201, 168, 76, 0.1)',
                color: 'var(--gold)',
              }}
            >
              {pub.year}
            </span>
            {pub.status && (
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{
                  fontFamily: 'var(--font-mono)',
                  background: sc.bg,
                  color: sc.color,
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                }}
              >
                {pub.status}
              </span>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p
              className="text-xs sm:text-sm mb-1.5"
              style={{ color: 'var(--slate)' }}
            >
              {formatAuthors(pub.authors)}
            </p>
            <h3
              className="text-sm sm:text-base font-semibold leading-tight mb-1.5"
              style={{
                fontFamily: 'var(--font-body)',
                color: 'var(--ink)',
              }}
            >
              {pub.title}
            </h3>
            <p
              className="text-xs"
              style={{
                fontFamily: 'var(--font-body)',
                fontStyle: 'italic',
                color: 'var(--slate)',
              }}
            >
              {pub.journal}
            </p>
          </div>

          {/* Expand chevron */}
          <div className="flex-shrink-0 self-center">
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown
                size={18}
                style={{ color: 'var(--slate)' }}
              />
            </motion.div>
          </div>
        </div>
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div
              className="px-4 sm:px-6 pb-4 sm:pb-6 pt-0"
              style={{
                borderTop: '1px solid rgba(201, 168, 76, 0.15)',
              }}
            >
              <div className="pt-3 sm:pt-4 sm:pl-36">
                {pub.abstract && (
                  <p
                    className="text-sm leading-relaxed mb-3 sm:mb-4"
                    style={{ color: 'var(--slate)' }}
                  >
                    {pub.abstract}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 sm:gap-3">
                  {pub.doi && (
                    <a
                      href={pub.doi}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        background: 'rgba(201, 168, 76, 0.1)',
                        color: 'var(--gold)',
                        border: '1px solid rgba(201, 168, 76, 0.2)',
                        minHeight: '32px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      DOI <ExternalLink size={10} aria-hidden="true" />
                    </a>
                  )}
                  {pub.pubmed && (
                    <a
                      href={pub.pubmed}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        background: 'rgba(201, 168, 76, 0.08)',
                        color: 'var(--gold)',
                        border: '1px solid rgba(201, 168, 76, 0.15)',
                        minHeight: '32px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      PubMed <ExternalLink size={10} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Publications() {
  usePageMeta(
    'Publications | MN-CCORE Lab',
    'Selected publications from MN-CCORE lab members including research on lung-protective ventilation, CLIF data standards, COVID-19 immunomodulation, and critical care outcomes.'
  )
  const pubsRef = useScrollRevealGroup('.fade-in-up', 80)

  // Group by year
  const years = [...new Set(publications.map((p) => p.year))].sort(
    (a, b) => b - a
  )

  return (
    <>
      {/* Header */}
      <section className="pt-12 pb-8 sm:pb-12 lg:pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <h1
          className="text-3xl sm:text-4xl lg:text-5xl mb-3 sm:mb-4"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            color: 'var(--ink)',
          }}
        >
          Publications
        </h1>
        <p
          className="text-base sm:text-lg max-w-2xl"
          style={{ color: 'var(--slate)' }}
        >
          Selected publications from MN-CCORE lab members. Click any paper to
          view its abstract and links.
        </p>
      </section>

      <SectionDivider />

      {/* Publication List */}
      <section
        className="py-8 sm:py-12 lg:py-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto"
        ref={pubsRef}
      >
        {years.map((year) => (
          <div key={year} className="mb-8 sm:mb-12">
            <h2
              className="fade-in-up text-lg sm:text-xl mb-4 sm:mb-6 flex items-center gap-3"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                color: 'var(--ink)',
              }}
            >
              <span>{year}</span>
              <span
                className="flex-1 h-px"
                style={{ background: 'rgba(201, 168, 76, 0.3)' }}
              />
              <span
                className="text-xs font-normal"
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--slate)',
                }}
              >
                {publications.filter((p) => p.year === year).length} paper
                {publications.filter((p) => p.year === year).length !== 1
                  ? 's'
                  : ''}
              </span>
            </h2>
            <div className="space-y-3 sm:space-y-4">
              {publications
                .filter((p) => p.year === year)
                .map((pub) => (
                  <div key={pub.title} className="fade-in-up">
                    <PublicationCard pub={pub} />
                  </div>
                ))}
            </div>
          </div>
        ))}
      </section>
    </>
  )
}
