import type { Env } from '../helpers';
import { json, generateId } from '../helpers';

// POST /api/impact/check — scan for impact events and create notifications
// Called periodically or after certain actions (e.g., before morning pulse email)
export async function handleCheckImpact(env: Env): Promise<Response> {
  let created = 0;

  // 1. Task completion -> project stage advance
  // If a project recently advanced stage, notify everyone who completed tasks on it
  const recentStageChanges = await env.DB.prepare(`
    SELECT al.related_id as project_id, al.description, al.timestamp,
           p.title as project_title, p.slug as project_slug
    FROM activity_log al
    JOIN projects p ON al.related_id = p.id
    WHERE al.type = 'project' AND al.description LIKE '%stage%'
    AND al.timestamp > datetime('now', '-7 days')
  `).all();

  for (const change of (recentStageChanges.results || []) as any[]) {
    // Find people who completed tasks on this project recently
    const contributors = await env.DB.prepare(`
      SELECT DISTINCT completed_by as slug FROM tasks
      WHERE project_id = ? AND completed = 1 AND completed_at > datetime('now', '-30 days')
      AND completed_by IS NOT NULL
    `).bind(change.project_slug).all();

    for (const contrib of (contributors.results || []) as any[]) {
      const slug = (contrib.slug as string).split('@')[0].toLowerCase();
      // Check if we already sent this notification (dedup by recipient + source)
      const existing = await env.DB.prepare(
        "SELECT id FROM notifications WHERE recipient_slug = ? AND source_id = ? AND type = 'impact'"
      ).bind(slug, change.project_id).first();

      if (!existing) {
        await env.DB.prepare(
          'INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          generateId(), slug, 'impact', 'project', change.project_id,
          `Your work advanced ${change.project_title}`,
          change.description,
          `/projects/${change.project_slug}`
        ).run();
        created++;
      }
    }
  }

  // 2. Paper published -> notify all author slugs
  const recentPublications = await env.DB.prepare(`
    SELECT id, title, author_slugs FROM publications
    WHERE status = 'published' AND created_at > datetime('now', '-7 days')
    AND author_slugs IS NOT NULL
  `).all();

  for (const pub of (recentPublications.results || []) as any[]) {
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
