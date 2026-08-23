# Adding a game

There is no list to join and nothing to wire up. Make a folder, export a
definition, reload.

```
src/world/games/fireflies/
  index.ts        ← default-exports a GameDefinition
  Fireflies.tsx   ← the game itself
  words.ts        ← its content, kept separate so it can grow
```

## The shape of a game

```ts
export default {
  id: 'fireflies',        // must match the folder name
  name: 'Fireflies',
  blurb: 'Catch 3. She catches 3. The ones you both caught stay lit.',
  mode: 'async',          // 'async' = a move at a time. See below.
  cadence: 'daily',       // 'daily' = one a day | 'endless' = one at a time
  duration: 'a minute, once a day',
  order: 2,               // optional; lower appears earlier around the fire
  makeSetup(seed) { ... },
  isSettled({ mine, theirs, solo }) { ... }, // optional for multi-stage games
  Component: Fireflies,
} satisfies GameDefinition<Setup, Move>
```

## Build for async first

Lagos is UTC+1 and Shanghai is UTC+8. Once one of them has moved, the hours
where both are awake and free are a sliver at each end of the day. **A game
that needs two people at once is a game they will play four times and then
stop.** Live games are the treat for the evenings that line up; they are not
the foundation.

So the unit is a *round*: something you open alone, put one move into, and
close. The good feeling is not winning. It is opening the Hollow and seeing
that she has been.

## The three facts, and the one that is hard

A game is handed three separate things, and conflating them is what makes
async games feel broken:

| | |
|---|---|
| `setup` | what you are both playing. Written once when the round opens. |
| `mine` | your moves, oldest first; empty if you have not moved. |
| `theirs` | hers — **or empty, which does not mean she hasn't played.** |

Until your opening move is in, the server *will not tell you* whether she has moved.
That is enforced in `firestore.rules`, not in the UI: each move is its own
document, and hers is unreadable until yours exists. The local mock seals
identically, on purpose — a mock that hands back everything would let you build
a game that quietly breaks the moment it meets the real backend.

The empty opening state is deliberately ambiguous. **Never render "waiting for
her"** before your own opening move is committed — you do not know that.
"Nobody sees anybody's until both are in" is the honest sentence. Moves after
the opening commitment are visible and can form turns or later stages.

## makeSetup must be pure

Both devices build the setup independently from a seed derived from the round
id, and whoever writes second must produce the same thing. Anything random,
time-based, or read from the world will hand the two of you subtly different
boards while the app insists you are playing the same one.

## Two rules to hold to

**Pollen is shared.** One number, one pool. There is no per-person score and no
leaderboard — a scoreboard between two people who are far apart is the one
thing guaranteed to make this feel worse over time.

**Leaving is free.** `onLeave` costs nothing, forfeits nothing, and is never
recorded. Someone's phone will die mid-game, and that must be a non-event.

## What the registry enforces at startup

- `id` must equal the folder name. Ids end up in saved rounds, so a rename that
  drifts from the folder would orphan real data. This throws instead.
- Ids must be unique.
- `order` controls the row when it is present; otherwise games sort by name
  after explicitly ordered games.
- A folder without a valid default export throws, naming the file. Nothing ever
  silently fails to appear.

## A game that is a place

Most games are a board drawn over the Hollow: the cave keeps rendering behind
them, the game itself is DOM, and that is the right shape for a word game.

A game can also *be* somewhere. Ember Rally is a road under the garden, and it
needs the camera, the whole frame and the renderer. So a definition may export
a **`Stage`** alongside its `Component`:

```ts
export default {
  ...
  Component: EmberRally,   // the words: briefings, results, the seal
  Stage: RootwayStage,     // the place: mounted inside the world's own Canvas
}
```

While `useGameStage`'s `taken` flag is set, `world/World.tsx` renders the Stage
**instead of** the section, stands the slide camera down and skips the sky. Set
it when your road opens and clear it when it closes — see
`ember-rally/EmberRally.tsx`, where both happen in one effect.

**It is not a second `<Canvas>`, and that is deliberate.** A second canvas is a
second WebGL context (phones ration those, and losing one silently blanks a
scene), a second shader pipeline that will drift out of agreement with the
garden's about what "lit" means, and a second render loop competing for the
frame. The racer this replaced was a 2D canvas laid over the world and that is
most of why it read as a different program bolted onto this one.

A Stage takes **no props**. It runs at sixty frames a second, and React state
at sixty frames a second is visible stutter — so everything it needs comes out
of the game's own store, read imperatively inside one `useFrame`. See
`ember-rally/session.ts` for the shape of that handover: four moments cross it,
and nothing per-frame does.
