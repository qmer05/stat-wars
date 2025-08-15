// Basic stat names you’ll support
export type StatName = "speed" | "strength" | "size" | "intelligence";

// A single card
export type Card = {
  id: string;
  animal: string;
  stats: Record<StatName, number>;
};

// Public view the server can safely send to a client
export type PublicTopCard = {
  // only reveal opponent card after a round resolves
  revealed: boolean;
  card?: {
    animal: string;
    stats?: Partial<Record<StatName, number>>;
  };
};

// Room & turn info that’s safe for the client
export type RoomView = {
  you: "P1" | "P2";
  players: { P1?: string; P2?: string };
  turn: "P1" | "P2" | null;
  yourDeckCount: number;
  oppDeckCount: number;
  topCards: { you?: PublicTopCard; opponent?: PublicTopCard };
  phase: "WAITING" | "READY" | "CHOOSE" | "RESOLVE" | "GAME_OVER";
};

// WS message shapes
export type ClientToServer =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "chooseStat"; stat: StatName }
  | { type: "requestRematch" }
  | { type: "leave" };

export type RoundEvent =
  | { type: "round"; stat: StatName; winner: "P1" | "P2" | "tie" }
  | { type: "join"; seat: "P1" | "P2"; name: string };

export type ServerToClient =
  | { type: "state"; view: RoomView; log: RoundEvent[] }
  | { type: "error"; code: string; message: string }
  | { type: "gameOver"; winner: "P1" | "P2"; summary: { rounds: number; durationSec: number } };
