import { useState } from 'react'
import { Presentation, Plus, Trash2, Plane, Check } from 'lucide-react'
import CollapsibleSection from './CollapsibleSection'
import EmptyState from './EmptyState'
import InlineSelect from './InlineSelect'
import { useUndoToast } from './UndoToast'
import { useConferences } from '../hooks/useApiData'
import { useCreateConference, useUpdateConference, useDeleteConference } from '../hooks/useMutations'
import { formatShortDate, localDateKey, isOverdue } from '../lib/dateUtils'
import type { ConferenceSubmissionRow, ConferenceSubmissionType, ConferenceStatus, MaterialsStatus } from '../lib/api'
import { ICON_PROPS } from '../lib/iconProps'
import { getStatusColor } from '../lib/statusColors'
import { Button } from './ui/Button'

// Colors come from the shared status map, never a local copy (principle 21).
const STATUS_OPTIONS: { value: ConferenceStatus; label: string; color: string }[] = ([
  { value: 'planning', label: 'Planning' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'presented', label: 'Presented' },
  { value: 'rejected', label: 'Rejected' },
] as const).map((o) => ({ ...o, color: getStatusColor(o.value) }))

const MATERIALS_OPTIONS: { value: MaterialsStatus; label: string; color: string }[] = ([
  { value: 'not_started', label: 'Not Started' },
  { value: 'drafting', label: 'Drafting' },
  { value: 'review', label: 'In Review' },
  { value: 'final', label: 'Final' },
] as const).map((o) => ({ ...o, color: getStatusColor(o.value) }))

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

// Input edge: --field-edge, the one input outline.
const CONF_INPUT_STYLE = {
  fontSize: '12px',
  padding: '6px 10px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--field-edge)',
  background: 'var(--field-bg)',
  color: 'var(--ink)',
  outline: 'none',
} as const

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
    const updates: Partial<{ status: ConferenceStatus; abstract_submitted_at: string; accepted_at: string }> = { status: newStatus }
    if (newStatus === 'submitted' && !conf.abstract_submitted_at) {
      updates.abstract_submitted_at = localDateKey()
    }
    if (newStatus === 'accepted' && !conf.accepted_at) {
      updates.accepted_at = localDateKey()
    }
    updateMutation.mutate({ id: conf.id, fields: updates })
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
                {['Conference', 'Type', 'Abstract due', 'Status', 'Materials', 'Travel', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '6px 8px',
                      fontSize: '11px',
                      fontWeight: 500,
                      color: 'var(--slate)',
                      opacity: 0.75,
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
                          color: isOverdue(conf.abstract_due) && conf.status === 'planning'
                            ? 'var(--job-overdue)'
                            : 'var(--ink)',
                          fontWeight: isOverdue(conf.abstract_due) && conf.status === 'planning' ? 600 : 400,
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
                    <Button
                      variant="ghost"
                      onClick={() => handleTravelToggle(conf)}
                      style={{
                        padding: '2px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}
                      title={conf.travel_booked ? 'Travel booked' : 'Travel not booked'}
                    >
                      <Plane {...ICON_PROPS}
                        size={13}
                        style={{
                          color: conf.travel_booked ? 'var(--sk-t2)' : 'var(--slate)',
                          opacity: conf.travel_booked ? 1 : 0.85,
                        }}
                      />
                      {conf.travel_booked ? (
                        <Check {...ICON_PROPS} size={10} style={{ color: 'var(--sk-t2)' }} />
                      ) : null}
                    </Button>
                  </td>

                  {/* Delete */}
                  <td style={{ padding: 'var(--sp-sm)' }}>
                    <Button
                      variant="ghost"
                      onClick={() => handleDelete(conf)}
                      className="hov-opacity hov-color"
                      style={{
                        color: 'var(--slate)',
                        opacity: 0.75,
                        padding: '2px',
                        '--hov-opacity': '1',
                        '--hov-color': 'var(--job-danger)',
                      } as React.CSSProperties}
                    >
                      <Trash2 {...ICON_PROPS} size={12} />
                    </Button>
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
          className="sk-mat"
          style={{
            marginTop: activeConfs.length > 0 ? '12px' : '0',
            padding: 'var(--sp-md)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <input
              placeholder="Conference name"
              value={form.conference}
              onChange={(e) => setForm({ ...form, conference: e.target.value })}
              autoFocus
              style={CONF_INPUT_STYLE}
            />
            <input
              placeholder="Submission title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              style={CONF_INPUT_STYLE}
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
              style={CONF_INPUT_STYLE}
              title="Abstract due date"
            />
            <input
              type="date"
              placeholder="Conference date"
              value={form.conference_date}
              onChange={(e) => setForm({ ...form, conference_date: e.target.value })}
              style={CONF_INPUT_STYLE}
              title="Conference date"
            />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="primary"
              onClick={handleAdd}
              disabled={!form.conference.trim() || !form.title.trim()}
              style={{
                fontSize: 'var(--label-size)',
                fontWeight: 'var(--label-weight)',
                padding: '5px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--job-accent-solid)',
                color: 'var(--ink-bright, #fff)',
                cursor: !form.conference.trim() || !form.title.trim() ? 'not-allowed' : 'pointer',
                opacity: !form.conference.trim() || !form.title.trim() ? 0.85 : 1,
              }}
            >
              Add
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowForm(false)}
              style={{
                fontSize: 'var(--label-size)',
                padding: '5px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'none',
                color: 'var(--slate)',
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          onClick={() => setShowForm(true)}
          className="hov-opacity"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            marginTop: activeConfs.length > 0 ? '8px' : '0',
            fontSize: 'var(--label-size)',
            color: 'var(--sk-t2)',
            padding: 'var(--sp-xs) 0',
            opacity: 0.85,
            '--hov-opacity': '1',
          } as React.CSSProperties}
        >
          <Plus {...ICON_PROPS} size={12} />
          Add Submission
        </Button>
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
