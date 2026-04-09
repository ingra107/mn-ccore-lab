import type { Env } from '../helpers';
import { json, error } from '../helpers';

// GET /api/pb/health — system health overview for PB Sector
export async function handlePBHealth(env: Env): Promise<Response> {
  try {
    const [
      taskStats,
      projectStats,
      recentActivity,
      tableCount,
      lastTaskUpdate,
    ] = await Promise.all([
      // Active vs completed tasks
      env.DB.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed
        FROM tasks
      `).first(),

      // Active projects
      env.DB.prepare(`
        SELECT COUNT(*) as active
        FROM projects WHERE status IN ('active', 'Active')
      `).first(),

      // Recent activity (last 24h)
      env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM activity_log
        WHERE timestamp > datetime('now', '-24 hours')
      `).first(),

      // D1 table count
      env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
      `).first(),

      // Most recent task updated_at (proxy for last sync)
      env.DB.prepare(`
        SELECT MAX(updated_at) as last_sync FROM tasks
      `).first(),
    ]);

    // Also get last activity timestamp for D1 freshness
    const lastActivity = await env.DB.prepare(`
      SELECT MAX(timestamp) as last_activity FROM activity_log
    `).first();

    // Sync summary: last push/pull from lab_settings + sync coverage estimate
    const [lastPush, lastPull, syncCount] = await Promise.all([
      env.DB.prepare("SELECT value FROM lab_settings WHERE key = 'last_d1_push'").first<{ value: string }>().catch(() => null),
      env.DB.prepare("SELECT value FROM lab_settings WHERE key = 'last_d1_pull'").first<{ value: string }>().catch(() => null),
      env.DB.prepare("SELECT COUNT(*) as count FROM tasks WHERE source = 'sync'").first<{ count: number }>().catch(() => null),
    ]);

    return json({
      data: {
        tasks: {
          total: taskStats?.total ?? 0,
          active: taskStats?.active ?? 0,
          completed: taskStats?.completed ?? 0,
        },
        projects: {
          active: projectStats?.active ?? 0,
        },
        recentActivityCount: recentActivity?.count ?? 0,
        d1TableCount: tableCount?.count ?? 0,
        lastTaskSync: lastTaskUpdate?.last_sync ?? null,
        lastActivityTimestamp: lastActivity?.last_activity ?? null,
        sync_summary: {
          last_push: lastPush?.value ?? null,
          last_pull: lastPull?.value ?? null,
          pending_changes: syncCount?.count ?? 0,
        },
      },
    });
  } catch (e: any) {
    return error(`PB health check failed: ${e.message}`, 500);
  }
}
