import { useEffect, useState, useRef } from 'react'
import { useAuth } from './useAuth'
import { emailToSlug } from '../lib/emailSlug'
import { getRealtimeBus } from '../lib/realtimeBus'

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
 * All three presence hooks + useRealtimeSync now share a single underlying
 * PartySocket via `src/lib/realtimeBus.ts`. Pre-consolidation a single detail
 * panel open spun up 3 sockets (presence + typing + intent).
 */

export type Intent = 'viewing' | 'editing' | 'commenting'

const INTENT_TTL_MS = 30_000

interface IntentMessage {
  type: 'intent' | 'intent-leave'
  slug: string
  entityType: string
  entityId: string
  intent: Intent
  ts: number
}

export function useIntentBroadcast(
  entityType: string,
  entityId: string | undefined | null,
  selfIntent: Intent,
): Record<string, Intent> {
  const { user } = useAuth()
  const mySlug = user?.email ? emailToSlug(user.email) : ''
  const [peerIntents, setPeerIntents] = useState<Record<string, { intent: Intent; lastSeen: number }>>({})
  const lastBroadcastRef = useRef<Intent>('viewing')

  useEffect(() => {
    if (!entityId || !mySlug) return
    const bus = getRealtimeBus()

    const send = (intent: Intent, leave = false) => {
      bus.send({
        type: leave ? 'intent-leave' : 'intent',
        slug: mySlug, entityType, entityId, intent, ts: Date.now(),
      } satisfies IntentMessage)
    }

    const stopOpen = bus.onOpen(() => send(selfIntent))

    const stopMsg = bus.subscribe((data) => {
      const msg = data as IntentMessage
      if (!msg || (msg.type !== 'intent' && msg.type !== 'intent-leave')) return
      if (msg.slug === mySlug) return
      if (msg.entityType !== entityType || msg.entityId !== entityId) return
      if (msg.type === 'intent-leave') {
        setPeerIntents((prev) => {
          if (!prev[msg.slug]) return prev
          const { [msg.slug]: _drop, ...rest } = prev
          return rest
        })
        return
      }
      setPeerIntents((prev) => ({ ...prev, [msg.slug]: { intent: msg.intent, lastSeen: Date.now() } }))
    })

    const ttlCleanup = window.setInterval(() => {
      setPeerIntents((prev) => {
        const now = Date.now()
        let changed = false
        const next = { ...prev }
        for (const slug of Object.keys(next)) {
          if (now - next[slug].lastSeen > INTENT_TTL_MS) {
            if (next[slug].intent !== 'viewing') {
              next[slug] = { ...next[slug], intent: 'viewing' }
              changed = true
            }
          }
        }
        return changed ? next : prev
      })
    }, 5_000)

    return () => {
      send('viewing', true)
      stopOpen()
      stopMsg()
      window.clearInterval(ttlCleanup)
    }
  }, [entityType, entityId, mySlug])

  // Broadcast self intent whenever it changes.
  useEffect(() => {
    if (!entityId || !mySlug) return
    if (lastBroadcastRef.current === selfIntent) return
    lastBroadcastRef.current = selfIntent
    getRealtimeBus().send({
      type: 'intent', slug: mySlug, entityType, entityId, intent: selfIntent, ts: Date.now(),
    } satisfies IntentMessage)
  }, [selfIntent, entityType, entityId, mySlug])

  const out: Record<string, Intent> = {}
  for (const [slug, { intent }] of Object.entries(peerIntents)) out[slug] = intent
  return out
}

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
  const lastBroadcastRef = useRef<{ typing: boolean; ts: number }>({ typing: false, ts: 0 })

  useEffect(() => {
    if (!entityId || !mySlug) return
    const bus = getRealtimeBus()

    const stopMsg = bus.subscribe((data) => {
      const msg = data as TypingMessage
      if (!msg || (msg.type !== 'typing-start' && msg.type !== 'typing-stop')) return
      if (msg.slug === mySlug) return
      if (msg.entityType !== entityType || msg.entityId !== entityId) return
      setTypingPeers((prev) => {
        const filtered = prev.filter((p) => p.slug !== msg.slug)
        if (msg.type === 'typing-stop') return filtered
        return [...filtered, { slug: msg.slug, lastSeen: Date.now() }]
      })
    })

    const ttlCleanup = window.setInterval(() => {
      setTypingPeers((prev) => {
        const next = prev.filter((p) => Date.now() - p.lastSeen < TYPING_TTL_MS)
        return next.length === prev.length ? prev : next
      })
    }, 1_000)

    return () => {
      bus.send({
        type: 'typing-stop', slug: mySlug, entityType, entityId, ts: Date.now(),
      } satisfies TypingMessage)
      stopMsg()
      window.clearInterval(ttlCleanup)
    }
  }, [entityType, entityId, mySlug])

  const broadcastTyping = (typing: boolean) => {
    const now = Date.now()
    const last = lastBroadcastRef.current
    if (typing && last.typing && now - last.ts < 3_000) return
    if (!typing && !last.typing) return
    lastBroadcastRef.current = { typing, ts: now }
    if (!entityId || !mySlug) return
    getRealtimeBus().send({
      type: typing ? 'typing-start' : 'typing-stop',
      slug: mySlug, entityType, entityId, ts: now,
    } satisfies TypingMessage)
  }

  return { typingPeers: typingPeers.map((p) => p.slug), broadcastTyping }
}

export function usePresence(entityType: string, entityId: string | undefined | null): string[] {
  const { user } = useAuth()
  const mySlug = user?.email ? emailToSlug(user.email) : ''
  const [peers, setPeers] = useState<PresenceEntry[]>([])

  useEffect(() => {
    if (!entityId || !mySlug) return
    const bus = getRealtimeBus()

    const sendPing = () => {
      bus.send({
        type: 'presence-ping', slug: mySlug, entityType, entityId, ts: Date.now(),
      } satisfies PresenceMessage)
    }

    const stopOpen = bus.onOpen(sendPing)

    const stopMsg = bus.subscribe((data) => {
      const msg = data as PresenceMessage
      if (!msg || (msg.type !== 'presence-ping' && msg.type !== 'presence-leave')) return
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
    })

    // Kick once immediately in case bus is already open (onOpen above fires
    // synchronously if so, but defensive: a subscribe-then-send race is fine).
    if (bus.isOpen()) sendPing()

    const heartbeat = window.setInterval(sendPing, HEARTBEAT_MS)
    const staleCleanup = window.setInterval(() => {
      setPeers((prev) => prev.filter((p) => Date.now() - p.lastSeen < STALE_MS))
    }, 10_000)

    return () => {
      bus.send({
        type: 'presence-leave', slug: mySlug, entityType, entityId, ts: Date.now(),
      } satisfies PresenceMessage)
      stopOpen()
      stopMsg()
      window.clearInterval(heartbeat)
      window.clearInterval(staleCleanup)
    }
  }, [entityType, entityId, mySlug])

  return peers.map((p) => p.slug)
}
