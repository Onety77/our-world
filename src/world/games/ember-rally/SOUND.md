# The roads, as sound

Read `../README.md` first for what the three roads are, and `systems/ambience.ts`
for the graph everything here plugs into. This file is only about the ear.

It exists because a brief arrived proposing that every road gets a downloaded
music loop, two downloaded intensity stems and a folder of environmental
recordings. The instincts in it are good and most of the recordings were already
in the repo — synthesised, and steering. What follows is that brief reconciled
against what is actually here, what has since been built, and what is left.

---

## What exists

About four thousand lines of Web Audio, all of it synthesis, none of it sampled.

| File | Lines | What it is |
|---|---|---|
| `systems/ambience.ts` | 1476 | the one `AudioContext`, a 19-second shared noise buffer, six ambient layers crossfaded per place, world cues, and `synthesisBus()` — the seam a road voice plugs into |
| `systems/engine.ts` | 1046 | the car: engine, exhaust, induction, road, wind, front/rear scrub, squeal, brakes, cave reverb. Events derived from edges in the state, not from extra calls |
| `systems/rootway.ts` | 460 | the Rootway road voice — room tone, draught, your own dust, seep, drips, lantern fire, root creaks, the rock taking its weight |
| `systems/moonbreak.ts` | 447 | the Moonbreak road voice — exposed air, water below, wet growth, arches overhead, the pressure and glass of the Drowned Mile |
| `systems/stormcrown.ts` | 487 | the Stormcrown road voice — rainwood, cloud, the clear crown above the storm, waterfalls with pan, lightning, the rods |
| `systems/volume.ts` | 122 | three faders: `world`, `effects`, `music`, per device, squared |

Each road follows the same three-file shape, and a new one should too:

```
weather.ts  -> storm   --+
depth.ts    -> deep     +-- plain object, written once a frame by Race.tsx
tunnel.ts   -> tunnel  --+   read by a *Sound.tsx bridge inside useFrame,
                             which calls voice.set(state) — one entry point
```

Nothing subscribes to anything. Each bridge acquires its voice lazily from
`ambience.synthesisBus()`, because the context may not exist until the first
gesture. `npm run sound` drives the Rootway's over a real lap against a stub
Web Audio API.

---

## What was built, and why the download list shrank

### The Rootway had no voice at all

`Moonbreak.tsx` mounted a soundscape, `Stormcrown.tsx` mounted one, and nothing
mounted anything on the Rootway — so driving underground played the *garden's*
ambient bed, which is open-meadow air, in a cave. That was the largest hole in
the racing audio and **not one byte of it was a download problem.**

Every item on the original Rootway environmental list — cave room tone, narrow
tunnel wind, gravel, stone scrapes, root creaks, drips at several distances,
lantern fire, deep pressure rumbles — is filtered noise and short envelopes, and
every one of them needed to be *steered*. A recording cannot narrow when the
tunnel narrows, and the Rootway is a road that opens and closes for its whole
length. See the note at the top of `systems/rootway.ts`.

> **The brief asked for a shortcut layer and there is no shortcut.** Rootwake
> came out of the road when the ordinary corners were sharpened — the tunnel was
> a curve drawn between two points that real corners had pulled together, so
> every feature in it folded. `makeTrack` sets `split: null` on every seed. What
> replaced it as the Rootway's subject is enclosure, which is better for the ear
> anyway: it is always happening rather than once per lap.

### The music does not coexist with a road

The original brief assumed the corner player would duck under road music. It
also reported that `Player.tsx` already ducked to 14% during a game — **that was
wrong.** The 14% duck is for voice-lights, and there was no interaction between
the games and the music at all.

There is now, and it is not a duck: **driving onto a road stops the music on that
device.** `useRace.open` and `.watch` call `silence()`; the player honours it in
its sound *and* in what it draws, so the bars and the ▶ never claim to be playing
something you cannot hear. It is local — if she is in step with you, her song
carries on untouched in Lagos — and it does not come back on its own. The next
deliberate press starts it again and nothing else does. See `silenced` in
`systems/listening.ts`.

---

## What NOT to download

Environmental recordings for any of the three roads, **thunder included.**

