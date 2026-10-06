// One FIFO upload queue per composer (backlog #1356 / #1358).
//
// Why this exists: composers used to start one independent async chain per
// file (`files.forEach(upload)`) against a single `uploading` boolean. The
// first chain to finish set it false while its siblings were still in
// flight, so the Attach control re-enabled mid-batch. SmartCompose fixed that
// in place for #1118 with a queue drained by one loop; this hook is that
// same shape, extracted so the task panel's quick composer and ProjectDetail's
// drop zone share one copy instead of transcribing a third and fourth.
//
// `uploading` is never set by a caller. It is true from the moment a file is
// enqueued until the queue is empty, because only one drain loop runs per
// hook instance and it alone clears the flag after the last file. A caller
// therefore cannot hold an `uploading` that disagrees with its own queue.
//
// The worker owns the per-file UI (preview, insert, toast). It should catch
// its own errors; if it throws anyway, the error is logged and the queue moves
// on to the next file rather than stalling with `uploading` stuck true.
//
// Unmount stops the queue: files still WAITING are dropped and the drain
// exits after the in-flight file (an R2 PUT cannot be recalled). Otherwise a
// closed composer kept uploading its backlog, and each file became an R2
// attachment whose link was never inserted anywhere.
import { useCallback, useEffect, useRef, useState } from 'react'

export interface UploadQueue {
  /** Append files to the queue and start draining if idle. */
  enqueue: (files: Iterable<File> | ArrayLike<File> | null | undefined) => void
  /** True while any enqueued file has not finished. */
  uploading: boolean
}

export function useUploadQueue(worker: (file: File) => Promise<void>): UploadQueue {
  const [uploading, setUploading] = useState(false)
  const queueRef = useRef<File[]>([])
  const drainingRef = useRef(false)
  // Read the latest worker at each file, so a drain that started before a
  // re-render (new taskId, new toast callbacks) never runs a stale closure.
  const workerRef = useRef(worker)
  workerRef.current = worker
  const mountedRef = useRef(true)
  useEffect(() => {
    // Set on every mount, not just at init: StrictMode's dev mount/unmount/
    // remount cycle runs this cleanup once before the real mount.
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      queueRef.current = []
    }
  }, [])

  const drain = useCallback(async () => {
    if (drainingRef.current) return
    drainingRef.current = true
    setUploading(true)
    try {
      while (mountedRef.current && queueRef.current.length > 0) {
        const file = queueRef.current.shift() as File
        try {
          await workerRef.current(file)
        } catch (err) {
          // Emission protection: the worker failed to report its own error.
          console.error(`upload queue: worker threw for ${file.name}`, err)
        }
      }
    } finally {
      drainingRef.current = false
      setUploading(false)
    }
  }, [])

  const enqueue = useCallback((files: Iterable<File> | ArrayLike<File> | null | undefined) => {
    if (!files) return
    const list = Array.from(files as ArrayLike<File>)
    if (list.length === 0 || !mountedRef.current) return
    queueRef.current.push(...list)
    void drain()
  }, [drain])

  return { enqueue, uploading }
}
