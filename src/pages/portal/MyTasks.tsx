import SectionHeader from '../../components/SectionHeader'

export default function MyTasks() {
  return (
    <div>
      <SectionHeader title="My Tasks" subtitle="Tasks assigned to you across all projects" />
      <div className="mt-8 text-center py-16 rounded-xl border border-dashed" style={{ borderColor: 'var(--border-light)', color: 'var(--slate)' }}>
        <p style={{ fontFamily: 'var(--font-sans)' }}>Personal task view — coming soon</p>
        <p className="text-sm mt-1" style={{ fontFamily: 'var(--font-mono)' }}>Phase A</p>
      </div>
    </div>
  )
}
