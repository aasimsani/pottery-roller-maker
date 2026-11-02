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

## Run it

```
npm install
npm run dev
```

Run `npm test` and `npm run build` before you commit. The plan lives in `docs/plan.md`.
