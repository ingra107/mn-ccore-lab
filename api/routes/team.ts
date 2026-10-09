import type { AuthUser, Env } from '../helpers';
import { json, error, logActivity, getPiEmails, generateId } from '../helpers';
import { slugFromName, MEMBER_SLUG, UMN_EMAIL } from '../../shared/memberSlug';

// AM-3 (SEC-T0-1): public-safe team_members projection. Excludes `email`
// (PII) and `auto_created` (the internal PENDING-REVIEW flag). Keeps every
// display field the marketing site + portal UI render (name, photo, role,
// bio, credentials, scholar/citation stats). Used by the cv-data handler
// below; GET /api/team returns the full row and leaves anonymous callers to
// its anonShape in api/index.ts.
const TEAM_PUBLIC_COLS = [
  'id', 'name', 'slug', 'preferred_name', 'full_name', 'role', 'credentials',
  'photo_url', 'bio', 'scholar_id', 'author_name', 'title', 'department',
  'member_type', 'expertise_tags', 'citation_count', 'h_index',
  'last_scholar_refresh', 'created_at',
  // NOTE: `email` + `auto_created` deliberately omitted from the public path.
].join(', ');

// GET /api/team
// Signed-in and API-key callers get the full row (email/auto_created
// included). An anonymous caller's view is the route's anonShape in
// api/index.ts (slug + name), applied by bindRegistryToHono.
export async function handleGetTeam(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT * FROM team_members ORDER BY member_type, name'
  ).all();
  return json({ data: result.results, count: result.results.length });
}

// GET /api/team/slugs — for @mention autocomplete
export async function handleTeamSlugs(env: Env): Promise<Response> {
  const result = await env.DB.prepare('SELECT slug, name FROM team_members WHERE slug IS NOT NULL ORDER BY name').all();
  // Hermes leads the list: it's the highest-traffic mention target and has no
  // team_members row (author slug is claude-ai; the mention token is @hermes,
  // matching the /@(hermes|claude)\b/i detection in questions.ts/projects.ts).
  return json({ data: [{ slug: 'hermes', name: 'Hermes' }, ...(result.results || [])] });
}

