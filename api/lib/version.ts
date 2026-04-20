export async function bumpVersion(db: D1Database) {
  await db.prepare("UPDATE _meta SET value = ? WHERE key = 'version'")
    .bind(String(Date.now()))
    .run();
}

export async function handleVersion(env: { DB: D1Database }): Promise<Response> {
  // Edge-cached for 10s. useRealtimeSync polls this every 15s on every
  // open tab, so without caching ~20 team members generate ~115K Worker
  // requests/day baseline. 10s TTL keeps cross-user invalidation
  // responsive (still detects changes within ~25s end-to-end) while
  // amortizing 95%+ of polling traffic at the edge.
  try {
    const row = await env.DB.prepare("SELECT value FROM _meta WHERE key = 'version'").first<{ value: string }>();
    return new Response(JSON.stringify({ version: row?.value || '0', env: 'production' }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=10, s-maxage=10',
      },
    });
  } catch {
    // DB_TEST may not have _meta table — return safe fallback rather than 500
    return new Response(JSON.stringify({ version: 'unknown', env: 'test' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    });
  }
}