They exist, they are steered, and layering a rain-on-metal loop over
`stormcrown.ts` would add megabytes to duplicate something that already responds
to how high up the mountain you are and whether you are inside the cloud. A loop
laid over a voice that moves does not add realism; it adds a second, static
opinion about the weather that the first one has to fight.

Thunder was the one exception in the first draft of this file and it is not one
any more — see stage 2. The general rule it turned out to be an example of:
**a recording cannot be a continuum.** Everything on these three roads that the
brief wanted to buy is something the road changes continuously — how enclosed
the rock is, how deep the water is, how far up the storm you have climbed, how
far away the last stroke was. Five files cannot say any of that, and a
synthesiser steered by the same number the renderer uses says it for free.

---

## The downloads, in order

### Stage 0 — done

`tunnel.ts`, `RootwaySound.tsx`, `systems/rootway.ts`, `scripts/sound-check.ts`,
and the music silencing. No downloads.

### Stage 1 — the sample path · no longer needed for sound effects

`SynthesisBus` hands out `{ context, output, noise, noiseSeconds }` — no
decoder, no buffer bank, no fetch, no cache. Nothing downloaded can enter the
*synthesis* graph without one.

With thunder synthesised, nothing wants to. **The only thing left that needs a
file is music, and music does not go through this bus at all** — it is an
`<audio>` element on the `music` fader, which already exists and already works.
So this stage is now optional, and should stay unbuilt until something concrete
needs it. Building a loader with nothing to load is how you end up maintaining a
cache for one file.

If a genuine gap ever turns up, the shape it wants is: `bank(name)` returning
null until decoded and never blocking; one `decodeAudioData` per file, cached
and shared; one-shots on the **`effects`** gain if they happen because of you and
**`world`** if the place did them (`volume.ts` has the rule); and a missing file
that is silent and logged rather than thrown — this ships to two phones on bad
mobile data and a 404 must not take the ambient bed down.

### Stage 2 — thunder · done, and synthesised

**This was going to be the one download that mattered, and it turned out not to
need downloading.** The argument for buying it was that a real close crack has a
spectral density and a multi-second decay that noise convolution approximates
and never lands. That is true of the *old* thunder, and the reason was not that
synthesis could not do it — it was that the old one was written as a sound
effect rather than as a distance. Four things were wrong, and all four were the
same mistake:

| | was | now |
|---|---|---|
| flash-to-bang | capped at 1.2 s — every stroke inside 400 m | `distance / 343`, out to 8 s |
| high frequencies | fixed filters | air absorption, so far strokes have *no* crack at all |
| the crack | fired on the flash, i.e. at the speed of light | arrives with the shock front, after a stepped-leader crackle |
| the roll | one burst and one late return, ~2.5 s | 5–9 unevenly spaced peals, each its own level, colour and side |

Plus the duck: everything that is not the thunder drops ~3 dB as the front lands
and comes back over a third of a second. That is what lets the crack be *no
louder* than before and land twice as hard.

`npm run sound` holds the physics — near 0.41 s, far 8.0 s, a 19.6× range — and
holds the duck's return, which is the one thing here that could fail silently
and permanently. Confirmed in a live browser too: a stroke at 316 m arrived
0.92 s after its flash, which is 316/343 to the hundredth.

**So there is nothing to buy here.** Recordings would now be a downgrade in the
only way that matters: five files cannot be a continuum, and the whole point of
this road is that you are climbing out of the weather and the storm is getting
further away. A sampler picking between five fixed distances cannot say that.

The rain got the smaller half of the same fix. Discrete drops already existed —
`rainImpact`, seven to thirteen a second — but every drop was the same drop, and
eleven identical ticks a second is a texture rather than weather. They have a
size now, skewed hard toward small, and the fat ones get a low ring off the
bodywork underneath the splash. One big drop a second gives the ear a scale to
measure the small ones against.

### Stage 3 — music beds

