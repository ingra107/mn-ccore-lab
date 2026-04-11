import { useState } from 'react'
import { FolderOpen, FileText, Database, FlaskConical, Upload, Link2, Plus, X, ExternalLink } from 'lucide-react'
import { useProjectDocuments } from '../../hooks/useApiData'
import { useAddProjectDocument, useDeleteProjectDocument } from '../../hooks/useMutations'
import type { ProjectDocumentRow } from '../../hooks/useApiData'

interface ProjectDocumentsProps {
  projectSlug: string
}

const DOC_TYPE_CONFIG: Record<string, { icon: typeof FolderOpen; label: string; color: string }> = {
  folder:     { icon: FolderOpen,   label: 'Folder',     color: 'var(--gold)' },
  draft:      { icon: FileText,     label: 'Draft',      color: 'var(--teal)' },
  data:       { icon: Database,     label: 'Dataset',    color: 'var(--green)' },
  protocol:   { icon: FlaskConical, label: 'Protocol',   color: 'var(--orange)' },
  submission: { icon: Upload,       label: 'Submission', color: 'var(--maroon)' },
  link:       { icon: Link2,        label: 'Link',       color: 'var(--slate)' },
}

const PRESETS: { label: string; doc_type: ProjectDocumentRow['doc_type']; placeholder: string }[] = [
  { label: 'Box Folder',   doc_type: 'folder',   placeholder: 'https://umn.box.com/...' },
  { label: 'Google Doc',   doc_type: 'draft',    placeholder: 'https://docs.google.com/...' },
  { label: 'Dataset',      doc_type: 'data',     placeholder: 'https://...' },
  { label: 'Protocol',     doc_type: 'protocol', placeholder: 'https://...' },
]

