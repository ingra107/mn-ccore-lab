import type { Env } from '../helpers';
import { json, actorSlug } from '../helpers';

// GET /api/team/pulse?hours=48
// AM-3 (SEC-T0-1): the per-member activity breakdown (who did what) is
// team-internal. `isAuthed` true for JWT/API-key callers (resolved by the
// index.ts router) — they get the full per-member `activity` array. Unauth
// callers get only non-sensitive aggregate counts (totals + active_this_week)
// with an empty `activity` array, so the public surface can't enumerate who's
// active. The TeamPulseCard consumer already tolerates `activity ?? []`.
export async function handleTeamPulse(url: URL, env: Env, isAuthed = false): Promise<Response> {
  const hours = parseInt(url.searchParams.get('hours') || '48', 10);
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  // Get activity per person in the time window
  const [updates, completions, activeMembers] = await Promise.all([
    // Project updates by author
    env.DB.prepare(
      'SELECT author as slug, COUNT(*) as count FROM project_updates WHERE created_at > ? GROUP BY author'
    ).bind(cutoff).all<{ slug: string; count: number }>(),

    // Task completions by person
    env.DB.prepare(
      'SELECT completed_by as slug, COUNT(*) as count FROM tasks WHERE completed = 1 AND completed_at > ? AND completed_by IS NOT NULL GROUP BY completed_by'
    ).bind(cutoff).all<{ slug: string; count: number }>(),

    // Distinct active members (any activity_log entry)
    env.DB.prepare(
      'SELECT DISTINCT actor as slug FROM activity_log WHERE timestamp > ? AND actor IS NOT NULL'
    ).bind(cutoff).all<{ slug: string }>(),
  ]);

  // Merge activity per person
  const personActivity = new Map<string, { slug: string; updates: number; completions: number }>();

  for (const row of updates.results || []) {
    const slug = actorSlug(row.slug);
    const entry = personActivity.get(slug) || { slug, updates: 0, completions: 0 };
    entry.updates += row.count;
    personActivity.set(slug, entry);
  }

  for (const row of completions.results || []) {
    const slug = actorSlug(row.slug);
    const entry = personActivity.get(slug) || { slug, updates: 0, completions: 0 };
    entry.completions += row.count;
    personActivity.set(slug, entry);
  }

  for (const row of activeMembers.results || []) {
    const slug = actorSlug(row.slug);
    if (!personActivity.has(slug)) {
      personActivity.set(slug, { slug, updates: 0, completions: 0 });
    }
  }

  const activity = [...personActivity.values()];
  const totalUpdates = activity.reduce((sum, a) => sum + a.updates, 0);
  const totalCompletions = activity.reduce((sum, a) => sum + a.completions, 0);

  return json({
    data: {
      // Unauth callers get aggregate counts only — no per-member breakdown.
      activity: isAuthed ? activity : [],
      active_this_week: personActivity.size,
      totals: { updates: totalUpdates, completions: totalCompletions },
    },
  });
}
