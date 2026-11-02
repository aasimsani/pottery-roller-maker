# Pottery Roller Maker

Run `npm test` (Vitest) and `npm run build` before you commit. The plan and its todos live in `docs/plan.md`.

This app is the sister of Pottery Stencil Maker (`../pottery-stencil-maker`). It shares that app's users, voice and
look, so follow the Design Context in that repo's CLAUDE.md. The tokens in `src/styles.css` match it.

`src/core/roller.ts` holds the sizing maths, the height sampling and the drum mesh. Keep the core free of DOM code so
that Vitest can run it in Node.
