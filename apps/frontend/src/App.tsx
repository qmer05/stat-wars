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
import "./App.css";

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
    <div className="page">
      <header className="topbar">
        <div className="branding">
          <div className="logo-dot" />
          <h1 className="title">Stat Wars</h1>
        </div>
        <div className="meta">
          <span className={`pill ${status}`}>Status: {status}</span>
          <span className="pill alt">Room: {room}</span>
          <span className="pill alt">Name: {name}</span>
        </div>
      </header>

      {!view && <p className="muted">Connecting…</p>}

      {view && (
        <>
          <section className="summary">
            <div className="summary-item">
              <span className="label">Phase</span>
              <span className="value">{view.phase}</span>
            </div>
            <div className="summary-item">
              <span className="label">Players</span>
              <span className="value">
                {view.players.P1 ?? "?"} vs {view.players.P2 ?? "?"}
              </span>
            </div>
            <div className="summary-item">
              <span className="label">Your Deck</span>
              <span className="value">{view.yourDeckCount}</span>
            </div>
            <div className="summary-item">
              <span className="label">Opponent Deck</span>
              <span className="value">{view.oppDeckCount}</span>
            </div>
          </section>

          <section className="controls">
            {view.phase === "READY" && (
              <button className="primary" onClick={() => send({ type: "start" })}>
                Start Game
              </button>
            )}
            {view.phase === "GAME_OVER" && (
              <button className="primary" onClick={() => send({ type: "requestRematch" })}>
                Rematch
              </button>
            )}
          </section>

          {view.phase === "CHOOSE" && (
            <section className="game-area">
              {/* Your card */}
              <article className="card-box you">
                <h3 className="card-title">
                  Your Card
                  <span className="animal">
                    {view.topCards.you?.card?.animal ?? "—"}
                  </span>
                </h3>

                <ul className="stats">
                  {view.topCards.you?.card &&
                    "stats" in view.topCards.you.card &&
                    Object.entries(
                      (view.topCards.you.card as { animal: string; stats: Record<string, number> })
                        .stats
                    ).map(([stat, value]) => {
                      const isRevealed = !!view?.reveal && view.reveal.stat === stat;
                      const outcome =
                        !isRevealed
                          ? ""
                          : view.reveal!.winner === view.you
                          ? "win"
                          : view.reveal!.winner === "tie"
                          ? "tie"
                          : "lose";

                      return (
                        <li key={stat} className={`stat-row ${isRevealed ? outcome : ""}`}>
                          {view.turn === view.you && !view?.reveal ? (
                            <button
                              className="stat-button"
                              onClick={() => send({ type: "chooseStat", stat: stat as any })}
                            >
                              <span className="stat-name">{stat}</span>
                              <span className="stat-value">{String(value)}</span>
                            </button>
                          ) : (
                            <div className="stat-label">
                              <span className="stat-name">{stat}</span>
                              <span className="stat-value">{String(value)}</span>
                            </div>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </article>

              {/* Opponent card */}
              <article className="card-box opponent">
                <h3 className="card-title">
                  Opponent Card
                  <span className="animal">
                    {view.topCards.opponent?.card?.animal ?? "—"}
                  </span>
                </h3>

                <ul className="stats">
                  {view.topCards.opponent?.card &&
                    Object.entries(view.topCards.opponent.card.stats).map(([stat, value]) => {
                      const isRevealed = !!view?.reveal && view.reveal.stat === stat;
                      const outcome =
                        !isRevealed
                          ? ""
                          : view.reveal!.winner !== view.you
                          ? view.reveal!.winner === "tie"
                            ? "tie"
                            : "win"
                          : "lose";

                      return (
                        <li key={stat} className={`stat-row ${isRevealed ? outcome : ""}`}>
                          <div className="stat-label">
                            <span className="stat-name">{stat}</span>
                            <span className="stat-value">{String(value)}</span>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </article>
            </section>
          )}

          <section className="log-section">
            <h2 className="h2">Game Log</h2>
            <div className="log-box">
              {JSON.stringify(log, null, 2)}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
