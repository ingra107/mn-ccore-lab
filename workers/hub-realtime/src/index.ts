import { Server, Connection, routePartykitRequest } from "partyserver";

interface Env {
  NOTIFICATION_HUB: DurableObjectNamespace;
}

export class NotificationHub extends Server {
  onConnect(_conn: Connection) {
    // Client connected — partyserver tracks connections automatically
  }

  onMessage(message: string, sender: Connection) {
    // Broadcast to all connected clients except the sender
    this.broadcast(message, [sender.id]);
  }

  async onRequest(request: Request) {
    // Internal: Hub Worker POSTs here to notify all connected clients
    if (request.method === 'POST') {
      const body = await request.text();
      this.broadcast(body);
      return new Response('ok');
    }
    return new Response('ws only', { status: 426 });
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response('ok', {
        headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' },
      });
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection',
        },
      });
    }

    // Route all other requests (including WebSocket upgrades) to PartyServer
    return (await routePartykitRequest(request, env)) || new Response('Not found', { status: 404 });
  },
};
