import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HelpCircle, Plus, MessageSquare, Check, ChevronDown, ChevronUp, Search } from 'lucide-react'
import SmartCompose from '../../components/SmartCompose'
import { motion, AnimatePresence } from 'framer-motion'
import { CardSkeleton, TextSkeleton } from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import PageContainer from '../../components/PageContainer'
import EmptyStateComponent from '../../components/EmptyState'
import EmptyStateArt from '../../components/EmptyStateArt'
import Modal from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import ToggleButton from '../../components/ToggleButton'
import Avatar from '../../components/Avatar'
import InlineSelect from '../../components/InlineSelect'
import { ActivityEntryItem } from '../../components/activity/activityRender'
import type { ActivityEntryItemRow } from '../../components/activity/activityRender'
import { useQuestions, useQuestionDetail, useProjects } from '../../hooks/useApiData'
import { useCreateQuestion, useCreateAnswer, useAcceptAnswer } from '../../hooks/useMutations'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../hooks/useAuth'
import { emailToSlug } from '../../lib/emailSlug'
import { getPersonInfo } from '../../data/team'
import { formatRelativeTime } from '../../lib/dateUtils'
import { isProductionVisible } from '../../lib/isProductionVisible'
import type { QuestionRow } from '../../lib/api'
import { ICON_PROPS } from '../../lib/iconProps'

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: 'var(--gold)', bg: 'var(--gold-active)' },
  resolved: { label: 'Resolved', color: 'var(--teal)', bg: 'var(--teal-active)' },
}

export default function AskTheLab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showCreate, setShowCreate] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Auto-open create modal from URL params. Kept as an effect (not moved to
  // render-time) because it also clears the URL via setSearchParams — a
  // real external-system sync, not a pure local-state adjustment.
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowCreate(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const { data: rawQuestions = [], isLoading } = useQuestions(
    filterStatus ? { status: filterStatus } : undefined
  )

  // Strip QA fixtures (test q, @claude Hi, etc) before anything renders.
  const questions = useMemo(
    () => rawQuestions.filter(q => isProductionVisible(q.question)),
    [rawQuestions]
  )

  const filteredQuestions = useMemo(() => {
    if (!searchQuery.trim()) return questions
    const q = searchQuery.toLowerCase()
    return questions.filter(qn =>
      qn.question.toLowerCase().includes(q) ||
      (qn.context || '').toLowerCase().includes(q) ||
      qn.asked_by.toLowerCase().includes(q)
    )
  }, [questions, searchQuery])

  const openCount = questions.filter((q) => q.status === 'open').length

  return (
    <PageContainer>
      <PageHeader
        icon={<HelpCircle {...ICON_PROPS} size={20} />}
        title="Ask the Lab"
        subtitle={`${openCount} open question${openCount !== 1 ? 's' : ''}`}
        count={openCount}
        actions={
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <Plus {...ICON_PROPS} size={16} />
            New Question
          </Button>
        }
      >
        {/* Filter controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {(['', 'open', 'resolved'] as const).map((s) => {
            const label = s === '' ? 'All' : s === 'open' ? 'Open' : 'Resolved'
            return (
              <ToggleButton
                key={s}
                active={filterStatus === s}
                onClick={() => setFilterStatus(s)}
              >
                {label}
              </ToggleButton>
            )
          })}
          <div className="relative flex-1 max-w-xs">
            <Search {...ICON_PROPS} size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--slate)', opacity: 0.75 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search questions..."
              className="w-full rounded-lg border pl-8 pr-3 py-1.5 text-xs outline-none"
              style={{ color: 'var(--ink)', borderColor: 'var(--border-subtle)', background: 'var(--cream)' }}
            />
          </div>
        </div>
      </PageHeader>

      {/* Question feed */}
      <div className="mt-5 flex flex-col gap-3">
        {isLoading ? (
          <CardSkeleton count={3} />
        ) : filteredQuestions.length === 0 ? (
          <EmptyStateComponent
            icon={<EmptyStateArt variant="decisions" />}
            title={searchQuery ? 'No matching questions' : 'Ask the lab — or @hermes'}
            subtitle={searchQuery ? 'Try different search terms.' : 'Post a research question for teammates, or tag @hermes in the body to get an AI response. Every question becomes a searchable record.'}
            action={!searchQuery ? { label: 'Ask a question', onClick: () => setShowCreate(true) } : undefined}
          />
        ) : (
          filteredQuestions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              expanded={expandedId === q.id}
              onToggle={() => setExpandedId(expandedId === q.id ? null : q.id)}
            />
          ))
        )}
      </div>

      {/* Create modal */}
      <CreateQuestionModal open={showCreate} onClose={() => setShowCreate(false)} />
    </PageContainer>
  )
}

