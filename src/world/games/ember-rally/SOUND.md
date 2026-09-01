# The roads, as sound

Read `../README.md` first for what the three roads are, and `systems/ambience.ts`
for the graph everything here plugs into. This file is only about the ear.

It exists because a brief arrived proposing that every road gets a downloaded
music loop, two downloaded intensity stems and a folder of environmental
recordings. The instincts in it are good and most of the recordings are already
in the repo — synthesised, and steering. What follows is that brief reconciled
against what is actually here, and then an order of work.

---

## What already exists

Roughly 3,600 lines of Web Audio, all of it synthesis, none of it sampled.

| File | Lines | What it is |
|---|---|---|
| `systems/ambience.ts` | 1476 | the one `AudioContext`, a 19-second shared noise buffer, six ambient layers crossfaded per place, world cues, and `synthesisBus()` — the seam a road voice plugs into |
| `systems/engine.ts` | 1046 | the car: engine, exhaust, induction, road, wind, front/rear scrub, squeal, brakes, cave reverb. Events derived from edges in the state, not from extra calls |
| `systems/moonbreak.ts` | 447 | the Moonbreak road voice — exposed air, water below, wet growth, arches overhead, the pressure and glass of the Drowned Mile |
| `systems/stormcrown.ts` | 487 | the Stormcrown road voice — rainwood, cloud, the clear crown above the storm, waterfalls with pan, lightning, the rods |
| `systems/volume.ts` | 122 | three faders: `world`, `effects`, `music`, per device, squared |

And the bridges, which are the established pattern for getting frame-rate truth
to a voice without React:

```
weather.ts  -> storm  --+
                        +-- plain object, written once a frame by Race.tsx
depth.ts    -> deep   --+   read by a *Sound.tsx bridge inside useFrame,
                            which calls voice.set(state) — one entry point
```

`StormcrownSound.tsx` reads `storm`; `MoonbreakSound.tsx` reads `deep`. Neither
subscribes to anything. Both acquire their voice lazily from
`ambience.synthesisBus()`, because the context may not exist until the first
gesture.

**The music, meanwhile, is not here at all.** `ui/Player.tsx` is the corner
player — songs the two of you chose, uploaded through `ui/AddMusic.tsx`, synced
between two phones. Line 167 already ducks it to `0.14` while a game is running.
There is no road music and never has been.

---

## The three real gaps

### 1. The Rootway has no voice

`Moonbreak.tsx:1191` mounts `<MoonbreakSound>`. `Stormcrown.tsx:833` mounts
`<StormcrownSound>`. Nothing mounts anything on the Rootway. Drive it and you
get the engine and the garden's ambient bed — which is open-meadow air inside a
tunnel, the exact failure `ambience.ts` was rewritten to stop.

This is the largest hole in the racing audio and **not one byte of it is a
download problem.** Every item on the Rootway environmental list — cave room
tone, narrow tunnel wind, gravel, stone scrapes, root creaks, drips at several
distances, lantern fire, the shortcut's debris, deep pressure rumbles — is
filtered noise and short envelopes, and every one of them needs to be *steered*
by position along the road, ceiling height, speed and shortcut depth. A recording
cannot narrow when the tunnel narrows. That is the whole argument the two
existing road voices already won.

> Note: `STEPS.md` documents `npm run sound` as checking "the Rootway's
> soundscape". There is no such script in `package.json` and no such file. The
> doc is ahead of the code. Fix that line when the voice lands.

### 2. There is no path for a sample at all

`SynthesisBus` hands out `{ context, output, noise, noiseSeconds }`. There is no
decoder, no buffer bank, no fetch, no cache. Nothing downloaded can enter this
codebase today without that being built first. It is small — see below — but it
does not exist, so "download some thunder" is currently a two-day job, not a
five-minute one.

### 3. Music, which synthesis genuinely cannot do

Everything above argues for synthesis. Music is the honest exception. Nobody is
writing a hybrid drum-and-bass bed in `AudioParam` calls, and it would be worse
if they did. **This is the one bucket where downloading is the right answer.**

---

## What NOT to download

Do not download environmental recordings for the Moonbreak or the Stormcrown.

They exist, they are steered, and layering a rain-on-metal loop over
`stormcrown.ts` would add megabytes to duplicate something that already responds
to how high up the mountain you are and whether you are inside the cloud. A loop
laid over a voice that moves does not add realism; it adds a second, static
opinion about the weather that the first one has to fight.

The single defensible exception is thunder — see stage 2.

---

## The downloads, in order

### Stage 0 — nothing. Build the Rootway voice first.

Before any download. Three files, mirroring the two roads that work:

1. `ember-rally/tunnel.ts` — the plain state object, sibling to `weather.ts` and
   `depth.ts`. Written once a frame by `Race.tsx`, guarded on
   `track.stage === 'rootway'` the way `deep` is guarded on `'moonbreak'`
   (`Race.tsx:1073`). Carries at least: `s`, `speed`, ceiling height / how
   enclosed, distance to the nearest lantern, shortcut depth, surface looseness.
2. `ember-rally/RootwaySound.tsx` — the `useFrame` bridge. Lazy
   `ambience.synthesisBus()`, allocation-free, one `voice.set(state)` per frame,
   edges for one-shots (a root creak passing, a rock fall).
3. `systems/rootway.ts` — the voice itself. Layers, in the idiom of the other
   two: room tone that narrows with the ceiling, tunnel wind whose whistle
   tightens as the walls close, loose-earth broadband riding speed, drips at
   three distances on unrelated periods, lantern fire near the lanterns, a
   sub-pressure that comes up in the deep sections.

