import LabPageLayout, {
  GrantsSection,
  ProjectsSection,
} from '../components/LabPageLayout'
import SectionDivider from '../components/SectionDivider'
import { usePageMeta } from '../hooks/usePageMeta'

const grants = [
  {
    mechanism: 'K23',
    title: 'IHCA Survivability Calculator',
    agency: 'NHLBI',
    proposed: true,
  },
]

const projects = [
  { title: 'DNR Provider Variation', status: 'Active' as const },
  { title: 'CCI in ARDS', status: 'Active' as const, description: 'Characterizing chronic critical illness trajectories in patients with acute respiratory distress syndrome. Shared project with Nick Ingraham.' },
]

export default function NateLab() {
  usePageMeta(
    'Nathan Mesfin Lab | MN-CCORE',
    'Nathan Mesfin, MD -- Assistant Professor of Critical Care Medicine at the University of Minnesota. Research in cardiac arrest survivability, DNR order variation, and chronic critical illness.'
  )
  return (
    <LabPageLayout
      name="Nathan Mesfin"
      credentials="MD"
      title="Assistant Professor, Critical Care Medicine"
      role="Co-Director, MN-CCORE"
      initials="NM"
      bio="Critical care physician at the University of Minnesota focused on improving outcomes for critically ill patients through predictive modeling and understanding provider decision-making around goals of care. Research interests include in-hospital cardiac arrest survivability, DNR order variation, and chronic critical illness."
      links={[
        { label: 'ORCID', href: 'https://orcid.org/0000-0001-8419-0339' },
        { label: 'UMN Bio', href: 'https://med.umn.edu/bio/nathan-mesfin' },
      ]}
      sections={[
        { id: 'grants', label: 'Grants & Proposals' },
        { id: 'research-projects', label: 'Research Projects' },
      ]}
    >
      <GrantsSection grants={grants} id="grants" title="Grants & Proposals" />
      <SectionDivider />
      <div className="py-4" />
      <ProjectsSection title="Research Projects" projects={projects} id="research-projects" />
    </LabPageLayout>
  )
}
