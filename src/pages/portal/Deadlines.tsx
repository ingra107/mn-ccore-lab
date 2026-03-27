import SectionHeader from '../../components/SectionHeader'

export default function Deadlines() {
  return (
    <div>
      <SectionHeader title="Deadlines & Milestones" subtitle="Track important dates and time-sensitive deliverables" />
      <div className="mt-4 flex gap-2">
        {['Timeline', 'List'].map((view) => (
          <button
            key={view}
            className="px-3 py-1.5 rounded-md text-sm border transition-colors"
            style={{
              borderColor: view === 'Timeline' ? 'var(--teal)' : 'var(--border-light)',
              backgroundColor: view === 'Timeline' ? 'rgba(45,138,138,0.1)' : 'transparent',
              color: view === 'Timeline' ? 'var(--teal)' : 'var(--slate)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {view}
          </button>
        ))}
      </div>
      <div className="mt-8 text-center py-16 rounded-xl border border-dashed" style={{ borderColor: 'var(--border-light)', color: 'var(--slate)' }}>
        <p style={{ fontFamily: 'var(--font-sans)' }}>Deadlines & Milestones — coming soon</p>
        <p className="text-sm mt-1" style={{ fontFamily: 'var(--font-mono)' }}>Phase C</p>
      </div>
    </div>
  )
}
