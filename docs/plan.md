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

## Print options

A hollow drum is a relief tube with an end plate of spokes at each end, and its middle stays empty.
A solid drum leaves the inside to the slicer's sparse infill. The app shows the filament for both,
because thin walls with end plates usually beat 15% infill, but not always on a small roller.

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

### Phase 2: Proto UI (superseded by Phase 2b)

- [x] Image upload and threshold, with a built-in seamless sample pattern
- [x] Controls for size, depth, repeats, plain ends, bore, and mesh detail, plus the pot-fit helper
- [x] 3D roller view and clay impression preview
- [x] STL download, plus checks for bed fit and seam
- [x] Same layout, tokens and number fields as the stencil and rib makers
- [x] Two uses, pressing a texture and printing underglaze, each with its own depth and edge
- [x] Hollow drum with end plates of spokes, or solid at a chosen infill, with a filament estimate for both

### Phase 2b: Fork the stencil maker's app

- [x] Copy the stencil maker's app, so the roller has the same layout and features: piece presets, saved pieces, photo tracing, scale to widest Ø, pattern band, design library, layers and lines, 3D views with Expand, print check, plate 3MF, printer settings
- [x] Write failing tests for the roller pipeline, checks and settings
- [x] Replace the stencil pipeline with `prepareRoller()` / `finishRoller()`, sized from the pot: D = pot Ø / turns per lap
- [x] Port Controls, Preview, the pot view (shows the impression laps times round) and the print view
- [x] Keep settings and layers under `roller.*` keys, so both apps can share an origin and saved pieces

## MCP (see `docs/rfc_mcp.html`)

Local first: the Worker runs under `wrangler dev`, Vite forwards `/mcp` and `/session` to it, and auth is a
session token the tab shows after Connect Claude and Turnstile. OAuth replaces the copy-paste step later.

### Phase M1: Pure core (RED → GREEN)

- [x] Failing tests: settings and layer ops with key and type checks, all-or-none batches, offered fixes only
- [x] Failing tests: the relay matches replies to requests, times out, and drops pending calls when the tab goes
- [x] Failing tests: a session token only verifies for its own session and secret
- [x] Failing tests: `imagePrompt()` carries the live roller's aspect ratio and minimum line share
- [x] Implement `src/mcp/ops.ts`, `worker/relay.ts`, `worker/token.ts` and `src/mcp/prompts.ts` until green

### Phase M2: Worker, session object and MCP route (local, under `wrangler dev`)

- [ ] Failing test: opening a session needs a passing Turnstile token and stays under the per-IP limit
- [ ] Failing test: `/mcp` refuses a missing or wrong token with 401
- [ ] Session object holds the tab socket and relays calls, and the MCP route serves the tools and prompts
- [ ] Vite forwards `/mcp` and `/session` to `wrangler dev`, so the tab and the MCP share one origin
