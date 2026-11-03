// The MCP prompts teach Claude the design loop and the rules a printable roller has to follow.

export interface RollerBrief {
  /** Roller tip diameter and pattern band height, in mm. */
  diameter: number; bandHeight: number;
  /** Repeats of the image round one turn of the roller. */
  repeatsPerTurn: number;
  /** The thinnest raised line and the narrowest gap that print, in mm. */
  minLine: number; minGap: number;
  use: 'texture' | 'underglaze';
}

const pct = (mm: number, of: number) => `${((100 * mm) / of).toFixed(1)}% of the image height`;

// imagePrompt() writes an image-generator prompt sized to the live roller. One repeat is π·D / repeats wide
// and one band high, and the minimum widths become shares of the image height, which a generator can follow.
export function imagePrompt(b: RollerBrief, subject: string, style = 'linocut block print'): string {
  const ratio = ((Math.PI * b.diameter) / b.repeatsPerTurn / b.bandHeight).toFixed(2);
  return [
    `A seamless horizontal repeating band for a pottery ${b.use === 'underglaze' ? 'underglaze printing' : 'texture'} roller, in the style of a bold ${style}.`,
    'Pure solid black shapes on a pure white background, two tones only. No grey, no gradients, no shading, no texture, no outlines around filled shapes, and no hatching or stippling.',
    `Subject: ${subject}. Few large elements, bold simple silhouettes, smooth curved edges, crisp vector-like quality.`,
    `Every line and every solid shape is at least ${pct(b.minLine, b.bandHeight)} wide. Every gap between shapes is at least ${pct(b.minGap, b.bandHeight)} wide, and gaps stay evenly wide everywhere.`,
    `Eyes and other enclosed white holes are at least ${pct(2.5, b.bandHeight)} across.`,
    'Black and white are evenly balanced across the whole band, about 40% black, with no large empty areas and no long straight vertical lines.',
    b.use === 'underglaze' ? 'Use medium-width shapes rather than large solid areas, because big solid areas take paint unevenly.' : '',
    `The left and right edges tile seamlessly, and no motif is cut in half at the edges. Aspect ratio ${ratio}:1.`,
    'Avoid: outline, line art, thin lines, sketch, hatching, stippling, halftone, noise, grain, gradient, shading, glow, 3D, photorealistic, colour, sparkle, watermark, logo, text, signature, tiny details, small gaps.',
  ].filter(Boolean).join('\n\n');
}

export const DESIGN_LOOP = `You are designing a pottery roller with the Pottery Roller Maker, which is open in the user's browser tab.
Work in rounds, and keep the user in the loop in chat.

1. Call get_state and view, and say what you see before you change anything.
2. Fix print check errors first, then warnings, then how it looks. Not every warning needs fixing. For each spot, call list_spots and
   view_spot, then pick a fix with fix_spot: thicken or widen by an amount, remove or fill in, or leave it as drawn. Save the fix
   for everything (fixLines, fixGaps, with fixLinesBy and fixGapsBy in mm) for spots that don't matter one by one.
3. Call checkpoint before each round. Change as many things as one idea needs, and send them together with batch, so they share one rebuild. Ask for view: true when you need to see the result.
4. Judge the result against the rules below. Keep the round only when the check and the look both get better, and otherwise call restore.
5. Stop when the check passes and the design reads well from arm's length. Ask the user before you call export.

Rules for a roller that prints and rolls well:
- Raised lines and gaps are at least two nozzle widths wide. The print check names the minimums.
- Gaps are at least as wide as the relief is deep, and 1.5 times as wide for underglaze, or clay and paint pack into them.
- A raised line is no taller than twice its width, or it snaps.
- Relief spreads evenly round the whole turn, with 30–50% raised, so the roller doesn't bump.
- Long straight lines along the axle make the roller jump, so prefer curves and diagonals.
- Enclosed holes, such as eyes, are at least 2.5 mm across, or they fill with clay.
- In texture mode, raised parts become grooves in the clay. Invert a layer to make figures stand proud.
- The pot's circumference is a whole number of roller turns, which turns per lap sets. Layer repeats count round the pot.
- Clay shrinks 10–15% by the final firing, so keep some margin above the minimums.`;

export const REVIEW_DESIGN = `Review the current roller design. Call view with which: "both", then judge it on each point and give a short verdict for each:
- Does it read from arm's length, with clear figures and enough contrast between raised and low parts?
- Is the relief spread evenly round the turn, without big empty stretches or solid blocks?
- Do the left and right edges meet without a visible seam in the clay view?
- What does the print check flag, and which fix keeps the design intact best?
- What is the one change most likely to improve it next?`;
