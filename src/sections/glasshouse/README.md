# The Glasshouse

An old iron conservatory standing in the meadow, half overgrown, with a
photograph in every pane. **The building is made of what the two of you have
kept**: the ironwork is always whole — iron outlasts glass — and the coloured
glass exists only where one of you has hung something. Empty, it is a skeleton
against the sky. After a few years it should be a tunnel of colour you walk
back through.

The oldest memory stands at the far end and the newest at the near one, where
you arrive and where the empty frame waits. So the only direction there is in
here is backwards through time.

## The shape of it

```
layout.ts      where it stands, how big it is, and where memory `n` hangs
ironwork.ts    ribs, purlins, glazing, the dwarf wall, the terrace, the vines
Panes.tsx      the glass — far (colour only), near (the picture), and the pools
EmptyFrame.tsx the one that is waiting
Motes.tsx      dust in the light
aisle.ts       how far down the building you are standing
Glasshouse.tsx the scene, the travel and the picking
```

Plus, outside this folder:

```
systems/picture.ts              pick → orient → downscale → strip → measure
systems/memories.ts             the store, fed by one watcher in App
data/pictures.ts                where the mock keeps the bytes (IndexedDB)
ui/Glasshouse.tsx               leaving one, and looking at one
world/hub/landmarks/Glasshouse  the same building, out in the garden
storage.rules                   the bucket
```

## The three ways a pane is drawn, and why

| | |
|---|---|
| **Far** | one instanced quad in the memory's own average colour. No texture, no request, no decode. |
| **Near** | a quad with the picture on it, for the five you are standing among. |
| **Open** | not in the scene at all — DOM, over the top of the world. |

The far case is most of the building and it is **not a fallback**. A wall of
coloured glass receding into the dark is what the place looks like; the tint is
stored on the document precisely so that the whole Glasshouse can be drawn,
every pane in its right colour, before a single photograph has been fetched.

The near case shows the sixteen-pixel preview out of the document first —
instantly, no request — and swaps to the real photograph when it arrives. "The
glass clears and the image appears" is therefore the literal behaviour of a
progressive load rather than an animation pretending to be one.

The open case is DOM because a photograph is the one thing in this world that
somebody *chose*, that cannot be made again, and whose colours are the whole
content. Everything drawn inside the Canvas goes through ACES tone mapping at
exposure 0.98, through fog, and through whatever the hour has done to the
ambient level — her face would come out warmer at six and bluer at midnight.
So the pane in the wall is lit like the building it is part of, and the one you
have opened is untouched. The room takes the picture's colour instead, which is
the response happening to the world rather than to the photograph.

## A pane never moves

`slotFor(n)` takes the memory's index in the **oldest-first** list and that
index is permanent — a new memory is appended and renumbers nothing. Same law
the letters follow, for the same reason. Ordering newest-first would be far
more natural to write and would shift every pane in the building one bay every
time either of you hung a photograph.

`slotFor` is cached, and has to be: which bay a pane stands in depends on every
pane before it, so working one out from scratch is O(n) and drawing a wall of
them is O(n²) *per frame*. The cache only grows and each entry is decided by a
hash of its own index, so extending it can never change an entry already in it.

## The building moves, not the camera

`SlideCamera` is already steering the camera every frame from the section's own
composition, and two things steering one camera is a fight nobody wins — the
racer had to stand it down entirely to avoid exactly this. So the Glasshouse
slides past a camera that never moves. Fog is measured from the camera and
stays correct; the sky and the far wood do not travel with you, and should not,
because you are inside a building looking out of it.

Everything that needs the offset goes through **`buildingZ()`** — the group
that moves the building and the ray that picks out of it. Two expressions of
the same number is how a tap lands on the photograph next to the one you aimed
at.

## What a memory is

Six things are stored that are not the picture, and each earns its place:

- `tint` — what the pane *is* at any distance. Averaged in linear light, not
  over the sRGB bytes; a flat mean of encoded values is the classic way to turn
  a sunset into mud.
- `blur` — sixteen pixels as a data URI, a few hundred bytes, in the document.
- `width`/`height` — so the glass is cut to the right shape before anything has
  been decoded, and nothing is ever cropped to fit.
- `when` and `why` — free text, both optional, and the only two questions asked.
  Not a title, a description, tags, an album, a place and a rating. Every field
  that could be left blank is a small accusation that you have not finished.
- `theirs` — one line, from the person who did **not** hang it. Enforced at the
  seam and in `firestore.rules`, not only in the interface. One person leaves
  the moment; the other leaves what it was from where they were standing.

## What is thrown away

Nothing is ever uploaded as it came off the camera. `systems/picture` redraws
every image through a canvas and re-encodes it, which drops every metadata
block there is — including where it was taken, to about five metres. That is
not a side effect being relied on by accident; it is the reason the redraw
happens even when the picture is already small enough.

The one piece that must survive is the orientation flag, and it survives by
being *applied* rather than kept.

The format that will actually turn up is **HEIC**, because that is what an
iPhone stores by default. Safari on iOS decodes it and this works. Chrome on a
desktop does not, and `decode()` says so by name rather than failing with
"could not load image" — which would send somebody hunting through their photo
library for a file that is perfectly fine.

## Verifying it

`?shot=1` publishes two things on `window`:

- `__glass` — where the pane you are standing at lands on screen, as normalised
  device coordinates plus a width in real pixels, and whether the whole thing
  is inside the frame. This place's composition is decided entirely by geometry
  — a corridor under three metres wide, seen through a fixed *vertical* field
  of view, on a screen that might be twice as tall as it is wide — and "does
  the picture fit" is not a question anybody can answer by eye across four
  viewports.
- `__glassOpen(id)` / `__glassWalk(m)` — the two verbs. Opening a particular
  memory from a test otherwise means aiming a mouse at a quad on a wall three
  metres away in a building that is sliding past, which tests the raycast
  rather than the thing under test.

The first of those has already paid for itself once: a "standoff" was added to
stop the near panes being cut off on a phone, and sweeping it against `__glass`
showed the panes had never been cut off at any value — they were simply small,
and every metre of standoff made them smaller. Measure the thing before
compensating for it.
