import { Mail } from 'lucide-react'
import { useEmailDraftsPending } from '../../hooks/useApiData'
import BentoCard from './BentoCard'

interface EmailDraft {
  id: string
  task_title: string
  gmail_link: string | null
  created_at: string
}

export default function EmailDraftsCard() {
  const { data, isLoading } = useEmailDraftsPending()

  const drafts: EmailDraft[] = (data as EmailDraft[] | undefined) ?? []
  const count = drafts.length

  return (
    <BentoCard title="Email Drafts" icon={Mail} subtitle={isLoading ? undefined : `${count} pending`}>
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
          {drafts.slice(0, 3).map((draft) => (
            <div
              key={draft.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
            >
              <Mail size={11} style={{ color: 'var(--gold)', flexShrink: 0, opacity: 0.85 }} />
              {draft.gmail_link ? (
                <a
                  href={draft.gmail_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] truncate flex-1"
                  style={{ color: 'var(--ink)', textDecoration: 'none' }}
                >
                  {draft.task_title || 'Untitled draft'}
                </a>
              ) : (
                <span className="text-[11px] truncate flex-1" style={{ color: 'var(--ink)' }}>
                  {draft.task_title || 'Untitled draft'}
                </span>
              )}
            </div>
          ))}

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
