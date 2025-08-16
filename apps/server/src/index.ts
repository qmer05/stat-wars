import { RoomPhase } from "@stat-wars/shared";

// apps/server/src/index.ts
import type {
  DurableObjectNamespace,
  DurableObjectState,
  WebSocket,
  Request as CfRequest,
} from "@cloudflare/workers-types";

import type {
  ClientToServer,
  ServerToClient,
  RoomView,
  RoundEvent,
  Card,
  StatName,
} from "@stat-wars/shared";

// (Type-only declaration so TS knows WebSocketPair exists in Workers)
declare const WebSocketPair: {
  new(): { 0: WebSocket; 1: WebSocket };
};

export interface Env {
  ROOM: DurableObjectNamespace;
}

export default {
  async fetch(request: CfRequest, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ping") {
      return new Response("pong");
    }

    if (url.pathname.startsWith("/ws/")) {
      const roomCode = url.pathname.split("/").pop()!;
      const id = env.ROOM.idFromName(roomCode);
      const stub = env.ROOM.get(id);
      // IMPORTANT: forward the ORIGINAL Request (not just the URL string)
      return (await stub.fetch(request)) as unknown as Response;
    }

    return new Response("Not found", { status: 404 });
  },
};

// ----- Durable Object -----

type Seat = "P1" | "P2";

type InternalState = {
  nextStarter: Seat
  players: { P1?: string; P2?: string };
  turn: Seat | null;
  phase: RoomPhase;
  log: RoundEvent[];
  deckP1: Card[];
  deckP2: Card[];
  lastRound?: {
    stat: StatName;
    p1Card?: Card;
    p2Card?: Card;
    winner: "P1" | "P2" | "tie";
  } | undefined;
};

const CARD_POOL: Card[] = [
  { id: "lion", animal: "Lion", stats: { speed: 80, strength: 95, size: 85, intelligence: 70 } },
  { id: "cheetah", animal: "Cheetah", stats: { speed: 120, strength: 60, size: 70, intelligence: 60 } },
  { id: "elephant", animal: "Elephant", stats: { speed: 40, strength: 99, size: 100, intelligence: 65 } },
  { id: "wolf", animal: "Wolf", stats: { speed: 75, strength: 70, size: 60, intelligence: 75 } },
  { id: "dolphin", animal: "Dolphin", stats: { speed: 55, strength: 50, size: 55, intelligence: 95 } },
  { id: "gorilla", animal: "Gorilla", stats: { speed: 45, strength: 92, size: 80, intelligence: 80 } },
  { id: "rhino", animal: "Rhino", stats: { speed: 50, strength: 97, size: 95, intelligence: 50 } },
  { id: "eagle", animal: "Eagle", stats: { speed: 160, strength: 40, size: 30, intelligence: 55 } },
];

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

class GameRoom {

  private startNewMatch() {
    this.room.deckP1 = shuffle(CARD_POOL);
    this.room.deckP2 = shuffle(CARD_POOL);
    this.room.lastRound = undefined;
    this.room.phase = "CHOOSE";
    this.room.turn = this.room.nextStarter;

    // flip the starter for the next time
    this.room.nextStarter = this.room.nextStarter === "P1" ? "P2" : "P1";
  }

  private sessions = new Map<WebSocket, Seat>();
  private seatSockets: Partial<Record<Seat, WebSocket | undefined>> = {};
  private room: InternalState = {
    nextStarter: "P1" as Seat,
    players: {},
    turn: null,
    phase: "WAITING",
    log: [],
    deckP1: [],
    deckP2: [],
  };

  constructor(private state: DurableObjectState, private env: Env) { }

  async fetch(request: CfRequest): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = (pair as any)[0] as WebSocket;
    const server = (pair as any)[1] as WebSocket;

    this.handleSession(server);

