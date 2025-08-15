// For local dev, set your Worker base URL here or via .env.local
// Vite env var example: VITE_API_BASE=http://127.0.0.1:8787
export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8787";

export const wsUrl = (path: string) => {
  const base = new URL(API_BASE);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = path.startsWith("/") ? path : `/${path}`;
  return base.toString();
};