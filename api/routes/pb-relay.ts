import type { AuthUser, Env } from '../helpers';
import { json, error, logActivity } from '../helpers';

interface RelayMessage {
  from: string
  to: string
  topic: string
  prompt: string
  status: 'pending' | 'completed'
  created_at: string
  completed_at?: string
}

function getRelayMessages(raw: string | null): RelayMessage[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

// GET /api/pb/relay — return pending relay messages
export async function handleGetRelay(env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT value FROM lab_settings WHERE key = 'relay_messages'"
  ).first() as { value: string } | null

  const messages = getRelayMessages(row?.value ?? null)
  return json({ data: messages })
}

// POST /api/pb/relay — add a relay message
export async function handleCreateRelay(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { from: string; to: string; topic: string; prompt: string }
  if (!body.from?.trim() || !body.to?.trim() || !body.topic?.trim() || !body.prompt?.trim()) {
    return error('from, to, topic, and prompt are all required', 400)
  }

  const row = await env.DB.prepare(
    "SELECT value FROM lab_settings WHERE key = 'relay_messages'"
  ).first() as { value: string } | null

  const messages = getRelayMessages(row?.value ?? null)
  const newMessage: RelayMessage = {
    from: body.from.trim(),
    to: body.to.trim(),
    topic: body.topic.trim(),
    prompt: body.prompt.trim(),
    status: 'pending',
    created_at: new Date().toISOString(),
  }
  messages.push(newMessage)

  await env.DB.prepare(
    "INSERT OR REPLACE INTO lab_settings (key, value, updated_at) VALUES ('relay_messages', ?, datetime('now'))"
  ).bind(JSON.stringify(messages)).run()

  await logActivity(env, 'relay', `Relay: ${body.from} -> ${body.to}: ${body.topic}`, user.email)
  return json({ data: messages }, 201)
}

// POST /api/pb/relay/:index/complete — mark relay message as completed
export async function handleCompleteRelay(request: Request, env: Env, index: number): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT value FROM lab_settings WHERE key = 'relay_messages'"
  ).first() as { value: string } | null

  const messages = getRelayMessages(row?.value ?? null)
  if (index < 0 || index >= messages.length) {
    return error('Invalid relay message index', 404)
  }

  messages[index].status = 'completed'
  messages[index].completed_at = new Date().toISOString()

  await env.DB.prepare(
    "INSERT OR REPLACE INTO lab_settings (key, value, updated_at) VALUES ('relay_messages', ?, datetime('now'))"
  ).bind(JSON.stringify(messages)).run()

  return json({ data: messages })
}
