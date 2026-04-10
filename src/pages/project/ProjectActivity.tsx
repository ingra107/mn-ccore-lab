import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Circle } from 'lucide-react'
import { useActionItems } from '../../hooks/useApiData'
import { useToggleActionItem } from '../../hooks/useMutations'
import { useUndoToast } from '../../components/UndoToast'
import { getPersonInfo } from '../../data/team'
import { formatMediumDate } from '../../lib/dateUtils'
import type { ActionItem } from '../../data/types'
import ProjectDecisions from './ProjectDecisions'
import ProjectDependencies from './ProjectDependencies'
import ProjectUpdateFeed from '../../components/ProjectUpdateFeed'
import ProjectComments from '../../components/ProjectComments'
import type { Project } from '../../data/types'

interface ProjectActivityProps {
  project: Project
  isPi: boolean
}

export default function ProjectActivity({ project, isPi }: ProjectActivityProps) {
  const { data: actionItemRows = [] } = useActionItems()
  const toggleAction = useToggleActionItem()
  const { showUndo } = useUndoToast()

  const relatedActions = useMemo(() => {
    const items = actionItemRows
      .filter((ai) => ai.project_id === project.slug || ai.project_id === project.title)
      .map((ai) => ({
        meetingId: ai.meeting_id || '',
        meetingTitle: ai.meeting_title || '',
        meetingDate: ai.meeting_date || ai.created_at?.split('T')[0] || '',
        action: {
          id: ai.id,
          description: ai.description,
          assignee: ai.assignee,
          dueDate: ai.due_date || undefined,
          completed: ai.completed === 1,
          projectSlug: ai.project_id || undefined,
        } as ActionItem,
      }))
    items.sort((a, b) => {
      if (a.action.completed !== b.action.completed) return a.action.completed ? 1 : -1
      return b.meetingDate.localeCompare(a.meetingDate)
    })
    return items
  }, [actionItemRows, project.slug, project.title])

  return (
    <>
      {/* Decisions */}
      <ProjectDecisions projectSlug={project.slug} />

      {/* Dependencies */}
      <ProjectDependencies project={project} isPi={isPi} />

      {/* Project Updates */}
      <div id="updates" style={{ scrollMarginTop: '60px' }}>
        <ProjectUpdateFeed projectSlug={project.slug} />
      </div>

      {/* Comments */}
      <div id="comments" style={{ scrollMarginTop: '60px' }}>
        <ProjectComments projectSlug={project.slug} />
      </div>

      {/* Action Items from meetings */}
      <motion.div
        id="action-items"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.25 }}
        style={{ marginBottom: '2.5rem', scrollMarginTop: '60px' }}
      >
        <h2
          style={{
            fontWeight: 'var(--label-weight)',
            fontSize: '16px',
            color: 'var(--ink)',
            margin: '0 0 12px 0',
          }}
        >
          Action Items
        </h2>

        <div
          style={{
            background: 'var(--ice)',
            borderRadius: 'var(--radius-xl)',
            padding: '16px 20px',
          }}
          className="detail-card"
        >
          {relatedActions.length > 0 ? (
            <div className="flex flex-col gap-2">
              {relatedActions.map((item) => (
                <motion.div
                  key={item.action.id || `${item.meetingId}-${item.action.description}`}
                  layout
                  className="flex items-start gap-3"
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(201, 168, 76, 0.08)',
                  }}
                >
                  <motion.button
                    type="button"
                    onClick={() => {
                      if (!item.action.id) return
                      toggleAction.mutate(item.action.id)
                      showUndo('Action item toggled', () => toggleAction.mutate(item.action.id!))
                    }}
                    className="cursor-pointer flex-shrink-0 mt-0.5"
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: item.action.completed ? 'var(--teal)' : 'var(--slate)',
                      opacity: item.action.completed ? 1 : 0.5,
                    }}
                    whileTap={{ scale: 0.85 }}
                  >
                    {item.action.completed ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <Circle size={18} />
                    )}
                  </motion.button>
                  <div style={{ flex: 1 }}>
                    <p
                      style={{
                        fontSize: 'var(--value-size)',
                        color: 'var(--ink)',
                        margin: 0,
                        lineHeight: 1.4,
                        textDecoration: item.action.completed ? 'line-through' : 'none',
                        opacity: item.action.completed ? 0.5 : 1,
                      }}
                    >
                      {item.action.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-1">
                      <span
                        style={{
                          fontSize: '10px',
                          color: 'var(--slate)',
                          opacity: 'var(--ink-label)',
                        }}
                      >
                        {getPersonInfo(item.action.assignee).name}
                      </span>
                      {item.action.dueDate && (
                        <span
                          style={{
                            fontSize: '10px',
                            color: 'var(--slate)',
                            opacity: 'var(--ink-label)',
                          }}
                        >
                          Due {formatMediumDate(item.action.dueDate)}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: '10px',
                          color: 'var(--slate)',
                          opacity: 0.35,
                        }}
                      >
                        from {formatMediumDate(item.meetingDate)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p
              style={{
                fontSize: '12px',
                color: 'var(--slate)',
                opacity: 'var(--ink-hint)',
                textAlign: 'center',
                padding: '16px 0',
                margin: 0,
              }}
            >
              No action items linked to this project
            </p>
          )}
        </div>
      </motion.div>
    </>
  )
}
