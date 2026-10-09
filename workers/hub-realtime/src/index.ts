import { Server, Connection, routePartykitRequest } from "partyserver";
import {
  REALTIME_TICKET_PARAM,
  REALTIME_TICKET_TTL_MS,
  type RealtimeHubRpc,
} from "../../../shared/realtime";

// Access model: see shared/realtime.ts. In short, the only public way in is a
// WebSocket upgrade carrying a live ticket; broadcast and ticket minting are
// RPC methods reachable only through a Durable Object binding. Until
// 2026-10-08 this worker had no auth at all: anyone could open the socket and
// read presence/typing traffic, and anyone could POST a broadcast.

interface Env {
  NOTIFICATION_HUB: DurableObjectNamespace;
}

const TICKET_PREFIX = "ticket:";

function randomTicket(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export class NotificationHub extends Server implements RealtimeHubRpc {
  async notify(body: string): Promise<void> {
    this.broadcast(body);
  }

  async issueTicket(): Promise<string> {
    const now = Date.now();
    // Tickets are consumed within seconds, so this list stays short. Expired
    // ones (a client that fetched a ticket and never connected) go here.
    const all = await this.ctx.storage.list<number>({ prefix: TICKET_PREFIX });
    const expired = [...all].filter(([, exp]) => exp <= now).map(([k]) => k);
    for (let i = 0; i < expired.length; i += 128) {
      await this.ctx.storage.delete(expired.slice(i, i + 128));
    }
    const ticket = randomTicket();
    await this.ctx.storage.put(TICKET_PREFIX + ticket, now + REALTIME_TICKET_TTL_MS);
    return ticket;
  }

  async ping(): Promise<string> {
    return "ok";
  }

  /** True once per live ticket; the ticket is gone afterwards either way. */
  async #consumeTicket(ticket: string | null): Promise<boolean> {
    if (!ticket) return false;
    const key = TICKET_PREFIX + ticket;
    const exp = await this.ctx.storage.get<number>(key);
    if (exp === undefined) return false;
    await this.ctx.storage.delete(key);
    return exp > Date.now();
  }

  // Every public request reaches the DO through here (routePartykitRequest
  // forwards both upgrades and plain requests to fetch). Only an upgrade with
  // a live ticket gets through to partyserver.
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("websocket only", { status: 426 });
    }
    const ticket = new URL(request.url).searchParams.get(REALTIME_TICKET_PARAM);
    if (!(await this.#consumeTicket(ticket))) {
      return new Response("unauthorized", { status: 401 });
    }
    return super.fetch(request);
  }

  onMessage(sender: Connection, message: string | ArrayBuffer) {
    // Presence / typing / intent: relay to every other connection. Only
    // ticketed (member) connections exist, so only members send or receive.
    const msg = typeof message === "string" ? message : new TextDecoder().decode(message);
    this.broadcast(msg, [sender.id]);
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    // Liveness only; reveals nothing.
    if (url.pathname === "/health") {
      return new Response("ok", { headers: { "Cache-Control": "no-cache" } });
    }

    return (await routePartykitRequest(request, env)) || new Response("Not found", { status: 404 });
  },
};
