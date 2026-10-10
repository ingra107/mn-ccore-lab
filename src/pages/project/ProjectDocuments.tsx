// ProjectDocuments — the project_documents rows, rendered INSIDE the project's
// one Links card (ProjectLinkLibrary `documents` slot). The page used to mount
// this as a second "Key Documents" card with a colored type rainbow and an
// uppercase type pill, below the Links card (audit F45, 2026-10-09). The store
// stays separate (project_documents vs links, Nick 2026-07-21); only the
// rendering is merged. Rows use the library's anatomy: StoredLinkChip-style pill
// on the left, a right-aligned slot (date + remove) on the right. The pill is a
// local copy of StoredLinkChip's styles (that component takes a stored links
// row; these are project_documents rows), so keep the two in step. The type is
// a neutral glyph plus the hover title, never a color. "Add document" opens
// the form, with the type chosen inside it, so there are no preset buttons.
import { useState } from 'react'
import { FolderOpen, FileText, Database, FlaskConical, Upload, Link2, Plus, X } from 'lucide-react'
import { useProjectDocuments } from '../../hooks/useApiData'
import { useAddProjectDocument, useDeleteProjectDocument } from '../../hooks/useMutations'
import type { ProjectDocumentRow } from '../../hooks/useApiData'
import InlineSelect from '../../components/InlineSelect'
import { ICON_PROPS } from '../../lib/iconProps'
import { formatDbLocal } from '../../lib/time'
import { Button } from '../../components/ui/Button'

interface ProjectDocumentsProps {
  projectSlug: string
}

const DOC_TYPE_CONFIG: Record<string, { icon: typeof FolderOpen; label: string; placeholder: string }> = {
  folder:     { icon: FolderOpen,   label: 'Folder',     placeholder: 'https://umn.box.com/...' },
  draft:      { icon: FileText,     label: 'Draft',      placeholder: 'https://docs.google.com/...' },
  data:       { icon: Database,     label: 'Dataset',    placeholder: 'https://...' },
  protocol:   { icon: FlaskConical, label: 'Protocol',   placeholder: 'https://...' },
  submission: { icon: Upload,       label: 'Submission', placeholder: 'https://...' },
  link:       { icon: Link2,        label: 'Link',       placeholder: 'https://...' },
}

const inputStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'var(--ink)',
  background: 'var(--cream)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: '8px 10px',
  outline: 'none',
  width: '100%',
}

export default function ProjectDocuments({ projectSlug }: ProjectDocumentsProps) {
  const { data: documents = [] } = useProjectDocuments(projectSlug)
  const addDocument = useAddProjectDocument(projectSlug)
  const deleteDocument = useDeleteProjectDocument(projectSlug)

  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [docType, setDocType] = useState<ProjectDocumentRow['doc_type']>('link')

  function reset() {
    setTitle('')
    setUrl('')
    setDocType('link')
    setShowForm(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !url.trim()) return
    addDocument.mutate({ title: title.trim(), url: url.trim(), doc_type: docType })
    reset()
  }

  const canSave = title.trim().length > 0 && url.trim().length > 0

  return (
    <div className="flex flex-col gap-1.5">
      {documents.map((doc) => {
        const config = DOC_TYPE_CONFIG[doc.doc_type] || DOC_TYPE_CONFIG.link
        const Icon = config.icon
        const date = formatDbLocal(doc.created_at, 'date')
        const tooltip = `${config.label} · ${doc.title}`
        return (
          <div key={doc.id} className="group flex items-center justify-between gap-2">
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              title={tooltip}
              className="inline-flex items-center gap-1.5 self-start"
              style={{
                padding: '4px 7px 4px 9px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--ice)',
                border: '1px solid var(--border-subtle)',
                maxWidth: 240,
                fontSize: 12,
                fontWeight: 500,
                textDecoration: 'none',
                color: 'var(--slate)',
              }}
            >
              <Icon {...ICON_PROPS} size={14} style={{ color: 'var(--slate)', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {doc.title}
              </span>
            </a>
            <span className="flex items-center gap-1.5" style={{ flexShrink: 0 }}>
              {date && (
                <span style={{ fontSize: '10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{date}</span>
              )}
              <Button
                variant="ghost"
                onClick={() => deleteDocument.mutate(doc.id)}
                data-tip="Remove document link"
                aria-label={`Remove document link: ${doc.title}`}
                className="tip opacity-60 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                style={{ color: 'var(--slate)', padding: 0, display: 'grid' }}
              >
                <X {...ICON_PROPS} size={12} />
              </Button>
            </span>
          </div>
        )
      })}

      {!showForm && (
        <Button
          variant="ghost"
          onClick={() => setShowForm(true)}
          aria-label={documents.length === 0 ? 'Add a document' : 'Add another document'}
          className="flex items-center gap-1 self-start rounded transition-colors hov-opacity hov-bg"
          style={{
            padding: '3px 4px',
            fontSize: 'var(--text-small)',
            color: 'var(--teal)',
            opacity: 0.75,
            fontFamily: 'inherit',
            '--hov-opacity': '1',
            '--hov-bg': 'var(--teal-hover)',
          } as React.CSSProperties}
        >
          <Plus {...ICON_PROPS} size={11} />
          {documents.length === 0 ? 'Add a document' : 'Add document'}
        </Button>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); reset() } }}
          className="flex flex-col gap-2 p-3 rounded-lg"
          style={{ background: 'var(--ice)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <InlineSelect
              value={docType}
              options={Object.entries(DOC_TYPE_CONFIG).map(([key, cfg]) => ({ value: key, label: cfg.label }))}
              onChange={(v) => setDocType(v as ProjectDocumentRow['doc_type'])}
              alwaysShowChevron
            />
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title"
            autoFocus
            style={inputStyle}
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={DOC_TYPE_CONFIG[docType]?.placeholder ?? 'https://...'}
            type="url"
            style={inputStyle}
          />
          <div className="flex items-center gap-2 justify-end">
            <Button
              variant="secondary"
              type="button"
              onClick={reset}
              style={{ borderRadius: 'var(--radius-md)', padding: '4px 10px', fontSize: 'var(--text-small)' }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={!canSave}
              style={{
                background: canSave ? 'var(--teal-solid)' : 'var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '4px 10px',
                fontSize: 'var(--text-small)',
                color: canSave ? 'var(--ink-bright)' : 'var(--slate)',
                cursor: canSave ? 'pointer' : 'not-allowed',
                fontWeight: 500,
                opacity: 1,
              }}
            >
              Add
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