// ── Question Card ───────────────────────────────────────────────

function QuestionCard({
  question,
  expanded,
  onToggle,
}: {
  question: QuestionRow
  expanded: boolean
  onToggle: () => void
}) {
  const person = getPersonInfo(question.asked_by)
  const status = statusConfig[question.status] || statusConfig.open
  const answerCount = question.answer_count ?? 0

  return (
    <div
      className="rounded-xl border overflow-hidden transition-shadow"
      style={{
        borderColor: expanded ? 'var(--teal)' : 'var(--border-subtle)',
        backgroundColor: 'var(--cream)',
        boxShadow: expanded ? '0 0 0 1px var(--teal)' : 'none',
      }}
    >
      {/* Clickable header */}
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-4 flex items-start gap-3 transition-colors hover:bg-black/[0.01] dark:hover:bg-white/[0.01]"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <div className="flex-1 min-w-0">
          {/* Question text */}
          <p
            className="font-semibold leading-snug"
            style={{ color: 'var(--ink)', fontSize: 15 }}
          >
            {question.question}
          </p>

          {/* Context snippet */}
          {question.context && !expanded && (
            <p
              className="mt-1 truncate"
              style={{ fontStyle: 'italic', fontSize: 13, color: 'var(--slate)', opacity: 0.75 }}
            >
              {question.context}
            </p>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div style={{ width: 20, height: 20 }}>
                <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="xs" variant="ice" />
              </div>
              <span className="text-[11px]" style={{ color: 'var(--slate)' }}>
                {person.name}
              </span>
            </div>

            <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
              {formatRelativeTime(question.created_at)}
            </span>

            {question.project_slug && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ color: 'var(--gold-on-emphasis)', backgroundColor: 'var(--gold-emphasis)' }}
              >
                {question.project_slug}
              </span>
            )}
          </div>
        </div>

        {/* Right side: status + answer count + chevron */}
        <div className="flex items-center gap-3 flex-shrink-0 pt-0.5">
          {/* Answer count badge */}
          <div className="flex items-center gap-1" style={{ color: answerCount > 0 ? 'var(--teal)' : 'var(--slate)', opacity: answerCount > 0 ? 1 : 0.85 }}>
            <MessageSquare {...ICON_PROPS} size={14} />
            <span className="text-xs font-medium">
              {answerCount}
            </span>
          </div>

          {/* Status pill */}
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
            style={{ color: status.color, backgroundColor: status.bg }}
          >
            {status.label}
          </span>

          {expanded ? <ChevronUp {...ICON_PROPS} size={16} style={{ color: 'var(--slate)', opacity: 0.75 }} /> : <ChevronDown {...ICON_PROPS} size={16} style={{ color: 'var(--slate)', opacity: 0.75 }} />}
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <QuestionExpanded questionId={question.id} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Expanded Question Detail ────────────────────────────────────

function QuestionExpanded({ questionId }: { questionId: string }) {
  const { data: detail, isLoading } = useQuestionDetail(questionId)
  const { user } = useAuth()
  const { showSuccess } = useToast()
  const userSlug = emailToSlug(user?.email)
  const [answerText, setAnswerText] = useState('')
  const createAnswerMut = useCreateAnswer(questionId)
  const acceptAnswerMut = useAcceptAnswer(questionId)

  const handleSubmitAnswer = (content: string) =>
    new Promise<void>((resolve) => {
      createAnswerMut.mutate(content, {
        onSuccess: () => { showSuccess('Answer posted'); resolve() },
        onError: () => resolve(),
      })
      setAnswerText('')
    })

  if (isLoading || !detail) {
    return (
      <div className="px-5 py-6 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <TextSkeleton lines={2} widths={['75%', '50%']} />
      </div>
    )
  }

  return (
    <div className="px-5 pb-5 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
      {/* Full context */}
      {detail.context && (
        <div className="mt-4 px-3 py-2.5 rounded-lg" style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
          <p className="text-[11px] mb-1" style={{ color: 'var(--muted)', fontWeight: 500 }}>
            Context
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--ink)', fontStyle: 'italic' }}>
            {detail.context}
          </p>
        </div>
      )}

      {/* Answers */}
      {detail.answers.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-[11px]" style={{ color: 'var(--slate)', fontWeight: 500 }}>
            {detail.answers.length} Answer{detail.answers.length !== 1 ? 's' : ''}
          </p>
          {detail.answers.map((answer) => {
            // Adapt AnswerRow → ActivityEntryItemRow for the unified Slack-thread renderer.
            // kind='comment' (gold bar, no badge) — answers are discussion entries.
            // ⚠️ entity_type='question' is NOT a DB activity_entries value — it's an
            // opaque passthrough. ActivityEntryItem must stay free of per-entity-type
            // layout forks beyond 'task' (its only special case today); if one is ever
            // added, this adapter needs an explicit mapping, not silent fallthrough.
            const entryRow: ActivityEntryItemRow = {
              id: answer.id,
              entity_type: 'question',
              entity_id: answer.question_id,
              project_id: null,
              kind: 'comment',
              visibility: 'team',
              actor_slug: answer.author_slug,
              body: answer.content,
              mentions_json: null,
              update_type: null,
              metadata_json: null,
              created_at: answer.created_at,
            }

            return (
              // Accepted-answer wrapper: subtle teal ring on top of the entry card.
              // The entry card itself handles background + left-bar; we add an outer
              // ring only on accepted rows so the card's own styling stays untouched.
              <div
                key={answer.id}
                style={
                  answer.is_accepted
                    ? { borderRadius: 'var(--radius-lg)', outline: '1px solid rgba(45,138,138,0.25)' }
                    : undefined
                }
              >
                <ActivityEntryItem entry={entryRow} />

                {/* Accepted badge + accept action — surface-specific, below the card */}
                {answer.is_accepted === 1 && (
                  <div
                    className="flex items-center gap-1 px-3 pb-1"
                    style={{ fontSize: 'var(--text-caption)' }}
                  >
                    <Check {...ICON_PROPS} size={10} style={{ color: 'var(--teal)' }} aria-hidden="true" />
                    <span style={{ color: 'var(--teal)' }}>Accepted answer</span>
                  </div>
                )}
                {/* Accept button — PI OR the asker can accept (Stack Overflow model). D1 in DECISIONS-RESOLVED. */}
                {!answer.is_accepted && detail.status === 'open' && (user?.isPi || userSlug === detail.asked_by) && (
                  <div className="px-3 pb-1">
                    <button
                      onClick={() => acceptAnswerMut.mutate(answer.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md transition-colors hover:bg-black/5"
                      style={{
                        fontSize: 'var(--text-caption)',
                        color: 'var(--teal)',
                        background: 'none',
                        border: '1px solid rgba(45,138,138,0.2)',
                        cursor: 'pointer',
                      }}
                    >
                      <Check {...ICON_PROPS} size={10} aria-hidden="true" />
                      Accept Answer
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {detail.answers.length === 0 && (
        <p className="mt-4 text-sm" style={{ color: 'var(--slate)', opacity: 0.75, fontStyle: 'italic' }}>
          No answers yet. Be the first to help.
        </p>
      )}

      {/* Answer form — SmartCompose (D14). */}
      {detail.status === 'open' && (
        <div className="mt-4">
          <SmartCompose
            theme="light"
            bare
            value={answerText}
            onChange={setAnswerText}
            onSubmit={handleSubmitAnswer}
            submitting={createAnswerMut.isPending}
            uploadContext={{ type: 'answer', id: questionId, entityType: 'question' }}
            placeholder="Write your answer… (use @hermes for AI)"
            rows={2}
            alwaysShowToolbar
            submitLabel="Reply"
          />
        </div>
      )}
    </div>
  )
}

// ── Create Question Modal ───────────────────────────────────────

function CreateQuestionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [questionText, setQuestionText] = useState('')
  const [context, setContext] = useState('')
  const [projectSlug, setProjectSlug] = useState('')
  const createQuestion = useCreateQuestion()
  const { data: projects = [] } = useProjects()
  const { showSuccess } = useToast()

  const submitQuestion = () => {
    if (!questionText.trim()) return
    createQuestion.mutate({
      question: questionText.trim(),
      context: context.trim() || undefined,
      project_slug: projectSlug || undefined,
    }, {
      onSuccess: () => showSuccess('Question posted'),
    })
    setQuestionText('')
    setContext('')
    setProjectSlug('')
    onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    submitQuestion()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Question"
      maxWidth="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm" style={{ color: 'var(--slate)', cursor: 'pointer', background: 'none', border: '1px solid var(--border-subtle)' }}>
            Cancel
          </button>
          <button
            type="submit"
            form="ask-lab-form"
            disabled={!questionText.trim()}
            aria-describedby={!questionText.trim() ? 'question-submit-hint' : undefined}
            className="px-4 py-2 rounded-md text-sm font-medium"
            style={{
              backgroundColor: !questionText.trim() ? 'var(--border-subtle)' : 'var(--teal)',
              color: !questionText.trim() ? 'var(--slate)' : 'var(--ink-bright, #fff)',
              cursor: !questionText.trim() ? 'not-allowed' : 'pointer',
              border: 'none',
            }}
          >
            Ask the Lab
          </button>
        </>
      }
    >
      <form
        id="ask-lab-form"
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.requestSubmit()
          }
        }}
        className="flex flex-col gap-3.5"
      >
        <div>
          <label htmlFor="question-text" className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>
            Question *
          </label>
          {/* SmartCompose (D14) — @-mention dropdown surfaces @hermes in the
              team list. The modal footer's "Ask the Lab" button drives the
              form (hideSubmitButton); Cmd+Enter submits via the form keydown. */}
          <SmartCompose
            theme="light"
            bare
            value={questionText}
            onChange={setQuestionText}
            onSubmit={async () => submitQuestion()}
            uploadContext={{ type: 'question', id: 'new', entityType: 'question' }}
            placeholder="What do you want to know? (use @hermes for AI)"
            rows={3}
            alwaysShowToolbar
            hideSubmitButton
            hideKbdHint
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>
            Context
          </label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Help others understand your question"
            rows={2}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none resize-none"
            style={{ borderColor: 'var(--border-subtle)' }}
          />
        </div>

        <div>
          <label htmlFor="ask-lab-related-project" className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>
            Related Project
          </label>
          <InlineSelect
            value={projectSlug}
            options={[
              { value: '', label: 'None (general question)' },
              ...projects.map((p) => ({ value: p.slug, label: p.title })),
            ]}
            onChange={setProjectSlug}
            size="md"
            alwaysShowChevron
          />
        </div>

        {!questionText.trim() && (
          <p id="question-submit-hint" className="text-[11px]" style={{ color: 'var(--slate)', opacity: 0.85 }}>
            Question is required.
          </p>
        )}
      </form>
    </Modal>
  )
}
