import { useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, File, Trash2, Download, Loader2 } from 'lucide-react'
import { getPersonInfo } from '../data/team'
import { formatRelativeTime } from '../lib/dateUtils'
import { ICON_PROPS } from '../lib/iconProps'

interface FileAttachment {
  id: string
  entity_type: string
  entity_id: string
  filename: string
  content_type: string | null
  size_bytes: number | null
  r2_key: string
  uploaded_by: string | null
  created_at: string
}

interface FileUploadProps {
  entityType: string
  entityId: string
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FileUpload({ entityType, entityId }: FileUploadProps) {
  const queryClient = useQueryClient()
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')

  const { data: files = [] } = useQuery<FileAttachment[]>({
    queryKey: ['attachments', entityType, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/files?entity_type=${entityType}&entity_id=${entityId}`)
      const json = await res.json() as { data: FileAttachment[] }
      return json.data || []
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await fetch(`/api/files/${fileId}/delete`, { method: 'POST' })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] })
    },
  })

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true)
    setUploadProgress(`Uploading ${file.name}...`)

    try {
      // 1. Get presigned URL
      const urlRes = await fetch('/api/upload/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          context: { type: entityType, id: entityId },
        }),
      })
      const urlData = await urlRes.json() as { data: { uploadUrl: string; key: string } }

      if (!urlData.data?.uploadUrl) {
        throw new Error('Failed to get upload URL — R2 may not be configured')
      }

      // 2. Upload directly to R2
      setUploadProgress(`Uploading ${file.name}... (${formatBytes(file.size)})`)
      const res = await fetch(urlData.data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
      if (!res.ok) throw new Error('Upload failed')

      // 3. Record in D1
      const doneRes = await fetch('/api/upload/done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: urlData.data.key,
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          entityType,
          entityId,
        }),
      })
      if (!doneRes.ok) throw new Error('Failed to register upload')

      queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] })
      setUploadProgress('')
    } catch (err) {
      console.error('Upload failed:', err)
      setUploadProgress(`Upload failed: ${err instanceof Error ? err.message : 'unknown error'}`)
      setTimeout(() => setUploadProgress(''), 3000)
    } finally {
      setUploading(false)
    }
  }, [entityType, entityId, queryClient])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }, [uploadFile])

  const handleDownload = useCallback(async (r2Key: string, filename: string) => {
    const res = await fetch(`/api/files/${r2Key}`)
    const data = await res.json() as { data: { downloadUrl: string } }
    if (data.data?.downloadUrl) {
      const a = document.createElement('a')
      a.href = data.data.downloadUrl
      a.download = filename
      a.click()
    }
  }, [])

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? 'var(--teal)' : 'var(--border-subtle)'}`,
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--sp-lg)',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 150ms, background 150ms',
          background: dragOver ? 'var(--teal-hover)' : 'transparent',
        }}
        onClick={() => document.getElementById(`file-input-${entityType}-${entityId}`)?.click()}
      >
        <input
          id={`file-input-${entityType}-${entityId}`}
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2" style={{ color: 'var(--teal)' }}>
            <Loader2 {...ICON_PROPS} size={16} className="animate-spin" />
            <span className="text-xs">{uploadProgress}</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2" style={{ color: 'var(--muted)' }}>
            <Upload {...ICON_PROPS} size={16} />
            <span className="text-xs">Drop a file or click to upload</span>
          </div>
        )}
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          {files.map((f) => {
            const uploaderInfo = f.uploaded_by ? getPersonInfo(f.uploaded_by) : null
            const uploaderName = uploaderInfo && uploaderInfo.name !== 'Unknown' ? uploaderInfo.name : null
            return (
              <div
                key={f.id}
                className="flex items-center gap-2 py-1.5 px-2 rounded-md"
                style={{ fontSize: '12px' }}
              >
                <File {...ICON_PROPS} size={14} style={{ color: 'var(--slate)', opacity: 0.85, flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="truncate" style={{ color: 'var(--ink)' }}>{f.filename}</div>
                  {(uploaderName || f.created_at) && (
                    <div style={{ color: 'var(--muted)', fontSize: '10px', marginTop: 1 }}>
                      {uploaderName && <span>{uploaderName}</span>}
                      {uploaderName && f.created_at && <span> · </span>}
                      {f.created_at && <span>{formatRelativeTime(f.created_at)}</span>}
                    </div>
                  )}
                </div>
                {f.size_bytes && (
                  <span style={{ color: 'var(--muted)', fontSize: '10px', flexShrink: 0 }}>
                    {formatBytes(f.size_bytes)}
                  </span>
                )}
                <button
                  onClick={() => handleDownload(f.r2_key, f.filename)}
                  title="Download"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', padding: '2px' }}
                >
                  <Download {...ICON_PROPS} size={13} />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete "${f.filename}"? This cannot be undone.`)) {
                      deleteMutation.mutate(f.id)
                    }
                  }}
                  title="Delete"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--maroon)', padding: '2px', opacity: 0.85 }}
                >
                  <Trash2 {...ICON_PROPS} size={13} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
