export type RoomPhase = "WAITING" | "READY" | "CHOOSE" | "GAME_OVER";

export interface RoomView {
  phase: RoomPhase;
  you: "P1" | "P2";
  players: { P1?: string; P2?: string };
  turn: "P1" | "P2" | null;
  yourDeckCount: number;
  oppDeckCount: number;
  topCards: {
    you?: { revealed: boolean; card?: { animal: string } };
    opponent?: { revealed: boolean };
  };
}