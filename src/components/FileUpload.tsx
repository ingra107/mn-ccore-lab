import { useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, File, Trash2, Download, Loader2 } from 'lucide-react'

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
      await fetch(urlData.data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })

      // 3. Record in D1
      await fetch('/api/upload/done', {
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

      queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] })
    } catch (err) {
      console.error('Upload failed:', err)
      setUploadProgress(`Upload failed: ${err instanceof Error ? err.message : 'unknown error'}`)
      setTimeout(() => setUploadProgress(''), 3000)
      return
    }

    setUploading(false)
    setUploadProgress('')
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
          background: dragOver ? 'rgba(45, 138, 138, 0.05)' : 'transparent',
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
            <Loader2 size={16} className="animate-spin" />
            <span className="text-xs">{uploadProgress}</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2" style={{ color: 'var(--muted)' }}>
            <Upload size={16} />
            <span className="text-xs">Drop a file or click to upload</span>
          </div>
        )}
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 py-1.5 px-2 rounded-md"
              style={{ fontSize: '12px' }}
            >
              <File size={14} style={{ color: 'var(--slate)', opacity: 0.7, flexShrink: 0 }} />
              <span className="truncate flex-1" style={{ color: 'var(--ink)' }}>{f.filename}</span>
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
                <Download size={13} />
              </button>
              <button
                onClick={() => deleteMutation.mutate(f.id)}
                title="Delete"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--maroon)', padding: '2px', opacity: 0.6 }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
