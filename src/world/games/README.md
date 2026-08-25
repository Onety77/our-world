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
  invite: {               // optional; how *this* game names its async round
    name: 'leave {them} a jar',
    tip: 'She empties it whenever she next comes down here',
  },
  live: {                 // optional; only if it has a both-here-now round
    name: 'catch together',
    tip: 'One jar, two hands, sixty seconds',
  },
  makeSetup(seed) { ... },
  isSettled({ mine, theirs, solo }) { ... }, // optional for multi-stage games
  Emblem: FirefliesEmblem, // optional but do it; see below
  Component: Fireflies,
} satisfies GameDefinition<Setup, Move>
```

### Draw yourself

**Games used to be chosen from a paragraph** — a title, two lines and three
words in small capitals, which is a settings screen. Nothing about it looked
like a thing you *play*, and with two of them in the row there was no way to
tell them apart at a glance, because both were a block of text in the same face
at the same size in the same place.

So a definition exports an `Emblem`: a tiny component in its own folder that
draws the game as **one object made of the game's own parts**. Not a screenshot
and not an icon. Word Duel is five stones with a word half worked out on them,
because its board is stones; Ember Rally is two pairs of headlamps in the dark,
one warm and one cool, because that is the whole picture of the race. Both are
a handful of CSS gradients — sharp at any size, nothing to load, and they
cannot go stale the way a screenshot of a daily-generated road certainly would.

It belongs on the definition and not in the Hollow for the same reason
`Component` and `Stage` do: adding a game must never mean editing a switch
somewhere else.

### Name your own ways in

Two of them, and both used to be written by the shell.

`invite` is the ordinary asynchronous round — the one that will actually get
used, because Lagos and Shanghai share a sliver of evening and nearly every
round starts with one of you alone. It said "vs {her name}", which is true of a
duel and says nothing about what pressing it *does*. `{them}` is replaced with
her name.

`live` is what this game calls its both-here-now round, and what it promises.
The Hollow used to call it "time challenge" for every game there is, because
Word Duel's five-minute round was the first live one built and the shell
learned the name from it. Then the racer got one and inherited a label for a
clock it does not have. A shell must not name another game's mechanic. Leave
`live` out and the button does not appear at all.

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

## Looking without opening

`useRound` opens a round if it is not there — it has to, that is how a round
comes into existence. **`useStandings` does not**, and anything that merely
*reports* on rounds must use it or something like it. A screen that lists what
is waiting would otherwise write a document for every game you glanced at.

It answers with four states and no more, because four is all the seal permits:
`nothing`, `yours`, `hers`, `both`. Before your own opening move exists the
rules withhold hers, so "has she been?" has no answer on your device — which is
why the state where you have not played is called **your move** rather than
anything about her. It is true either way. Never widen this set without
checking what the rules actually hand over.

## What the registry enforces at startup

- `id` must equal the folder name. Ids end up in saved rounds, so a rename that
  drifts from the folder would orphan real data. This throws instead.
- Ids must be unique.
- `order` controls the row when it is present; otherwise games sort by name
  after explicitly ordered games.
- `Emblem` and `live` are optional. A game without an emblem still lists, it
  just gets a quieter entry — which is honest rather than broken.
- A folder without a valid default export throws, naming the file. Nothing ever
  silently fails to appear.

## When a round has to be blind

The seal in `firestore.rules` withholds the *opening* move of a round — seq 0 —
until yours exists. Everything after it is open, because a turn-based game
where you cannot see her turn is not a game.

Some games need the opposite: **every** move blind. Scattergories is four
sheets of twelve answers, and if any of them were readable, whoever played
second would write around the first list instead of racing it — not a harder
round, a much worse game. Four sheets at seq 0..3 leaves three of the four
readable.

The answer was not a new rule. It was a different shape: **each round of the
match is its own round document.** `scattergories:2026-08-24` holds round one,
and `…-r2`, `-r3`, `-r4` hold the rest, so every sheet is the seq 0 of *some*
round and the existing seal covers all four. `roundIdFor` in
`scattergories/Scattergories.tsx` is the whole trick, and `firestore.rules` was
not touched.

Two things follow that are easy to get wrong:

- **`isSettled` has to know.** The default — one move each — would settle the
  match the instant the first pair of sheets landed, and pay out three rounds
  early. Scattergories settles on round one only, because round one is the only
  thing living in that document, and says so.
- **The shell only ever sees round one.** Everything about rounds two to four,
  including the running total, is the game's business. If your game needs a
  match-level fact the shell can see, it belongs in round one's document.

Before reaching for a rules change, check whether the guarantee you want is
already available in a different arrangement of documents.

## Objects instead of an interface

The design law allows exactly three pieces of interface in the whole world and
each had to earn it. Scattergories wanted two more — three minutes needs a
clock, twelve lines need a progress count — and got neither, because a game
played at a table has **a die you roll and a glass you turn**.

The glass is better than a clock at the only job that matters: roughly how long
is left, without reading a number every four seconds. The twelve notches beat a
bar, because a bar says "eight of twelve" and the notches say *which* eight,
which is the thing you actually want with forty seconds to go — and each one is
also the way to that line without the keyboard going away.

Both are a handful of gradients over the cave, not a second lit 3D scene, for
the same reason Word Duel's board is: the world is already rendering behind
this in its own pipeline, and a second idea of "firelit" stacked on top of the
first is two of them fighting.

When a rule looks like it needs an exception, **look for the object first**.

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
