import SectionHeader from '../../components/SectionHeader'

export default function Grants() {
  return (
    <div>
      <SectionHeader title="Grants & Funding" subtitle="Track research grants, timelines, and milestones" />
      <div className="mt-8 text-center py-16 rounded-xl border border-dashed" style={{ borderColor: 'var(--border-light)', color: 'var(--slate)' }}>
        <p style={{ fontFamily: 'var(--font-sans)' }}>Grant Portfolio — will migrate Gantt chart from Dashboard card</p>
        <p className="text-sm mt-1" style={{ fontFamily: 'var(--font-mono)' }}>Phase B (PI dashboard)</p>
      </div>
    </div>
  )
}
