import { Server, routePartykitRequest } from "partyserver";
import type { Connection, ConnectionContext } from "partyserver";
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
// Set by NotificationHub.fetch from the consumed ticket, after any client copy
// of the header is overwritten; read once by onConnect.
const MEMBER_HEADER = "x-hub-member";

type Ticket = { member: string; expires: number };
type ConnState = { member: string };

function randomTicket(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export class NotificationHub extends Server implements RealtimeHubRpc {

  async notify(body: string): Promise<void> {
    this.broadcast(body);
  }

  async issueTicket(memberSlug: string): Promise<string> {
    if (typeof memberSlug !== "string" || !memberSlug.trim()) {
      throw new Error("issueTicket needs the member's slug");
    }
    const now = Date.now();
    // Tickets are consumed within seconds, so this list stays short. Expired
    // ones (a client that fetched a ticket and never connected) go here.
    const all = await this.ctx.storage.list<Ticket>({ prefix: TICKET_PREFIX });
    const expired = [...all].filter(([, t]) => t.expires <= now).map(([k]) => k);
    for (let i = 0; i < expired.length; i += 128) {
      await this.ctx.storage.delete(expired.slice(i, i + 128));
    }
    const ticket = randomTicket();
    const value: Ticket = { member: memberSlug, expires: now + REALTIME_TICKET_TTL_MS };
    await this.ctx.storage.put(TICKET_PREFIX + ticket, value);
    return ticket;
  }

  async ping(): Promise<string> {
    return "ok";
  }

  /** The ticket's member, once per live ticket; the ticket is gone afterwards
   *  either way. */
  async #consumeTicket(ticket: string | null): Promise<string | null> {
    if (!ticket) return null;
    const key = TICKET_PREFIX + ticket;
    const t = await this.ctx.storage.get<Ticket>(key);
    if (t === undefined) return null;
    await this.ctx.storage.delete(key);
    return t.expires > Date.now() ? t.member : null;
  }

  // Every public request reaches the DO through here (routePartykitRequest
  // forwards both upgrades and plain requests to fetch). Only an upgrade with
  // a live ticket gets through to partyserver.
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("websocket only", { status: 426 });
    }
    const ticket = new URL(request.url).searchParams.get(REALTIME_TICKET_PARAM);
    const member = await this.#consumeTicket(ticket);
    if (!member) {
      return new Response("unauthorized", { status: 401 });
    }
    const admitted = new Request(request);
    admitted.headers.set(MEMBER_HEADER, member);
    return super.fetch(admitted);
  }

  onConnect(connection: Connection<ConnState>, ctx: ConnectionContext) {
    // fetch() above set this header from the consumed ticket.
    connection.setState({ member: ctx.request.headers.get(MEMBER_HEADER)! });
  }

  onMessage(sender: Connection<ConnState>, message: string | ArrayBuffer) {
    // Presence / typing / intent: relay to every other connection, with `slug`
    // set to the sender's ticket member whatever the client wrote. A message
    // that is not a JSON object has no relay path.
    const member = sender.state?.member;
    if (!member) return;
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return;
    this.broadcast(JSON.stringify({ ...parsed, slug: member }), [sender.id]);
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
