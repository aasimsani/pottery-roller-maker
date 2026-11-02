// parseNumber() reads what someone typed into a number field. It accepts a decimal comma and a
// trailing unit such as "mm", and it returns null while the text is not a number yet, such as "-".
export function parseNumber(text: string): number | null {
  const m = text.trim().replace(',', '.').match(/^-?(\d+\.?\d*|\.\d+)/);
  return m ? Number(m[0]) : null;
}

export const clampTo = (v: number, min?: number, max?: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));

// stepBy() moves a value by count steps. It rounds to the step's decimals, so 0.3 + 0.1 shows as 0.4.
export function stepBy(v: number, step: number, count: number, min?: number, max?: number): number {
  const decimals = (String(step).split('.')[1] ?? '').length;
  return clampTo(Number((v + step * count).toFixed(decimals)), min, max);
}
