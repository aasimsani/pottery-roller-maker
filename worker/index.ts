import { createMcpHandler } from 'agents/mcp/server';
import { Session } from './session';
import { authorizeMcp, json, openSession, type Deps } from './routes';
import { buildServer } from './server';
import { hashSecret, newSecret, newSessionId, parseToken } from './token';

export { Session };

// Cloudflare serves the app at aasimsani.net/projects/pottery-roller-maker/, but the build keeps its files at the
// root of dist/ so that it still runs from any static host. The Worker strips the prefix before it routes.
const PREFIX = '/projects/pottery-roller-maker';
const MAX_UPLOAD = 8 * 1024 * 1024;

interface Env {
  ASSETS: Fetcher;
  SESSIONS: DurableObjectNamespace<Session>;
  SESSION_RATE?: RateLimit;
  CALL_RATE?: RateLimit;
  TURNSTILE_SECRET: string;
}

const stub = (env: Env, session: string) => env.SESSIONS.get(env.SESSIONS.idFromName(session));

function deps(env: Env): Deps {
  return {
    async verifyTurnstile(token, ip) {
      const body = new FormData();
      body.set('secret', env.TURNSTILE_SECRET); body.set('response', token); body.set('remoteip', ip);
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
      const v = (await r.json()) as { success?: boolean; 'error-codes'?: string[] };
      return { success: v.success === true, codes: v['error-codes'] };
    },
    limitSession: async (ip) => !env.SESSION_RATE || (await env.SESSION_RATE.limit({ key: ip })).success,
    async createSession() {
      const session = newSessionId(), tabSecret = newSecret(), mcpSecret = newSecret();
      await stub(env, session).init(await hashSecret(tabSecret), await hashSecret(mcpSecret));
      return { session, tabSecret, token: `${session}.${mcpSecret}` };
    },
    async checkToken(token) {
      const t = parseToken(token);
      return t && (await stub(env, t.session).verifyMcp(await hashSecret(t.secret))) ? t.session : null;
    },
    limitCalls: async (session) => !env.CALL_RATE || (await env.CALL_RATE.limit({ key: session })).success,
  };
}

// upload() takes one local image through a one-time ticket and adds it to the tab as a layer.
async function upload(req: Request, env: Env, url: URL): Promise<Response> {
  const t = parseToken(url.searchParams.get('ticket') ?? '');
  if (req.method !== 'POST' || !t || !(await stub(env, t.session).useTicket(await hashSecret(t.secret))))
    return json({ error: 'This upload link is used up or has expired. Call image_upload_url for a new one.' }, 403);
  const type = req.headers.get('Content-Type') ?? '';
  if (!type.startsWith('image/')) return json({ error: 'Send an image, with a Content-Type such as image/png.' }, 415);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > MAX_UPLOAD) return json({ error: 'The image is over 8 MB. Make it smaller first.' }, 413);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const name = url.searchParams.get('name') ?? 'Image';
  try {
    return json(await stub(env, t.session).call('apply', { ops: [{ op: 'addImage', url: `data:${type};base64,${btoa(bin)}`, name }], view: false }));
  } catch (e) {
    // The tab may have closed since the link was made, so the error says what to do rather than failing with a bare 500.
    return json({ error: e instanceof Error ? e.message : String(e) }, 409);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // The build uses relative asset paths, which only resolve under the prefix when the URL ends in a slash.
    if (url.pathname === PREFIX) return Response.redirect(`${url.origin}${PREFIX}/`, 301);
    if (url.pathname.startsWith(`${PREFIX}/`)) url.pathname = url.pathname.slice(PREFIX.length);
    const req = new Request(url, request), d = deps(env);

    if (url.pathname === '/session/new') return openSession(req, d);
    if (url.pathname === '/session/ws') return stub(env, url.searchParams.get('session') ?? '-').fetch(req);
    if (url.pathname === '/mcp/upload') return upload(req, env, url);
    if (url.pathname === '/mcp') {
      const auth = await authorizeMcp(req, d);
      if (auth instanceof Response) return auth;
      const s = stub(env, auth.session);
      const mintUploadUrl = async () => {
        const secret = newSecret();
        await s.addTicket(await hashSecret(secret));
        return `${url.origin}${request.url.includes(PREFIX) ? PREFIX : ''}/mcp/upload?ticket=${auth.session}.${secret}`;
      };
      return createMcpHandler(() => buildServer((m, p) => s.call(m, p), mintUploadUrl), {
        route: '/mcp', allowedHostnames: ['localhost', '127.0.0.1', 'aasimsani.net'],
      })(req, env, ctx);
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
