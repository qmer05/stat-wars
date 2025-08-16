// apps/frontend/src/App.tsx
import { useEffect, useRef, useState } from "react";
import {
  STAT_NAMES,
  type RoomView,
  type ServerToClient,
  type ClientToServer,
} from "@stat-wars/shared";
import { wsUrl } from "./config";

const ROOM = "test-room"; // open two tabs with the same room to play vs yourself

export default function App() {
  const wsRef = useRef<WebSocket | null>(null);
  const [view, setView] = useState<RoomView | null>(null);
  const [log, setLog] = useState<unknown[]>([]);

  useEffect(() => {
    const url = wsUrl(`/ws/${ROOM}`);
    console.log("Connecting to:", url);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      console.log("Connected to server");
      send({ type: "join", name: "Player 1" });
    });

    ws.addEventListener("message", (evt) => {
      const msg: ServerToClient = JSON.parse(evt.data);
      console.log("Received:", msg);

      if (msg.type === "state") {
        setView(msg.view);
        setLog(msg.log);
      }
      if (msg.type === "gameOver") {
        alert(`Game Over! Winner: ${msg.winner}`);
      }
    });

    ws.addEventListener("close", () => {
      console.log("Disconnected from server");
    });

    ws.addEventListener("error", (err) => {
      console.error("WebSocket error:", err);
    });

    return () => {
      ws.close();
    };
  }, []);

  function send(msg: ClientToServer) {
    wsRef.current?.send(JSON.stringify(msg));
  }

  return (
    <div style={{ padding: "1rem" }}>
      <h1>Stat Wars</h1>

      {view ? (
        <>
          <p>Phase: {view.phase}</p>
          <p>Players: {JSON.stringify(view.players)}</p>
          <p>Your Deck: {view.yourDeckCount} cards</p>
          <p>Opponent Deck: {view.oppDeckCount} cards</p>

          <div style={{ marginTop: "1rem" }}>
            {view.phase === "READY" && (
              <button onClick={() => send({ type: "start" })}>
                Start Game
              </button>
            )}

            {view.phase === "CHOOSE" && view.turn === view.you && (
              <div>
                <h3>Choose a Stat:</h3>
                {STAT_NAMES.map((stat) => (
                  <button
                    key={stat}
                    style={{ margin: "0.25rem" }}
                    onClick={() => send({ type: "chooseStat", stat })}
                  >
                    {stat}
                  </button>
                ))}
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