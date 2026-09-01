# Notes between us

Two of us work on this garden — Claude and Codex — and not always at different
times. On the 26th of August we were both in it at once: `track.ts` was rewritten
seventeen seconds before the other one read it, the project stopped compiling for
about a minute, and it came back on its own. Nothing was lost, but only because
the collision happened to be in a file one of us had finished with.

**This file is a log, not an instruction.** Neither of us should tell the other
what to do here — the plan lives in `PLAN.md` and the person whose garden this is
decides what happens. What this is for is the thing that is genuinely expensive
to discover twice: *what just changed, and what was learned doing it.*

## The other side of this

Codex keeps `CODEX_NOTES.md`. The arrangement, as written in both files: **each
of us reads the other's before starting**, and neither writes in the other's.
This one is Claude's.

## How to use it

Add an entry when you finish something. Newest at the top. Say what moved, what
it cost, and — the useful part — anything you measured, because a measurement is
the one thing the next reader cannot cheaply repeat.

Keep entries short. The reasoning belongs in the code, next to the thing it
explains, the way everything else in this project does. This is an index, not a
second copy of the truth.

If you are about to work somewhere the other has just been, that is fine. Read
their entry first.

---

> **For Codex, before the Stormcrown:** `GameDefinition.Component` and
> `.Stage` are no longer plain components — they are `Later`, from
> `systems/later.ts`, so a third road's stage wants
> `Stage: later(() => import('./Race').then((m) => ({ default: m.YourStage })))`
> rather than a direct import. Everything else in a game definition is
> unchanged and still eager. Nothing else of yours was touched: the rally's
> model, sampler, physics, checks and README are as you left them.

## 1 Sep · Claude · a held drift keeps its speed, and the music belongs to the race

Two things, both reported from actually playing it.

### The drift bled away to nothing

Holding one direction bled to 57 km/h against a dial reading 72 — on every
seed, with the scrub dial wound to zero, which is why turning dials had not
helped. `npm run drift` reproduced it exactly.

The whole deficit was `DRIFT_ANGLE_COST` applied to a *held* pose. That cost is
right about the entry — hanging the car out scrubs speed and should — and wrong
about every second after it. A slide already settled at its angle is not
scrubbing harder this second than last; it is sliding, which is the point of it.
What genuinely costs is *moving* the pose, and that is the swing term, untouched.

So `car.driftSettled` counts how long the pose has been still (knocked back
hard when `|swing|` is over 0.35 rad/s), and the angle's bite fades with it.
`TUNE.driftHold`, new dial in the drift group, default 0.85.

    before   108 · 65 · 59 · 58 · 57 · 57 · 57
    after    108 · 65 · 67 · 70 · 70 · 70 · 70

The entry still costs; then it holds. **Both side-swap traces are byte-identical
to before** — a swap never settles, so it never gets the relief, which is what
keeps a chicane expensive.

### The music belonged to the level, not the race

My mistake, and the owner caught it: the first version started on `open()` and
stopped on `close()`, so it played over the road-choice screen, over the result,
and over the menu. It is driven per frame now from the race loop — one `want`,
the product of an arrival curve and three ducks, all smoothed:

- **arrival** 15 s from a floor of 0.06, smoothstep *squared*, so the loud half
  is the second half and it reads as arriving rather than as a fader being
  pushed. Measured over a real Rootway race: 0.026 → 0.413.
- **drift** −42%, down in 0.14 s and back over 0.55. Hand-driven with real key
  events, because the fire-spirit is far too tidy to ever trigger it: drift 0 →
  1.00, `want` 0.242 → 0.188 on entry, released on exit.
- **depth** −50% *and* a lowpass from 20 kHz to 620 Hz. Measured on the dive:
  the sweep tracks `deep.at` exactly.
- **thunder** −55%. This one needed a new signal: the flash and the bang are up
  to eight seconds apart, so `lightning()` now returns when the sound will
  arrive and `StormcrownSound` books the envelope into `storm.thunder`.

Three things worth not rediscovering:

> **`frame()` returns early when paused**, before anything I had added — so the
> music never learned it was paused and held its last level under the paused
> screen. It is driven from `driveMusic()` above that guard now.

> **`ambience` had no music bus.** `volume.ts` has documented three faders for
> a long time and the graph only ever had two, because the corner player applies
> its own. A road bed needs a real node to be ducked and filtered on, so there
> is a third now, and `setLevels` moves all three.

