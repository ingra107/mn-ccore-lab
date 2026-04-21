import LabPageLayout, {
  GrantsSection,
  ProjectsSection,
  MenteesSection,
  PublicationsSection,
} from '../components/LabPageLayout'
import SectionDivider from '../components/SectionDivider'
import { usePageMeta } from '../hooks/usePageMeta'
import { usePublications } from '../hooks/useApiData'
import { mentees as allMentees } from '../data/mentees'

const grants = [
  {
    mechanism: 'R01',
    title: 'LPV Precision Practice Assistance',
    agency: 'NHLBI',
  },
  {
    mechanism: 'R01',
    title: 'Provider Variation Across CLIF',
    agency: 'NHLBI',
  },
  {
    mechanism: 'R03',
    title: 'Decision-Making Styles of Medical Trainees',
    agency: 'NHLBI',
  },
]

const clifProjects = [
  { title: 'P1: Gender Disparities & Low Tidal Volume', status: 'Active' as const, description: 'Examining whether gender influences the delivery of lung-protective ventilation across CLIF consortium sites.' },
  { title: 'P4: ICU Quality Metrics', status: 'Active' as const, description: 'Developing and validating standardized quality metrics for ICU care using multi-center CLIF data.' },
  { title: 'IV Fluids Shortage', status: 'Active' as const, description: 'Evaluating the impact of the 2024 IV fluid shortage on ICU fluid resuscitation practices and patient outcomes.' },
  { title: 'PF-v-SF Oxygenation Severity', status: 'In Review' as const, description: 'Comparing PaO2/FiO2 and SpO2/FiO2 ratios for classifying oxygenation severity in mechanically ventilated patients.' },
  { title: 'VentMode Waterfall Brief — JAMIA', status: 'In Review' as const, description: 'Characterizing ventilation mode transitions and their association with outcomes in mechanically ventilated ICU patients.' },
  { title: 'Volume vs Pressure Control Mortality', status: 'Active' as const, description: 'Multi-center comparison of volume-controlled vs pressure-controlled ventilation on ICU mortality.' },
  { title: 'Hypothermia Rewarming Rates', status: 'Active' as const },
  { title: 'WBC & Temperature Thresholds for Sepsis', status: 'Active' as const },
  { title: 'Clinical Implications of Sepsis Definitions', status: 'Active' as const },
  { title: 'FLAME', status: 'Active' as const },
  { title: 'Proning Incidence in Severe ARF', status: 'Active' as const, description: 'Quantifying prone positioning utilization rates across CLIF sites in patients with severe acute respiratory failure.' },
]

const labProjects = [
  { title: 'LPV Adherence Paper', status: 'In Review' as const, description: 'Quantifying provider-level variation in lung-protective ventilation adherence using multi-center CLIF data.' },
  { title: 'Decision-Making Survey / GDMS', status: 'Active' as const, description: 'Surveying ICU providers on general decision-making styles and correlating with ventilator management choices.' },
  { title: 'Provider EBP Research Program', status: 'Active' as const, description: 'Building a research program studying how provider characteristics influence evidence-based practice adoption in the ICU.' },
  { title: 'Critical Care Quality Manuscript', status: 'Active' as const },
  { title: 'SGLT2 & Metformin in COPD Readmissions', status: 'Active' as const, description: 'Investigating whether SGLT2 inhibitors and metformin reduce 30-day readmission risk in COPD patients.' },
]

// Mentees: show all (Nick mentors + shared) — but only with populated
// names. Anonymous/stub rows belong on internal Team page, not the
// public-facing list. P2-R2-04.
const mentees = allMentees.filter(
  (m) => (m.mentor === 'nick-ingraham' || m.mentor === 'shared') && m.name && m.name.trim().length > 0
)

export default function NickLab() {
  const { data: publications = [] } = usePublications()
  usePageMeta(
    'Nick Ingraham Lab | MN-CCORE',
    'Nick Ingraham, MD -- Assistant Professor of Pulmonary & Critical Care Medicine at the University of Minnesota. Research in provider variation, lung-protective ventilation, and CLIF Consortium data science.'
  )
  return (
    <LabPageLayout
      name="Nick Ingraham"
      credentials="MD"
      title="Assistant Professor, Pulmonary & Critical Care Medicine"
      role="Co-Director, MN-CCORE"
      initials="NI"
      bio="Physician-scientist at the University of Minnesota studying how provider-level variation in clinical practice impacts ICU outcomes. Founding member of the CLIF Consortium. Research interests include lung-protective ventilation adherence, clinical decision-making styles, and multi-center ICU data science. Over 2,600 citations (h-index 24)."
      links={[
        { label: 'Scholar', href: 'https://scholar.google.com/citations?user=ZKMVVHkAAAAJ&hl=en' },
        { label: 'ORCID', href: 'https://orcid.org/0000-0002-0292-0594' },
        { label: 'GitHub', href: 'https://github.com/ingra107' },
      ]}
      photoUrl="https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/web_profiles/2023-06/Nick%20Picture_2022.jpg?itok=VEDKgpUN"
      sections={[
        { id: 'grants', label: 'Active Funding' },
        { id: 'lab-projects', label: 'Lab Projects' },
        { id: 'clif-projects', label: 'CLIF Projects' },
        { id: 'mentees', label: 'Trainees' },
        { id: 'publications', label: 'Publications' },
      ]}
    >
      <GrantsSection grants={grants} id="grants" title="Active Funding" />
      <SectionDivider />
      <div className="py-4" />
      <ProjectsSection title="Lab Projects" projects={labProjects} id="lab-projects" />
      <SectionDivider />
      <div className="py-4" />
      <ProjectsSection title="CLIF Projects" projects={clifProjects} id="clif-projects" />
      <SectionDivider />
      <div className="py-4" />
      <MenteesSection mentees={mentees} id="mentees" title="Trainees & Mentees" />
      <SectionDivider />
      <div className="py-4" />
      <PublicationsSection
        publications={publications.filter((p) => p.authorSlugs?.includes('nick-ingraham'))}
        id="publications"
      />
    </LabPageLayout>
  )
}
