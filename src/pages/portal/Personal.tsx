import SectionHeader from '../../components/SectionHeader'

export default function Personal() {
  return (
    <div>
      <SectionHeader title="My Hub" subtitle="Your personal command center across all projects" />
      <div className="mt-8 text-center py-16 rounded-xl border border-dashed" style={{ borderColor: 'var(--border-light)', color: 'var(--slate)' }}>
        <p style={{ fontFamily: 'var(--font-sans)' }}>Personal Command Center — coming soon</p>
        <p className="text-sm mt-1" style={{ fontFamily: 'var(--font-mono)' }}>Phase B</p>
      </div>
    </div>
  )
}