> **`import.meta.glob` does not exist in Node**, and `roadMusic` reaching
> `session.ts` took `npm run rally` down on the import line. Wrapped in a
> try/catch — Vite transforms the call before the browser sees it, so the try
> wraps an object literal and costs nothing. The same import chain then hit bare
> `import.meta.env.DEV` at module scope in four `systems` files; those are
> optional-chained now, which makes the whole audio layer Node-importable.

`musicWant` is exported and pure so `npm run sound` can drive it — it is the
only real judgement in the module and everything around it is an element and a
context. Thirteen new assertions, including that every combination of the three
ducks stays a finite number in 0..1.

## 1 Sep · Claude · a road can bring its own music

`ember-rally/roadMusic.ts`, and an empty `ember-rally/music/` folder with a
README in it. Drop `rootway.m4a` — or `.mp3`, see below — into that folder and
the road plays it. There is nothing else to wire up.

`import.meta.glob('./music/*.{m4a,mp3}', { query: '?url' })` rather than files in
`public/`, so the build content-hashes them: `rootway-BOjAqwDR.m4a`. Change a
sample and the URL changes, so a phone holding the old mix cannot keep playing
it, and the old one can be cached for ever. With a fixed path in `public/` that
problem is unsolvable without renaming files by hand.

**Both `.m4a` and `.mp3`, and the mp3 is not a grudging fallback.** Pixabay hands
you an mp3. If only `.m4a` were read, adding a song would begin with installing
ffmpeg — a real step, on a real evening, between somebody and the thing they
wanted to do. `.m4a` wins when both exist, because converting is worth doing
eventually and worth nothing first.

One real bug found by driving it, and it is not a StrictMode curiosity:

> `open()` is an effect in `EmberRally` and `close()` is that effect's cleanup,
> so every road in development is opened, closed and opened again within a few
> ms. The close scheduled a 700 ms fade-out; the fade-out ended *after* the
> second open had a track playing and called `pause()` on it. Symptom:
> `AbortError: The play() request was interrupted by a call to pause()`, and the
> road came up silent every time. **Production reaches the same race by pressing
> "again" while a road is still fading out.** Fixed with a generation counter —
> every start or stop takes a number and a deferred step does nothing unless its
> number is still current. Last call wins.

`__roadMusic` in dev carries `stage`, `level`, `silent`, `source`, `sounding` and
`problem`. `problem` earns its place: a track that will not play is the failure
somebody will actually hit, and its symptom is silence — which is also what
success looks like on a road with no music. Without it, "I added the song and
nothing happened" has no next step.

Measured in a browser: corner song playing → enter the Rootway → corner stops,
bed fades to full, `sounding: true` → leave the road → bed stops and the road
lets go of it. Repo left with the folder empty, so nothing ships until a real
file does.

## 1 Sep · Claude · the thunder is a distance now, not a thump

Codex's sound brief said the one thing worth *buying* was thunder, and I agreed
with that in `SOUND.md` before reading the old `lightning()` properly. It was
wrong. Thunder did not need a recording, it needed to stop being written as a
sound effect and start being written as a distance.

Four faults, all the same fault:

- **The flash-to-bang gap was capped at 1.2 s**, which puts every stroke inside
  four hundred metres. Everyone on earth knows this sound — you count between
  the flash and the bang — so a storm you are supposed to be *climbing out of*
  was permanently on top of you and the flash meant nothing. It is `metres/343`
  now, out to eight seconds.
- **No air absorption.** Distance eats the top of a sound long before the
  bottom, and that is what a rumble *is*. One exponential on the cutoff gives
  the whole family from tear to rumble, so near and far are the same
  synthesiser rather than two presets.
- **No crack.** The bright transient fired on the *flash* — at the speed of
  light, so it arrived with the light and not with the sound. There is a
  stepped-leader crackle a few milliseconds ahead of the shock front now, and
  the front itself.
- **Thunder is not one event.** A crooked channel kilometres long sends a
  separate peal from every bend. Five to nine of them, unevenly spaced, each
  with its own level, colour and side — that irregular sequence is the whole
  difference between thunder and a drum.

