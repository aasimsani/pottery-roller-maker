import { describe, expect, it, vi } from 'vitest';
import { Relay } from './relay';

describe('Relay', () => {
  it('matches each reply to its own request', async () => {
    const sent: string[] = [], r = new Relay((m) => sent.push(m), 1000);
    const a = r.call('getState', {}), b = r.call('view', { which: 'flat' });
    const [ma, mb] = sent.map((m) => JSON.parse(m));
    r.receive(JSON.stringify({ id: mb.id, result: 'B' }));
    r.receive(JSON.stringify({ id: ma.id, result: 'A' }));
    await expect(a).resolves.toBe('A');
    await expect(b).resolves.toBe('B');
  });
  it('turns a tab error into a rejected call', async () => {
    const sent: string[] = [], r = new Relay((m) => sent.push(m), 1000);
    const p = r.call('updateSettings', {});
    r.receive(JSON.stringify({ id: JSON.parse(sent[0]).id, error: { message: 'Unknown setting: dept' } }));
    await expect(p).rejects.toThrow('Unknown setting: dept');
  });
  it('times out when the tab never answers', async () => {
    vi.useFakeTimers();
    const r = new Relay(() => {}, 500), p = r.call('getState', {});
    vi.advanceTimersByTime(501);
    await expect(p).rejects.toThrow(/didn't answer/);
    vi.useRealTimers();
  });
  it('fails every pending call when the tab goes away', async () => {
    const r = new Relay(() => {}, 1000), p = r.call('getState', {});
    r.close();
    await expect(p).rejects.toThrow(/closed/);
  });
});
