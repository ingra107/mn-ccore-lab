// useLocalPomodoro — polls the local Flask pomodoro server (localhost:5555)
// from the browser. Laptop-only by design: phones can't reach localhost; if the
// server is unreachable the hook surfaces serverReachable=false and callers
// show a disabled/idle state instead of crashing.
//
// Mixed-content note: Hub is served over https; Chrome exempts localhost from
// mixed-content blocking (https://chromestatus.com/feature/5749656795963392).
// CORS headers must still be present on the server for the browser to accept
// the response — the orchestrator adds `flask-cors` / an after_request handler.
//
// Fetch shape (for CORS config):
//   GET  http://localhost:5555/api/status           (no body, no custom headers)
//   POST http://localhost:5555/api/start            Content-Type: application/json, body: {}
//   POST http://localhost:5555/api/stop             Content-Type: application/json, body: {}
// POSTs trigger a CORS preflight (OPTIONS). The server must handle OPTIONS and
// return Allow-Origin + Allow-Methods: GET,POST,OPTIONS + Allow-Headers: Content-Type.

import { useState, useEffect, useCallback } from 'react'
import { fetchWithTimeout } from '../lib/api'

// Exported so callers can also open the timer's own web UI (PomodoroControl
// opens it on Start) without a second hardcoded copy of the origin.
export const POMO_BASE = 'http://localhost:5555'
const POLL_MS = 5000    // background status poll (local tick drives display between polls)
const FETCH_TIMEOUT_MS = 2000

export interface PomoStatus {
  active: boolean
  task?: string | null
  task_id?: string | null
  project_id?: string | null
  project_name?: string | null
  start_time?: string | null   // ISO local time from Python datetime.now().isoformat()
  elapsed_seconds?: number
  phase?: string
  session_count?: number
  work_min?: number
}

export interface UseLocalPomodoroResult {
  status: PomoStatus | null
  serverReachable: boolean
  isLoading: boolean
  start: (opts?: { project_id?: string; project_name?: string }) => Promise<void>
  stop: () => Promise<void>
}

export function useLocalPomodoro(): UseLocalPomodoroResult {
  const [status, setStatus] = useState<PomoStatus | null>(null)
  const [serverReachable, setServerReachable] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${POMO_BASE}/api/status`, undefined, FETCH_TIMEOUT_MS)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as PomoStatus
      setStatus(data)
      setServerReachable(true)
    } catch {
      // network error or timeout — server not running; show disabled state
      setServerReachable(false)
      setStatus(null)
    }
  }, [])

  // Initial load + background poll
  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, POLL_MS)
    return () => clearInterval(id)
  }, [fetchStatus])

  const start = useCallback(async (opts?: { project_id?: string; project_name?: string }) => {
    setIsLoading(true)
    try {
      await fetchWithTimeout(`${POMO_BASE}/api/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts ?? {}),
      }, FETCH_TIMEOUT_MS)
    } catch {
      // unreachable — fetchStatus below updates serverReachable
    } finally {
      setIsLoading(false)
    }
    await fetchStatus()
  }, [fetchStatus])

  const stop = useCallback(async () => {
    setIsLoading(true)
    try {
      await fetchWithTimeout(`${POMO_BASE}/api/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }, FETCH_TIMEOUT_MS)
    } catch {
      // unreachable — fetchStatus below updates serverReachable
    } finally {
      setIsLoading(false)
    }
    await fetchStatus()
  }, [fetchStatus])

  return { status, serverReachable, isLoading, start, stop }
}
