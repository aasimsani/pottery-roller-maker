// otsuThreshold() picks the luminance cutoff that best separates an image into ink and paper.
// It is Otsu's method: try every cutoff and keep the one that maximises the between-class
// variance w0·w1·(μ0 − μ1)². Pixels with luminance < cutoff become paint.
// Clean artwork often has an empty gap between its two tones, so every cutoff in the gap
// scores the same. The middle of that run is kept, which leaves the most margin both ways.
// A one-tone image has nothing to separate and falls back to 128.
export function otsuThreshold(hist: ArrayLike<number>): number {
  let total = 0, sum = 0;
  for (let i = 0; i < 256; i++) { total += hist[i]; sum += i * hist[i]; }
  let w0 = 0, s0 = 0, best = 0, runStart = -1, runEnd = -1;
  for (let t = 1; t < 256; t++) {
    w0 += hist[t - 1]; s0 += (t - 1) * hist[t - 1];
    const w1 = total - w0;
    if (!w0 || !w1) continue;
    const score = w0 * w1 * (s0 / w0 - (sum - s0) / w1) ** 2;
    if (score > best * (1 + 1e-12)) { best = score; runStart = runEnd = t; }
    else if (score >= best * (1 - 1e-12) && runEnd === t - 1) runEnd = t;
  }
  return best > 0 ? Math.round((runStart + runEnd) / 2) : 128;
}
