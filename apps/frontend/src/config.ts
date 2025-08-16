// For local dev, set your Worker base URL here or via .env.local
// Example .env.local: VITE_API_BASE=http://127.0.0.1:8787
export const API_BASE =
  import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8787";

export function wsUrl(path: string) {
  // Build ws://... from http://... base
  const u = new URL(path, API_BASE);
  u.protocol = u.protocol.replace("http", "ws");
  return u.toString();
}