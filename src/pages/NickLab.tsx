import LabPageLayout, {
  GrantsSection,
  ProjectsSection,
  MenteesSection,
} from '../components/LabPageLayout'
import SectionDivider from '../components/SectionDivider'
import { usePageMeta } from '../hooks/usePageMeta'

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
  { title: 'P1: Gender Disparities & Low Tidal Volume', status: 'Active' as const },
  { title: 'P4: ICU Quality Metrics', status: 'Active' as const },
  { title: 'IV Fluids Shortage', status: 'Active' as const },
  { title: 'PF-v-SF Oxygenation Severity', status: 'In Review' as const },
  { title: 'VentMode Waterfall Brief — JAMIA', status: 'In Review' as const },
  { title: 'Volume vs Pressure Control Mortality', status: 'Active' as const },
  { title: 'Hypothermia Rewarming Rates', status: 'Active' as const },
  { title: 'WBC & Temperature Thresholds for Sepsis', status: 'Active' as const },
  { title: 'Clinical Implications of Sepsis Definitions', status: 'Active' as const },
  { title: 'FLAME', status: 'Active' as const },
  { title: 'Proning Incidence in Severe ARF', status: 'Active' as const },
]

const labProjects = [
  { title: 'LPV Adherence Paper', status: 'In Review' as const },
  { title: 'Decision-Making Survey / GDMS', status: 'Active' as const },
  { title: 'Provider EBP Research Program', status: 'Active' as const },
  { title: 'Critical Care Quality Manuscript', status: 'Active' as const },
  { title: 'SGLT2 & Metformin in COPD Readmissions', status: 'Active' as const },
]

const mentees = [
  { name: 'Nathan Mesfin', project: 'CCI in ARDS' },
  { name: 'Emma Bromley', project: 'GDMS x LPV Hebbel Abstract' },
  { name: 'Steven Arriaza', project: 'Hospital Transfer Qualitative' },
  { name: 'Kendall McEachron', project: 'EGS Database' },
  { name: 'Sami Safadi', project: 'Severe Hyponatremia' },
]

export default function NickLab() {
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
      bio="Physician-scientist at the University of Minnesota studying how provider-level variation in clinical practice impacts ICU outcomes. Founding member of the CLIF Consortium. Research interests include lung-protective ventilation adherence, clinical decision-making styles, and multi-center ICU data science."
      links={[
        { label: 'Scholar', href: 'https://scholar.google.com/' },
        { label: 'ORCID', href: 'https://orcid.org/' },
        { label: 'GitHub', href: 'https://github.com/' },
      ]}
    >
      <GrantsSection grants={grants} />
      <SectionDivider />
      <div className="py-4" />
      <ProjectsSection title="CLIF Projects" projects={clifProjects} />
      <SectionDivider />
      <div className="py-4" />
      <ProjectsSection title="Lab Projects" projects={labProjects} />
      <SectionDivider />
      <div className="py-4" />
      <MenteesSection mentees={mentees} />
    </LabPageLayout>
  )
}
