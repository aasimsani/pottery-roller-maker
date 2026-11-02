// Relay carries tool calls from the Worker to the tab over one WebSocket and matches each reply to its call by id.
// It holds no socket itself. The Session object hands it a send function and passes every message it receives.
export class Relay {
  private next = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(private send: (message: string) => void, private timeoutMs = 25_000) {}

  call(method: string, params: unknown): Promise<unknown> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`The tab didn't answer ${method} within ${Math.round(this.timeoutMs / 1000)} s. It may still be rebuilding, so call get_state again.`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send(JSON.stringify({ id, method, params })); } catch (e) {
        clearTimeout(timer); this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  receive(raw: string): void {
    let m: { id?: number; result?: unknown; error?: { message?: string } };
    try { m = JSON.parse(raw); } catch { return; }
    const p = m.id === undefined ? undefined : this.pending.get(m.id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(m.id!);
    if (m.error) p.reject(new Error(m.error.message ?? 'The tab reported an error.'));
    else p.resolve(m.result);
  }

  close(reason = 'The tab closed its Claude session. Open the app and press Connect Claude again.'): void {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(reason)); }
    this.pending.clear();
  }
}
