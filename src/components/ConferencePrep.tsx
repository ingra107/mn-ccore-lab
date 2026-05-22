import { useState } from 'react'
import { Presentation, Plus, Trash2, Plane, Check } from 'lucide-react'
import CollapsibleSection from './CollapsibleSection'
import EmptyState from './EmptyState'
import InlineSelect from './InlineSelect'
import { useUndoToast } from './UndoToast'
import { useConferences } from '../hooks/useApiData'
import { useCreateConference, useUpdateConference, useDeleteConference } from '../hooks/useMutations'
import { formatShortDate, localDateKey } from '../lib/dateUtils'
import type { ConferenceSubmissionRow, ConferenceSubmissionType, ConferenceStatus, MaterialsStatus } from '../lib/api'

const STATUS_OPTIONS: { value: ConferenceStatus; label: string; color: string }[] = [
  { value: 'planning', label: 'Planning', color: 'var(--slate)' },
  { value: 'submitted', label: 'Submitted', color: 'var(--gold)' },
  { value: 'accepted', label: 'Accepted', color: 'var(--teal)' },
  { value: 'preparing', label: 'Preparing', color: 'var(--blue, #5b9bd5)' },
  { value: 'presented', label: 'Presented', color: 'var(--green)' },
  { value: 'rejected', label: 'Rejected', color: 'var(--maroon)' },
]

const MATERIALS_OPTIONS: { value: MaterialsStatus; label: string; color: string }[] = [
  { value: 'not_started', label: 'Not Started', color: 'var(--slate)' },
  { value: 'drafting', label: 'Drafting', color: 'var(--gold)' },
  { value: 'review', label: 'In Review', color: 'var(--teal)' },
  { value: 'final', label: 'Final', color: 'var(--green)' },
]

const TYPE_OPTIONS: { value: ConferenceSubmissionType; label: string }[] = [
  { value: 'abstract', label: 'Abstract' },
  { value: 'oral', label: 'Oral' },
  { value: 'poster', label: 'Poster' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'invited', label: 'Invited' },
]

// Status pill colors: use getStatusBg / getStatusColor from '../lib/statusColors' when needed.

interface ConferencePrepProps {
  projectId: string
}

