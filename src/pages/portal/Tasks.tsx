import SectionHeader from '../../components/SectionHeader'

export default function Tasks() {
  return (
    <div>
      <SectionHeader title="All Tasks" subtitle="Manage lab tasks across all projects" />
      <div className="mt-4 flex gap-2 flex-wrap">
        {['List', 'Board', 'Stand Up', 'Timeline'].map((view) => (
          <button
            key={view}
            className="px-3 py-1.5 rounded-md text-sm border transition-colors"
            style={{
              borderColor: view === 'List' ? 'var(--teal)' : 'var(--border-light)',
              backgroundColor: view === 'List' ? 'rgba(45,138,138,0.1)' : 'transparent',
              color: view === 'List' ? 'var(--teal)' : 'var(--slate)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {view}
          </button>
        ))}
      </div>
      <div className="mt-8 text-center py-16 rounded-xl border border-dashed" style={{ borderColor: 'var(--border-light)', color: 'var(--slate)' }}>
        <p style={{ fontFamily: 'var(--font-sans)' }}>Task System — coming soon</p>
        <p className="text-sm mt-1" style={{ fontFamily: 'var(--font-mono)' }}>Phase A</p>
      </div>
    </div>
  )
}
