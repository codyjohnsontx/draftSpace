import { Room } from "./room";
import { originAllowed, randomCode, randomToken, tokenHash } from "./security";

export { Room };

const cors = (origin: string) => ({ "access-control-allow-origin": origin, "access-control-allow-methods": "POST, GET, OPTIONS", "access-control-allow-headers": "content-type", vary: "Origin" });
const json = (value: unknown, status: number, origin: string) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...cors(origin) } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url); const origin = request.headers.get("Origin");
    if (request.method === "GET" && url.pathname === "/health") return new Response("ok");
    if (!originAllowed(origin, env.ALLOWED_ORIGINS)) return new Response("Forbidden", { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin!) });
    if (request.method === "POST" && url.pathname === "/rooms") {
      const requestIdentity = request.headers.get("CF-Connecting-IP")?.trim() || origin!;
      const rateLimit = await env.ROOM_CREATION_RATE_LIMITER.limit({ key: requestIdentity });
      if (!rateLimit.success) return json({ error: "rate-limited" }, 429, origin!);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = randomCode(); const hostToken = randomToken(); const roomId = crypto.randomUUID();
        const room = env.ROOMS.get(env.ROOMS.idFromName(code));
        const created = await room.fetch("https://room/create", { method: "POST", body: JSON.stringify({ roomId, hostTokenHash: await tokenHash(hostToken) }) });
        if (created.ok) {
          const protocol = url.protocol === "https:" ? "wss:" : "ws:";
          return json({ roomId, code, hostToken, websocketUrl: `${protocol}//${url.host}/rooms/${code}/connect` }, 201, origin!);
        }
      }
      return json({ error: "room-unavailable" }, 503, origin!);
    }
    const match = url.pathname.match(/^\/rooms\/([0-9A-Z]{10})\/connect$/);
    if (request.method === "GET" && match && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
    }
    return json({ error: "not-found" }, 404, origin!);
  },
} satisfies ExportedHandler<Env>;