export default function ConferencePrep({ projectId }: ConferencePrepProps) {
  const { data: conferences = [], isLoading } = useConferences(projectId)
  const createMutation = useCreateConference(projectId)
  const updateMutation = useUpdateConference(projectId)
  const deleteMutation = useDeleteConference(projectId)
  const { showUndo } = useUndoToast()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    conference: '',
    title: '',
    submission_type: 'abstract' as ConferenceSubmissionType,
    abstract_due: '',
    conference_date: '',
    notes: '',
  })

  const activeConfs = conferences.filter((c) => c.status !== 'rejected')

  const handleStatusChange = (conf: ConferenceSubmissionRow, newStatus: ConferenceStatus) => {
    const prev = conf.status
    const updates: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'submitted' && !conf.abstract_submitted_at) {
      updates.abstract_submitted_at = localDateKey()
    }
    if (newStatus === 'accepted' && !conf.accepted_at) {
      updates.accepted_at = localDateKey()
    }
    updateMutation.mutate({ id: conf.id, fields: updates as any })
    showUndo(`Status -> ${newStatus}`, () => updateMutation.mutate({ id: conf.id, fields: { status: prev as ConferenceStatus } }))
  }

  const handleMaterialsChange = (conf: ConferenceSubmissionRow, newMaterials: MaterialsStatus) => {
    const prev = conf.materials_status
    updateMutation.mutate({ id: conf.id, fields: { materials_status: newMaterials } })
    showUndo(`Materials -> ${newMaterials}`, () => updateMutation.mutate({ id: conf.id, fields: { materials_status: prev as MaterialsStatus } }))
  }

  const handleTravelToggle = (conf: ConferenceSubmissionRow) => {
    const newVal = conf.travel_booked ? 0 : 1
    updateMutation.mutate({ id: conf.id, fields: { travel_booked: newVal } })
    showUndo(newVal ? 'Travel booked' : 'Travel unbooked', () =>
      updateMutation.mutate({ id: conf.id, fields: { travel_booked: conf.travel_booked } })
    )
  }

  const handleDelete = (conf: ConferenceSubmissionRow) => {
    deleteMutation.mutate(conf.id)
    showUndo(`Deleted "${conf.conference}"`, () =>
      createMutation.mutate({
        project_id: projectId,
        conference: conf.conference,
        title: conf.title,
        submission_type: conf.submission_type,
        abstract_due: conf.abstract_due || undefined,
        conference_date: conf.conference_date || undefined,
        status: conf.status,
        notes: conf.notes || undefined,
      })
    )
  }

  const handleAdd = () => {
    if (!form.conference.trim() || !form.title.trim()) return
    createMutation.mutate({
      project_id: projectId,
      conference: form.conference.trim(),
      title: form.title.trim(),
      submission_type: form.submission_type,
      abstract_due: form.abstract_due || undefined,
      conference_date: form.conference_date || undefined,
      notes: form.notes.trim() || undefined,
    })
    setForm({ conference: '', title: '', submission_type: 'abstract', abstract_due: '', conference_date: '', notes: '' })
    setShowForm(false)
  }

  if (isLoading) return null

  return (
    <CollapsibleSection
      title="Conferences"
      icon={<Presentation size={12} style={{ color: 'var(--teal)', opacity: 0.85 }} />}
      badge={activeConfs.length || null}
      storageKey={`conf-${projectId}`}
    >
      {activeConfs.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '12px',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                {['Conference', 'Type', 'Abstract Due', 'Status', 'Materials', 'Travel', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '6px 8px',
                      fontSize: '10px',
                      fontWeight: 500,
                      color: 'var(--slate)',
                      opacity: 0.75,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeConfs.map((conf) => (
                <tr
                  key={conf.id}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  {/* Conference name + title */}
                  <td style={{ padding: 'var(--sp-sm)', maxWidth: '200px' }}>
                    <div style={{ fontWeight: 500, color: 'var(--ink)', lineHeight: 1.3 }}>
                      {conf.conference}
                    </div>
                    <div
                      style={{
                        fontSize: 'var(--label-size)',
                        color: 'var(--slate)',
                        opacity: 'var(--ink-label)',
                        lineHeight: 1.3,
                        marginTop: '2px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '180px',
                      }}
                      title={conf.title}
                    >
                      {conf.title}
                    </div>
                    {conf.conference_date && (
                      <div style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-label)', marginTop: '1px' }}>
                        {formatShortDate(conf.conference_date)}
                      </div>
                    )}
                  </td>

                  {/* Type */}
                  <td style={{ padding: 'var(--sp-sm)' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--ink)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {conf.submission_type}
                    </span>
                  </td>

                  {/* Abstract due */}
                  <td style={{ padding: 'var(--sp-sm)', whiteSpace: 'nowrap' }}>
                    {conf.abstract_due ? (
                      <span
                        style={{
                          fontSize: 'var(--label-size)',
                          color: new Date(conf.abstract_due + 'T23:59:59') < new Date() && conf.status === 'planning'
                            ? 'var(--maroon)'
                            : 'var(--ink)',
                          fontWeight: new Date(conf.abstract_due + 'T23:59:59') < new Date() && conf.status === 'planning' ? 600 : 400,
                        }}
                      >
                        {formatShortDate(conf.abstract_due)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>--</span>
                    )}
                  </td>

                  {/* Status */}
                  <td style={{ padding: 'var(--sp-sm)' }}>
                    <InlineSelect
                      value={conf.status}
                      options={STATUS_OPTIONS}
                      onChange={(v) => handleStatusChange(conf, v as ConferenceStatus)}
                    />
                  </td>

                  {/* Materials */}
                  <td style={{ padding: 'var(--sp-sm)' }}>
                    {['accepted', 'preparing', 'presented'].includes(conf.status) ? (
                      <InlineSelect
                        value={conf.materials_status}
                        options={MATERIALS_OPTIONS}
                        onChange={(v) => handleMaterialsChange(conf, v as MaterialsStatus)}
                      />
                    ) : (
                      <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>--</span>
                    )}
                  </td>

                  {/* Travel */}
                  <td style={{ padding: 'var(--sp-sm)', textAlign: 'center' }}>
                    <button
                      onClick={() => handleTravelToggle(conf)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}
                      title={conf.travel_booked ? 'Travel booked' : 'Travel not booked'}
                    >
                      <Plane
                        size={13}
                        style={{
                          color: conf.travel_booked ? 'var(--teal)' : 'var(--slate)',
                          opacity: conf.travel_booked ? 1 : 0.85,
                        }}
                      />
                      {conf.travel_booked ? (
                        <Check size={10} style={{ color: 'var(--teal)' }} />
                      ) : null}
                    </button>
                  </td>

                  {/* Delete */}
                  <td style={{ padding: 'var(--sp-sm)' }}>
                    <button
                      onClick={() => handleDelete(conf)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--slate)',
                        opacity: 0.75,
                        padding: '2px',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--maroon)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.color = 'var(--slate)' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add form */}
      {showForm ? (
        <div
          style={{
            marginTop: activeConfs.length > 0 ? '12px' : '0',
            padding: 'var(--sp-md)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--teal-hover)',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <input
              placeholder="Conference name"
              value={form.conference}
              onChange={(e) => setForm({ ...form, conference: e.target.value })}
              autoFocus
              style={{
                fontSize: '12px',
                padding: '6px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--cream)',
                color: 'var(--ink)',
                outline: 'none',
              }}
            />
            <input
              placeholder="Submission title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              style={{
                fontSize: '12px',
                padding: '6px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--cream)',
                color: 'var(--ink)',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <InlineSelect
              value={form.submission_type}
              options={TYPE_OPTIONS}
              onChange={(v) => setForm({ ...form, submission_type: v as ConferenceSubmissionType })}
              alwaysShowChevron
            />
            <input
              type="date"
              placeholder="Abstract due"
              value={form.abstract_due}
              onChange={(e) => setForm({ ...form, abstract_due: e.target.value })}
              style={{
                fontSize: '12px',
                padding: '6px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--cream)',
                color: 'var(--ink)',
              }}
              title="Abstract due date"
            />
            <input
              type="date"
              placeholder="Conference date"
              value={form.conference_date}
              onChange={(e) => setForm({ ...form, conference_date: e.target.value })}
              style={{
                fontSize: '12px',
                padding: '6px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--cream)',
                color: 'var(--ink)',
              }}
              title="Conference date"
            />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleAdd}
              disabled={!form.conference.trim() || !form.title.trim()}
              style={{
                fontSize: 'var(--label-size)',
                fontWeight: 'var(--label-weight)',
                padding: '5px 14px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: 'var(--teal-solid)',
                color: 'var(--ink-bright, #fff)',
                cursor: !form.conference.trim() || !form.title.trim() ? 'not-allowed' : 'pointer',
                opacity: !form.conference.trim() || !form.title.trim() ? 0.85 : 1,
              }}
            >
              Add
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{
                fontSize: 'var(--label-size)',
                padding: '5px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'none',
                color: 'var(--slate)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            marginTop: activeConfs.length > 0 ? '8px' : '0',
            fontSize: 'var(--label-size)',
            color: 'var(--teal)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 'var(--sp-xs) 0',
            opacity: 0.85,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7' }}
        >
          <Plus size={12} />
          Add Submission
        </button>
      )}

      {/* Empty state */}
      {activeConfs.length === 0 && !showForm && (
        <EmptyState
          icon={<Presentation size={24} />}
          title="No conference submissions yet"
        />
      )}
    </CollapsibleSection>
  )
}
