import { useEffect, useState, useRef } from 'react'
import PartySocket from 'partysocket'
import { useAuth } from './useAuth'
import { emailToSlug } from '../lib/emailSlug'

const WS_HOST = import.meta.env.VITE_WS_HOST || 'hub-realtime.nicholas-ingraham.workers.dev'
const HEARTBEAT_MS = 15_000
const STALE_MS = 45_000

interface PresenceEntry {
  slug: string
  entityType: string
  entityId: string
  lastSeen: number
}

interface PresenceMessage {
  type: 'presence-ping' | 'presence-leave'
  slug: string
  entityType: string
  entityId: string
  ts: number
}

/**
 * Lightweight presence — Slack-style "who's viewing this entity right now."
 *
 * Each client broadcasts a ping every 15s on the shared mnccore room with
 * its slug + current entity. Clients maintain a local Map; entries older
 * than 45s are treated as gone. No server-side state — partyserver just
 * echoes messages to the room.
 *
 * Caveats:
 * - Clock skew is irrelevant (we only use our own `Date.now()` for staleness).
 * - Partyserver broadcasts exclude sender, so we don't see our own presence.
 * - Small team (~20) — for large rooms a real presence-channel pattern
 *   (track, broadcast-self-only-on-join) would be better.
 */
/**
 * T-51 Typing indicator — additive to presence. Broadcasts `typing-start` /
 * `typing-stop` on the same room. Peers clear after 5s of silence (TTL),
 * so a dropped `typing-stop` doesn't wedge the indicator. Returns
 * `{ typingPeers, broadcastTyping }`.
 */
const TYPING_TTL_MS = 5_000

interface TypingMessage {
  type: 'typing-start' | 'typing-stop'
  slug: string
  entityType: string
  entityId: string
  ts: number
}

export function useTyping(entityType: string, entityId: string | undefined | null) {
  const { user } = useAuth()
  const mySlug = user?.email ? emailToSlug(user.email) : ''
  const [typingPeers, setTypingPeers] = useState<{ slug: string; lastSeen: number }[]>([])
  const wsRef = useRef<PartySocket | null>(null)
  const lastBroadcastRef = useRef<{ typing: boolean; ts: number }>({ typing: false, ts: 0 })

  useEffect(() => {
    if (!entityId || !mySlug || !WS_HOST) return
    const ws = new PartySocket({ host: WS_HOST, room: 'mnccore', party: 'notification-hub' })
    wsRef.current = ws

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data) as TypingMessage
        if (msg.type !== 'typing-start' && msg.type !== 'typing-stop') return
        if (msg.slug === mySlug) return
        if (msg.entityType !== entityType || msg.entityId !== entityId) return
        setTypingPeers((prev) => {
          const filtered = prev.filter((p) => p.slug !== msg.slug)
          if (msg.type === 'typing-stop') return filtered
          return [...filtered, { slug: msg.slug, lastSeen: Date.now() }]
        })
      } catch { /* not typing traffic */ }
    }
    ws.addEventListener('message', handleMessage)

    const ttlCleanup = window.setInterval(() => {
      setTypingPeers((prev) => prev.filter((p) => Date.now() - p.lastSeen < TYPING_TTL_MS))
    }, 1_000)

    return () => {
      try {
        ws.send(JSON.stringify({
          type: 'typing-stop', slug: mySlug, entityType, entityId, ts: Date.now(),
        } satisfies TypingMessage))
      } catch { /* closed */ }
      ws.removeEventListener('message', handleMessage)
      window.clearInterval(ttlCleanup)
      ws.close()
      wsRef.current = null
    }
  }, [entityType, entityId, mySlug])

  // Debounced broadcast: emit start at most every 3s; stop always emits.
  const broadcastTyping = (typing: boolean) => {
    const now = Date.now()
    const last = lastBroadcastRef.current
    if (typing && last.typing && now - last.ts < 3_000) return
    if (!typing && !last.typing) return
    lastBroadcastRef.current = { typing, ts: now }
    const ws = wsRef.current
    if (!ws || !entityId || !mySlug) return
    try {
      ws.send(JSON.stringify({
        type: typing ? 'typing-start' : 'typing-stop',
        slug: mySlug, entityType, entityId, ts: now,
      } satisfies TypingMessage))
    } catch { /* not open */ }
  }

  return { typingPeers: typingPeers.map((p) => p.slug), broadcastTyping }
}

export function usePresence(entityType: string, entityId: string | undefined | null): string[] {
  const { user } = useAuth()
  const mySlug = user?.email ? emailToSlug(user.email) : ''
  const [peers, setPeers] = useState<PresenceEntry[]>([])
  const wsRef = useRef<PartySocket | null>(null)

  useEffect(() => {
    if (!entityId || !mySlug || !WS_HOST) return

    const ws = new PartySocket({
      host: WS_HOST,
      room: 'mnccore',
      party: 'notification-hub',
    })
    wsRef.current = ws

    const sendPing = () => {
      try {
        ws.send(JSON.stringify({
          type: 'presence-ping',
          slug: mySlug,
          entityType,
          entityId,
          ts: Date.now(),
        } satisfies PresenceMessage))
      } catch { /* socket not open yet */ }
    }

    const handleOpen = () => sendPing()
    ws.addEventListener('open', handleOpen)

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data) as PresenceMessage
        if (msg.type !== 'presence-ping' && msg.type !== 'presence-leave') return
        if (msg.slug === mySlug) return
        if (msg.entityType !== entityType || msg.entityId !== entityId) return
        setPeers((prev) => {
          const filtered = prev.filter((p) => p.slug !== msg.slug)
          if (msg.type === 'presence-leave') return filtered
          return [
            ...filtered,
            { slug: msg.slug, entityType: msg.entityType, entityId: msg.entityId, lastSeen: Date.now() },
          ]
        })
      } catch { /* not presence traffic */ }
    }
    ws.addEventListener('message', handleMessage)

    const heartbeat = window.setInterval(sendPing, HEARTBEAT_MS)
    const staleCleanup = window.setInterval(() => {
      setPeers((prev) => prev.filter((p) => Date.now() - p.lastSeen < STALE_MS))
    }, 10_000)

    // Send one presence-leave on unmount so peers drop us immediately
    return () => {
      try {
        ws.send(JSON.stringify({
          type: 'presence-leave',
          slug: mySlug,
          entityType,
          entityId,
          ts: Date.now(),
        } satisfies PresenceMessage))
      } catch { /* already closed */ }
      ws.removeEventListener('open', handleOpen)
      ws.removeEventListener('message', handleMessage)
      window.clearInterval(heartbeat)
      window.clearInterval(staleCleanup)
      ws.close()
      wsRef.current = null
    }
  }, [entityType, entityId, mySlug])

  return peers.map((p) => p.slug)
}
