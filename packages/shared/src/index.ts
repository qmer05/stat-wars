// Types for game stats
export type StatName = "speed" | "kg" | "intelligence" | "lifespan";
export const STAT_NAMES: StatName[] = ["speed", "kg", "intelligence", "lifespan"];

// Room phases
export type RoomPhase = "WAITING" | "READY" | "CHOOSE" | "REVEAL" | "GAME_OVER";

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
  stats: {
    speed: number;        // km/h
    kg: number;           // adult mass in kg
    intelligence: number; // Encephalization Quotient (EQ)
    lifespan: number;     // avg lifespan in wild (years)
  };
}

// Game log event
export type RoundEvent =
  | { type: "join"; seat: "P1" | "P2"; name: string }
  | { type: "round"; stat: StatName; winner: "P1" | "P2" | "tie" };

// Messages from client → server
export type ClientToServer =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "next" }
  | { type: "chooseStat"; stat: StatName }
  | { type: "leave" }
  | { type: "requestRematch" };

// Messages from server → client
export type ServerToClient =
  | { type: "state"; view: RoomView; log: RoundEvent[] }
  | { type: "error"; code: string; message: string }
  | { type: "gameOver"; winner: "P1" | "P2"; summary: { rounds: number; durationSec: number } };

// The animal cards
export const CARD_POOL: Card[] = [
  {
    id: "lion",
    animal: "Lion",
    stats: { speed: 80, kg: 190, intelligence: 1.0, lifespan: 12 },
  },
  {
    id: "cheetah",
    animal: "Cheetah",
    stats: { speed: 120, kg: 72, intelligence: 0.5, lifespan: 10 },
  },
  {
    id: "elephant",
    animal: "Elephant",
    stats: { speed: 40, kg: 6000, intelligence: 1.8, lifespan: 65 },
  },
  {
    id: "wolf",
    animal: "Wolf",
    stats: { speed: 65, kg: 45, intelligence: 1.6, lifespan: 10 },
  },
  {
    id: "dolphin",
    animal: "Dolphin",
    stats: { speed: 55, kg: 150, intelligence: 5.3, lifespan: 35 },
  },
  {
    id: "gorilla",
    animal: "Gorilla",
    stats: { speed: 40, kg: 160, intelligence: 1.5, lifespan: 37 },
  },
  {
    id: "rhino",
    animal: "Rhino",
    stats: { speed: 50, kg: 2300, intelligence: 0.7, lifespan: 45 },
  },
  {
    id: "eagle",
    animal: "Eagle",
    stats: { speed: 160, kg: 6, intelligence: 0.7, lifespan: 18 },
  },
];