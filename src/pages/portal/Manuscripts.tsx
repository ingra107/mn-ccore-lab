import SectionHeader from '../../components/SectionHeader'

export default function Manuscripts() {
  return (
    <div>
      <SectionHeader title="Manuscripts & Publications" subtitle="Track manuscripts from writing to publication" />
      <div className="mt-8 text-center py-16 rounded-xl border border-dashed" style={{ borderColor: 'var(--border-light)', color: 'var(--slate)' }}>
        <p style={{ fontFamily: 'var(--font-sans)' }}>Manuscript Pipeline — coming soon</p>
        <p className="text-sm mt-1" style={{ fontFamily: 'var(--font-mono)' }}>Phase D</p>
      </div>
    </div>
  )
}
