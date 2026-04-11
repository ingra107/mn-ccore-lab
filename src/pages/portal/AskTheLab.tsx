import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HelpCircle, Plus, X, MessageSquare, Check, ChevronDown, ChevronUp, Send, Sparkles, Search } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { CardSkeleton } from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import EmptyStateComponent from '../../components/EmptyState'
import ToggleButton from '../../components/ToggleButton'
import Avatar from '../../components/Avatar'
import { useQuestions, useQuestionDetail, useProjects } from '../../hooks/useApiData'
import { useCreateQuestion, useCreateAnswer, useAcceptAnswer } from '../../hooks/useMutations'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../hooks/useAuth'
import { getPersonInfo } from '../../data/team'
import { formatRelativeTime } from '../../lib/dateUtils'
import type { QuestionRow } from '../../lib/api'

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

  // Auto-open create modal from URL params
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setShowCreate(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const { data: questions = [], isLoading } = useQuestions(
    filterStatus ? { status: filterStatus } : undefined
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
    <div>
      <PageHeader
        icon={<HelpCircle size={20} />}
        title="Ask the Lab"
        subtitle={`${openCount} open question${openCount !== 1 ? 's' : ''}`}
        count={openCount}
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: 'var(--teal)', color: 'var(--ink-bright, #fff)', border: 'none', cursor: 'pointer' }}
          >
            <Plus size={16} />
            New Question
          </button>
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
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--slate)', opacity: 0.4 }} />
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
            icon={<HelpCircle size={40} />}
            title={searchQuery ? 'No matching questions' : 'No questions yet'}
            subtitle={searchQuery ? 'Try different search terms.' : 'Be the first to ask. No question is too small.'}
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
    </div>
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
        borderColor: expanded ? 'var(--teal)' : 'var(--border-light)',
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
              style={{ fontStyle: 'italic', fontSize: 13, color: 'var(--slate)', opacity: 0.6 }}
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
                style={{ color: 'var(--gold)', backgroundColor: 'var(--gold-hover)' }}
              >
                {question.project_slug}
              </span>
            )}
          </div>
        </div>

        {/* Right side: status + answer count + chevron */}
        <div className="flex items-center gap-3 flex-shrink-0 pt-0.5">
          {/* Answer count badge */}
          <div className="flex items-center gap-1" style={{ color: answerCount > 0 ? 'var(--teal)' : 'var(--slate)', opacity: answerCount > 0 ? 1 : 0.4 }}>
            <MessageSquare size={14} />
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

          {expanded ? <ChevronUp size={16} style={{ color: 'var(--slate)', opacity: 0.4 }} /> : <ChevronDown size={16} style={{ color: 'var(--slate)', opacity: 0.4 }} />}
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
  const userSlug = user?.email?.split('@')[0]?.toLowerCase()
  const [answerText, setAnswerText] = useState('')
  const createAnswerMut = useCreateAnswer(questionId)
  const acceptAnswerMut = useAcceptAnswer(questionId)

  const handleSubmitAnswer = (e: React.FormEvent) => {
    e.preventDefault()
    if (!answerText.trim()) return
    createAnswerMut.mutate(answerText.trim(), {
      onSuccess: () => showSuccess('Answer posted'),
    })
    setAnswerText('')
  }

  if (isLoading || !detail) {
    return (
      <div className="px-5 py-6 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="animate-pulse flex flex-col gap-3">
          <div className="h-4 rounded w-3/4" style={{ backgroundColor: 'var(--border-subtle)' }} />
          <div className="h-4 rounded w-1/2" style={{ backgroundColor: 'var(--border-subtle)' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="px-5 pb-5 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
      {/* Full context */}
      {detail.context && (
        <div className="mt-4 px-3 py-2.5 rounded-lg" style={{ backgroundColor: 'var(--gold-hover)', border: '1px solid rgba(201,168,76,0.1)' }}>
          <p className="text-[11px] mb-1" style={{ color: 'var(--gold)', fontWeight: 500 }}>
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
            const isAI = answer.author_slug === 'claude-ai'
            const answerPerson = getPersonInfo(answer.author_slug)

            if (isAI) {
              return (
                <div
                  key={answer.id}
                  className="p-3 rounded-lg"
                  style={{
                    background: 'var(--gold-hover)',
                    border: '1px solid rgba(201,168,76,0.15)',
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles size={12} style={{ color: 'var(--gold)' }} />
                    <span style={{ fontSize: '10px', color: 'var(--gold)' }}>
                      Hermes
                    </span>
                    <span className="ml-auto" style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.5 }}>
                      {formatRelativeTime(answer.created_at)}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ink)', margin: 0 }}>
                    {answer.content}
                  </p>
                </div>
              )
            }

            return (
              <div
                key={answer.id}
                className="flex gap-3 p-3 rounded-lg"
                style={{
                  backgroundColor: answer.is_accepted ? 'var(--teal-hover)' : 'rgba(0,0,0,0.015)',
                  border: answer.is_accepted ? '1px solid rgba(45,138,138,0.15)' : '1px solid transparent',
                }}
              >
                <div style={{ width: 24, height: 24, flexShrink: 0, paddingTop: 2 }}>
                  <Avatar name={answerPerson.name} initials={answerPerson.initials} photoUrl={answerPerson.photoUrl} size="tight" variant="gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium" style={{ color: 'var(--ink)' }}>
                      {answerPerson.name}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                      {formatRelativeTime(answer.created_at)}
                    </span>
                    {answer.is_accepted === 1 && (
                      <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: 'var(--teal)', backgroundColor: 'var(--teal-active)' }}>
                        <Check size={10} />
                        Accepted
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ink)' }}>
                    {answer.content}
                  </p>

                  {/* Accept button — only for PI (ningraha) and if not yet accepted */}
                  {!answer.is_accepted && detail.status === 'open' && userSlug === 'ningraha' && (
                    <button
                      onClick={() => acceptAnswerMut.mutate(answer.id)}
                      className="mt-2 flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors hover:bg-black/5"
                      style={{ color: 'var(--teal)', background: 'none', border: '1px solid rgba(45,138,138,0.2)', cursor: 'pointer' }}
                    >
                      <Check size={12} />
                      Accept Answer
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {detail.answers.length === 0 && (
        <p className="mt-4 text-sm" style={{ color: 'var(--slate)', opacity: 0.5, fontStyle: 'italic' }}>
          No answers yet. Be the first to help.
        </p>
      )}

      {/* Answer form */}
      {detail.status === 'open' && (
        <form onSubmit={handleSubmitAnswer} className="mt-4 flex gap-2">
          <textarea
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            placeholder="Write your answer..."
            rows={2}
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none resize-none"
            style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--cream)' }}
          />
          <button
            type="submit"
            disabled={!answerText.trim() || createAnswerMut.isPending}
            className="self-end flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: !answerText.trim() ? 'var(--border-subtle)' : 'var(--teal)',
              color: !answerText.trim() ? 'var(--slate)' : 'var(--ink-bright, #fff)',
              cursor: !answerText.trim() ? 'not-allowed' : 'pointer',
              border: 'none',
            }}
          >
            <Send size={14} />
            Reply
          </button>
        </form>
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
  const modalRef = useRef<HTMLDivElement>(null)

  // Focus trap + Escape
  useEffect(() => {
    if (!open || !modalRef.current) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const focusable = modalRef.current!.querySelectorAll<HTMLElement>('input, select, textarea, button, [tabindex]:not([tabindex="-1"])')
      if (focusable.length === 0) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handler)
    modalRef.current.querySelector<HTMLElement>('textarea')?.focus()
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
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

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(15,25,35,0.5)' }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="New Question"
        className="rounded-xl shadow-xl border w-full max-w-md mx-4"
        style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-subtle)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-lg" style={{ fontWeight: 500, color: 'var(--ink)' }}>
            New Question
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: 'var(--sp-xs)' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3.5">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>
              Question *
            </label>
            <textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="What do you want to know?"
              rows={3}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none resize-none"
              style={{ borderColor: 'var(--border-subtle)' }}
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
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>
              Related Project
            </label>
            <select
              value={projectSlug}
              onChange={(e) => setProjectSlug(e.target.value)}
              className="w-full rounded-md border px-2.5 py-2 text-sm"
              style={{ borderColor: 'var(--border-subtle)', cursor: 'pointer' }}
            >
              <option value="">None (general question)</option>
              {projects.map((p) => (
                <option key={p.slug} value={p.slug}>{p.title}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm" style={{ color: 'var(--slate)', cursor: 'pointer', background: 'none', border: '1px solid var(--border-subtle)' }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={!questionText.trim()}
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
          </div>
        </form>
      </div>
    </div>
  )
}
