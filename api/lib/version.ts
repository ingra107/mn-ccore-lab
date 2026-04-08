export async function bumpVersion(db: D1Database) {
  await db.prepare("UPDATE _meta SET value = ? WHERE key = 'version'")
    .bind(String(Date.now()))
    .run();
}

export async function handleVersion(env: { DB: D1Database }): Promise<Response> {
  const row = await env.DB.prepare("SELECT value FROM _meta WHERE key = 'version'").first<{ value: string }>();
  return new Response(JSON.stringify({ version: row?.value || '0' }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
  });
}
