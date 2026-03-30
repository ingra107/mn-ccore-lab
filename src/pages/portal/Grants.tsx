import { Wallet } from 'lucide-react'
import SectionHeader from '../../components/SectionHeader'

export default function Grants() {
  return (
    <div>
      <SectionHeader icon={Wallet} title="Grants & Funding" subtitle="Track research grants, timelines, and milestones" />
      <div className="mt-5 text-center py-20">
        <div
          className="mx-auto mb-4"
          style={{ width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(45,138,138,0.08)' }}
        >
          <Wallet size={28} style={{ color: 'var(--teal)', opacity: 0.6 }} />
        </div>
        <p className="text-base font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
          No grants yet
        </p>
        <p className="text-sm mt-1.5 max-w-sm mx-auto" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.7 }}>
          Active and pending grants with timelines, milestones, and budget tracking will appear here.
        </p>
      </div>
    </div>
  )
}
