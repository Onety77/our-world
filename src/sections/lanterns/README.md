# The Lantern Walk

A lane that wanders through the edge of the wood, with a lit photograph hanging
along it for every memory the two of you have kept — and a path worn exactly as
far as you have walked.

Empty, it is one bare post on ground nobody has trodden. Full, it is a chain of
warm lights bending away into the trees. **The place gets brighter as it fills**,
which is the one thing the room that stood here could not do: that building was
at its full size on the first day and slowly filled in, so an empty archive was
a large dead structure.

## Why this replaced the Glasshouse

The Glasshouse hung its pictures on two walls running *parallel to the direction
of travel*, so they were permanently seen edge-on. Its own README records the
cost: a focused pane occupying twenty-eight pixels on a phone. The fix was to
**rotate the entire building twenty-two degrees about the viewer** whenever you
settled on one, and ninety when you opened it.

That is a workaround for the shape being wrong, and it is what made moving
through the place feel like being steered. It also needed three separate
mechanisms to stop the building being the subject — which is what a design is
telling you when it needs enforcing against itself.

Here, **a lantern is turned to face the piece of path you will be standing on
when you reach it** — `hangingFor`, using `FACING`. Face-on is a property of
where the thing was hung rather than something the camera has to arrange, so
nothing rotates about anybody and the lane is free to wander. Opening a memory
walks you to the exact spot it was hung facing.

## The footprints are the record

Each memory lays a short stride of prints in its author's own light, warm or
cool. So the trodden way *is* the archive: how far back it goes, and who went.
A stretch kept mostly by one of you reads as theirs at a glance.

The lane is only worn as far as the walking — `Lane` stops its path at
`trodden`, and the untrodden lane ahead of the newest memory is grass.

## The shape of it

```
layout.ts       the wander, where memory n hangs, and which way it faces
walk.ts         how far along you are, and the gestures that move you
Lane.tsx        the graded shelf and the worn path down the middle of it
Footprints.tsx  one stride per memory, in its keeper's colour
Verge.tsx       the wood either side, so photographs have a dark ground
Lanterns.tsx    the glass (far, near), the posts and the halos
picture.ts      crop, downscale and cache a kept photograph
view.ts         where the open lantern is on screen
LanternWalk.tsx the scene, the travel and the picking
```

Plus, outside this folder: `systems/picture.ts`, `systems/memories.ts`,
`ui/Memories.tsx`, `world/hub/landmarks/LanternWalk.tsx`, `storage.rules`.

## Three things that are not obvious

**The place carries its own ground, and `World` knows it.** The meadow is one
plane that follows the *camera*, displaced from world coordinates — and travel
here works the way it does everywhere in the garden, by sliding the place past a
camera that never moves. Anything bedded into that terrain rises and sinks as the
lane goes by. `Lane` lays a graded shelf that travels with everything on it, and
`OWN_GROUND` in `world/World` stops the world drawing its meadow over the top.
The Glasshouse met the same wall and answered it with a plinth.

**Travel is a translation, not a turn.** Turning the lane to the heading would be
the truer walk — you would round a bend rather than watch one slide past — and it
would take the lane away from the ground it was measured against. The wander
still reads; it arrives as the path swinging across the frame.

**Colours in these shaders are written linear.** Everything goes out through
`colorspace_fragment`, so 0.03 arrives at about 0.19. Written as though they were
already sRGB, the dark posts and pressed-earth footprints came out as pale sand.

## The light belongs to the lanterns

`underTheTrees` in `LanternWalk.tsx` takes the world's palette and gives this
place a fraction of it — a quarter of the sun, a third of the ambient, and the
fog pulled in to about sixty metres. The hour is still hers; what changes is that
you are under a canopy.

This is not decoration. The first build handed the lane full daylight, so
everything was evenly lit to the far end, nothing on the ground owed anything to
a lantern, and the chain read as coloured signage over a field. Dimming the place
is what turns the lanterns into the thing holding the darkness off — and because
every part of this place reads a palette and brightens against
`ambientLightLevel`, it is one lever rather than a uniform threaded through six
shaders.

`Pools.tsx` is the other half: the light each lantern throws down onto the lane.
A lamp is only read as a lamp when you can see what it is lighting.

## Picking, and the probe

Tapping a lantern you are not standing at **walks you to it**; tapping the one
you are at opens it. Opening carries the whole lane so the chosen lantern comes
to a fixed spot just in front of the eye — the camera never moves, because
`SlideCamera` owns it.

`window.__walk` under `?shot=1` publishes every reachable lantern's screen box.
A screenshot of this place looks identical whether picking works or not, so that
probe is the only way to test it — and it immediately found the real bug: hit
boxes pinned at their eighteen-pixel floor, which is honest and unusable. They
are a thumb now (44 px on touch, 30 on a mouse).

## Still owed

- **Daylight is flatter than dusk.** Honest — it is the afternoon — but the place
  is clearly designed for the dark and it shows.
- `ui/Memories.tsx` still speaks of glass in a few places.
- `npm run places` has the new id but has not been re-run, so the walk's
  soundscape is unmeasured — it is currently the Glasshouse's mix under a new
  name, which is wrong: a lane outdoors is not a room.
- Nothing here has been seen on a real GPU, only SwiftShader, so there is no
  frame cost for it yet.