The shortcut is the interesting part and it is a filter, not a file: the whole
mix narrows — high end rolled off, the reverb shortened, the sub raised — and
opens back out where the roads rejoin. That is four `AudioParam` ramps driven by
one `shortcut` number, and it is impossible with a loop.

Also add `scripts/sound-check.ts` and a `"sound"` script to `package.json`, so
the claim in `STEPS.md` becomes true. It catches the bug that matters: a
non-finite value reaching an `AudioParam` kills the entire bed silently.

### Stage 1 — the sample path

Still no downloads. Extend `SynthesisBus` with a one-shot bank:

- `bank(name): AudioBuffer | null` — returns null until decoded, never blocks
- fetch, then `decodeAudioData` once, cached, shared across every voice
- one-shots route through the **`effects`** gain if they happen because of you,
  **`world`** if the place did them (`volume.ts` has the rule)
- a missing file must be silent and logged, never a throw — this ships to two
  phones on bad mobile data and a 404 must not take the ambient bed down

Test it with one file before downloading a hundred.

### Stage 2 — Sonniss GDC bundle · thunder and a small handful

**Source:** [gdc.sonniss.com](https://gdc.sonniss.com/) — the GDC 2026 bundle is
7.47 GB, 347 WAVs, from 17 vendors. Royalty-free, commercial use, **no
attribution**, unlimited projects, files identical to the ones Sonniss sells.
The full multi-year archive is around 160 GB; you do not want it. Take one year.

**Download the 2026 bundle. Take at most a dozen files out of it.**

The case for real thunder is the strongest one on the list. `stormcrown.ts`
already synthesises it — `mountainImpulse()` builds a 2.75-second irregular
convolution with three unequal slope returns, which is genuinely good work — but
a real close crack has a spectral density and a multi-second decay that noise
convolution approximates and never lands. And the Stormcrown's identity rests on
that sound more than on anything else in the road.

What to pull:

- **5 thunder recordings.** Not variations of one. One close crack with almost no
  tail, one crack with a long rolling tail, two mid-distance rolls, one very
  distant rumble. The existing `lightning(force, remoteness, below)` signature
  already selects between them — remoteness picks the file, force picks the gain
  and the low-pass.
- **2–3 impacts** for suspension landings on the stair sections, if the current
  synthesised ones are thin. Listen first.
- Nothing else. Everything else in the environmental list is already playing.

Keep the WAV masters in a folder outside the repo. Only the compressed exports
get committed.

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
and one layer that joins above about 70% of top speed. If that works, add the
third later.

Ship **AAC (`.m4a`)**, not Opus. Opus is smaller and it is the technically better
answer, but a silent iPhone is the worst possible outcome for a gift and AAC is
the format nothing anywhere refuses. Test Opus on her actual phone before
switching.

Budget: a 90-second stereo loop at 128 kbps is about 1.4 MB. Six files is about
8 MB. That is a lot on mobile data in Kano or Shanghai, so: nothing loads until a
road is entered, the primary bed loads first and starts, and the layer arrives
behind it at silent gain. A layer that has not downloaded yet is simply a layer
that has not joined yet.

### Stage 4 — Freesound, only for named gaps

**Source:** [freesound.org](https://freesound.org/) — **filter to CC0 only.**
Freesound carries several licenses; some require attribution and some forbid
commercial use, and they are mixed together in every search result.

Do not open this until stages 0–3 are done and there is a written list of
specific sounds that are still missing. Otherwise it is an afternoon of browsing.

---

## The one decision that is not technical

**What happens to her song when a race starts?**

`Player.tsx:167` currently ducks the corner player to `0.14` during a game. Add
road music on top of that and 14% of a chosen song is playing underneath a
drum-and-bass bed — which is neither of them, and it is the worse of the two
failures because it makes a deliberate choice sound like a mistake.

**The recommendation: on a road, road music replaces the player entirely.** Duck
the `<audio>` element to zero over about 400 ms on entry and restore it on exit.
The garden's rule is that music is something playing while you are somewhere
else, chosen on purpose — and the roads are the one place in this world with a
tempo of their own that a chosen song will fight. Racing is the exception that
proves the corner player right everywhere else.

The alternative — no road music at all, corner player left at full — is
defensible and cheaper, and it keeps `PLAN.md`'s rule unbroken. It is worth one
moment's thought before stage 3, because stage 3 is pointless under it.

### And the duck that makes the storm real

When `lightning()` fires close, everything except the thunder drops about 3 dB
for roughly 200 ms and comes back over 800. One gain node between the road mix
and the master, one `setTargetAtTime`. It costs almost nothing and it is the
single largest gain in this document — it is the difference between thunder
playing over a race and thunder happening in one.

---

## Order of work

1. `tunnel.ts` + `RootwaySound.tsx` + `systems/rootway.ts` — the missing road
2. `scripts/sound-check.ts`, and make `STEPS.md` true
3. The one-shot bank on `SynthesisBus`
4. Sonniss 2026, five thunder files, wired into `stormcrown.lightning()`
5. The 3 dB lightning duck
6. Decide the music question above
7. Pixabay, six files, per-road bed with a speed layer
8. Freesound CC0, against a written list of what is still missing

Steps 1–3 are the whole of the real engineering, and none of them require a
download. Steps 4–8 are shopping, and they are cheap once the seams exist.
