# Pottery Roller Maker

Pottery Roller Maker designs 3D-printable texture and underglaze rollers sized to a pot. It's the sister app of
[Pottery Stencil Maker](https://github.com/aasimsani/pottery-stencil-maker) and shares its layout, its design library and
its layers.

## Make a roller

1. **Describe the pot.** Pick a preset, or enter its base Ø, rim Ø and height. Saved pieces are shared with the stencil maker.
2. **Place the pattern band.** It sets the roller's patterned length.
3. **Set the roller.** Pick **press a texture** or **print underglaze**, and the turns per lap. The roller's diameter is the
   pot's divided by the turns, so the pattern meets itself where you finish.
4. **Add designs** from the library, or your own images, as layers. A layer's repeats count round the pot.
5. **Choose how it prints.** A hollow drum has spokes at the ends, and a solid drum uses sparse infill. The app shows the
   filament for both.
6. **Check it and download the STL**, or add several rollers to a plate and download one 3MF file.

A straight roller rolls cleanly only on a straight wall. The print check warns when the band tapers.

## Use with Claude

Claude can look at your roller, change it, and look again while you watch. It connects through a Model Context Protocol
(MCP) server on the app's Cloudflare Worker. It only works while your tab is open.

1. Open the app at https://aasimsani.net/projects/pottery-roller-maker/.
2. Select **Connect Claude** in the header.
3. Complete the person check.
4. Copy the `claude mcp add` command from the panel.
5. Run the command in a terminal.
6. Start a new Claude Code session.
7. Run the `/mcp__pottery-roller__design_roller` prompt.

The session lasts one week. Claude can only change the design while your tab stays open. To end the session, select
**Disconnect**.

To run the app on your computer:

1. Run `npm run dev:worker`.
2. In a second terminal, run `npm run dev`.
3. Open http://localhost:5181.

The local Worker uses the Turnstile test key from `.dev.vars.example`. As a result, the person check always passes.

## Run it

```
npm install
npm run dev
```

Run `npm test` and `npm run build` before you commit. The plan lives in `docs/plan.md`.
