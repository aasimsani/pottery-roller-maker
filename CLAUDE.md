# Pottery Roller Maker

Run `npm test` (Vitest) and `npm run build` before you commit. The plan and its todos live in `docs/plan.md`.

## Design Context

The app is forked from `../pottery-stencil-maker` and shares its users, voice, palette and layout, so follow the Design
Context in that repo's CLAUDE.md. The users are potters who want a roller that goes round their pot in whole turns, and
an STL file they trust to print the first time.

## Sister apps

Three apps share one layout, one set of field components and one palette. Each one lives in its own repo:

| App | Repo | Makes |
|---|---|---|
| Pottery Stencil Maker | `../pottery-stencil-maker` | flat or curved underglaze stencils |
| Pottery Rib Maker | `../pottery-rib-maker` | profile ribs with a height scale |
| Pottery Roller Maker | `../pottery-roller-maker` | texture and underglaze rollers, forked from the stencil maker |

When you change something the apps share, such as `src/ui/fields.tsx`, the tokens at the top of `src/styles.css`, the
library drawer or the preview layout, make the same change in the sibling repos, so the three stay one family. A new
tool forks the closest existing app rather than starting fresh.

## Code map

- `src/pipeline.ts` sizes the roller from the pot (Ø = pot Ø ÷ turns per lap), renders the layers round one turn with
  the stencil maker's layer and mask code, raises the result into relief, and runs the print check. `prepareRoller()`
  runs on the page, and `finishRoller()` runs in `src/roller.worker.ts`.
- `src/core/roller.ts` holds the drum maths: height sampling with wrap and mirror, the watertight drum mesh, the hollow
  build with spoked end plates, the filament estimate, and the STL writer.
- `src/core/fix.ts` finds thin raised lines and narrow gaps on the wrapping pattern, and repairs them when the user
  picks a fix.
- `src/checks.ts` is the roller's print check. Each check may offer one-click fixes, which set `fixLines` or `fixGaps`.
- `src/state.ts` holds the settings. `nozzleSettings()` fits the minimum widths and the detail to a nozzle.
- `src/ui/` holds the panels and the three.js views. `Piece3D.tsx` shows the impression round the pot, and
  `PrintView.tsx` shows the drum, lying down or standing on the bed.
- Settings and layers save under `roller.*` keys, so the apps can share an origin. Saved pieces (`pieces`) stay shared.

## MCP

Claude drives the open tab through an MCP route on the app's own Worker. The design is in `docs/rfc_mcp.html`.

- `worker/index.ts` routes `/session/new` (Turnstile and a per-IP limit), `/session/ws` (the tab's socket),
  `/mcp` (token check, per-session limit, then `createMcpHandler`) and `/mcp/upload` (one-time image upload links).
- `worker/session.ts` is the Session Durable Object. It keeps the tab's WebSocket and relays each call with
  `worker/relay.ts`. It stores only hashes of the tab secret and Claude's token (`worker/token.ts`).
- `worker/server.ts` builds the MCP tools and prompts. Every tool forwards to the tab.
- `src/mcp/tab.ts` answers the calls in the tab. Changes go through `applyOps()` in `src/mcp/ops.ts`, which checks
  every key and type and applies a batch whole or not at all. A reply waits until the result on screen is built
  from the latest inputs (`gen` and `builtGen` in `src/App.tsx`), so it never carries a stale print check.
- Run it locally with `npm run dev:worker` and `npm run dev`, open http://localhost:5181, press **Connect Claude**,
  and run the command it shows. `.dev.vars` holds Cloudflare's always-pass Turnstile test secret.
