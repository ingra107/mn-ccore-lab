import { SquarePen } from 'lucide-react'
import { useEmailDraftsPending } from '../../hooks/useApiData'
import BentoCard from './BentoCard'
import { ICON_PROPS } from '../../lib/iconProps'

interface EmailDraft {
  id: string
  // Joined from the tasks table (#84). task_id-only rows fall back to "Untitled".
  task_title?: string | null
  task_short_title?: string | null
  // PI / API-key only — team callers never receive this (private gmail link).
  gmail_draft_url?: string | null
  created_at: string
}

export default function EmailDraftsCard() {
  const { data, isLoading } = useEmailDraftsPending()

  const drafts: EmailDraft[] = (data as EmailDraft[] | undefined) ?? []
  const count = drafts.length

  return (
    <BentoCard title="Email Drafts" icon={SquarePen} subtitle={isLoading ? undefined : `${count} pending`}>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-3 rounded" style={{ background: 'var(--border-subtle)', width: `${60 + i * 10}%` }} />
          ))}
        </div>
      ) : count === 0 ? (
        <div className="flex items-center justify-center h-full">
          <span className="text-[12px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
            All sent -- inbox zero
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Large count */}
          <div
            style={{
              fontSize: '28px',
              fontWeight: 600,
              color: count > 0 ? 'var(--gold)' : 'var(--ink)',
              lineHeight: 1,
              marginBottom: '4px',
            }}
          >
            {count}
          </div>

          {/* List up to 3 drafts */}
          {drafts.slice(0, 3).map((draft) => {
            const label = draft.task_short_title || draft.task_title || 'Untitled draft'
            return (
              <div
                key={draft.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
              >
                <SquarePen {...ICON_PROPS} size={11} style={{ color: 'var(--gold)', flexShrink: 0, opacity: 0.85 }} />
                {draft.gmail_draft_url ? (
                  <a
                    href={draft.gmail_draft_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] truncate flex-1"
                    style={{ color: 'var(--ink)', textDecoration: 'none' }}
                  >
                    {label}
                  </a>
                ) : (
                  <span className="text-[11px] truncate flex-1" style={{ color: 'var(--ink)' }}>
                    {label}
                  </span>
                )}
              </div>
            )
          })}

          {count > 3 && (
            <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
              +{count - 3} more
            </span>
          )}
        </div>
      )}
    </BentoCard>
  )
}
