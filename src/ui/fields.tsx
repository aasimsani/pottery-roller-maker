import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { clampTo, parseNumber, stepBy } from './number';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset><legend>{title}</legend>{children}</fieldset>;
}

interface NumberProps {
  label: string; unit: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}

/**
 * A number input that shows its unit inside the field, with − and + buttons beside it. The field
 * keeps the text you type until you leave it, so a half-typed value such as "1" on the way to "15"
 * is never snapped to the minimum. The arrow keys step the value: Shift moves 10 steps, and Alt
 * moves a tenth of a step. Escape puts back the value from before you started typing.
 */
export function NumberField({ label, unit, value, onChange, min, max, step = 1 }: NumberProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = Number.isFinite(value) ? String(value) : '';
  const nudge = (count: number, fine = false) => { setDraft(null); onChange(stepBy(value, fine ? step / 10 : step, count, min, max)); };
  const commit = () => {
    const v = draft === null ? null : parseNumber(draft);
    if (v !== null) onChange(clampTo(v, min, max));
    setDraft(null);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      nudge((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1), e.altKey);
    } else if (e.key === 'Enter') commit();
    else if (e.key === 'Escape' && draft !== null) { e.preventDefault(); setDraft(null); }
  };
  return (
    <label>
      {label}
      <span className="num">
        <button type="button" tabIndex={-1} aria-label={`Decrease ${label}`} disabled={min !== undefined && value <= min} onClick={() => nudge(-1)}>−</button>
        <span className="u" data-u={unit}>
          <input type="text" inputMode="decimal" role="spinbutton" aria-label={label} aria-valuenow={value} aria-valuemin={min} aria-valuemax={max}
            value={draft ?? shown}
            onChange={(e) => {
              setDraft(e.target.value);
              // A value inside the limits applies as you type, so the preview follows along.
              const v = parseNumber(e.target.value);
              if (v !== null && v === clampTo(v, min, max)) onChange(v);
            }}
            onBlur={commit} onKeyDown={onKey} />
        </span>
        <button type="button" tabIndex={-1} aria-label={`Increase ${label}`} disabled={max !== undefined && value >= max} onClick={() => nudge(1)}>+</button>
      </span>
    </label>
  );
}

export function RangeField({ label, value, onChange, min, max, step = 1, action }: Omit<NumberProps, 'unit'> & { action?: ReactNode }) {
  return (
    <label className="range">
      <span>{label} <output>{value}</output></span>
      <span className="range-row">
        <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(e.target.valueAsNumber)} />
        {action}
      </span>
    </label>
  );
}

export function SelectField<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: [T, string][]; onChange: (v: T) => void;
}) {
  return (
    <label>
      {label}
      <select value={String(value)} onChange={(e) => onChange(options.find(([v]) => String(v) === e.target.value)![0])}>
        {options.map(([v, text]) => <option key={String(v)} value={String(v)}>{text}</option>)}
      </select>
    </label>
  );
}

export function CheckField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}
