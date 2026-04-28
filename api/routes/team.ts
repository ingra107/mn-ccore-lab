import type { AuthUser, Env } from '../helpers';
import { json, error, logActivity, actorSlug, getPiEmails } from '../helpers';

// GET /api/team
export async function handleTeam(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT * FROM team_members ORDER BY member_type, name'
  ).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/team/slugs — for @mention autocomplete
export async function handleTeamSlugs(env: Env): Promise<Response> {
  const result = await env.DB.prepare('SELECT slug, name FROM team_members WHERE slug IS NOT NULL ORDER BY name').all();
  return json({ data: result.results || [] });
}

// GET /api/team/:slug/cv-data
export async function handleCVData(slug: string, env: Env): Promise<Response> {
  const [member, pubs, grants, mentees] = await Promise.all([
    env.DB.prepare('SELECT * FROM team_members WHERE slug = ?').bind(slug).first(),
    env.DB.prepare("SELECT * FROM publications WHERE author_slugs LIKE ? ORDER BY year DESC")
      .bind(`%"${slug}"%`).all(),
    env.DB.prepare('SELECT * FROM grants WHERE pi = ? ORDER BY proposed ASC, mechanism ASC').bind(slug).all(),
    env.DB.prepare("SELECT * FROM team_members WHERE bio LIKE ?").bind(`%mentor%${slug}%`).all(),
  ]);

  if (!member) return error('Team member not found', 404);

  return json({
    data: {
      member,
      publications: pubs.results || [],
      grants: grants.results || [],
      mentees: mentees.results || [],
    },
  });
}

// Self-edit fields — anyone can update on their own profile.
const SELF_EDIT_FIELDS = ['bio', 'photo_url', 'scholar_id', 'title', 'department', 'full_name', 'preferred_name', 'credentials'] as const

// Admin-only fields — only PI emails (lab_settings.pi_emails) can set.
// role/member_type assignment is admin-only because it determines team
// directory grouping + sets the gold-pill role label visible to the
// whole lab.
const ADMIN_ONLY_FIELDS = ['role', 'member_type'] as const

const ALL_ALLOWED_FIELDS: readonly string[] = [...SELF_EDIT_FIELDS, ...ADMIN_ONLY_FIELDS]

// PUT /api/team/:slug — update a team member's profile.
// Authorization:
//   - User editing their OWN row (slug derived from JWT email == path slug):
//     can update SELF_EDIT_FIELDS only
//   - User in lab_settings.pi_emails:
//     can update any row, including ADMIN_ONLY_FIELDS
//   - Anyone else: 403
export async function handleUpdateTeamMember(
  slug: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  // Auth boundary. Anonymous fallback identity has email='anonymous';
  // reject before any DB write. (REQUIRE_AUTH=1 in prod also blocks at
  // middleware level, but this is defense-in-depth.)
  if (!user.email || user.email === 'anonymous') {
    return error('Authentication required', 401);
  }

  const callerSlug = actorSlug(user.email);
  const piEmails = await getPiEmails(env);
  const isPi = piEmails.has(user.email.toLowerCase());
  const isOwner = callerSlug === slug;

  if (!isOwner && !isPi) {
    return error('Forbidden — can only edit your own profile', 403);
  }

  const body = await request.json() as Record<string, unknown>;

  const updates: string[] = [];
  const values: (string | null)[] = [];

  for (const [key, val] of Object.entries(body)) {
    if (!ALL_ALLOWED_FIELDS.includes(key)) continue
    // Admin-only field guard.
    if (ADMIN_ONLY_FIELDS.includes(key as typeof ADMIN_ONLY_FIELDS[number]) && !isPi) {
      return error(`Field "${key}" can only be set by a PI`, 403);
    }
    updates.push(`${key} = ?`);
    values.push(val as string | null);
  }

  if (updates.length === 0) {
    return error('No valid fields to update', 400);
  }

  // Clear the auto_created flag whenever a role is assigned (admin-only
  // path; only PI reaches here). Idempotent — re-clearing is harmless.
  const setsRole = typeof body.role === 'string' && body.role.trim() !== '';
  if (setsRole) updates.push('auto_created = 0');

  values.push(slug);

  const result = await env.DB.prepare(
    `UPDATE team_members SET ${updates.join(', ')} WHERE slug = ?`
  ).bind(...values).run();

  if (result.meta.changes === 0) {
    return error('Team member not found', 404);
  }

  await logActivity(env, 'team_update', `Updated profile for ${slug}`, user.email, slug, 'team_member');

  const updated = await env.DB.prepare('SELECT * FROM team_members WHERE slug = ?').bind(slug).first();
  return json({ data: updated });
}
