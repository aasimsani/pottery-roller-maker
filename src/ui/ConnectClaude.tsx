import { useEffect, useRef, useState } from 'react';
import { addCommand, connect, openSession, saveConnection, savedConnection, type Connection, type Handler, type Status } from '../mcp/bridge';

// Cloudflare's documented test key always passes. Set VITE_TURNSTILE_SITE_KEY to the real key for the live site.
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA';

declare global { interface Window { turnstile?: { render(el: HTMLElement, o: { sitekey: string; callback(token: string): void }): string } } }

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.onload = () => ok(); s.onerror = () => fail(new Error('The person check didn\'t load. Check your connection.'));
    document.head.appendChild(s);
  });
}

const LABEL: Record<Status, string> = { connecting: 'Connecting…', connected: 'Claude can edit this design', retrying: 'Reconnecting…', ended: 'Claude session ended' };

/** The Connect Claude button, its person check, and the live session's status. */
export function ConnectClaude({ handlers }: { handlers: Record<string, Handler> }) {
  const [conn, setConn] = useState<Connection | null>(savedConnection);
  const [status, setStatus] = useState<Status | null>(null), [detail, setDetail] = useState('');
  const [open, setOpen] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState(false);
  const widget = useRef<HTMLDivElement>(null);
  // The socket reads the latest handlers through a ref, so a re-render never drops the connection.
  const live = useRef(handlers);
  live.current = handlers;

  useEffect(() => {
    if (!conn) { setStatus(null); return; }
    const proxied = Object.fromEntries(Object.keys(live.current).map((k) => [k, ((p: never) => live.current[k](p)) as Handler]));
    return connect(conn, proxied, (st, d) => { setStatus(st); setDetail(d ?? ''); });
  }, [conn]);

  useEffect(() => {
    if (!open || conn || !widget.current) return;
    let cancelled = false;
    loadTurnstile().then(() => {
      if (cancelled || !widget.current) return;
      window.turnstile!.render(widget.current, {
        sitekey: SITE_KEY,
        callback: (token) => openSession(token).then((c) => { saveConnection(c); setConn(c); setError(''); }).catch((e) => setError(e.message)),
      });
    }).catch((e) => setError(e.message));
    return () => { cancelled = true; };
  }, [open, conn]);

  const disconnect = () => { saveConnection(null); setConn(null); setOpen(false); };

  return (
    <div className="claude">
      {conn ? (
        <>
          <span className={`claude-status ${status === 'connected' ? 'ok' : 'caution'}`} role="status">{status ? LABEL[status] : ''}</span>
          <button className="secondary small" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Setup'}</button>
          <button className="secondary small" onClick={disconnect}>Disconnect</button>
        </>
      ) : (
        <button className="secondary small" onClick={() => setOpen((o) => !o)}>Connect Claude</button>
      )}
      {open && (
        <div className="claude-panel">
          {!conn && <><p className="hint">Prove you're a person, and the tab opens a live session for Claude.</p><div ref={widget} /></>}
          {conn && (
            <>
              <p className="hint">Run this once in your terminal. Claude can then see and change this design while this tab stays open.</p>
              <pre className="claude-cmd">{addCommand(conn)}</pre>
              <div className="row-actions">
                <button className="small" onClick={() => navigator.clipboard.writeText(addCommand(conn)).then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy command'}</button>
              </div>
              {detail && <p className="hint caution">{detail}</p>}
            </>
          )}
          {error && <p className="warn">{error}</p>}
        </div>
      )}
    </div>
  );
}
