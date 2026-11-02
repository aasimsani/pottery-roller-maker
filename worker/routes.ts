// The Worker's routes, with everything they reach outside the request passed in. That keeps the
// abuse checks testable in Node, and worker/index.ts wires the real Turnstile, limits and Session objects.

export interface Deps {
  verifyTurnstile(token: string, ip: string): Promise<boolean>;
  /** Each limit returns true while the caller is still under it. */
  limitSession(ip: string): Promise<boolean>;
  createSession(): Promise<{ session: string; tabSecret: string; token: string }>;
  /** Returns the token's session id, or null when the token doesn't verify. */
  checkToken(token: string): Promise<string | null>;
  limitCalls(session: string): Promise<boolean>;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// openSession() checks the per-IP limit first, so a flood never spends Turnstile verifications.
export async function openSession(req: Request, d: Deps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const ip = req.headers.get('CF-Connecting-IP') ?? 'local';
  if (!(await d.limitSession(ip))) return json({ error: 'Too many sessions from this address. Wait a minute, then try again.' }, 429);
  const body = (await req.json().catch(() => ({}))) as { turnstile?: unknown };
  if (!(await d.verifyTurnstile(String(body.turnstile ?? ''), ip))) return json({ error: 'The person check failed. Reload the page and try again.' }, 403);
  return json(await d.createSession());
}

export async function authorizeMcp(req: Request, d: Deps): Promise<{ session: string } | Response> {
  const m = /^Bearer\s+(\S+)$/.exec(req.headers.get('Authorization') ?? '');
  const session = m ? await d.checkToken(m[1]) : null;
  if (!session) return json({ error: 'Open the Pottery Roller Maker, press Connect Claude, and add the server with the command it shows.' }, 401);
  if (!(await d.limitCalls(session))) return json({ error: 'Too many calls this minute. Wait a moment, then try again.' }, 429);
  return { session };
}
