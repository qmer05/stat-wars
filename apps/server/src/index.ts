export interface Env {
  ROOM: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Simple health check for now
    if (url.pathname === "/ping") {
      return new Response("pong");
    }

    // WebSocket entry: /ws/:roomCode
    if (url.pathname.startsWith("/ws/")) {
      const roomCode = url.pathname.split("/").pop()!;
      const id = env.ROOM.idFromName(roomCode);
      const stub = env.ROOM.get(id);
      // Forward the request (and the upgrade) to the Durable Object
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

// One GameRoom Durable Object per roomCode
export class GameRoom {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Set<WebSocket>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
  }

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    this.handleSession(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  private handleSession(ws: WebSocket) {
    ws.accept();
    this.sessions.add(ws);

    ws.addEventListener("message", (evt: MessageEvent) => {
      const text = typeof evt.data === "string" ? evt.data : "";
      // For now, echo back and broadcast to everyone (including sender)
      for (const s of this.sessions) {
        try {
          s.send(text || "pong");
        } catch {
          // ignore broken sockets
        }
      }
    });

    ws.addEventListener("close", () => {
      this.sessions.delete(ws);
    });

    ws.addEventListener("error", () => {
      this.sessions.delete(ws);
      try { ws.close(); } catch {}
    });

    // Greet on connect
    try { ws.send(JSON.stringify({ type: "hello", message: "connected to GameRoom" })); } catch {}
  }
}