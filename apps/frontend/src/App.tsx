import { useEffect, useRef, useState } from "react";
import { wsUrl } from "./config";
import type { ServerToClient } from "@stat-wars/shared";

export default function App() {
  const [roomCode, setRoomCode] = useState("TEST");
  const [name, setName] = useState("Player");
  const [log, setLog] = useState<string[]>([]);
  // Define the shape of the view object based on expected server response
  type ViewState = {
    phase: string;
    turn?: "P1" | "P2" | null;
    [key: string]: unknown;
  } | null;

  const [view, setView] = useState<ViewState>(null);

  const socketRef = useRef<WebSocket | null>(null);

  const connect = () => {
    socketRef.current?.close();

    const url = wsUrl(`/ws/${roomCode}`);
    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.onopen = () => append(`[open] ${url}`);

    ws.onmessage = (evt) => {
      const raw = typeof evt.data === "string" ? evt.data : "(binary)";
      try {
        const msg = JSON.parse(raw) as ServerToClient;
        if (msg.type === "state") {
          setView(msg.view);
          append(`[state] phase=${msg.view.phase} turn=${msg.view.turn ?? "-"}`);
        } else if (msg.type === "error") {
          append(`[error] ${msg.code}: ${msg.message}`);
        } else if (msg.type === "gameOver") {
          append(`[gameOver] winner=${msg.winner}`);
        } else {
          append(`[msg] ${raw}`);
        }
      } catch {
        append(`[msg] ${raw}`);
      }
    };

    ws.onclose = () => append("[close]");
    ws.onerror = () => append("[error]");
  };

  const append = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l]);

  const sendJson = (obj: unknown) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(obj));
  };

  const join = () => sendJson({ type: "join", name });
  const start = () => sendJson({ type: "start" });

  useEffect(() => () => socketRef.current?.close(), []);

  return (
    <main style={{ padding: 24, maxWidth: 820, margin: "0 auto" }}>
      <h1>Stat Wars</h1>

      <section style={{ marginTop: 16 }}>
        <h2>Connect</h2>
        <input
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          placeholder="ROOM"
        />
        <button style={{ marginLeft: 8 }} onClick={connect}>Connect</button>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2>Lobby</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
        <button style={{ marginLeft: 8 }} onClick={join}>Join</button>
        <button style={{ marginLeft: 8 }} onClick={start}>Start</button>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Current View</h3>
        <pre style={{ background: "#222", color: "#eee", padding: 12, minHeight: 120 }}>
{JSON.stringify(view, null, 2)}
        </pre>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Log</h3>
        <pre style={{ background: "#111", color: "#0f0", padding: 12, minHeight: 160 }}>
{log.join("\n")}
        </pre>
      </section>
    </main>
  );
}