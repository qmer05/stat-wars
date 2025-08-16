import { useEffect, useMemo, useRef, useState } from "react";
import {
  STAT_NAMES,
  type ServerToClient,
  type ClientToServer,
} from "@stat-wars/shared";

// Redefine RoomView locally to include reveal field for type safety
import type { StatName, Card } from "@stat-wars/shared";
type RoomView = {
  phase: string;
  you: "P1" | "P2";
  players: { P1?: string; P2?: string };
  turn: "P1" | "P2" | null;
  yourDeckCount: number;
  oppDeckCount: number;
  topCards: {
    you?: { revealed: boolean; card?: Card };
    opponent?: { revealed: boolean; card?: Card };
  };
  reveal?: { stat: StatName; winner: "P1" | "P2" | "tie" };
};
import { wsUrl } from "./config";

function useRoomAndName() {
  return useMemo(() => {
    const u = new URL(window.location.href);
    const room = (u.searchParams.get("room") || "test-room").toLowerCase();
    const stored = localStorage.getItem("sw_name");
    const name =
      u.searchParams.get("name") ||
      stored ||
      `Player-${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem("sw_name", name);
    return { room, name };
  }, []);
}

export default function App() {
  const { room, name } = useRoomAndName();
  const wsRef = useRef<WebSocket | null>(null);
  const [view, setView] = useState<RoomView | null>(null);
  const [log, setLog] = useState<unknown[]>([]);
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "closed">("idle");

  useEffect(() => {
    setStatus("connecting");
    const url = wsUrl(`/ws/${room}`);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      setStatus("open");
      send({ type: "join", name });
    });

    ws.addEventListener("message", (evt) => {
      const msg: ServerToClient = JSON.parse(evt.data);
      if (msg.type === "state") {
        setView(msg.view);
        setLog(msg.log);
      } else if (msg.type === "gameOver") {
        alert(`Game Over! Winner: ${msg.winner}`);
      } else if (msg.type === "error") {
        console.warn("Server error:", msg.code, msg.message);
      }
    });

    ws.addEventListener("close", () => setStatus("closed"));
    ws.addEventListener("error", () => setStatus("closed"));

    return () => ws.close();
  }, [room, name]);

  function send(msg: ClientToServer) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }

  return (
    <div style={{ padding: "1rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>Stat Wars</h1>
      <p>
        <b>Status:</b> {status} | <b>Room:</b> {room} | <b>Name:</b> {name}
      </p>

      {view ? (
        <>
          <p>Phase: {view.phase}</p>
          <p>Players: {JSON.stringify(view.players)}</p>
          <p>Your Deck: {view.yourDeckCount} cards</p>
          <p>Opponent Deck: {view.oppDeckCount} cards</p>

          <div style={{ marginTop: "1rem" }}>
            {view.phase === "READY" && (
              <button onClick={() => send({ type: "start" })}>Start Game</button>
            )}

            {view.phase === "CHOOSE" && (
              <div style={{ display: "flex", gap: 32 }}>
                {/* Your card */}
                <div style={{ flex: 1 }}>
                  <h3>Your Card: {view.topCards.you?.card?.animal}</h3>
                  <ul>
                    {view.topCards.you?.card && "stats" in view.topCards.you.card &&
                      Object.entries((view.topCards.you.card as { animal: string; stats: Record<string, number> }).stats).map(([stat, value]) => (
                        <li key={stat}>
                          {view.turn === view.you && !view?.reveal ? (
                            <button
                              onClick={() => send({ type: "chooseStat", stat: stat as any })}
                              style={{ margin: "0.25rem" }}
                            >
                              {stat}: {String(value)}
                            </button>
                          ) : (
                            <span
                              style={
                                view?.reveal && view.reveal.stat === stat
                                  ? {
                                    fontWeight: "bold",
                                    color:
                                      view.reveal.winner === view.you
                                        ? "green"
                                        : view.reveal.winner === "tie"
                                          ? "orange"
                                          : "red",
                                  }
                                  : {}
                              }
                            >
                              {stat}: {String(value)}
                            </span>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>

                {/* Opponent card */}
                <div style={{ flex: 1 }}>
                  <h3>Opponent Card: {view.topCards.opponent?.card?.animal}</h3>
                  <ul>
                    {view.topCards.opponent?.card &&
                      Object.entries(view.topCards.opponent.card.stats).map(([stat, value]) => (
                        <li key={stat}>
                          <span
                            style={
                              view.reveal && view.reveal.stat === stat
                                ? {
                                  fontWeight: "bold",
                                  color:
                                    view.reveal.winner !== view.you
                                      ? view.reveal.winner === "tie"
                                        ? "orange"
                                        : "green"
                                      : "red",
                                }
                                : {}
                            }
                          >
                            {stat}: {String(value)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            )}

            {view.phase === "GAME_OVER" && (
              <button onClick={() => send({ type: "requestRematch" })}>
                Rematch
              </button>
            )}
          </div>

          <h2 style={{ marginTop: "2rem" }}>Game Log</h2>
          <pre
            style={{
              background: "#f5f5f5",
              padding: "0.5rem",
              borderRadius: "4px",
              maxHeight: "200px",
              overflow: "auto",
            }}
          >
            {JSON.stringify(log, null, 2)}
          </pre>
        </>
      ) : (
        <p>Connecting...</p>
      )}
    </div>
  );
}