And the duck, which was already in the brief as the cheapest win available: a
`weather` bus that everything continuous goes through, down about 3 dB as the
front lands and back over a third of a second. The crack is no louder than it
was and lands twice as hard, because the ear reads the hole around it. It does
not reach the car — that is a separate voice on the effects bus and reaching
across for it would be a layering violation.

Rain got the small version of the same treatment. Discrete drops already existed
(`rainImpact`, 7–13 a second) — I had assumed they did not and was wrong — but
every drop was the same drop, and eleven identical ticks a second is a texture
rather than weather. Drops have a size now, skewed hard to small, and the fat
ones get a low ring off the bodywork under the splash.

`npm run sound` covers the Stormcrown too now, with 75 strokes across the whole
remoteness range: near 0.41 s, far 8.0 s, a 19.6× spread. Verified both new
assertions bite — restoring the old 1.2 s cap fails the range, and deleting the
duck's return-to-1 fails the recovery. That last one is the only thing here that
could have failed *silently and for ever*: the mountain would have got quieter
with every strike and nothing on screen would have said so.

In a live browser: a stroke at 316 m arrived 0.92 s behind its flash, which is
316/343 to the hundredth. Worth knowing for anyone else driving this headlessly
— the Stormcrown renders at a few fps under the software renderer, so the game
clock crawls and you get about six strokes a minute instead of thirty. The road
is fine; the harness is slow.

Net effect on the shopping list in `SOUND.md`: **only the music is left.**

## 1 Sep · Claude · the Rootway can be heard, and the music gets out of its way

The other two roads had a soundscape and this one never did, so driving
underground played the *garden's* ambient bed — open-meadow air, in a cave,
which is the exact failure the top of `ambience.ts` was rewritten to stop.

Three files in the shape yours already use: `tunnel.ts` is the plain per-frame
object beside `weather.ts` and `depth.ts`, `RootwaySound.tsx` is the bridge,
`systems/rootway.ts` is the voice. Room tone, draught, your own dust off a close
wall, seep, drips at three distances, lantern fire, root creaks, and the rock
taking its weight — all noise off the shared buffer, no second context.

**The subject is enclosure**, because that is what this road actually does: a
chamber is thirteen metres to the vault and the throat before the arrival hall
is under four. `enclosed` drives the reverb send *and* the pre-send filter
together, so a hall reads as distance rather than as volume. Crossing a
threshold is derived from the edge in the state rather than announced by the
racer — the road is already telling the voice everything it needs.

There is no fork any more, so the "shortcut narrows the mix" idea in the brief
that started this became "the road narrows the mix", which is better: it happens
all lap instead of once.

Two things measured, both of which changed the code:

- **The lantern field pinned.** Corner lanterns are eleven metres apart and four
  or five overlap, so the fire layer sat clamped at 1 for about half the road —
  measured in a real browser over a real lap. Weight down from 0.5 to 0.17; it
  now peaks at 1 only at the two hearths and is pinned for 2% of a lap.
- **The root field was worse** — mean 0.97, pinned for 79%, on every seed. A
  field that is always full cannot say *here* is rootier than *there*. Scaled to
  0.16: mean 0.37, never pins, and rather less than half the road is over the
  threshold the creaks need. Both fields moved into `tunnel.ts` so the check can
  drive the real lantern layout instead of a plausible-looking sine.

`npm run sound` now exists, which makes the line in `STEPS.md` true — it was
describing a script that had never been written. Stub Web Audio, a real lap,
and it fails on a non-finite AudioParam, an exponential ramp to zero, a gain
that never becomes audible, and anything still running after `stop()`. Verified
it bites: injecting one `Infinity` fails 6109 writes and exits 1.

One thing worth not repeating: the drip assertion first said `> 30`, and the
drip schedule is randomised on purpose — over twelve laps the count runs 28 to
38, so it failed about one run in three. A check that cries wolf teaches you to
run it again. It asks `> 12` now, which is far below anything a working layer
produces and far above the zero a broken one gives. Ten runs, ten passes.

**And the corner player stops on a road.** Not ducked — the brief that started
this claimed `Player.tsx` already ducked to 14% during a game, and that is the
*voice-light* duck; there was no interaction with the games at all. `silenced`
in `systems/listening.ts` is local to the device, never touches either anchor —
so if you are in step, her song carries on untouched — and nothing turns it back
on but a deliberate press. The player draws itself stopped while silenced,
including the lock-screen card, because a ▶▶ that is making no sound is the
interface lying about the one thing it reports.

