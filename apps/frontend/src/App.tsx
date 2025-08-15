export default function App() {
  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1>Stat Wars</h1>
      <p>Online, turn-based animal stat battle.</p>

      <section style={{ marginTop: 24 }}>
        <h2>Create / Join</h2>
        <p>(We’ll wire this to the backend later.)</p>
        <button disabled>Create Room</button>
        <div style={{ marginTop: 12 }}>
          <input placeholder="Enter room code" />
          <button disabled style={{ marginLeft: 8 }}>Join</button>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Game Table</h2>
        <p>Two decks face-down. Current top cards appear here.</p>
      </section>
    </main>
  );
}
