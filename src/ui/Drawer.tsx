import { useRef, type ReactNode } from 'react';
import { useDialog } from './dialog';

/**
 * A panel that slides in from the right over the page. Focus moves into it and stays there while it
 * is open. Escape, the Close button, or a click on the dimmed page closes it.
 */
export function Drawer({ labelledBy, onClose, children }: { labelledBy: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, true, onClose);
  return (
    <div className="drawer-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
        <button className="secondary small drawer-close" onClick={onClose}>Close</button>
        {children}
      </div>
    </div>
  );
}