// GET /api/team/:slug/cv-data
// Pattern C (Phase 1b-B): use the public column projection to prevent email/auto_created leakage.
// This endpoint is publicly reachable (no auth wall); SELECT * would expose PII.
export async function handleCVData(slug: string, env: Env): Promise<Response> {
  const [member, pubs, grants, mentees] = await Promise.all([
    env.DB.prepare(`SELECT ${TEAM_PUBLIC_COLS} FROM team_members WHERE slug = ?`).bind(slug).first(),
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
// whole lab. `email` is the member's login identity (#8945): the address
// their CF Access login carries is matched against it to find their row, so
// setting the real UMN address on a pre-provisioned row is how a new member
// lands on their own account — no code change, no NetID map.
const ADMIN_ONLY_FIELDS = ['role', 'member_type', 'email'] as const

// Citation cache fields — written ONLY by the PB-side scholarly cron via
// X-API-Key (Bearer PB_API_KEY) auth, never by browser users. See
// scripts/citations-scholar-stub.md. Schema: api/schema-v54-team-citations.sql.
const CITATION_FIELDS = ['citation_count', 'h_index', 'last_scholar_refresh'] as const

const ALL_ALLOWED_FIELDS: readonly string[] = [
  ...SELF_EDIT_FIELDS,
  ...ADMIN_ONLY_FIELDS,
  ...CITATION_FIELDS,
]

// PUT /api/team/:slug — update a team member's profile.
// Authorization:
//   - Caller authenticated via PB_API_KEY (X-API-Key / Bearer header):
//     can update CITATION_FIELDS only (used by the weekly scholarly cron).
//     Owner / PI gates do NOT apply — the cron has no JWT identity.
//   - User editing their OWN row (slug derived from JWT email == path slug):
//     can update SELF_EDIT_FIELDS only
//   - User in lab_settings.pi_emails:
//     can update any row, including ADMIN_ONLY_FIELDS (NOT citation fields —
//     those flow only from the cron, never hand-edited).
//   - Anyone else: 403
export async function handleUpdateTeamMember(
  slug: string,
  request: Request,
  user: AuthUser,
  env: Env,
  apiKeyAuth: boolean = false,
): Promise<Response> {
  // API-key auth path (PB scholarly cron). No JWT identity — cron writes
  // CITATION_FIELDS only.
  if (apiKeyAuth) {
    const body = await request.json() as Record<string, unknown>;
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    for (const [key, val] of Object.entries(body)) {
      if (!CITATION_FIELDS.includes(key as typeof CITATION_FIELDS[number])) {
        return error(`Field "${key}" is not writable via API key`, 403);
      }
      updates.push(`${key} = ?`);
      values.push(val as string | number | null);
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

    // Citation cron writes are mechanical; skip activity_log spam. (Cron
    // runs weekly across ~20 members → would generate 20 activity rows
    // every Monday morning for no operational signal.)
    const updated = await env.DB.prepare('SELECT * FROM team_members WHERE slug = ?').bind(slug).first();
    return json({ data: updated });
  }

  // Browser/JWT auth path — original owner-or-PI flow.
  // Anonymous fallback identity has email='anonymous'; reject before any
  // DB write. (REQUIRE_AUTH=1 in prod also blocks at middleware level,
  // but this is defense-in-depth.)
  if (!user.email || user.email === 'anonymous') {
    return error('Authentication required', 401);
  }

  const callerSlug = user.slug;
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
    // Citation fields can only be written by the PB cron (API key).
    if (CITATION_FIELDS.includes(key as typeof CITATION_FIELDS[number])) {
      return error(`Field "${key}" is only writable by the citations cron`, 403);
    }
    // Admin-only field guard.
    if (ADMIN_ONLY_FIELDS.includes(key as typeof ADMIN_ONLY_FIELDS[number]) && !isPi) {
      return error(`Field "${key}" can only be set by a PI`, 403);
    }
    if (key === 'email') {
      const email = typeof val === 'string' ? val.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return error('email must be a single address', 400);
      }
      // A typo here must not lock anyone out: the login email of a PI, or of
      // the caller themselves, is never changed through this route.
      if (isOwner) return error('Cannot change your own login email', 403);
      const current = await env.DB.prepare(
        'SELECT email FROM team_members WHERE slug = ?'
      ).bind(slug).first<{ email: string | null }>();
      if (current?.email && piEmails.has(current.email.toLowerCase())) {
        return error("Cannot change a PI's login email", 403);
      }
      // Two rows on one address would make the login resolve to whichever
      // was created first. (Sign-in no longer creates ghost rows, 2026-10-08,
      // so any other row holding the address is a real conflict.)
      const taken = await env.DB.prepare(
        'SELECT slug FROM team_members WHERE lower(email) = ? AND slug != ? LIMIT 1'
      ).bind(email, slug).first<{ slug: string }>();
      if (taken) return error(`email is already the login of "${taken.slug}"`, 409);
      updates.push('email = ?');
      values.push(email);
      continue;
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

  // D22 (2026-05-22): snapshot old role before UPDATE so we can emit a typed
  // 'role_assignment' event when it genuinely changes. Fetch only when setsRole
  // is true — avoids an extra query on profile-only edits.
  const oldRoleRow = setsRole
    ? await env.DB.prepare('SELECT role FROM team_members WHERE slug = ?').bind(slug).first<{ role: string | null }>()
    : null;

  values.push(slug);

  const result = await env.DB.prepare(
    `UPDATE team_members SET ${updates.join(', ')} WHERE slug = ?`
  ).bind(...values).run();

  if (result.meta.changes === 0) {
    return error('Team member not found', 404);
  }

  await logActivity(env, 'team_update', `Updated profile for ${slug}`, user.email, slug, 'team_member');

  // D22: typed role transition event — only when role genuinely changed.
  if (setsRole && oldRoleRow !== null && body.role !== oldRoleRow.role) {
    await logActivity(env, 'role_assignment', `Role: ${oldRoleRow.role ?? '—'} → ${body.role as string}`, user.email, slug, 'team_member');
  }

  const updated = await env.DB.prepare('SELECT * FROM team_members WHERE slug = ?').bind(slug).first();
  return json({ data: updated });
}

// Roles and member types a new row may take. member_type drives the Team
// directory grouping; research_team is what a new lab member almost always is.
const MEMBER_TYPES = ['director', 'senior_mentor', 'faculty', 'research_team'] as const
type MemberType = typeof MEMBER_TYPES[number]

// POST /api/team — a PI adds a member (2026-10-08). This, and a PI setting
// the email on an existing row, are the only ways an email becomes a member:
// sign-in no longer creates rows. Body: { name, email, slug?, role?,
// member_type? }. 409 when the email or the slug is already taken.
export async function handleCreateTeamMember(
  request: Request,
  user: AuthUser,
  env: Env,
  isPi: boolean,
): Promise<Response> {
  if (!isPi) return error('Forbidden — only a PI can add a member', 403);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown> }
  catch { return error('Body must be JSON', 400) }

  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 120) return error('name is required (1-120 characters)', 400);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!UMN_EMAIL.test(email)) return error('email must be a single UMN address (…@umn.edu)', 400);
  const slugIn = typeof body.slug === 'string' && body.slug.trim() !== '' ? body.slug.trim().toLowerCase() : slugFromName(name);
  if (!MEMBER_SLUG.test(slugIn) || slugIn.length > 80) {
    return error('slug must be lowercase letters, digits and single hyphens', 400);
  }
  const memberType = (typeof body.member_type === 'string' && body.member_type !== '' ? body.member_type : 'research_team') as MemberType;
  if (!MEMBER_TYPES.includes(memberType)) return error(`member_type must be one of ${MEMBER_TYPES.join(', ')}`, 400);
  const role = typeof body.role === 'string' && body.role.trim() !== '' ? body.role.trim().slice(0, 120) : null;

  const emailTaken = await env.DB.prepare(
    'SELECT slug FROM team_members WHERE lower(email) = ? LIMIT 1'
  ).bind(email).first<{ slug: string }>();
  if (emailTaken) return json({ error: `${email} is already the login of "${emailTaken.slug}"`, code: 'email_taken', slug: emailTaken.slug }, 409);
  const slugTaken = await env.DB.prepare('SELECT 1 AS ok FROM team_members WHERE slug = ? LIMIT 1').bind(slugIn).first();
  if (slugTaken) return json({ error: `The profile name "${slugIn}" is taken; choose another`, code: 'slug_taken', slug: slugIn }, 409);

  const id = generateId();
  try {
    await env.DB.prepare(
      `INSERT INTO team_members (id, name, slug, email, role, member_type, auto_created)
       VALUES (?, ?, ?, ?, ?, ?, 0)`
    ).bind(id, name, slugIn, email, role, memberType).run();
  } catch (e) {
    // A concurrent add lands here: slug is UNIQUE, and so is lower(email)
    // (schema-v118, index idx_team_members_email_lower).
    const msg = (e as Error).message;
    if (msg.includes('UNIQUE') && msg.includes('email')) {
      return json({ error: `${email} is already the login of another member`, code: 'email_taken' }, 409);
    }
    if (msg.includes('UNIQUE')) {
      return json({ error: `The profile name "${slugIn}" is taken; choose another`, code: 'slug_taken', slug: slugIn }, 409);
    }
    throw e;
  }

  // Typed event, the same shape as role_assignment. The address stays out of
  // the description: activity text is readable by every member.
  await logActivity(env, 'member_added', `Added ${name} to the team`, user.email, slugIn, 'team_member');

  const created = await env.DB.prepare('SELECT * FROM team_members WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}