**Source:** [Pixabay Music](https://pixabay.com/music/) under the
[Pixabay License](https://pixabay.com/service/terms/) — free for commercial use,
no attribution, adaptation permitted. Save a copy of the license text and a
record of every download date and URL alongside the masters; the license is
permissive but it is a per-upload grant and a page can change.

The musical directions in the original brief are right and worth following:

| Road | Tempo | Character |
|---|---|---|
| Rootway | 105–115 | frame drums, organic percussion, bowed low strings, hollow knocks. No melody, no heroism |
| Moonbreak | 122–128 | atmospheric breakbeat, analog bass pulse, glass arpeggios, wide pads |
| Stormcrown | 150–165, halftime feel | hybrid drum and bass, heavy toms, distorted sub, sparse industrial hits |

**One bed per road, and one layer.** The original brief proposed a primary loop
plus an intensity layer plus a danger layer; that is nine files, and finding nine
free tracks that are genuinely stem-separated and in the same key is a week of
searching for something the ear will barely resolve at speed. Take a primary bed
and one layer that joins above about 70% of top speed. If that works, add a third
later.

Ship **AAC (`.m4a`)**, not Opus. Opus is smaller and technically the better
answer, but a silent iPhone is the worst possible outcome for a gift and AAC is
the format nothing anywhere refuses. Test Opus on her actual phone first.

Budget: a 90-second stereo loop at 128 kbps is about 1.4 MB; six files is about
8 MB. That is a lot on mobile data in Kano or Shanghai, so nothing loads until a
road is entered, the primary bed loads first and starts, and the layer arrives
behind it at silent gain. A layer that has not downloaded yet is a layer that has
not joined yet.

**The seam it plugs into already exists.** The corner player is stopped on a road
rather than ducked, so a road bed has the `music` fader entirely to itself and
nothing to fight. It belongs on that fader, not on `world` — it is the one sound
in a race that nobody in the fiction can hear.

### Stage 4 — Freesound, only for named gaps

**Source:** [freesound.org](https://freesound.org/) — **filter to CC0 only.**
Freesound carries several licenses; some require attribution and some forbid
commercial use, and they are mixed together in every search result.

Do not open this until the music is in and there is a written list of specific
sounds that are still missing. Otherwise it is an afternoon of browsing.

---

## Where the files go

**In the project, not in Storage.** Three reasons, and the first is decisive:
`storage.rules:141` requires `isOneOfUs()` on every read, so a Storage-hosted
asset is an authenticated fetch against a rules evaluation and cannot exist
before sign-in. It is also a second origin — a fresh DNS and TLS handshake
before a byte moves, 200–400 ms on a phone — and a single-region bucket rather
than an edge CDN, which matters for Kano and matters more for Shanghai.

The line is: **if you chose it for the road, it is code; if either of you
uploaded it, it is data.** Road music is level design and ships with the level.
The corner player's songs are genuinely user content and stay exactly where they
are.

Import them rather than dropping them in `public/`, so Vite content-hashes them:
a re-mixed track gets a new URL and can be cached for ever, and a typo'd
filename is a missing key at build time instead of a 404 nobody notices. Commit
compressed exports only — keep the masters outside the repo and audition from
there, so each file enters git history once, when it is chosen.

While you are there: `vercel.json` is only the SPA rewrite. Hashed assets want
`Cache-Control: public, max-age=31536000, immutable`, or every visit
re-validates the lot.

---

## What is left

**Almost nothing.** The music is in — one file per road in `./music/`, picked up
by name, played by `roadMusic.ts` and driven per frame from the race loop. It is
not a level soundtrack: it starts at the green light, arrives over about fifteen
seconds from almost silence, ducks for the drift, the Drowned Mile and a close
strike, fades on a pause and again at the flag.

1. **`Cache-Control` on hashed assets in `vercel.json`** — the one real gap.
   Without it every visit re-validates the beds, and they are the biggest thing
   the app ships (the Stormcrown's is 5.6 MB).
2. **Convert the beds to `.m4a`** when convenient. AAC at the same bitrate is
   meaningfully better, and the loader already prefers `.m4a` over `.mp3` for
   the same name — so it is a drop-in, not a migration.
3. **A second intensity layer** per road, if the single bed ever feels flat. Two
   files started together need a shared clock, so this wants decoded buffers
   rather than a second element; it is a real piece of work rather than a
   filename, and the single bed may well be enough.
4. Freesound CC0, only against a written list of what is actually missing.
