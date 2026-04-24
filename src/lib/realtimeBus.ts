import PartySocket from 'partysocket'

// Shared PartySocket dispatcher. All realtime hooks (presence, typing, intent,
// version-invalidation) route through ONE socket per (host, room, party) tuple.
// Pre-consolidation: each TaskDetailPanel open spun up 3 sockets (presence +
// typing + intent). 19 members × 3 = ~57 concurrent connections to a single
// Durable Object, hammered when the team dogfoods simultaneously. Post: 1.
//
// Connection lifecycle: lazily opened on first subscribe. After the last
// unsubscribe, we wait 2s before closing — React detail panels remount
// rapidly during navigation, and we don't want to cycle the socket on every
// tab-switch. A fresh subscribe inside the grace window reuses the live
// connection.

const WS_HOST = import.meta.env.VITE_WS_HOST || 'hub-realtime.nicholas-ingraham.workers.dev'
const CLOSE_GRACE_MS = 2_000

type Listener = (data: unknown) => void

interface BusEntry {
  socket: PartySocket
  listeners: Set<Listener>
  openListeners: Set<() => void>
  pendingSends: string[]
  isOpen: boolean
  closeTimer: number | null
}

const buses = new Map<string, BusEntry>()

function busKey(room: string, party: string): string {
  return `${WS_HOST}::${room}::${party}`
}

function ensureBus(room: string, party: string): BusEntry {
  const key = busKey(room, party)
  const existing = buses.get(key)
  if (existing) {
    if (existing.closeTimer !== null) {
      window.clearTimeout(existing.closeTimer)
      existing.closeTimer = null
    }
    return existing
  }
  const socket = new PartySocket({ host: WS_HOST, room, party })
  const entry: BusEntry = {
    socket,
    listeners: new Set(),
    openListeners: new Set(),
    pendingSends: [],
    isOpen: false,
    closeTimer: null,
  }
  socket.addEventListener('open', () => {
    entry.isOpen = true
    for (const payload of entry.pendingSends) {
      try { socket.send(payload) } catch { /* still opening */ }
    }
    entry.pendingSends.length = 0
    for (const fn of entry.openListeners) fn()
  })
  socket.addEventListener('close', () => { entry.isOpen = false })
  socket.addEventListener('message', (event: MessageEvent) => {
    let parsed: unknown
    try { parsed = JSON.parse(event.data) } catch { parsed = event.data }
    for (const fn of entry.listeners) fn(parsed)
  })
  buses.set(key, entry)
  return entry
}

function scheduleCloseIfIdle(key: string) {
  const entry = buses.get(key)
  if (!entry) return
  if (entry.listeners.size > 0 || entry.openListeners.size > 0) return
  if (entry.closeTimer !== null) return
  entry.closeTimer = window.setTimeout(() => {
    const e = buses.get(key)
    if (!e) return
    if (e.listeners.size > 0 || e.openListeners.size > 0) return
    try { e.socket.close() } catch { /* already closed */ }
    buses.delete(key)
  }, CLOSE_GRACE_MS)
}

export interface RealtimeBus {
  /** Subscribe to messages. Returns unsubscribe. */
  subscribe(listener: Listener): () => void
  /** Send when open; queue if opening. */
  send(payload: object): void
  /** Run fn on open (immediately if already open). Returns disposer. */
  onOpen(fn: () => void): () => void
  isOpen(): boolean
}

export function getRealtimeBus(room = 'mnccore', party = 'notification-hub'): RealtimeBus {
  const key = busKey(room, party)
  const entry = ensureBus(room, party)

  return {
    subscribe(listener) {
      entry.listeners.add(listener)
      return () => {
        entry.listeners.delete(listener)
        scheduleCloseIfIdle(key)
      }
    },
    send(payload) {
      const json = JSON.stringify(payload)
      if (entry.isOpen) {
        try { entry.socket.send(json) } catch { entry.pendingSends.push(json) }
      } else {
        entry.pendingSends.push(json)
      }
    },
    onOpen(fn) {
      if (entry.isOpen) {
        fn()
      } else {
        entry.openListeners.add(fn)
      }
      return () => {
        entry.openListeners.delete(fn)
        scheduleCloseIfIdle(key)
      }
    },
    isOpen() { return entry.isOpen },
  }
}
