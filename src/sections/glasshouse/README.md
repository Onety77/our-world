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

## Memories first

The building must never be the subject. Three things enforce that, and all
three came out of one failure: a focused pane occupying twenty-eight pixels on
a phone while the ironwork had the whole middle of the frame.

**It turns.** Settle on a pane and the building rotates twenty-two degrees
about the point in front of you — because a picture on a corridor wall is seen
*edge-on*, its width running down the aisle, and no amount of moving closer
changes that. It leans sideways too, which is the smaller half. The same
photograph is a hundred and thirty-two pixels now: thirty-four per cent of a
phone screen.

**Every frame is the same shape.** Three by two, with the picture centre-
cropped into it. Identical frames disappear, and once they disappear you are
looking at photographs rather than at a row of differently-shaped outlines.
Cropped only in the wall — opening a memory shows the whole thing.

**Every memory grows a flower** on the floor in front of it, in that
photograph's own colours pushed away from grey so it reads as a flower rather
than a smudge. A row of them says *many* long before a row of rectangles does,
and after dark the petals are the only floor lighting there is.

## The shape of it

```
layout.ts      where it stands, how big it is, and where memory `n` hangs
ironwork.ts    ribs, purlins, glazing, the dwarf wall, the terrace, the vines
Panes.tsx      the glass — far (colour only), near (the picture), and the pools
Flowers.tsx    one per memory, in its colours, and the lamps after dark
EmptyFrame.tsx the one that is waiting
Motes.tsx      dust in the light
aisle.ts       how far down the aisle you are, the lean, and the turn
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

## Opening one is somewhere you go

Tapping a pane does not put a panel over a stopped world. The aisle glides to
its bay, the building turns square to its wall, and the photograph ends up in
front of you because **you are standing in front of it** — the room is still
there, above it, below it and either side. Everything else in the building
loses its light while that happens (`uHush`), so the wall does not go on
selling other people's evenings next to the one you asked for.

Three things had to be true first, and each one is a note somewhere in here:

1. **No pane has a tilt.** A face-on rectangle projects to an axis-aligned
   rectangle, which a DOM element can be laid on exactly. Two degrees of
   hand-hung wobble makes that impossible. See `slotFor`.
2. **The turn pivots about the middle of the aisle, and nobody stands there.**
   SlideCamera puts the camera off the centreline and back down it, and
   `backOffFor` moves it again with the aspect. So the scene *solves* the
   building's position each frame against the camera's own axes — depth along
   local X until the pane is `standFor()` metres away, then across along
   local Z until it is on the centre line. Both faded on the turn, because
   both are only true at ninety degrees.
3. **How far you stand cannot be a constant.** Five metres fills 99% of a
   phone's width and 28% of a laptop's — same building, same pane. `standFor`
   solves the distance from the size the pane should *end up*: a bit under half
   the screen's height, never more than nine tenths of its width, never further
   back than the wall behind you.

The photograph itself is DOM because it is the one thing in this world that
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
- `__glass.open` — the open state's own workings, when one is open: how far
  through the turn, how far it has walked, which side, and `stand` — where the
  camera is in the building's own coordinates, where anything past ±2.62 means
  it has left through a wall.
- `__glassOpen(id)` / `__glassWalk(m)` / `__glassReach(m)` — the verbs.
  Opening a particular memory from a test otherwise means aiming a mouse at a
  quad on a wall three metres away in a building that is sliding past, which
  tests the raycast rather than the thing under test. `__glassReach` pins the
  standing distance so it can be swept across viewports in one run instead of
  four minutes per value.

The first of those has already paid for itself once: a "standoff" was added to
stop the near panes being cut off on a phone, and sweeping it against `__glass`
showed the panes had never been cut off at any value — they were simply small,
and every metre of standoff made them smaller. Measure the thing before
compensating for it.

`__glass.open` earned its place the same way, immediately. An open memory
settled with its centre thirty-two pixels from the left edge of a phone, most
of it off the side, while every eased number in the system reported that it had
arrived exactly where it had been asked to go — because they had, and the thing
they had been asked for was wrong. Then, once centred, it came out beautifully
framed against a flat grey nothing: the camera was standing a metre outside the
far glazing, looking in. Neither of those is visible in a number you did not
think to print, and both are obvious in one.

Headless is also in slow motion. Every frame is clamped to `1/20` of a second
and SwiftShader manages one or two a second, so four seconds of wall clock is
under one second of eased time — long enough to screenshot a half-finished turn
and file it as a bug. Wait on the state, not on the clock.
