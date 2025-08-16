// apps/frontend/src/config.ts

// Use an env var in dev if you like: VITE_API_BASE=http://127.0.0.1:8787
export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8787";

// Helper to derive ws:// or wss:// from API_BASE
export const wsUrl = (path: string) => {
  const wsBase = API_BASE.replace(/^http/i, "ws");
  return `${wsBase}${path}`;
};