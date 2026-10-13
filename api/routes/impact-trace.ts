import type { Env } from '../helpers';
import { json, generateId } from '../helpers';

// POST /api/impact/check — scan for impact events and create notifications
// Called periodically or after certain actions (e.g., before morning pulse email)
export async function handleCheckImpact(env: Env): Promise<Response> {
  let created = 0;

  // 1. Paper published -> notify all author slugs
  const recentPublications = await env.DB.prepare(`
    SELECT id, title, author_slugs FROM publications
    WHERE status = 'published' AND created_at > datetime('now', '-7 days')
    AND author_slugs IS NOT NULL
  `).all();

  for (const pub of (recentPublications.results || []) as Record<string, unknown>[]) {
    try {
      const slugs = JSON.parse(pub.author_slugs as string) as string[];
      for (const slug of slugs) {
        const existing = await env.DB.prepare(
          "SELECT id FROM notifications WHERE recipient_slug = ? AND source_id = ? AND type = 'impact'"
        ).bind(slug, pub.id).first();

        if (!existing) {
          await env.DB.prepare(
            'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(
            generateId(), slug, 'impact', 'publication', pub.id,
            'Your paper was published!',
            pub.title,
            `/publications/${pub.id}`
          ).run();
          created++;
        }
      }
    } catch {
      // Skip if author_slugs isn't valid JSON
    }
  }

  return json({ data: { checked: true, notifications_created: created } });
}