Measured in headless Chrome over a driven lap: rms 0.03–0.16, peak 0.28,
`enclosed` swinging 0.06 to 0.96, fire 0.01 to 1.00, drips and thresholds both
accumulating. `npm run rally` and `npm run typecheck` unchanged.

`ember-rally/SOUND.md` is the whole picture — what exists, what not to download
and why, and the four stages that are left. The short version: almost nothing
needs downloading except thunder and music.

## 27 Aug · Claude · the control room has tabs

The owner opened the page for the first time and the verdict was fair: one
continuous scroll with forty-one sliders in the middle of it is not dense, it
is a wall, and everything below the car had become unreachable.

Two levels now. **Four tabs** across the top — car, world, you two, device —
split by *what you are doing* rather than by what the settings are, which is
why the quality tier sits with "wipe this device" and not with the sky. And
**ten chips** inside the car for its groups of dials, with a count on each chip
saying how many in that group you have moved, so half-finished work says where
it left off without opening anything.

Two things that are not decoration:

- **Both selections are remembered in localStorage** (`ui/remember.ts`). The
  drive loop is slider → *drive it now* → drive → back, and "back" is a full
  page load, because the garden and the control room are different pages by
  design. Tabs on ordinary React state would have landed you on the first tab
  forty times an evening — they would have made the one loop the page exists
  for measurably worse than the wall they replaced.
- **The filter and "only what I have changed" ignore the chips.** Those two
  questions are about the whole car, so while either is on, every group with a
  match is shown and no chip reads as active. A filter that searched only the
  tab you happened to be on would be a filter that lies.

Chips rather than underlined tabs because this page has no typographic baseline
for an underline to sit on — it is a monospace grid of boxes, so a filled box
among outlined boxes is the same language everything else here is written in,
and it survives wrapping to three rows on a phone.

Nothing about the car changed: `npm run rally` and `npm run tuning` both still
report what they did this morning.

## 27 Aug · Claude · the car is tuned from `/dev7731` now

Forty-one dials — grip, weight, gravity, steering ratio and hand speed, brakes
and their balance, the handbrake, all three helpers, the drift, the ember, the
camera, the body — lifted out of `physics.ts`, `camera.ts` and `controls.ts`
into a new `ember-rally/tuning.ts`, with a slider each in the control room.
Nothing in Codex's files was touched: `track.ts`, `geometry.ts`, the two roads
and the Rootwake fork are exactly as they were.

**The car did not change.** `npm run rally` prints byte-identical numbers to
before the split — 0–100 in 7.97 s, top speed 35.27 m/s, understeer gradient
1.86°/g, same kick recovery, same drift angles. That was checked by stashing
the work and running it both ways rather than by reading the diff, and it is
the only check worth doing on a refactor like this one.

Three layers: the code, then a published set (one Firestore doc, warm only),
then this device's draft in localStorage. Drafts win locally, which is what
makes an hour of dragging sliders safe — her car does not move until one
deliberate button sends the set.

Two things measured, both of which cost time:

- **A dial that was lifted but never re-pointed still renders perfectly.**
  Slider, value, note, moves when dragged, car does nothing, forever. `npm run
  tuning` now drives the car once per dial and insists the drive comes out
  different. It found nothing dead in the end, but only after the *test* was
  wrong three times in a row — which is the actual finding below.
- **A sine wave is not a driver.** The first probe steered with `sin(t)` and
  scrubbed the car down to 13 m/s, where it never left second gear, never held
  a drift past a tenth of a second and never earned enough ember to press the
  button. Three perfectly wired dials came back dead. Driving it with
  `spiritDriver` instead fixed all three — and it is a closed loop, so it
  *amplifies* a dial moving rather than washing it out.
- And three dials cannot be reached from any realistic lap at all. Slide
  catching and spin protection both stand down inside a drift on purpose, and
  outside one this car is extremely hard to get sideways — full lock into full
  brakes at 25 m/s peaks at **six degrees** of slip, because the lock available
  at speed is all the tyres can use. Those are put into the state directly now,
  the way `rally-check` does it.

**Not deployed:** `firestore.rules` has a new `rallyTuning/ours` block and
`npm run rules` cannot run here — `VITE_WARM_EMAIL` is empty in `.env.local`.
Until those rules are pasted into the console, sending will be refused against
the real backend. Local mode works today.

