/**
 * Notify connected WebSocket clients via Durable Object.
 * Fire-and-forget — never blocks the mutation response.
 */
export async function notifyClients(env: { NOTIFICATION_HUB?: DurableObjectNamespace }, type: string) {
  try {
    if (!env.NOTIFICATION_HUB) return; // DO not bound yet
    const id = env.NOTIFICATION_HUB.idFromName('mnccore');
    const stub = env.NOTIFICATION_HUB.get(id);
    await stub.fetch('https://dummy/notify', {
      method: 'POST',
      body: JSON.stringify({ type, timestamp: Date.now() }),
    });
  } catch (e) {
    // Never let notification failure break mutations
    console.error('DO notification failed:', e);
  }
}
