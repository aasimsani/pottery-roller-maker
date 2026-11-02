// The bridge keeps the tab's WebSocket to its live Claude session, and answers each relayed call with a handler.

export type Handler = (params: never) => Promise<unknown>;
export interface Connection { session: string; tabSecret: string; token: string }
export type Status = 'connecting' | 'connected' | 'retrying' | 'ended';

const KEY = 'roller.mcp';

export function savedConnection(): Connection | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}
export function saveConnection(c: Connection | null): void {
  try { if (c) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

/** Opens a session after the Turnstile check passes. The Worker answers with the tab secret and Claude's token. */
export async function openSession(turnstile: string): Promise<Connection> {
  const r = await fetch(new URL('session/new', location.href), { method: 'POST', body: JSON.stringify({ turnstile }) });
  const body = await r.json().catch(() => ({ error: `The Worker answered ${r.status}. Is wrangler dev running?` }));
  if (!r.ok) throw new Error(body.error ?? `The Worker answered ${r.status}.`);
  return body as Connection;
}

export const mcpUrl = () => new URL('mcp', location.href).toString();
export const addCommand = (c: Connection) =>
  `claude mcp add --transport http pottery-roller ${mcpUrl()} --header "Authorization: Bearer ${c.token}"`;

// connect() keeps the socket open, retrying with a growing delay, until stop() runs or another tab takes the session over.
export function connect(c: Connection, handlers: Record<string, Handler>, onStatus: (s: Status, detail?: string) => void): () => void {
  let ws: WebSocket | null = null, stopped = false, delay = 1000;
  const open = () => {
    const url = new URL(`session/ws?session=${encodeURIComponent(c.session)}&secret=${encodeURIComponent(c.tabSecret)}`, location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    onStatus('connecting');
    const sock = new WebSocket(url);
    ws = sock;
    sock.onopen = () => { delay = 1000; onStatus('connected'); };
    sock.onmessage = async (e) => {
      const { id, method, params } = JSON.parse(String(e.data));
      try {
        const h = handlers[method];
        if (!h) throw new Error(`The tab doesn't know the call ${method}.`);
        sock.send(JSON.stringify({ id, result: await h((params ?? {}) as never) }));
      } catch (err) {
        sock.send(JSON.stringify({ id, error: { message: err instanceof Error ? err.message : String(err) } }));
      }
    };
    sock.onclose = (e) => {
      if (stopped) return;
      if (e.code === 4000) { onStatus('ended', 'Another tab took over this Claude session.'); return; }
      onStatus('retrying', delay > 8000 ? 'The session may have ended. Disconnect, then connect again.' : undefined);
      setTimeout(() => { if (!stopped) open(); }, delay);
      delay = Math.min(delay * 2, 30_000);
    };
  };
  open();
  return () => { stopped = true; ws?.close(); };
}