## 26 Aug · Claude · Rootwake's mouth, and the Stormcrown's weather

Both of these are in Codex's files and both were asked for by the owner. **No
driving changed**: all three roads time identically to before — rootway 83.7 to
89.6 s, moonbreak 114.5, stormcrown 178.8, same strikes, same wall contact.

### The mouth is rock now, not a curtain

The concealing veil is gone entirely — the web, the roots, the caught leaves,
the fifty-eight fragments, the camera shove, `EngineVoice.brush()`, the
`veilBroken` flag and `buildRootwakeVeil`. The owner's words were that it
looked unprofessional, and the reasoning holds up: **an entrance that announces
itself is not concealed, it is signposted, and one you have to smash is not a
road.**

What was actually wrong underneath is worth keeping. Joining two swept tubes by
omitting one wall for twenty-four metres is the right technique, and it leaves
raw polygon edges — a hard black rectangle over the opening and a flat plane
down one side. The veil was hiding that, and drawing the eye to it.

So the seams are covered with rock: an uneven lintel *sunk into* the vault
(at three quarters of the ceiling height each block had daylight under it and
read as a boulder parked in mid-air), two jambs half buried in the wall at
different depths so the opening is never a frame, and a spill of rubble outside
the width the car uses. All placed off a hash of their own index, so the mouth
is identical on both phones and between laps.

And **entering is a change in the light**: ambient and fog ease to a deeper
dark over about three seconds, off `car.shortcut`. The thing that is actually
true about Rootwake is that the lanterns stop, so that is what it says.

`?veil=hold` and `?veil=exit` are now `?rootwake=mouth` and `?rootwake=exit`.

### The Stormcrown climbs through weather

The road shape and distance were left completely alone — the owner likes them.
What was missing was that **the sky, cloud, rain and cedars were the same at
every height**, so 4.79 km of climbing from sea level to ninety metres looked
identical top and bottom and read as the Moonbreak in grey paint. The one thing
this road has that the other two cannot have was going unspent.

`stormAt` in `track.ts` turns `y` into two numbers, and everything reads them:

| | the road | what it is |
|---|---|---|
| under it | 0–26 m | fog at 60 m, wet slate, rain, cedars close |
| in it | 26–66 m | fog at **32 m and pale** — the only fog in the garden brighter than what it hides. Lands on the Cloud Shelf and the Thunder Stair |
| above it | 66 m+ | fog at 900 m, clear black sky, stars, and a floor of cloud below you. Lands exactly on your "eye" section |

Lightning is strokes rather than `pow(sin(t), 96)` — a countdown, one to three
strokes down the same channel, a tenth-second decay — and it goes through the
shared light block so the rock, road, cedars and car all take it together. Above
the cloud it flashes from *below* the horizon.

### Two real bugs found on the way, both yours to know about

- **The Stormcrown's sky dome has never once been on screen.** Radius 5200,
  centred on the middle of the track, against a camera whose far plane is 2400
  — clipped in its entirety, so all 4.79 km were looking at the flat
  `<color attach="background">`. It is 1600 now and travels with the camera.
  I only found it because a temporary red debug colour did not appear.
- **A cone is not a mountain.** `addPeak` built seven-sided single-apex cones,
  which at the summit read as flat black triangles pasted on a starfield. They
  are ridges now: eleven uneven sides, three summits on a bearing of their own,
  and snow above the cloud line — the pale line is keyed to `CLOUD_TOP` rather
  than to each peak's own height, so from up in the clear the mountains are the
  only other things above the weather.

## 26 Aug · Claude · signs that she has been here, and a room that remembers

Codex's two ideas, both built. The counters in the corners **stay** — that was
the owner's call and it is the right one: a number is the only thing that can
say *how many*. What the world says is the other half — *which one, and where*.
The two read the same source, so they cannot disagree.

`systems/newness.ts` is the seam. Each place remembers when you last stood in
*it* (not one mark for the whole garden, or a glance at the Tree would silently
clear the other four), the mark is **frozen on arrival and written on the way
out** (or you would clear the very thing you came to see, on the frame you
arrived), and it lives in `localStorage` — "have I seen this" is a fact about a
person looking at a screen, and keeping it local means no collection, no rule
change and nothing to deploy.

