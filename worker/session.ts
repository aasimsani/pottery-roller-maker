import { DurableObject } from 'cloudflare:workers';
import { Relay } from './relay';
import { hashSecret, sameHash } from './token';

// A session lasts a week from Connect Claude. Calls only work while its tab is connected, so closing the tab stops Claude.
const LIFETIME = 7 * 24 * 3600 * 1000;
// An upload link works once, for five minutes.
const TICKET_LIFETIME = 5 * 60 * 1000;
/** The largest message the tab may send, which fits two 1200 px previews. */
export const MAX_MESSAGE = 8 * 1024 * 1024;
const NO_TAB = 'No tab is connected to this session. Open the Pottery Roller Maker and press Connect Claude.';

interface Meta { tabHash: string; mcpHash: string; expires: number }

// Session is one live link between Claude and one tab. It keeps the tab's WebSocket with hibernation,
// and its Relay matches each reply to its call. It stores only hashes of the secrets.
export class Session extends DurableObject {
  private open = () => this.ctx.getWebSockets().find((w) => w.readyState === WebSocket.OPEN);
  private relay = new Relay((m) => {
    const ws = this.open();
    if (!ws) throw new Error(NO_TAB);
    ws.send(m);
  });

  async init(tabHash: string, mcpHash: string): Promise<void> {
    await this.ctx.storage.put('meta', { tabHash, mcpHash, expires: Date.now() + LIFETIME } satisfies Meta);
  }

  private async meta(): Promise<Meta | null> {
    const m = await this.ctx.storage.get<Meta>('meta');
    return m && m.expires > Date.now() ? m : null;
  }

  async verifyMcp(hash: string): Promise<boolean> {
    const m = await this.meta();
    return !!m && sameHash(m.mcpHash, hash);
  }

  async call(method: string, params: unknown): Promise<unknown> {
    if (!this.open()) throw new Error(NO_TAB);
    return this.relay.call(method, params);
  }

  async addTicket(hash: string): Promise<void> {
    await this.ctx.storage.put(`ticket:${hash}`, Date.now() + TICKET_LIFETIME);
  }

  /** Uses up an upload ticket. It returns false when the ticket is unknown, used or stale. */
  async useTicket(hash: string): Promise<boolean> {
    const until = await this.ctx.storage.get<number>(`ticket:${hash}`);
    await this.ctx.storage.delete(`ticket:${hash}`);
    return !!until && until > Date.now();
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket.', { status: 426 });
    const m = await this.meta(), secret = new URL(request.url).searchParams.get('secret') ?? '';
    if (!m || !sameHash(m.tabHash, await hashSecret(secret))) return new Response('This session has ended. Press Connect Claude again.', { status: 410 });
    // A second tab takes the session over, so calls always reach exactly one tab.
    for (const old of this.ctx.getWebSockets()) old.close(4000, 'A newer tab took over this session.');
    this.relay.close('A newer tab took over this session. Call the tool again.');
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === 'string' && message.length <= MAX_MESSAGE) this.relay.receive(message);
  }

  webSocketClose(): void {
    if (!this.open()) this.relay.close();
  }
}
