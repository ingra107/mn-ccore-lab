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
