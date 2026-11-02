# Pottery Roller Maker plan

## Goal

The app turns a pattern image into a 3D-printable texture roller for clay, sized so that the
pattern repeats cleanly around a pot or along a slab. It is the sister app to Pottery Stencil Maker
and reuses that app's stack (Vite, React, TypeScript, three.js, Vitest) and its look.

## How a roller maps a pattern

- One turn of the roller lays π·D of pattern, where D is the diameter at the tips of the relief.
- The image's height maps to the roller's patterned length, and its width maps to one repeat
  around the roller. Keeping the image's proportions fixes D once the length and the repeat count
  are set: π·D = repeats · patternHeight · (imageWidth / imageHeight).
- The impression in clay is the mirror image of the roller surface, so the roller carries the
  pattern mirrored by default.
- Dark pixels become raised relief, which presses grooves into the clay. **Invert** swaps this.
- The left and right edges of the image meet at a seam on the roller. The app warns when they
  don't match, because the seam then shows once per turn.

## Pots, slabs, and sizing up and down

- A cylinder roller rolls cleanly on a slab or on a straight-sided pot whose axis is parallel to
  the roller's.
- To go round a pot with no mismatch, the pot's circumference must be a whole number of roller
  turns. Then D = potØ / laps.
- A tapered pot needs a conical roller that shares the pot's apex, or the roller skids. That is a
  later phase. Until then, roll a slab and build with it, or use a cylinder.
- A large roller, like a 300 mm band of figurative art, prints standing up on the P2S bed
  (256 × 256 × 256 mm). The drum is solid with an axle bore, and the slicer's sparse infill keeps
  it light.

## Parts

1. The drum, which has relief, plain ends and an axle bore.
2. The handle, which is optional. It's a fork that takes an axle rod or a printed axle, and it
   comes in a later phase.

## Phases

| Phase | Delivers |
|---|---|
| 1. Core | Sizing maths, height sampling with wrap and mirror, a watertight drum mesh, binary STL |
| 2. Proto UI | Upload an image, set the size, see the roller in 3D and a preview of the clay impression, download the STL |
| 3. Handle | A printed fork handle and axle, exported as a second STL or as one plate |
| 4. Pot fit and taper | A pot preview, and a conical roller for tapered pots |
| 5. Ship | README, Cloudflare deploy pipeline as in the stencil maker, and making the repo public |

## Todos

### Phase 1: Core (RED → GREEN)

- [x] Write failing invariant tests (`src/core/roller.test.ts`)
- [x] Implement `src/core/roller.ts` so the tests pass
- [x] Refactor while green

### Phase 2: Proto UI

- [x] Image upload and threshold, with a built-in seamless sample pattern
- [x] Controls for size, depth, repeats, plain ends, bore, and mesh detail, plus the pot-fit helper
- [x] 3D roller view and clay impression preview
- [x] STL download, plus checks for bed fit and seam
