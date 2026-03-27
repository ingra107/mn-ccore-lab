import SectionHeader from '../../components/SectionHeader'

export default function SearchPage() {
  return (
    <div>
      <SectionHeader title="Academic Search" subtitle="Powered by Perplexity - Academic Sources Only" />
      <div className="mt-6 flex items-center gap-2 max-w-2xl mx-auto">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Ask a research question..."
            className="w-full px-4 py-3 rounded-xl border text-sm"
            style={{
              borderColor: 'var(--border-light)',
              backgroundColor: 'var(--surface)',
              color: 'var(--ink)',
              fontFamily: 'var(--font-sans)',
            }}
            disabled
          />
        </div>
      </div>
      <div className="mt-8 text-center py-12" style={{ color: 'var(--slate)' }}>
        <p style={{ fontFamily: 'var(--font-sans)' }}>AI Search — coming soon</p>
        <p className="text-sm mt-1" style={{ fontFamily: 'var(--font-mono)' }}>Phase G</p>
      </div>
    </div>
  )
}
