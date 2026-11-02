# Pottery Roller Maker

Pottery Roller Maker turns a pattern image into a 3D-printable texture roller for clay. You set the roller's diameter,
or the pot it should fit, and the app sizes the drum so that the pattern keeps its proportions and meets itself at the
end of each lap.

## Run it

```
npm install
npm run dev
```

## How it works

- Dark parts of the image become raised relief, which presses grooves into the clay. **Invert** swaps this.
- The roller carries the pattern mirrored, so the impression in clay reads the right way round.
- One turn rolls π × the diameter at the tips. With the image's proportions kept, that sets the drum length.
- To fit a pot, the pot's diameter divided by the roller's diameter must be a whole number.
- The drum prints standing on its end. It has plain ends and an 8.2 mm axle hole for an 8 mm dowel.

See `docs/plan.md` for the phases still to come, including the handle and conical rollers for tapered pots.