- **Tree** — already did this, via `Letter.readAt`. Left alone.
- **Glasshouse** — a memory of hers you have not seen throws a stronger pool of
  its own colour across the flagstones, breathing on about a seven-second
  clock. The pools already existed; they just do it harder.
- **Stars** — `uUnread` was declared in the shader, used in the fragment stage
  and **never written by anything**. It was also the wrong shape — one number
  brightens the whole sky, including your own lights. Replaced with a per-light
  `iFresh` attribute, so the light that burns larger is *hers*.
- **Wellspring** — one band of brighter water runs down the channel, over and
  over. A river carrying something rather than a pin on a map.
- **Hollow** — the fire throws a few more embers. The extra ones are always
  allocated and simply do not light (`EMBER_QUIET`), because rebuilding an
  instanced buffer because somebody took their turn is a hitch. The count comes
  from `theRoom`, written by the interface that already has those three
  listeners open — see the note in `systems/waiting.ts` for why the cave must
  not open them again.

And the Hollow now keeps what happens in it: ember veins spread through the
rock as the two of you accumulate. `systems/seasoned.ts` — slow (half lit is
most of a season of daily rounds) and **monotonic**, because pollen is a shared
pool that gets spent and a room that dims the day you buy something is a room
punishing you for using it. The high-water mark is local; the larger of the two
wins.

### Two traps, both of which have now bitten twice

- **Precision.** Adding `uniform float uTime` to the water's *fragment* stage
  linked nothing and drew nothing: the vertex stage has no `precision`
  directive, so it is highp there and mediump here — *"Precisions of uniform
  'uTime' differ between VERTEX and FRAGMENT shaders"*, logged to the console
  and nowhere else. The river was simply a dry valley. Anything time-varying
  is computed in the vertex stage and handed down as a varying, which is what
  the note at the top of `water.ts` already said.
- **Backticks in shaders**, twice more. `npm run shaders` catches it in about a
  second; run it after touching any `/* glsl */` block, not at the end.

### The tuning that mattered

The veins were built once and were metre-wide amber ribbons across the ceiling
after sixty rounds — a lava lamp. The fix was raising the ridge to a high power
so what survives is a *thread*, roughly tripling the frequencies, and halving
the brightness. Screenshots at 0, 60 and 300 rounds: bare rock, a hint, and
threads of ore catching the firelight.

## 26 Aug · Claude · nothing is downloaded until it is wanted

This one was Codex's idea and it was the right one. Both registries collected
their folders with `import.meta.glob(..., { eager: true })` and every folder's
`index.ts` reached straight into the thing it described, so every place, all
three games, the racer's physics and both of its roads, the admin page and the
whole Firebase SDK were downloaded before the first blade of grass.

**Before first paint: 696 KB gzipped. Now: 404 KB.** A further 89 KB arrives
quietly afterwards, and on the local backend Firebase's 214 KB is never fetched
at all.

- `systems/later.ts` is the new seam: `later(() => import('./X'))` returns a
  lazy component with a `warm()` hung on it, and `warmWhenIdle` pulls a list of
  them down once the garden has settled.
- `SectionDefinition.Scene` and `GameDefinition.Component` / `.Stage` are now
  `Later`. Everything else in both definitions stays eager, and the line is not
  about size: the row of places and the row of games are drawn *before* you
  choose, so names, blurbs, durations, cameras and the little card emblems have
  to be there. Only the worlds behind them are deferred.
- Firebase is fetched inside the effect `RealProvider` already had, behind the
  `'connecting'` state it was already showing. `Door` imports `signIn` inside
  its submit handler. `import type` stays — it is erased anyway.
- The admin page loads at its own hidden route and nowhere else.

**The wait is the part that would have been felt, and it is handled in three
places rather than one.** Everything is warmed a couple of seconds after the
garden settles; a place is warmed again the moment a slide picks it, which is
half a fade before the world swaps; and a game is warmed when its card becomes
the selected one in the Hollow. The Suspense fallback for a place is
`<GardenHub />` — so the worst case is not an empty world, it is *the garden you
were already standing in*, held a moment longer.

Verified by entering all five places in turn and sampling triangles **mid-fade**,
both normally and with every chunk delayed two seconds: the count never drops
below about 730,000 at the moment of the swap, because that is the garden
standing in. Never zero, never a spinner. Screenshots in both conditions show
the destination fully drawn.

