import LabPageLayout, {
  GrantsSection,
  ProjectsSection,
  PublicationsSection,
  MenteesSection,
} from '../components/LabPageLayout'
import SectionDivider from '../components/SectionDivider'
import { usePageMeta } from '../hooks/usePageMeta'
import { usePublications } from '../hooks/useApiData'
import { mentees as allMentees } from '../data/mentees'

const grants = [
  {
    mechanism: 'K23',
    title: 'IHCA Survivability Calculator',
    agency: 'NHLBI',
    proposed: true,
  },
]

const projects = [
  {
    title: 'DNR Order Variation Across Providers',
    status: 'Active' as const,
    description:
      'Multi-center analysis of how individual providers vary in their approach to do-not-resuscitate order timing, documentation, and patient/family communication. Uses CLIF data to quantify provider-level variation in goals-of-care discussions.',
  },
  {
    title: 'CCI in ARDS',
    status: 'In Review' as const,
    description:
      'Characterizing chronic critical illness trajectories in patients with acute respiratory distress syndrome using multi-center CLIF data. Identifies risk factors for prolonged ICU dependence and develops predictive models. Shared project with Nick Ingraham.',
  },
  {
    title: 'In-Hospital Cardiac Arrest Survivability',
    status: 'Active' as const,
    description:
      'Developing a predictive model to estimate survivability following in-hospital cardiac arrest (IHCA). Aims to provide clinicians and families with evidence-based prognostic information to support shared decision-making.',
  },
  {
    title: 'Goals-of-Care Documentation Quality',
    status: 'Active' as const,
    description:
      'Assessing the quality and completeness of goals-of-care documentation in the ICU using NLP-based extraction from clinical notes. Identifies gaps between documented preferences and care delivered.',
  },
]

// Public page: only show trainees with populated names (P2-R2-04).
const mentees = allMentees.filter(
  (m) => (m.mentor === 'nate-mesfin' || m.mentor === 'shared') && m.name && m.name.trim().length > 0
)

export default function NateLab() {
  const { data: publications = [] } = usePublications()
  usePageMeta(
    'Nathan Mesfin Lab | MN-CCORE',
    'Nathan Mesfin, MD — Assistant Professor of Critical Care Medicine at the University of Minnesota. Research in cardiac arrest survivability, DNR order variation, and chronic critical illness.'
  )
  return (
    <LabPageLayout
      name="Nathan Mesfin"
      credentials="MD"
      title="Assistant Professor, Critical Care Medicine"
      role="Co-Director, MN-CCORE"
      initials="NM"
      bio="Critical care physician at the University of Minnesota investigating how provider decision-making shapes outcomes for the most vulnerable ICU patients. His research program centers on three interconnected questions: How do providers vary in their approach to goals-of-care conversations? Can we predict survivability after in-hospital cardiac arrest to inform these conversations? And what defines the trajectory of patients who develop chronic critical illness? He uses multi-center CLIF data and electronic health record analytics to answer these questions at scale."
      links={[
        { label: 'ORCID', href: 'https://orcid.org/0000-0001-8419-0339' },
        { label: 'UMN Bio', href: 'https://med.umn.edu/bio/nathan-mesfin' },
      ]}
      photoUrl="https://med.umn.edu/sites/med.umn.edu/files/styles/bio_photo/public/images/dom-faculty-_0135_layer-164_0.png?itok=YWiCOKFA"
      sections={[
        { id: 'publications', label: 'Publications' },
        { id: 'grants', label: 'Grants & Proposals' },
        { id: 'research-projects', label: 'Research Projects' },
        { id: 'trainees', label: 'MNCCORE Trainees' },
      ]}
    >
      <PublicationsSection
        publications={publications.filter((p) => p.authorSlugs?.includes('nate-mesfin'))}
        id="publications"
      />
      <SectionDivider />
      <div className="py-4" />
      <GrantsSection grants={grants} id="grants" title="Grants & Proposals" />
      <SectionDivider />
      <div className="py-4" />
      <ProjectsSection title="Research Projects" projects={projects} id="research-projects" />
      <SectionDivider />
      <div className="py-4" />
      <MenteesSection mentees={mentees} id="trainees" title="MN-CCORE Trainees" />
    </LabPageLayout>
  )
}
