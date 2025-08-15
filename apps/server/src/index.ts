import type {
  ClientToServer,
  ServerToClient,
  RoomView,
  RoundEvent,
} from "@stat-wars/shared";

export interface Env {
  ROOM: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ping") {
      return new Response("pong");
    }

    if (url.pathname.startsWith("/ws/")) {
      const roomCode = url.pathname.split("/").pop()!;
      const id = env.ROOM.idFromName(roomCode);
      const stub = env.ROOM.get(id);
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

// ----- Durable Object -----

type Seat = "P1" | "P2";

type InternalState = {
  players: { P1?: string; P2?: string };
  turn: Seat | null;
  phase: RoomView["phase"];
  log: RoundEvent[];
};

export class GameRoom {
  private state: DurableObjectState;
  private env: Env;

  // Map each connected socket to a seat
  private sessions = new Map<WebSocket, Seat>();
  // Also keep last socket per seat (for reconnect handling later)
  private seatSockets: Partial<Record<Seat, WebSocket | undefined>> = {};
  private room: InternalState = {
    players: {},
    turn: null,
    phase: "WAITING",
    log: [],
  };

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
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

    ws.addEventListener("message", (evt: MessageEvent) => {
      const msg = this.safeParse(evt.data);
      if (!msg) {
        this.send(ws, { type: "error", code: "BAD_JSON", message: "Invalid JSON" });
        return;
      }
      this.handleClientMessage(ws, msg);
    });

    ws.addEventListener("close", () => {
      this.sessions.delete(ws);
      // If this socket was the primary for a seat, keep room state but drop this reference
      for (const [seat, sock] of Object.entries(this.seatSockets) as [Seat, WebSocket][]) {
        if (sock === ws) this.seatSockets[seat] = undefined;
      }
      // We don't auto-change phase on disconnect yet; add later if desired
    });

    ws.addEventListener("error", () => {
      try { ws.close(); } catch {}
      this.sessions.delete(ws);
    });

    // Greet
    this.send(ws, { type: "state", view: this.publicViewFor(ws), log: this.room.log });
  }

  private handleClientMessage(ws: WebSocket, msg: ClientToServer) {
    switch (msg.type) {
      case "join": {
        const seat = this.assignSeat(ws, msg.name.trim());
        if (!seat) {
          this.send(ws, { type: "error", code: "ROOM_FULL", message: "Room already has 2 players" });
          return;
        }
        this.room.log.push({ type: "join", seat, name: msg.name });
        // If 2 players, phase -> READY
        if (this.room.players.P1 && this.room.players.P2 && this.room.phase === "WAITING") {
          this.room.phase = "READY";
        }
        this.broadcastState();
        return;
      }

      case "start": {
        if (!(this.room.players.P1 && this.room.players.P2)) {
          this.send(ws, { type: "error", code: "NOT_READY", message: "Need two players to start" });
          return;
        }
        // Start the match — no decks yet; just turn logic scaffold
        this.room.phase = "CHOOSE";
        this.room.turn = "P1"; // you can randomize later
        this.broadcastState();
        return;
      }

      case "chooseStat": {
        // We'll implement round resolution when we add decks.
        this.send(ws, { type: "error", code: "NOT_IMPLEMENTED", message: "Rounds not implemented yet" });
        return;
      }

      case "requestRematch": {
        // Later: reset state and decks
        this.send(ws, { type: "error", code: "NOT_IMPLEMENTED", message: "Rematch not implemented yet" });
        return;
      }

      case "leave": {
        this.dropSeat(ws);
        this.broadcastState();
        return;
      }

      default: {
        this.send(ws, { type: "error", code: "UNKNOWN", message: "Unknown message type" });
        return;
      }
    }
  }

  private assignSeat(ws: WebSocket, name: string): Seat | null {
    // If already seated, update the socket reference
    const existingSeat = this.sessions.get(ws);
    if (existingSeat) {
      this.seatSockets[existingSeat] = ws;
      this.room.players[existingSeat] = name || this.room.players[existingSeat] || `Player ${existingSeat === "P1" ? "1" : "2"}`;
      return existingSeat;
    }

    let seat: Seat | null = null;
    if (!this.room.players.P1) seat = "P1";
    else if (!this.room.players.P2) seat = "P2";
    else return null;

    this.sessions.set(ws, seat);
    this.seatSockets[seat] = ws;
    this.room.players[seat] = name || `Player ${seat === "P1" ? "1" : "2"}`;

    // If only 1 player, phase must be WAITING
    if (!this.room.players.P2 || !this.room.players.P1) {
      this.room.phase = "WAITING";
      this.room.turn = null;
    }

    return seat;
  }

  private dropSeat(ws: WebSocket) {
    const seat = this.sessions.get(ws);
    if (!seat) return;
    this.sessions.delete(ws);
    this.seatSockets[seat] = undefined;
    delete this.room.players[seat];

    // If one leaves mid-game, we could set GAME_OVER or WAITING
    if (this.room.phase !== "GAME_OVER") {
      this.room.phase = Object.keys(this.room.players).length === 2 ? "READY" : "WAITING";
      this.room.turn = null;
    }
  }

  private broadcastState() {
    const payload: ServerToClient = {
      type: "state",
      view: this.publicView(), // same for now; later per-socket view
      log: this.room.log,
    };
    for (const ws of this.sessions.keys()) {
      this.send(ws, payload);
    }
  }

  private publicView(): RoomView {
    return {
      you: "P1", // placeholder; per-socket view added below
      players: this.room.players,
      turn: this.room.turn,
      yourDeckCount: 0,
      oppDeckCount: 0,
      topCards: {},
      phase: this.room.phase,
    };
  }

  private publicViewFor(ws: WebSocket): RoomView {
    // When we add hidden info, we’ll tailor by seat.
    // For now it’s the same view; set "you" based on mapping:
    const seat = this.sessions.get(ws) ?? null;
    return {
      ...this.publicView(),
      you: (seat as RoomView["you"]) ?? "P1",
    };
  }

  private send(ws: WebSocket, msg: ServerToClient) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // ignore
    }
  }

  private safeParse(data: unknown): ClientToServer | null {
    if (typeof data !== "string") return null;
    try {
      const obj = JSON.parse(data);
      if (obj && typeof obj.type === "string") return obj as ClientToServer;
    } catch {
      // ignore
    }
    return null;
  }
}