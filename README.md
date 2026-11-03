# Pottery Roller Maker

Design texture and underglaze rollers for your pottery, and 3D print them. You describe the pot, and the app sizes the
roller so that a whole number of turns goes round it. The pattern then meets itself where you finish. The app is a
sister of [Pottery Stencil Maker](https://github.com/aasimsani/pottery-stencil-maker), and it shares that app's layout,
design library, and layers.

**Try it in your browser at [aasimsani.net/projects/pottery-roller-maker](https://aasimsani.net/projects/pottery-roller-maker/).** You do not need to install anything.

## Make a roller

1. **Describe the pot.** Pick a preset, or enter its base Ø, rim Ø, and height. The stencil maker and the roller maker
   share your saved pieces.
2. **Place the pattern band.** The band sets the length of the roller's pattern.
3. **Set the roller.** Pick **press a texture** or **print underglaze**, and set the turns per lap. The app divides the
   pot's diameter by the turns to get the roller's diameter, so the pattern meets itself where you finish.
4. **Add designs** from the library, or your own images, as layers. A layer's repeats count round the pot.
5. **Choose how it prints.** A hollow drum has spokes at its ends, and a solid drum uses sparse infill. The app shows the
   filament that each build uses.
6. **Add a handle.** Under **Handle**, keep **Print a handle and an axle** on, and set the grip length. The handle prints
   flat, and the axle prints standing on its head. An 8 mm dowel works instead of the printed axle.
7. **Check the roller.** Fix every error that the **Print check** marks.
8. **Download it.** **Download roller + handle (.3mf)** puts the roller, the handle and the axle on one plate.
   **Download STL** saves the roller alone.

A straight roller rolls cleanly only on a straight wall. The print check warns you when the band tapers.

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

You need [Node.js](https://nodejs.org) 22 or later.

```sh
git clone https://github.com/aasimsani/pottery-roller-maker.git
cd pottery-roller-maker
npm install
npm run dev
```

Then open http://localhost:5181. Everything runs in your browser, and your browser also saves your designs.

Run `npm test` and `npm run build` before you commit. The plan is in `docs/plan.md`, and the MCP design is in
`docs/rfc_mcp.html`.

## License

This project uses the MIT License. See `LICENSE`.