export default function ProjectDocuments({ projectSlug }: ProjectDocumentsProps) {
  const { data: documents = [] } = useProjectDocuments(projectSlug)
  const addDocument = useAddProjectDocument(projectSlug)
  const deleteDocument = useDeleteProjectDocument(projectSlug)

  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [docType, setDocType] = useState<ProjectDocumentRow['doc_type']>('link')
  const [urlPlaceholder, setUrlPlaceholder] = useState('https://...')
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  function handlePreset(preset: typeof PRESETS[number]) {
    setDocType(preset.doc_type)
    setUrlPlaceholder(preset.placeholder)
    setShowForm(true)
    setTitle('')
    setUrl('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !url.trim()) return
    addDocument.mutate({ title: title.trim(), url: url.trim(), doc_type: docType })
    setTitle('')
    setUrl('')
    setDocType('link')
    setShowForm(false)
  }

  function handleDelete(docId: string) {
    deleteDocument.mutate(docId)
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div className="flex items-center gap-2 mb-3">
        <FolderOpen size={14} style={{ color: 'var(--gold)' }} />
        <span
          style={{
            fontSize: 'var(--label-size)',
            fontWeight: 500,
            color: 'var(--slate)',
            opacity: 'var(--ink-label)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Key Documents
        </span>
        {documents.length > 0 && (
          <span
            style={{
              fontSize: 'var(--label-size)',
              color: 'var(--slate)',
              opacity: 0.5,
            }}
          >
            {documents.length}
          </span>
        )}
      </div>

      <div
        style={{
          background: 'var(--ice)',
          borderRadius: 'var(--radius-xl)',
          padding: '16px 20px',
        }}
        className="detail-card"
      >
        {/* Document list */}
        {documents.length > 0 && (
          <div style={{ marginBottom: showForm ? '12px' : 0 }}>
            {documents.map((doc) => {
              const config = DOC_TYPE_CONFIG[doc.doc_type] || DOC_TYPE_CONFIG.link
              const Icon = config.icon
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-3"
                  style={{
                    padding: 'var(--sp-sm) var(--sp-xs)',
                    borderBottom: '1px solid var(--border-subtle)',
                    transition: 'background 150ms ease',
                    background: hoveredId === doc.id ? 'rgba(201,168,76,0.04)' : 'transparent',
                    borderRadius: 'var(--radius-sm)',
                  }}
                  onMouseEnter={() => setHoveredId(doc.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <Icon
                    size={16}
                    style={{ color: config.color, flexShrink: 0, opacity: 0.8 }}
                  />
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: '13px',
                      color: 'var(--ink)',
                      textDecoration: 'none',
                      fontWeight: 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {doc.title}
                    <ExternalLink
                      size={10}
                      style={{ opacity: 0.4, flexShrink: 0 }}
                    />
                  </a>
                  <span
                    className="inline-block px-1.5 py-0.5 rounded-full"
                    style={{
                      fontSize: '10px',
                      fontWeight: 500,
                      color: config.color,
                      background: `color-mix(in srgb, ${config.color} 12%, transparent)`,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      flexShrink: 0,
                    }}
                  >
                    {config.label}
                  </span>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px',
                      color: 'var(--slate)',
                      opacity: hoveredId === doc.id ? 0.6 : 0,
                      transition: 'opacity 150ms ease',
                      flexShrink: 0,
                    }}
                    title="Remove document link"
                    aria-label="Remove document link"
                  >
                    <X size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Empty state */}
        {documents.length === 0 && !showForm && (
          <div className="text-center" style={{ padding: 'var(--sp-lg) 0 var(--sp-md)' }}>
            <FolderOpen
              size={24}
              style={{ color: 'var(--slate)', opacity: 0.25, margin: '0 auto var(--sp-sm)' }}
            />
            <p
              style={{
                fontSize: '12px',
                color: 'var(--slate)',
                opacity: 'var(--ink-label)',
                margin: '0 0 var(--sp-xs)',
              }}
            >
              No documents linked yet
            </p>
            <p
              style={{
                fontSize: '11px',
                color: 'var(--slate)',
                opacity: 'var(--ink-hint)',
                margin: 0,
              }}
            >
              Link Box folders, Google Docs, datasets, and protocols
            </p>
          </div>
        )}

        {/* Preset buttons */}
        {!showForm && (
          <div
            className="flex flex-wrap items-center gap-2"
            style={{ marginTop: documents.length > 0 ? '10px' : '12px' }}
          >
            {PRESETS.map((preset) => {
              const config = DOC_TYPE_CONFIG[preset.doc_type]
              const Icon = config.icon
              return (
                <button
                  key={preset.doc_type}
                  onClick={() => handlePreset(preset)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                  style={{
                    background: 'transparent',
                    color: 'var(--slate)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    opacity: 0.7,
                  }}
                >
                  <Icon size={12} style={{ color: config.color }} />
                  {preset.label}
                </button>
              )
            })}
            <button
              onClick={() => { setShowForm(true); setDocType('link'); setUrlPlaceholder('https://...') }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
              style={{
                background: 'transparent',
                color: 'var(--teal)',
                border: '1px solid var(--teal)',
                cursor: 'pointer',
                opacity: 0.8,
              }}
            >
              <Plus size={12} />
              Other
            </button>
          </div>
        )}

        {/* Add form */}
        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginTop: documents.length > 0 ? '4px' : '12px' }}>
            <div className="flex items-center gap-2 mb-2">
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 500,
                  color: 'var(--slate)',
                  opacity: 0.6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Add {DOC_TYPE_CONFIG[docType]?.label || 'Link'}
              </span>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as ProjectDocumentRow['doc_type'])}
                style={{
                  fontSize: '10px',
                  color: 'var(--slate)',
                  background: 'var(--cream)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '2px 6px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {Object.entries(DOC_TYPE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => { setShowForm(false); setTitle(''); setUrl('') }}
                style={{
                  marginLeft: 'auto',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--slate)',
                  opacity: 0.5,
                  padding: '2px',
                }}
                aria-label="Cancel"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Document title"
                autoFocus
                style={{
                  fontSize: '13px',
                  color: 'var(--ink)',
                  background: 'var(--cream)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 10px',
                  outline: 'none',
                  width: '100%',
                }}
              />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={urlPlaceholder}
                type="url"
                style={{
                  fontSize: '13px',
                  color: 'var(--ink)',
                  background: 'var(--cream)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 10px',
                  outline: 'none',
                  width: '100%',
                }}
              />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="submit"
                disabled={!title.trim() || !url.trim()}
                className="px-3 py-1.5 rounded-md text-xs font-medium"
                style={{
                  background: title.trim() && url.trim() ? 'var(--teal)' : 'var(--slate)',
                  color: 'var(--ink-bright, #fff)',
                  border: 'none',
                  cursor: title.trim() && url.trim() ? 'pointer' : 'not-allowed',
                  opacity: title.trim() && url.trim() ? 1 : 0.4,
                }}
              >
                Add Link
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setTitle(''); setUrl('') }}
                className="px-3 py-1.5 rounded-md text-xs"
                style={{
                  color: 'var(--slate)',
                  background: 'none',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