Three.js is now over half of what is left (227 KB gzipped of the 404) and it is
irreducible — the first frame is 3D. That is the floor.

### If you are picking this up

- Nothing else is worth deferring. I looked: the next largest thing after
  three.js is the app's own core at 94 KB, and it is core.
- `window.__frame` under `?shot=1` reports draw calls, triangles, programs,
  geometries, textures, fps and the eight heaviest meshes. It is how both of
  the last two pieces of work were decided.
- The racer's geometry is **not** streamed and should not be: the whole 3.4 km
  Moonbreak builds in 53 ms, once, behind a 3.1-second countdown.

## 26 Aug · Claude · the frame is about half what it was

**Measured first.** Added `window.__frame` under `?shot=1` (in `world/World`):
draw calls, triangles, programs, geometries, textures, fps, and the eight
heaviest meshes in the scene. It overturned the assumption the work started from
— the Glasshouse felt heavy, and 83% of what it drew was the ring of trees
*around* it. The building was 3%. Draw calls (18) and textures (0) were never a
problem anywhere; the garden is vertex-bound.

Three changes, none of which alter a pixel:

- **`woodDetail`** in `world/tree`, the companion to `leafDetail` that never
  existed. A tree was 113 limb boxes against 250 leaf cards, and the limbs cost
  *more*. Background woods now draw a limb as one box instead of two and skip
  the outermost ring, which sits inside its own leaf spray. The rng is consumed
  in the same order at every detail level, so a thinned wood is the same wood —
  same tips, same splits, same hang points. The Tree of Letters is untouched at
  1, and must stay there: a letter is keyed to a hang point by index.
- **`buildTiles`** in `world/forms`. Every field in the garden carried
  `frustumCulled={false}`, for a real reason — an instanced geometry's bounding
  sphere comes from the base shape, which is one leaf at the origin. Fields are
  now cut into tiles with honest bounds and the ordinary frustum test does its
  ordinary job. Draw calls 18 → ~45, which is nothing.
- **`inTheView`** in `world/terrainShader`. The meadow and the flowers have no
  world positions in any buffer — they are wrapped around the camera in the
  vertex shader — so they are culled *there*, by the same `fade` that already
  softened the rim of the disc.

| | before | after |
|---|---|---|
| Glasshouse, phone | 334,272 | **55,276** |
| Glasshouse, desktop | 334,272 | **91,044** |
| Garden / Tree, phone | 471,758 | **305,840** |
| Garden / Tree, desktop | 723,358 | **625,506** |

Verified by rendering the Glasshouse with culling on and off — 218,622 against
91,044 triangles, and the two images are identical — and by inverting
`inTheView`, which made all the grass *in front* of the camera vanish.

`npm run tris` had gone stale and was reporting the treeline at its old figure;
it is corrected, and now says out loud that it counts what the garden *builds*
rather than what it draws.

### Numbers that may save someone else the measuring

- The whole Moonbreak — 3.4 km, 69 chunks, 68k triangles — builds in **53 ms**.
  The Rootway, 154k triangles, in 58 ms. Both happen once, behind a 3.1-second
  countdown. Streaming them would be a lot of machinery for a hitch that is
  already hidden.
- The bundle is **2.31 MB minified, 674 KB gzipped, in one chunk.** With
  comments stripped the app's own code is about 850 KB of that, and Ember Rally
  is a quarter of it. Firebase — app, auth, firestore, storage and database —
  is statically imported and is likely the largest single deferrable thing in
  the download.
- Headless is in slow motion. Frame delta is clamped to 1/20 s and SwiftShader
  manages one or two frames a second, so four seconds of wall clock can be under
  one second of eased time. Wait on state, never on the clock.

## 26 Aug · Claude · the racer

The Split (a shortcut on a longer Rootway), the Drowned Mile (a glass tunnel
under the Moonbreak), a drift that holds its line, and the frozen speedometer.
All four are written up in `src/world/games/ember-rally/README.md` and in
`PLAN.md`; the measurements live in `npm run rally`.

`npm run shaders` is new and worth knowing about: it sweeps every
`/* glsl */` template for a backtick inside a shader, which ends the shader and
is reported as a parse error several hundred lines away, usually in a file
nobody touched. It has cost real time four times.
