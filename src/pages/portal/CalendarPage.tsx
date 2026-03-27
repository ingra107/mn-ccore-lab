import SectionHeader from '../../components/SectionHeader'

export default function CalendarPage() {
  return (
    <div>
      <SectionHeader title="Calendar" subtitle="Lab-wide events, deadlines, and meetings" />
      <div className="mt-8 text-center py-16 rounded-xl border border-dashed" style={{ borderColor: 'var(--border-light)', color: 'var(--slate)' }}>
        <p style={{ fontFamily: 'var(--font-sans)' }}>Lab Calendar — coming soon</p>
        <p className="text-sm mt-1" style={{ fontFamily: 'var(--font-mono)' }}>Phase F</p>
      </div>
    </div>
  )
}
