// Types for game stats
export type StatName = "speed" | "strength" | "size" | "intelligence";
export const STAT_NAMES: StatName[] = ["speed", "strength", "size", "intelligence"];

// Room phases
export type RoomPhase = "WAITING" | "READY" | "CHOOSE" | "GAME_OVER";

// Public game view for a client
export interface RoomView {
  phase: RoomPhase;
  you: "P1" | "P2";
  players: { P1?: string; P2?: string };
  turn: "P1" | "P2" | null;
  yourDeckCount: number;
  oppDeckCount: number;
  topCards: {
    you?: { revealed: boolean; card?: Card };
    opponent?: { revealed: boolean; card?: Card };
  };
  // Optionally include reveal info for the round
  reveal?: { stat: StatName; winner: "P1" | "P2" | "tie" };
}

// Card shape
export interface Card {
  id: string;
  animal: string;
  stats: Record<StatName, number>;
}

// Game log event
export type RoundEvent =
  | { type: "join"; seat: "P1" | "P2"; name: string }
  | { type: "round"; stat: StatName; winner: "P1" | "P2" | "tie" };

// Messages from client → server
export type ClientToServer =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "chooseStat"; stat: StatName }
  | { type: "leave" }
  | { type: "requestRematch" };

// Messages from server → client
export type ServerToClient =
  | { type: "state"; view: RoomView; log: RoundEvent[] }
  | { type: "error"; code: string; message: string }
  | { type: "gameOver"; winner: "P1" | "P2"; summary: { rounds: number; durationSec: number } };