    // 101 Switching Protocols
    return new Response(null, { status: 101, webSocket: client as any });
  }

  private handleSession(ws: WebSocket) {
    (ws as any).accept();

    ws.addEventListener("message", (evt: any) => {
      const msg = this.safeParse(evt.data);
      if (!msg) {
        this.send(ws, { type: "error", code: "BAD_JSON", message: "Invalid JSON" });
        return;
      }
      this.handleClientMessage(ws, msg);
    });

    ws.addEventListener("close", () => {
      this.dropSeat(ws);
    });

    ws.addEventListener("error", () => {
      try {
        ws.close();
      } catch { }
      this.dropSeat(ws);
    });

    // Initial push
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
        this.startNewMatch();
        this.broadcastState();
        return;
      }

      case "requestRematch": {
        if (!(this.room.players.P1 && this.room.players.P2)) {
          this.send(ws, { type: "error", code: "NOT_READY", message: "Need two players" });
          return;
        }
        this.startNewMatch();
        this.broadcastState();
        return;
      }

      case "chooseStat": {
        const seat = this.sessions.get(ws);
        if (!seat || this.room.turn !== seat || this.room.phase !== "CHOOSE") {
          this.send(ws, { type: "error", code: "OUT_OF_TURN", message: "Not your turn" });
          return;
        }
        if (this.room.deckP1.length === 0 || this.room.deckP2.length === 0) {
          this.finishIfOver();
          return;
        }

        const p1Card = this.room.deckP1.shift()!;
        const p2Card = this.room.deckP2.shift()!;
        const s = msg.stat;
        const a = p1Card.stats[s];
        const b = p2Card.stats[s];

        let winner: "P1" | "P2" | "tie" = "tie";
        if (a > b) winner = "P1";
        else if (b > a) winner = "P2";

        if (winner === "P1") {
          this.room.deckP1.push(p1Card, p2Card);
          this.room.turn = "P1";
        } else if (winner === "P2") {
          this.room.deckP2.push(p1Card, p2Card);
          this.room.turn = "P2";
        } else {
          this.room.deckP1.push(p1Card);
          this.room.deckP2.push(p2Card);
          this.room.turn = seat === "P1" ? "P2" : "P1";
        }

        this.room.lastRound = { stat: s, p1Card, p2Card, winner };
        this.room.log.push({ type: "round", stat: s, winner });
        if (!this.finishIfOver()) {
          this.room.phase = "CHOOSE";
        }
        this.broadcastState();
        return;
      }

      case "leave": {
        this.dropSeat(ws);
        this.broadcastState();
        return;
      }

      default: {
        this.send(ws, { type: "error", code: "UNKNOWN", message: "Unknown message type" });
      }
    }
  }

  private finishIfOver(): boolean {
    if (this.room.deckP1.length === 0 || this.room.deckP2.length === 0) {
      this.room.phase = "GAME_OVER";
      const winner = this.room.deckP1.length > this.room.deckP2.length ? "P1" : "P2";
      const payload: ServerToClient = {
        type: "gameOver",
        winner,
        summary: { rounds: this.room.log.filter((e) => e.type === "round").length, durationSec: 0 },
      };
      for (const ws of this.sessions.keys()) this.send(ws, payload);
      return true; // game is over
    }
    return false; // still going
  }

  private assignSeat(ws: WebSocket, name: string): Seat | null {
    if (!this.room.players.P1) return this.claimSeat(ws, "P1", name);
    if (!this.room.players.P2) return this.claimSeat(ws, "P2", name);
    return null;
  }

  private claimSeat(ws: WebSocket, seat: Seat, name: string): Seat {
    this.sessions.set(ws, seat);
    this.seatSockets[seat] = ws;
    this.room.players[seat] = name || `Player ${seat === "P1" ? "1" : "2"}`;
    return seat;
  }

  private dropSeat(ws: WebSocket) {
    const seat = this.sessions.get(ws);
    if (!seat) return;
    this.sessions.delete(ws);
    this.seatSockets[seat] = undefined;
    delete this.room.players[seat];
    if (this.room.phase !== "GAME_OVER") {
      this.room.phase = Object.keys(this.room.players).length === 2 ? "READY" : "WAITING";
      this.room.turn = null;
    }
  }

  private broadcastState() {
    for (const ws of this.sessions.keys()) {
      this.send(ws, { type: "state", view: this.publicViewFor(ws), log: this.room.log });
    }
  }

  private publicViewFor(ws: WebSocket): RoomView {
    const seat = this.sessions.get(ws) ?? ("P1" as Seat);
    const yourDeck = seat === "P1" ? this.room.deckP1 : this.room.deckP2;
    const oppDeck = seat === "P1" ? this.room.deckP2 : this.room.deckP1;

    return {
      you: seat,
      players: this.room.players,
      turn: this.room.turn,
      yourDeckCount: yourDeck.length,
      oppDeckCount: oppDeck.length,
      topCards: {
        ...(yourDeck.length && yourDeck[0]
          ? { you: { revealed: true, card: { animal: yourDeck[0]!.animal } } }
          : {}),
        ...(oppDeck.length ? { opponent: { revealed: false } } : {}),
      },
      phase: this.room.phase,
    };
  }

  private send(ws: WebSocket, msg: ServerToClient) {
    try {
      ws.send(JSON.stringify(msg));
    } catch { }
  }

  private safeParse(data: unknown): ClientToServer | null {
    if (typeof data !== "string") return null;
    try {
      const obj = JSON.parse(data);
      if (obj && typeof obj.type === "string") return obj as ClientToServer;
    } catch { }
    return null;
  }
}

// Keep this explicit export so wrangler can bind the DO class
export { GameRoom };