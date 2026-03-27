import SectionHeader from '../../components/SectionHeader'

export default function Ideas() {
  return (
    <div>
      <SectionHeader title="Ideas Board" subtitle="Capture and organize innovative research ideas" />
      <div className="mt-8 text-center py-16 rounded-xl border border-dashed" style={{ borderColor: 'var(--border-light)', color: 'var(--slate)' }}>
        <p style={{ fontFamily: 'var(--font-sans)' }}>Ideas Board — coming soon</p>
        <p className="text-sm mt-1" style={{ fontFamily: 'var(--font-mono)' }}>Phase E</p>
      </div>
    </div>
  )
}
