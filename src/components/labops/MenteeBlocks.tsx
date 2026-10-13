import { TrendingUp } from 'lucide-react'
import ChartCard from '../ui/ChartCard'
import { FaceDisc } from '../today/skin'
import { getPersonInfo } from '../../data/team'
import { ICON_PROPS } from '../../lib/iconProps'
import type { PIDashboardData } from '../../hooks/usePIDashboard'

/** Each trainee's paper count and yearly rate (PI only). The footer carries the total the old "Trainee pubs" stat showed. */
export function TraineeVelocityBlock({ data }: { data?: PIDashboardData }) {
  const list = data?.menteeVelocity ?? []
  const total = list.reduce((s, m) => s + m.pub_count, 0)
  return (
    <ChartCard title="Trainee publication velocity" count="PI only">
      {list.length > 0 ? (
        <>
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left text-[11px] font-medium pb-2" style={{ color: 'var(--sk-t3)' }}>Trainee</th>
                <th className="text-right text-[11px] font-medium pb-2" style={{ color: 'var(--sk-t3)' }}>Papers</th>
                <th className="text-right text-[11px] font-medium pb-2" style={{ color: 'var(--sk-t3)' }}>Rate</th>
                <th className="text-right text-[11px] font-medium pb-2" style={{ color: 'var(--sk-t3)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((mentee) => {
                const person = getPersonInfo(mentee.slug)
                return (
                  <tr key={mentee.slug} style={{ borderTop: '1px solid var(--sk-line)' }}>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div style={{ width: 20, height: 20, flexShrink: 0 }}>
                          <FaceDisc label={person.name} initials={person.initials} photo={person.photoUrl} px={20} variant="brand" decorative />
                        </div>
                        <span className="text-sm" style={{ color: 'var(--ink)' }}>{mentee.name}</span>
                      </div>
                    </td>
                    <td className="text-right text-sm font-semibold" style={{ color: 'var(--ink)' }}>{mentee.pub_count}</td>
                    <td className="text-right text-sm" style={{ color: 'var(--sk-t1)' }}>{mentee.rate > 0 ? `${mentee.rate}/yr` : '--'}</td>
                    <td className="text-right">
                      {mentee.pub_count > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--sk-t2)', backgroundColor: 'var(--sk-line)' }}>
                          <TrendingUp {...ICON_PROPS} size={10} />
                          Publishing
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--slate)', backgroundColor: 'var(--border-subtle)' }}>Pre-pub</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-[11px] mt-3" style={{ color: 'var(--muted)' }}>
            {total} paper{total === 1 ? '' : 's'} across {list.length} trainee{list.length === 1 ? '' : 's'}
          </p>
        </>
      ) : (
        <p className="text-center py-6 text-sm" style={{ color: 'var(--muted)' }}>No trainees/fellows in the system</p>
      )}
    </ChartCard>
  )
}
