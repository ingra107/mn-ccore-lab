// userPrefs.ts -- a person's Hub view preferences, on the server so the same
// view follows them to every device (user_prefs, schema-v143; PB #911).
//
//   GET    /api/user-prefs        every listed pref the caller has saved
//   PUT    /api/user-prefs/:key   { value } replace that pref's whole value
//   DELETE /api/user-prefs/:key   back to the default (no row)
//
// Which keys may exist is shared/userPrefKeys.ts, the list the UI hook is typed
// by. An unlisted key answers 400 here, so a device-local setting cannot be
// stored even by a raw fetch. A row whose key has since left the list is not
// served (nothing reads it any more).
//
// `memberSlug` is the caller's own slug, never a URL or body field, and every
// statement names it: the scope rule (table-scope.ts user_prefs) already
// limits a member to their rows, and the PB key, whose handle is unscoped,
// gets Nick's. The write is INSERT OR IGNORE then UPDATE, the digest.ts shape:
// viewer-db refuses ON CONFLICT DO UPDATE on a scoped table.

import type { Env } from '../helpers'
import { json, error } from '../helpers'
import { USER_PREF_MAX_BYTES, isUserPrefKey } from '../../shared/userPrefKeys'

export interface UserPrefRow {
  key: string
  value: unknown
  updated_at: string
}

const NOT_MEMBER = 'Sign in as a lab member to save view preferences'

export async function handleGetUserPrefs(env: Env, memberSlug: string | null): Promise<Response> {
  if (!memberSlug) return error(NOT_MEMBER, 403)
  const { results } = await env.DB.prepare(
    'SELECT key, value_json, updated_at FROM user_prefs WHERE member_slug = ? ORDER BY key',
  ).bind(memberSlug).all<{ key: string; value_json: string; updated_at: string }>()
  const data: UserPrefRow[] = []
  for (const r of results ?? []) {
    if (!isUserPrefKey(r.key)) continue
    data.push({ key: r.key, value: JSON.parse(r.value_json), updated_at: r.updated_at })
  }
  return json({ data })
}

export async function handlePutUserPref(
  key: string,
  request: Request,
  env: Env,
  memberSlug: string | null,
): Promise<Response> {
  if (!memberSlug) return error(NOT_MEMBER, 403)
  if (!isUserPrefKey(key)) return error(`Unknown preference key: ${key}`, 400)
  const body = await request.json().catch(() => null) as { value?: unknown } | null
  if (!body || typeof body !== 'object' || !('value' in body) || body.value === undefined) {
    return error('Body must be JSON { "value": ... }', 400)
  }
  const valueJson = JSON.stringify(body.value)
  if (valueJson.length > USER_PREF_MAX_BYTES) {
    return error(`Preference value is ${valueJson.length} bytes; the limit is ${USER_PREF_MAX_BYTES}`, 413)
  }
  const ins = await env.DB.prepare(
    'INSERT OR IGNORE INTO user_prefs (member_slug, key, value_json) VALUES (?, ?, ?)',
  ).bind(memberSlug, key, valueJson).run()
  if (ins.meta.changes === 0) {
    await env.DB.prepare(
      `UPDATE user_prefs SET value_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE member_slug = ? AND key = ?`,
    ).bind(valueJson, memberSlug, key).run()
  }
  const row = await env.DB.prepare(
    'SELECT key, value_json, updated_at FROM user_prefs WHERE member_slug = ? AND key = ?',
  ).bind(memberSlug, key).first<{ key: string; value_json: string; updated_at: string }>()
  if (!row) return error('Preference was not stored', 500)
  return json({ data: { key: row.key, value: JSON.parse(row.value_json), updated_at: row.updated_at } })
}

export async function handleDeleteUserPref(key: string, env: Env, memberSlug: string | null): Promise<Response> {
  if (!memberSlug) return error(NOT_MEMBER, 403)
  if (!isUserPrefKey(key)) return error(`Unknown preference key: ${key}`, 400)
  await env.DB.prepare('DELETE FROM user_prefs WHERE member_slug = ? AND key = ?').bind(memberSlug, key).run()
  return json({ data: { key, deleted: true } })
}
