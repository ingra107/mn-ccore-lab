import type { Env } from './types';

export type { Env };

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cf-Access-Jwt-Assertion',
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

export function error(message: string, status = 500): Response {
  return json({ error: message }, status);
}

export interface AuthUser {
  email: string
  name?: string
}

export function getAuthUser(request: Request): AuthUser | null {
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) return null;

  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.email) return null;
    return {
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
    };
  } catch {
    return null;
  }
}

export function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function logActivity(
  env: Env,
  type: string,
  description: string,
  actor: string,
  relatedId?: string,
  relatedType?: string,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO activity_log (id, type, description, actor, related_id, related_type) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(generateId(), type, description, actor, relatedId ?? null, relatedType ?? null).run();
}

export function parseMentions(text: string): string[] {
  const regex = /@([a-z][a-z0-9_-]*)/g;
  return [...new Set(Array.from(text.matchAll(regex), m => m[1]))];
}
