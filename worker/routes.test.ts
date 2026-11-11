import { describe, expect, it } from 'vitest';
import { authorizeMcp, openSession, type Deps } from './routes';

const deps = (o: Partial<Deps> = {}): Deps => ({
  verifyTurnstile: async (t) => (t === 'pass' ? { success: true } : { success: false, codes: ['invalid-input-response'] }),
  limitSession: async () => true,
  createSession: async () => ({ session: 'S1', tabSecret: 'tab', token: 'S1.mcp' }),
  checkToken: async (t) => (t === 'S1.mcp' ? 'S1' : null),
  limitCalls: async () => true,
  ...o,
});
const post = (body: unknown) => new Request('http://localhost/session/new', { method: 'POST', body: JSON.stringify(body), headers: { 'CF-Connecting-IP': '1.2.3.4' } });
const mcp = (auth?: string) => new Request('http://localhost/mcp', { method: 'POST', headers: auth ? { Authorization: auth } : {} });

describe('openSession', () => {
  it('refuses a session without a passing Turnstile token', async () => {
    expect((await openSession(post({ turnstile: 'fail' }), deps())).status).toBe(403);
  });
  it("names Turnstile's reason when it refuses the token, so a bad secret shows up as one", async () => {
    const r = await openSession(post({ turnstile: 'fail' }), deps());
    expect(((await r.json()) as { error: string }).error).toContain('invalid-input-response');
  });
  it('refuses a session past the per-IP limit, before it checks Turnstile', async () => {
    let checked = false;
    const r = await openSession(post({ turnstile: 'pass' }), deps({ limitSession: async () => false, verifyTurnstile: async () => ({ success: (checked = true) }) }));
    expect([r.status, checked]).toEqual([429, false]);
  });
  it('opens a session and hands back the tab secret and the MCP token', async () => {
    const r = await openSession(post({ turnstile: 'pass' }), deps());
    expect(await r.json()).toEqual({ session: 'S1', tabSecret: 'tab', token: 'S1.mcp' });
  });
});

describe('authorizeMcp', () => {
  it('refuses a missing or wrong token with 401', async () => {
    expect(((await authorizeMcp(mcp(), deps())) as Response).status).toBe(401);
    expect(((await authorizeMcp(mcp('Bearer S1.wrong'), deps())) as Response).status).toBe(401);
  });
  it('refuses a token past its per-minute limit with 429', async () => {
    expect(((await authorizeMcp(mcp('Bearer S1.mcp'), deps({ limitCalls: async () => false }))) as Response).status).toBe(429);
  });
  it('lets a live token through to its own session', async () => {
    expect(await authorizeMcp(mcp('Bearer S1.mcp'), deps())).toEqual({ session: 'S1' });
  });
});
