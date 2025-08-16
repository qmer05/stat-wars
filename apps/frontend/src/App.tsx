import { wsUrl } from "./config";
import "./App.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  STAT_NAMES,
  type ServerToClient,
  type ClientToServer,
  RoundEvent,
} from "@stat-wars/shared";

const STAT_LABELS: Record<string, string> = {
  speed: "Speed (km/h)",
  kg: "Weight (kg)",
  intelligence: "Intelligence (EQ)",
  lifespan: "Lifespan (years)",
};

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

function useRoom() {
  return useMemo(() => {
    const u = new URL(window.location.href);
    return (u.searchParams.get("room") || "test-room").toLowerCase();
  }, []);
}

export default function App() {
  const room = useRoom();
  const [name, setName] = useState<string>("");
  const [nameInput, setNameInput] = useState<string>("");
  const [nameSet, setNameSet] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [view, setView] = useState<RoomView | null>(null);
  const [log, setLog] = useState<RoundEvent[]>([]);
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "closed">("idle");

  useEffect(() => {
    if (!nameSet) return;
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
  }, [room, name, nameSet]);

  function send(msg: ClientToServer) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }

  // Name input form
  if (!nameSet) {
    return (
      <div className="page">
        <header className="topbar">
          <div className="branding">
            <div className="logo-dot" />
            <h1 className="title">Stat Wars</h1>
          </div>
        </header>
        <main style={{ margin: "2rem auto", maxWidth: 400, textAlign: "center" }}>
          <h2>Enter your name to join</h2>
          <form
            onSubmit={e => {
              e.preventDefault();
              if (nameInput.trim()) {
                setName(nameInput.trim());
                setNameSet(true);
                localStorage.setItem("sw_name", nameInput.trim());
              }
            }}
          >
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder="Your name"
              style={{ fontSize: 20, padding: "0.5rem 1rem", borderRadius: 8, border: "1px solid #ccc", marginBottom: 16 }}
              autoFocus
            />
            <br />
            <button className="primary" type="submit" style={{ fontSize: 20, marginTop: 12 }}>
              Join Game
            </button>
          </form>
        </main>
      </div>
    );
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

          {(view.phase === "CHOOSE" || view.phase === "REVEAL") && (
            <section className="game-area">
              {/* Your card */}

              <article className="card-box you">
                <h3 className="card-title">
                  Your Card
                  <span className="animal">
                    {view.topCards.you?.card?.animal ?? "—"}
                  </span>
                </h3>
                {view.topCards.you?.card?.id && (
                  <img
                    src={`/animals/${view.topCards.you.card.id}.png`}
                    alt={view.topCards.you.card.animal}
                    className="animal-img"
                    style={{ width: "120px", height: "auto", marginBottom: "1rem" }}
                  />
                )}

                <ul className="stats">
                  {view.topCards.you?.card &&
                    Object.entries(view.topCards.you.card.stats).map(([stat, value]) => {
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
                          {view.phase === "CHOOSE" && view.turn === view.you && !view?.reveal ? (
                            <button
                              className="stat-button"
                              onClick={() => send({ type: "chooseStat", stat: stat as any })}
                            >
                              <span className="stat-name">{STAT_LABELS[stat] ?? stat}</span>
                              <span className="stat-value">{String(value)}</span>
                            </button>
                          ) : (
                            <div className="stat-label">
                              <span className="stat-name">{STAT_LABELS[stat] ?? stat}</span>
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
                {view.topCards.opponent?.card?.id && (
                  <img
                    src={`/animals/${view.topCards.opponent.card.id}.png`}
                    alt={view.topCards.opponent.card.animal}
                    className="animal-img"
                    style={{ width: "120px", height: "auto", marginBottom: "1rem" }}
                  />
                )}

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
                            <span className="stat-name">{STAT_LABELS[stat] ?? stat}</span>
                            <span className="stat-value">{String(value)}</span>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </article>
            </section>
          )}

          {/* Next button for REVEAL phase */}
          {view.phase === "REVEAL" && (
            <section className="controls">
              <button className="primary" onClick={() => send({ type: "next" })}>
                Next
              </button>
            </section>
          )}

          <section className="log-section">
            <h2 className="h2">Game Log</h2>
            <div className="log-box">
              {log.length === 0 && <div className="muted">No events yet.</div>}
              <ul style={{ paddingLeft: 0, margin: 0, listStyle: "none" }}>
                {log.map((event, i) => {
                  if (event.type === "join") {
                    return (
                      <li key={i}>
                        <strong>{event.name}</strong> joined as <strong>{event.seat}</strong>
                      </li>
                    );
                  }
                  if (event.type === "round") {
                    return (
                      <li key={i}>
                        <span>
                          <strong>Round:</strong> Stat <strong>{event.stat}</strong> &rarr; Winner:{" "}
                          <strong>
                            {event.winner === "tie"
                              ? "Tie"
                              : event.winner === "P1"
                                ? (view?.players.P1 ?? "P1")
                                : (view?.players.P2 ?? "P2")}
                          </strong>
                        </span>
                      </li>
                    );
                  }
                  return null;
                })}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
