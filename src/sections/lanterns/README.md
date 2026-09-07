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

## Still owed

- The **day-time look** has had far less attention than dusk. The lanterns are
  designed to be the only light there is, and at noon they compete with a sun.
- `ui/Memories.tsx` still speaks of panes and glass in about thirty places.
- The **hub landmark** is built but has not been photographed from the garden.
- `npm run places` has the new id but has not been re-run, so the walk's
  soundscape is unmeasured.
