import type { AuthUser, Env } from '../helpers';
import { json, error, logActivity } from '../helpers';

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

// PUT /api/team/:slug — team member updates own profile
export async function handleUpdateTeamMember(
  slug: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;

  // Allowlisted fields that team members can update about themselves
  const allowed = ['bio', 'photo_url', 'scholar_id', 'title', 'department'];
  const updates: string[] = [];
  const values: (string | null)[] = [];

  for (const [key, val] of Object.entries(body)) {
    if (allowed.includes(key)) {
      updates.push(`${key} = ?`);
      values.push(val as string | null);
    }
  }

  if (updates.length === 0) {
    return error('No valid fields to update', 400);
  }

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
