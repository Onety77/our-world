# The Garden Between Us

A place two people go, from opposite ends of the world, to be somewhere
together. Not an app with a nature theme — one continuous garden you drift
through, where every feature is a location rather than a menu item.

The full plan, including what's coming and why, is in [`plan.html`](./plan.html).

---

## Running it

```bash
npm install
npm run dev
```

No `.env` is needed to start. The data layer defaults to **local** — everything
lives in memory and `localStorage`, nothing leaves the device, and the corner of
the dev panel says so. `.env.example` documents every key for when Firebase
lands in Phase 01.

### On your phone

The dev server binds to your network, so the terminal prints a second address
like `http://192.168.1.145:5173/`. Open that on a phone on the same wi-fi.
**Do this early and often** — mobile is the priority surface, and a 3D world
that was only ever checked on a laptop is the classic way to find out too late.

### Useful URL switches

| Switch | Does |
| --- | --- |
| `?hour=18.6` | Pins the garden's clock. `6.4` dawn, `13` midday, `18.6` dusk, `1` deep night. |
| `?tier=low` | Forces a quality tier — `low`, `medium`, `high`. Handy for feeling what a slower phone gets. |
| `?place=reading-tree` | Opens straight into a place instead of the Clearing. |

Both are also in the **dev** panel, top left, along with a slider for the hour,
the profile editor, and controls to move the other person's light around so you
can see what being here together looks like on your own.

---

## Controls

The garden is the home screen. Swipe across its living place previews, then
choose **enter this place** to move inside the Tree, Wellspring, Hollow, or
Stars. Back/Escape returns to the garden.

| | |
| --- | --- |
| **Look** | Move the mouse for gentle parallax. |
| **Browse** | Drag horizontally or use the arrow keys. |
| **Enter** | Choose the named place or press `Enter`; `Esc` goes back. |

**On a phone** — nothing to capture, so it stays touch-shaped.

| | |
| --- | --- |
| **Browse** | Swipe between the four living place previews. |
| **Enter** | Tap **enter this place**; use **back to the garden** to leave. |

Dragging and the captured mouse turn *opposite* ways, deliberately. A drag moves
the world; a captured mouse moves your head. Each is the right convention for
its input and using either one for the other feels broken.

There's a **how this works** link bottom-right that brings the guide back.

## What's built

### The Reading Tree

Every letter either of you has ever left, hanging from the branches.

- Walk up to a letter and it opens — the words over the garden, no panel. A
  moment spent there is what marks it read.
- The hollow round the back of the trunk is where you write. Leave it and it
  rises into the branches.
- Hers, unopened, are the only things in the tree that glow.
- Newest faces the way you arrive; older ones wind round the trunk in three
  rings, so walking around it walks you backwards through everything.

A few placeholder letters are seeded so the tree isn't bare. **reset world** in
the dev panel clears them.

### The Clearing, and an endless landscape around it

- An endless ground and meadow — both follow you, so walking never finds an
  edge and never costs another instance. Around 65,000 blades in one draw call.
- Flowers, a treeline with gaps toward every other place, scattered woods out to
  280m, a band on the horizon beyond that, boulders and pebbles.
- A sky that runs from deep night to midday and back, with stars that fade in.
- **Both moons** — one per person, placed by that person's timezone alone, and
  labelled with whose clock they are and what time it is there.
- The other person as a **figure of light**: head, body, arms, edges feathered
  into a glow rather than stopping at a stroke.
- Ambient wind, synthesised — no audio files, no seam where a loop repeats.
- A local data layer with a second player you can puppet from the dev panel.

Every other place is real in the registry, named on the horizon, and visible
from the Clearing. Tapping one says it isn't grown yet rather than drifting you
into an empty field.

---

## Layout

```
src/
  config.ts            runtime config; fails loudly, never falls back to a guess
  data/
    types.ts           every shape that crosses the seam, with units
    money.ts           integer minor units; conversion needs an explicit rate
    local.ts           in-memory + localStorage, with a puppetable second player
    provider.tsx       React binding
  systems/
    time.ts            IANA timezones -> local hour -> where a moon sits
    palette.ts         the whole garden's colour, as a function of the hour
    terrain.ts         the shape of the ground; one function, used by everything
    ambience.ts        wind, synthesised from filtered noise
    quality.ts         how hard to push this device, and stepping down if needed
    navigation.ts      where you are and where you're heading
    rng.ts             seeded scatter, so the garden is the same place every time
  world/
    places/            one folder per place  ← add a place by adding a folder
    games/             one folder per game   ← add a game by adding a folder
    ...                the scenery
  ui/                  everything readable, sitting directly on the world
```

---

## Adding to it

**A game:** make `src/world/games/<id>/index.ts`, default-export a
`GameDefinition`. It appears in the Hollow on the next reload. Full contract in
[`src/world/games/README.md`](./src/world/games/README.md).

**A place:** make `src/world/places/<id>/index.ts`, default-export a
`PlaceDefinition`. It appears on the horizon, in the treeline gaps, and in
navigation.

Nothing to import, no list to join. The registry checks at startup that the
folder name matches the id and that ids are unique, and throws naming the file
if not — ids end up inside saved data, so a rename that drifts from its folder
would orphan real letters.

---

## Two rules worth keeping

**Dormancy, never death.** Nothing in the garden dies from neglect and nothing
counts your absence. When you're away it goes quiet and it wakes when you come
back. No streaks, no badges, no guilt. The reason to return is that something
good is waiting, never that something bad will happen.

**Pollen and money never touch.** Pollen is earned in the garden and spent on
more garden. The Wellspring is a record of real money the two of you have
actually set aside. Neither can ever buy the other.
