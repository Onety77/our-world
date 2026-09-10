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

## 10 Sep · Claude · the Moonbreak, at night

The owner's ask: the level looked plain, make the world feel full — and do not
touch the track, the lanes or the corners. None of those moved. `npm run
moonbreak` passes unchanged, and `npm run rally` imports none of the files below.
The whole story is in the ember-rally README under **The drowned garden, at
night**; this is the index.

**Two real bugs, both found by rendering the road, not by any check.**

- **Tidecut and the Moonhook are below the sea.** The drop off the span and the
  Fall both put the road at −3.6 m against a water plane at −1.08, and `Race`
  keyed the water's light off the road's height alone. Every run, both hard
  corners turned green for a few seconds, the camera went through the water plane,
  the car sat under a sheet of translucent sea and the Drowned Mile's shoals swam
  in the open sky. They are sea-walled cuttings now (`addSeaWall`, `buildCutMask`
  in `Moonbreak.tsx`), and the depth drive in `Race` and `dev-span` only applies
  inside `MOONBREAK.deep`. The Moonbreak soundscape reads `deep.at`, so its false
  plunge at Tidecut is gone with it.
- **`track.boulders` were never drawn on the Moonbreak.** The physics strikes you
  with them; now you can see them (`addSeaStone`).

Also the underwater moon spot was pinned to a world point a kilometre from the
Drowned Mile, so it never appeared. It is camera-relative now.

**What moved**

- `materials.ts` — `uMoonDir`/`uMoonColor` in the shared light block. Black, and
  skipped, on every other road.
- `Race.tsx` — `ABOVE` retuned for a night (ambient `#7e889c`, fog `#2a3244`,
  veins turned down, moon `#b8c6e0`), and the depth gate above.
- `moonlight.ts` (new) — the moon, `nightSky`, a noise chunk. Its own file so the
  world and the far shore do not import each other.
- `Moonbreak.tsx` — sky, moon, carried sea with the moon path, sea walls, spills,
  and all the placement calls. `Moonshore.tsx` (new) — ranges and drowned ruins.
  `moonGarden.ts` (new) — trees, arches, posts, sea stones, viaduct, terraces,
  sunken columns. `Moonlife.tsx` (new) — lilies, fireflies, petals.
  `Deepwater.tsx` — shafts of moonlight.

**For Codex.** Nothing in `systems/moonbreak.ts` or `MoonbreakSound.tsx` was
touched. Two things there might want sound now: the sea spilling over the walls in
both cuttings, and the viaduct's vaults going past under the Stair. The arch on the
span is still the old light hoop, so its arch-pass event still lines up.

**Measured**

- Through ACES at 0.98, the old palette: horizon `#8793aa`, sea `#225769`, fog
  `#060e1d`.
- Phone portrait, 390×844, at the start, the orchard and Tidecut: 58–60k
  triangles and 34–38 draw calls. Heaviest single thing: the lily pads, 9.4k.
- Typecheck, the 143-shader sweep, `npm run moonbreak` and the production build
  pass. `npm run rally` prints three flags — the Drowned Mile at 50.2 s against a
  26–42 s target, its mouths at 1206/2119 against the tube's 1233/2102, and the
  Stormcrown spirit at 241 s — and since that script imports only physics, tuning,
  track, spirit, model and session, all three predate this.

## 8 Sep · Claude · the emoji board answers the mouse now

Three things were wrong with it, and the third one hid the other two.

**Every emoji landed at position zero.** Two causes, stacked. The board used to
render inside a wrapper element that only appeared when it opened, which changes
the shape of the React tree — so React discarded the textarea and built a new
one, and a new textarea has its caret at 0. And even without that, the caret was
read on the way *out*, by which time the grid had the focus. The wrapper is gone
for good (`Ink` returns the bare field in every state, on every machine, because
five different layouts position it directly), the board is a portal placed from
the field's measured rectangle, and the caret is taken in the keydown handler for
Alt+E while the field still holds it.

**It always opened upward, and in full-screen film the composer is at the top of
the screen**, so the one place it was needed most was the one place it was cut
off. It measures now: `box.top - tall - OFF < 8` flips it below.

**And it was completely dead to the mouse.** This is the one worth writing down.

`useDismissOutside` binds `click` in the **capture** phase on `document`, and its
handler ends:

```js
if (!info.control) consume(event)
window.clearTimeout(dismissTimer)
outsideWorldTap = false
dismissNow.current()     // ← unconditional
```

Being a control spares you from having the event *consumed*. It does not spare
you from the dismissal. So every click anywhere in the board called
`stopWriting()`, which unmounted the composer, which unmounted `Ink`, which
unmounted the board — all in the capture phase, before React's bubble-phase
handler on the button under the mouse had run. Clicking "edit" did nothing;
clicking an emoji made the whole composer disappear. The keyboard worked
perfectly, because nothing listens for keys, and that asymmetry is what made it
look like a portal/React problem for an hour. It is not: **`onClick` in a body
portal is fine. The click was being answered by something else first.**

The fix is a general one, because the collision is general — any panel belonging
to an open surface but rendered elsewhere in the document has it.
`useDismissOutside` now also counts `[data-inside]` as inside, and the board says
`data-inside` on its root. If another portalled panel is ever added to a
dismissible surface, that attribute is the whole contract.

**"add one" is "edit".** Inside it: shift+arrows or ‹ › move one, `×` or
backspace removes one (starters included — it is your keyboard), and a paste
field adds one, on paste or on Enter. Usage-based sorting is gone from
`systems/emoji` entirely: a list that reshuffles as you use it can never be
learned, and the point of a grid with arrow keys is that the third one along is
always the third one along. The order is yours; `all` is the order.

### A section was silently not rendering while I tested this

`uDawn` was declared in `Conversation.tsx`'s **vertex** shader and used in its
**fragment** shader. Uniforms are per-stage — each one compiles alone and sees
only what it names — so the fragment compile failed, the material failed, and the
whole Stars fell through to "try that again". No TypeScript error, no build
error, and `npm run shaders` passes: it looks for backticks that end a template
early, not for identifiers that do not resolve. The only thing that catches this
is opening the page.

Worth knowing that `npm run shaders` has this blind spot. A cross-stage check —
uniform used in FRAG, declared only in VERT — would be cheap and would have
turned an hour into a second.

### Verified

Real CDP mouse and key events at 1280×800, against the Stars
(`scratchpad/emoji.mjs`):

| | |
|---|---|
| caret | `"hello world"`, cursor at 5 → `"hello😂 world"` |
| flip | composer pinned to the top → `is-under`, fully on screen |
| click an emoji | `"hello😂 world"` → `"hello😂🥹 world"` |
| edit | `.emoji.is-editing` after a real click |
| reorder | `❤️ 😂 🥹 😭 …` → `❤️ 😂 😭 🥹 …` |
| remove | 40 → 39 |
| add | 39 → 40, `🦄` at the front, in `localStorage` |

Two things the render showed that the assertions did not: the paste field was
6.5rem, which clipped its own placeholder to "paste one to", and the `×` badges
were too soft to read against a colour emoji — the busiest background there is.
Both widened and darkened.

## 8 Sep · Claude · Her Morning — the Stars' second sky, done properly

The first attempt at this was thrown away. It deserved to be: it changed the
lower third and left the sky, it never touched the sound, its swipe only worked
in one direction, and it made the conversation unreadable. Four separate
failures, and three of them were things I did not check at all.

**The theme is the other half of the place's own sentence.** The Stars has
carried the same line since it was made — *"your night, their morning, and the
space in between"* — and has only ever drawn the first half, with her dawn as a
band on the far horizon. So the second sky is that band, stood inside: the stars
go out, the plain sinks, the ridges come up pale in haze and the sun she is
already under rises over them. Crossing the screen crosses the world.

### Three ways across, because a drag from the edge is a phone gesture

Asked how to change it on a laptop, and the honest answer was "click and drag
from within thirty-six pixels of the right edge" — which technically worked
and is a thing you aim at rather than a thing you do. There was no keyboard
way at all, on the surface where they type all evening.

So: **Alt+S** from anywhere in the Stars, a **click on the handle**, or the
drag. Alt is the modifier this garden does not otherwise spend, and the
conversation already ignores every Alt-modified key, so it can never be
mistaken for the start of a message.

The handle became a real button to do it — it was decoration with
`pointer-events: none`, which is right for a hint and wrong for the only thing
on screen that says the second sky exists. The pull now makes an exception for
it, because it sits in the middle of the very band a drag starts from and
bailing on every button would have made the one visible affordance the one
place the gesture refused to begin.

**And it was on the wrong side.** The handle still moved to whichever edge the
other sky was behind — left over from the two-edge pull I had already replaced
— so in the morning the only visible handle sat on the left while the only
working edge was on the right. A hint pointing away from its control is worse
than no hint. Found by asking the page where the button actually was rather
than by looking at a screenshot, which would have shown a small bright line in
a plausible place.
### The four faults, and what each one actually was

**Seventy per cent of the screen never moved.** The night dome was *tinted* by
the crossing rather than faded, so the night sky was still there underneath the
whole time. It now goes to alpha zero while the morning dome comes over the top,
and the two dissolve through each other — halfway is a violet sky with the last
stars in it and the sun already on the ridge. The night's motes and its two
lights leave with it; they are as much "your night" as the ground is, and
leaving them hanging in a sunrise was most of why it read as two pictures
stacked.

**The sound could not possibly have changed, and I should have caught it.**
`setShade` was a *multiplier* on the place's own mix, and the Stars plays no
`air` and no `leaves` at all — both are zeroes in its column. Asking for six
times the air produced six times nothing. It sets levels outright now, because
**a weather is not a louder version of another weather**; it is a different set
of layers. The morning is open air and something growing in it, with the close
hush of a night plain taken out and the cold sparkle nearly gone.

**The swipe only worked one way.** I had put the way back on the *opposite*
edge, reasoning that each sky lives behind its own side. Tidy, and wrong: nobody
remembers which edge they are owed. One edge now, and it toggles — pull from the
right and whichever sky you are not in comes across; do it again and it takes
you back. One gesture, and it is its own undo.

**The words went invisible.** The messages are cream and pale blue because they
hang in a night. Over a sunrise they vanish, and the conversation is the entire
reason the place exists. They are dark ink in the morning now — warm brown on
your side, slate on hers — with the dark halo behind them replaced by a pale
one, and the message-lights put out, because nothing glows at sunrise. That
inversion turned out to be the single strongest thing separating the two skies:
light *in* the dark against words *on* the light.

### Two things that bit, both silent

**A custom property declared on a descendant beats an inherited one, always.**
I wrote the crossing onto the document element every frame and also declared
`--dawn: 0` on `.talking` — so every message inside it read the local zero and
the ink never moved. Nothing errors; the value is simply never seen.

**A sky on its own is a gradient, and a gradient is not a place.** The first
morning was a beautiful wash with a sun in it and nothing to stand on. Four
ridges receding into haze fixed it — and they have to be *pale*, palest at the
back: at night a ridge is a dark cut-out against a lit horizon, at dawn the air
between you and it is full of light. Getting that backwards gives a sunset with
the colours swapped. The first set of ridges was also too dark and too high and
put the last three messages black-on-black, which is the same mistake as the ink
in a different costume.

### And the smaller asks

The pen changes with the sky — `setPen` runs the nib from a hard bright point
to soft pencil, lower and blunter and quieter, because the scratch of a nib over
a sunrise is the one sound that still belongs to the middle of the night. The
sun rises as you pull, breathes in the haze, and the whole dome lifts on a
ninety-second cycle. Chaff drifts through the low light where the night has cold
sparks.

The sun sits nearer the middle than looks right on a laptop: a phone's field of
view is about half as wide, and comfortably off-centre on a desk is *off the
screen* on the surface this is mostly read on.

**Verified by driving the gesture**: crossed to 1.00 with the ink measured at
rgb(0.29, 0.17, 0.07), then the same edge again to 0.00 with the ink back at
cream. `npm run places` still has the cave as the quiet one.

## 8 Sep · Claude · The Hollow stops repeating itself, and the roads join the room

> *"it doesnt have to still have the full descritpion of the game on it, since
> you already know what you select"* — and the roads *"doesnt really fit the
> exisiting cards styles in the hollow"*

Both true, and photographing the three screens in a row made the shape of it
obvious: **choosing a game, choosing a way and choosing a road were three
different design languages for the same act.** Frameless cards under a serif
name; then a bare text list; then an illustrated carousel with its own type
scale, its own arrows and its own dots. Nothing was wrong with any one of them
and together they read as three products.

**The ways screen was showing you the card you had just chosen.** Emblem at
fourteen vh, full name, whole blurb, duration — the entire game card again, at
full size, on the screen you reached *by tapping that card*. It pushed the only
new thing into the bottom half and left a third of the phone empty under it. It
is a name beside its mark now, on one line, and the three ways take the room
that gave back.

**The roads keep their illustrations and lose their frame.** Those scenes are
the best thing on that screen and the reason a road is worth *choosing* rather
than listing — the Rootway's arch, the Moonbreak's water, the Harmattan with no
horizon in it at all. What changed is everything around them: name and line at
the game card's scale, the way in as the same small capitals as "bring it to the
fire" and only on the one you are looking at, the Hollow's smaller arrows, its
round marks, its heading size. The scenes now fade at both edges instead of
being cut square, so they sit *in* the dark rather than on it.

### Two things worth keeping

**A single-class override does not beat a two-class rule, however late it comes.**
The road heading is written as `.rally-courses .rally-course-heading h1` inside
a phone media query; my first override was one class deep at the end of the
file and lost silently — the build passed, the screenshot was unchanged, and
there is nothing to see unless you go looking for the winning rule.

**The overrides live at the end of `styles.css`, not in the rally's own block.**
Those numbers are still what the racer's pause screen uses. This is the Hollow
dressing a screen it shares, and editing the rally's block would have changed a
screen nobody asked about.

### What I did not do

I did not collapse the two Hollow screens into one, which was the other way to
kill the repetition — a game row with its ways underneath, no navigation. It is
probably better and it is a real rewrite of a file that also holds the live
round handshake, the locks and the invite flow. Trimming first was the smaller
risk; the merge is still there to do.

## 8 Sep · Claude · The walk sounds like a lane, the door is a third of the weight, and the lanterns stopped being blurred

Three things, and the third one was my fault twice.

### The Lantern Walk was playing a closed room

Its mix column was the Glasshouse's, inherited whole when the place was replaced
and the id renamed: `room: 0.78` is a conservatory with the doors shut,
`water: 0.12` was rain on its roof, `shimmer: 0.5` was its glass ringing. None
of that is out on a lane. It is leaves and moving air now, with a trace of room
for the little that comes back off the trunks.

Measured rather than asserted — `npm run places` puts it at 0.004 A-weighted,
1210 Hz, low 0.253, which sits it with the Tree (1068 Hz) and the Wellspring
(1297 Hz) and nowhere near the Hollow (105 Hz, low 0.79). Before, it measured
like the cave.

**Renaming a place does not rename what it sounds like.** The column belongs to
the place, not to the id, and there is now a note on the table saying so.

### The cold open: 1.45 MB → 487 KB of JavaScript before the door

Two static imports were doing it.

**`App.tsx` imported `@/world/World` beside `@/ui/Door`** — one line, and behind
it three.js, the meadow, the grass, the trees, the water and every shader in the
garden, parsed before anybody could type a password. It is fetched with
`later()` now, like places and games already were, and **warmed on the first
frame** so the fetch finishes while the sign-in form is being read rather than
after the one button that must not pause. Modulepreload tags: 33 → 10.

**`systems/palette.ts` imported `Color` from three** — 373 KB of renderer in the
entry graph to do a hex parse and a lerp, in the one module the very first
render reads. It uses `systems/colour` now: the same two conversions three's
ColorManagement does, in the same order, in the same space.

**That swap is checked rather than trusted.** `npm run colour` compares the two
across the hue circle and every colour the garden ships — 2,712 operations,
identical to the digit. A colour pipeline that is *nearly* right shifts every
sky, grass and fog in the world by a shade nobody can name, all at once, and
that is not something to eyeball.

### The lanterns were not blurred on purpose — they were stuck on the placeholder

Reported twice, and I fixed the wrong thing the first time: I raised how many
lanterns get a photograph, which made it worse.

A memory had two representations: a **sixteen-pixel** preview in the document,
and the display copy at up to **2560 px** in storage. Nothing in between. So a
lane wanting sixteen photographs on screen was downloading sixteen *full-size
photographs* — megabytes — to draw panes a few hundred pixels wide. On mobile
data none of them arrived, and what you were left looking at was the sixteen
pixels, stretched. It was never a decision to blur anything.

So there is a middle rung: `LANE = 720`, a walking copy encoded when the memory
is kept and stored beside the display copy, with `Memory.lanePath` pointing at
it. Optional, because every memory kept before today has only the big one, and
the fallback lives inside the data layer so no reader has to know which is
which.

Measured in a real browser on a 3000×2000 picture: **358 KB → 118 KB on noise,
57 KB → 12 KB on photograph-like content** — three to five times smaller
depending on what is in the picture. Sixteen of them go from about 0.9 MB to
0.19 MB on the same image.

And they are fetched **nearest-first, three at a time**. `near` was already
sorted by distance and all sixteen were started together, which on one pipe
means the lantern you are standing in front of finishes at the same moment as
the one four bends away. Sixteen asked for at once is sixteen arriving last.

### Worth knowing

**This repo has mixed line endings.** The files another editor has touched came
back CRLF; mine are LF. A multi-line anchor written with `
` silently matches
nothing in a CRLF file — it reports "found 0" for text that is plainly there,
which cost a confused detour. Read, normalise, edit, restore.

## 7 Sep · Claude · Return sends in the Stars, on a keyboard

> *"why the hell is it that on desktop in the stars section, the enter key
> doesn’t send a message"*

Because it never did, and the Stars was the only composer in the garden like
that. The whisper sends on return; all three of the film’s composers send on
return; the Stars had a note saying the message owns the return key and the
light does the sending.

That note is right **on a phone** — the on-screen key is a return key, the send
light is under your thumb, and a conversation is exactly where you want a
second line. On a laptop it is simply wrong, and the field was quietly
swallowing sentences and waiting for a mouse.

So it is split by pointer rather than made the same everywhere, because both
behaviours are correct for the device they are on. Shift-return still makes a
line, and a return arriving mid-composition is ignored — an input method sends
one to commit a character, and treating that as a send posts half a word for
anybody typing in a language that uses one.

**Verified by driving real key events**: four messages on screen became five,
the draft cleared, and shift-return did not send. The newline that
shift-return should leave behind is *not* verified — a synthetic key event
with no text does not trigger the browser’s own insertion, so that half needs
a person.
## 7 Sep · Claude · The Stars gets a second sky, and you pull it in from the edge

**The Cloudsea.** The Stars has carried the same blurb since the day it was
made — *"your night, their morning, and the space in between"* — and it has only
ever drawn the two ends of that sentence. The plain splits the horizon: deep
night above, her dawn on the far edge. The space in between has never been
anywhere you could stand.

So the second sky is that space. Pull from the right edge and the plain sinks
away under a sea of moonlit cloud: the weather the two of you are on opposite
sides of, seen from above, with nothing under your feet and the conversation
still hanging in the air. **One moon rather than two lights** — that is the
difference the place is for. Above the weather there is no your-side and
her-side, only the same light on the same cloud, and it is the one thing in this
garden that is not split in two.

**The crossing is a value, not a toggle**, which is why it feels like anywhere.
`at` runs 0..1 and everything reads it: the plain sinks, the cloud rises, the
dome lifts, the bed re-voices. Let go halfway and it settles to the nearer side.

### Four things worth keeping

**The plain sinks rather than fading.** That is the true shape of it — you have
not switched the plain off, you have gone up, and it is under the cloud now. The
sea is drawn at a height that swallows it on the way past, so nothing has to
dissolve and no piece needed a fade uniform adding to it.

**Above cloud the sky gets *paler*, not darker.** Moonlight on an overcast fills
the whole dome with a cold bounce, which is why a night above one is bright
enough to walk in. Going darker up there was the first instinct and it is wrong
for exactly the reason the place is worth drawing.

**The sea's noise was sampled on `position.xy` after the plane had been rotated
flat**, so it varied along one axis only and the sea came out as long straight
bands running to the horizon. The give-away was that it looked *ruled*, and
noise never does. It is `xz`. Its far edge also had to lose its *alpha*, not
just mix to the sky colour — mixing alone left a flat slab of that colour laid
over the dome and drew a hard line across the horizon.

**An edge gesture has to be on the window, in the capture phase.** The first
version listened on `.surface` and never fired once: the conversation lays
`.talking` over the whole canvas and takes the press first. Anything that wants
an *edge* is above the page's own layers by construction, or it only works in
the places that happen not to have covered that edge yet.

### The sound

`ambience.setShade` is new: per-layer multipliers on top of the place's own row,
cleared whenever the place changes. The Stars' bed is mostly `shimmer` over a
little `room` — a high sparkle over close, contained air, which is right when
you are standing on ground. Above the weather there is no floor to be close to
and nothing near enough to reflect, so crossing turns `air` up, takes `room`
nearly out, and pulls `shimmer` back. It follows the finger, so a half-pull is a
half-voicing.

A second `Place` id was the other way to do it, and it would have meant touching
the ids in six files and every check that walks the places in order to say
something untrue: it is the same room, in different weather.

### And it is findable

`ui/SkyEdge` — a short soft line on whichever edge the *other* sky is behind,
faint at rest and leaning with the finger. A gesture nobody can find is a
gesture that does not exist, and a handle that answers the first millimetre of a
pull teaches it in one go where a static hint would still need explaining.

`window.__sky` under `?shot=1`, for the same reason `__walk` exists: a
screenshot of a sky halfway through a crossing looks like a sky.

## 7 Sep · Claude · The music survives a locked screen again

**A regression, and the comment that caused it was the giveaway.** `App.tsx`
suspended the ambience AudioContext whenever the page was hidden, reasoning —
in the comment, right there — that "the chosen song is a real `<audio>` element
and may keep playing with the screen off". True of the element, false of the
device: on iOS an AudioContext owns the app's *audio session*, and suspending
it tears the session down with every other output in the page attached. Pocket
the phone, the music stops; open the app, the context resumes, the song carries
on. Exactly the shape of the report.

The clock is now only stopped when nothing of ours wants the output — no song
sounding, no film open. A muted context that is still running costs a timer and
no audible work, and `setMaster(0)` already takes the world's animation loop
with it, so the saving that mattered is kept.

Not verified on a real iPhone from here. The mechanism is documented at the
call site so the next person has something to disprove.

## 7 Sep · Claude · Tap goes to it, hold opens it — and the walk can turn now

**The zoom felt wrong because it could only be a slide.** Choosing a lantern
translated the lane sideways until the picture was centred, which reads as the
scenery being dragged past you. It could not rotate, because the world's meadow
follows the camera and a turning lane would take its trees and footprints away
from the ground they were measured against.

That constraint died when the walk started carrying its own ground, and nobody
noticed. It turns now: the lane pivots **about the camera** — two nested groups,
the outer at the eye carrying the rotation — so it reads as stepping round to
face something. `-hung.yaw` is exact, not a guess: a lantern is hung facing the
path, so undoing that angle is square-on.

**Tap and hold are now two things, because they are two intentions.** A tap
turns you to it and walks you up; the picture is behind a press and hold. A tap
throwing a full-screen photograph over the world was the interface deciding you
had finished walking.

**A gesture outlives a render, and the first version did not know that.** The
press was kept in local variables inside an effect that re-registers every
render — and tapping starts the lane gliding, which changes which lanterns are
near, which sets state, which tears the effect down about eighty milliseconds
in. Every hold silently became a tap. It lives in a ref now and the cleanup only
removes listeners.

Also: **no more cropping.** The Glasshouse cut every picture to three by two
because a *wall* of frames in six proportions reads as a noticeboard. On a lane
the lanterns are metres apart at different angles against trees — there is no
row of outlines to be distracted by, and a tall photograph on a post is just a
tall lantern. The width is fixed, the height follows the picture, and the hood
and post follow the height.

**The pole has a lamp on it.** Every light here came out of a photograph, and a
photograph is not a lamp — which is most of why the lane read as lit signage. A
small brass cap on the post head with a flame under it that breathes, in that
memory's colour, and the picture hangs below it. Which is what a lantern on a
pole has always been.

**And a canopy, because dimming the palette could never reach the sky.** Sky,
clouds and horizon belong to the world and carry across every slide — taking
them off this section would make the walk look like a different game. So at
three in the afternoon the lane was dark and the enormous bright thing above it
was not. A dome over the lane fixes that honestly: you cannot see much sky from
inside a wood. Its first ramp did nothing, because the camera looks *along* the
lane and the zenith is off screen; it needed a floor as well as a ramp.

**How dark is now a slider**, in the control room under `world` — see
`systems/lanternLight`. That place is the only one whose whole point is
contrast, and every value so far was chosen from a headless render on a machine
in another country, which is the wrong place to decide it from. Device-local, so
neither of you can make the other's walk too dark to see.

## 7 Sep · Claude · An emoji keyboard for the machines without one

A phone has an emoji key. A laptop has a system panel behind a chord, which
loses the focus of what you were typing and takes a hand off the keys — worst in
the place it comes up most, sitting through a film together.

**Alt+E**, in every message field at once, because they all already share `Ink`
— the Stars, the film's composer, the whisper. Arrows move, Enter puts it in *at
the caret* (a picker that always lands at the end is one you can only use when
you have finished typing), Escape leaves, `+` adds, backspace removes.

**A short list that learns, not fifteen hundred in nine categories.** Forty to
start, counted as they are picked, most-used first — after a fortnight it is
your list. Anything missing gets pasted in and joins it. Sorted stably, so ties
keep their places and nothing reshuffles under the cursor.

Never on a touch device: a second emoji keyboard on a phone that has one is
clutter fighting the native one for the same tap.

## 7 Sep · Claude · The lane gets a floor, and the light gets something to fall on

> *"you only did the fix i wanted you to, rather than actually thinking of
> making an upgrade"*

Fair, and correct. The four reported faults were fixed and treated as the job,
when the job was to look at the place cold and raise it. Looking at it cold, the
three biggest things wrong were not on the list.

**The ground was a coloured plane.** No grass, nothing growing, in a garden
whose meadow runs twenty-two thousand blades — and that is most of why the rest
of the world reads as a place rather than a diagram. The lane had none because
it carries its own graded shelf and the world's grass is wrapped around the
*camera* using the shared height function, so it cannot sit on one. Nobody had
noticed the shelf was bare because it was the right colour.

**The light is baked into the blades, and that is the good idea here.** A lantern
never moves and neither does a blade, so *how much light this blade gets from
that lamp* is a fact that can be settled once and stored on the vertex. Every
blade near the lane carries the summed colour of the lamps around it. The grass
goes golden under a warm lantern and cold blue under hers, with real darkness
between them — for one float3 per blade and **no runtime cost at all**. The
alternatives were a forward light per lantern (dozens) or a loop over lamp
positions in the fragment shader, both of which recompute every frame an answer
that cannot change.

**The air was empty.** `Air.tsx` — motes that belong to a lantern and drift near
it in its colour, so they thin out between lamps exactly as the light does. The
Glasshouse had already written down why this matters: a shaft of light is
invisible until something is floating in it. It matters more here, because this
place is now dark on purpose.

**A lantern was a flat board on a stick, which is a sign.** It has a hood and an
arm now. Those two shapes are most of what makes a hanging lamp read as one, and
the hood does real work after dark: it is the dark edge along the top that stops
the pane bleeding into the sky.

Two things worth keeping:

- **Scale is easy to get wrong by an order of magnitude and obvious once
  rendered.** The first grass was 11 cm wide at 3 blades per square metre —
  which is not sparse grass, it is scattered shards. Narrow blades and twenty
  times the density, and the same shader reads as a field.
- The undergrowth and the motes take their budget from `quality.grassCount`,
  so a phone already told to draw less grass in the meadow draws less in here.
  One decision about the machine, made where it is measured.

**And the backtick trap caught me twice more** — `uv.y` and `hangingFor` inside
GLSL template comments. That is six times now. `npm run shaders` caught both in
the same second it always does.

## 7 Sep · Claude · The walk gets its darkness, its pictures and its way in

Four things were wrong with the first build, all reported and all correct.

**"The place doesn't look that dark at all."** It was taking the world's full
daylight, so everything was evenly lit to the far end of the lane, nothing on
the ground owed anything to a lantern, and the chain read as coloured signage
over a field. `underTheTrees` now gives the place a quarter of the sun, a third
of the ambient and fog pulled in to about sixty metres. The hour is still hers —
this is a canopy, not a different time of day.

One derived palette rather than a uniform threaded through six shaders: every
part of this place already reads a palette and brightens against
`ambientLightLevel`, so dimming it turns the lanterns up everywhere at once with
nothing left to forget. `Pools.tsx` is the other half — the light each lantern
throws onto the lane, because a lamp is only read as a lamp when you can see
what it is lighting.

**"I don't know who said the pictures should be blurred."** Nobody did; there
simply were not any. Only the nearest **five** carried a photograph, copied from
the room this replaced — where it was right, because an aisle shows you two walls
at arm's length. A lane shows you the whole chain, so five meant three real
pictures at your feet and a receding line of flat coloured cards. Sixteen now,
and the reach is nearly three times what it was.

**"I can't even touch it to make my camera zoom in."** Two faults. Opening
walked you to the lantern's viewing spot and stopped, which puts you the right
distance away along the path with the picture still off at the verge — it now
carries the whole lane so the chosen lantern comes to a fixed spot in front of
the eye. And the hit boxes were the lantern's own projected size with an
eighteen-pixel floor, so every lantern past about fifteen metres was a target the
size of a full stop. **A screenshot cannot see this**, which is why it survived
the first pass: the place looks identical whether picking works or not. So there
is a probe now — `window.__walk` under `?shot=1` publishes every reachable
lantern's screen box — and it found the floor in one run. Targets are a thumb
now: 44 px on touch, 30 on a mouse.

**"It looks like two lights sticking from the ground."** It did. The landmark was
a line of posts, replacing a building a hundred metres long, and what the garden
lost was not detail but *presence* — the other four landmarks are each one strong
silhouette you can point at from anywhere. The lane has a mouth now: two heavy
uprights and a lintel, with the track running out under it and the chain of
lights receding into the dark.

Worth knowing for the next landmark: **`buildInstanced` positions by centre, not
by foot.** The gateway went up half underground with its lintel floating in the
air above it. `Posts` in the section does not have this problem because it
translates its own box geometry so the foot sits at the origin.

## 7 Sep · Claude · The Glasshouse is gone; the Lantern Walk is where memories live

> *"who says it has to be the glass house, like really who says... i want
> something that feels like memory, that is actually very good and feels like
> environment, that i go through"*

A lane that wanders through the edge of the wood, a lit photograph hanging along
it for every memory, and **a path worn exactly as far as the two of you have
walked**. Full write-up in `src/sections/lanterns/README.md`.

**The diagnosis, which came out of the Glasshouse's own README.** It hung its
pictures on two walls running parallel to the direction of travel, so they were
permanently edge-on — its notes record a focused pane at twenty-eight pixels on a
phone — and the fix was to rotate the whole building twenty-two degrees about the
viewer, ninety when you opened one. That is a workaround for the shape being
wrong, and it is exactly what "i dont even like how the camera movement works"
was describing. It also carried three separate mechanisms to stop the building
being the subject, which is what a design tells you when it needs enforcing
against itself.

Out here a lantern is turned, once, to face the piece of path you will be
standing on when you reach it. Face-on becomes a property of where it was hung
rather than something the camera arranges, so nothing rotates about anybody and
the lane is free to wander. `LEAN` and `TURN` were not ported; they had no job
left.

**The footprints were the user's idea and they reframed the place.** Each memory
lays a stride of prints in its keeper's own light, warm or cool, so the trodden
way *is* the record — how far back it goes and who went — and the lane is only
worn as far as the walking. It also fixes what was backwards: a building starts
at full size and fills in, so an empty archive was a large dead structure. A path
starts at nothing.

### Three things that cost time and are worth not rediscovering

**A place that travels has to carry its own ground.** The meadow is one plane
that follows the *camera*, displaced from world coordinates, while travel here
slides the place past a camera that never moves. So anything bedded into terrain
rises and sinks as the lane goes by — the first build had posts hanging a metre
in the air. `Lane` lays a graded shelf that travels with everything on it and
`OWN_GROUND` in `World` stops the meadow being drawn over the top. The Glasshouse
hit the same wall and answered it with a plinth; copying that plinth's *height*
was the bug, because it was clearing terrain a building actually crossed.

**Colours in these shaders are linear.** Everything exits through
`colorspace_fragment`, so 0.03 arrives at about 0.19. Written as though already
sRGB, the dark posts and pressed-earth prints came out as pale sand on a night
lane.

**Two quads in the same place tear.** The near lantern was stood six millimetres
proud of its far one; the depth buffer cannot separate that at range and every
lantern was split down the middle with a hard line. The fix is not a bias, it is
for the far chain to leave a gap where the near ones are.

Also: the lane was first laid along negative Z, which put every lantern *behind*
the viewer — you arrived at a walk you had already finished, facing an empty
meadow with eighteen lights at your back.

### What is not done

Dusk has had far more attention than noon. `ui/Memories.tsx` still speaks of
panes and glass in about thirty places. The hub landmark is built but has not
been photographed from the garden, and `npm run places` has the new id but has
not been re-run, so the walk has no measured soundscape. Nothing here has been
seen on a real GPU — only SwiftShader.

## 7 Sep · Claude · A sweep of the five places, at the size they are used

Photographed all five at 390×844 and 1280×800, hour and weather pinned so two
runs compare. Three things were wrong; the first was wrong everywhere.

**The music was a card floating over a painting.** Closed, on a phone, the
player drew its full surface — rounded, bordered, blurred, shadowed — pinned
across the top of every place. It was the first thing the eye landed on in four
of the five, sitting on the sky above the Wellspring and straight across the
Tree's canopy.

The surface is not wrong; the comment above it in `styles.css` earns it
properly, and the argument is that an **open** list of song titles laid over a
briefing is two typefaces at right angles and neither readable. That argument is
about the list. Closed there is no list — one line and three arrows — and the
panel was being drawn anyway. So the surface now arrives with the list and
leaves with it, and the line uses `--lift`, which is what every other label in
the garden uses to stay legible over open sky.

Also: a progress line for a song that does not exist is furniture pretending to
be information. `.silent` is "no song loaded", which is deliberately not the
same as paused — a paused song still has a length and a position worth drawing.

**The Wellspring was combing into diagonal streaks**, badly on a phone and
faintly on a desk. There was already a distance fade on the ripple and it was
measuring the wrong quantity. What decides whether a wave can be drawn is not
how far away it is but how fast its phase moves per *pixel*, and at a grazing
angle that runs away long before depth grows — which is exactly why the marks
were worst across the middle of the channel and not at the far bend.

A sinusoid survives sampling while its phase advances less than π across one
pixel; past that it does not vanish, it **beats**, and neighbouring pixels land
on unrelated parts of the wave. Those beats were the streaks. `fwidth` measures
it directly, so it holds at any resolution and any field of view rather than
being tuned until one screenshot looked acceptable — and it explains why a phone
was so much worse: same river, narrower view, more metres per pixel.

**Rendered the two gradients straight to the screen to check, and it is worth
knowing what that showed.** The phase gradient behaves exactly as hoped — low
underfoot, saturating in the mid-distance — so the ripple keeps its texture where
you can see the surface and relaxes into sheen where it cannot be drawn
honestly. The *crest* gradient crosses its threshold only on thin spikes, so the
matching fade on the glitter and the froth removes a few individual sparkles and
is **not** what makes the water calmer. The comment in the shader says so. The
broad bands that remain are the swell itself, drawn correctly; if they ever want
changing that is an amplitude and a wavelength, not an alias.

**The icons were 509 KB of PNG for four small pictures.** Re-encoding at the
same size changed almost nothing, which said the encoding was fine and the
weight was in the content. Palette-quantising them took the set to 178 KB —
**331 KB saved**, of which 35 KB comes off every first open, because
`icon-192.png` is in the precache shell. Compared side by side at size, the
palette version is indistinguishable. They are 8-bit colormap PNGs now, so
anything regenerated from `design/garden-icon-master.png` wants the same
treatment or it will quietly put the weight back.

Not done, and worth its own round: **the Glasshouse is badly composed** — a
black pole dead centre, a grey void through the middle third, and half the frame
given to floor tiles. That is a camera and a room, not a shader, so it wants
deciding rather than nudging.

The sweep harness is a scratch script, not a checked-in one. It pins
`?hour=&sky=0,0,0,0` the way `npm run places` does, for the same reason.

## 7 Sep · Claude · Three small debts paid

Three things that had been written down as owed rather than done.

**4.3 MB that shipped to a phone for no reason.** `public/` is not a folder of
project files — every byte in it is copied into `dist/` and deployed. It held
the icon master and three logo plates, which nothing in the app has ever
referenced. They are artwork, and they are now in `design/`, which is outside
the build. **`dist` went from 20 MB to 16 MB.** The precache list in
`vite.config.ts` is still a hand-written list rather than a glob, and the
comment there now says why: a glob would quietly ship and precache whatever
lands in that folder next.

**`npm run places` was failing on the time of day.** The garden's wind comes
from the hour *and* from her real weather, fetched live — so the same unchanged
code read 0.0043 one morning and 0.0062 that afternoon, and the ceiling caught
the second one. The listening run is now pinned to `?hour=13.5&sky=0,0,0,0`:
the windiest hour, no weather. That is the worst case, and it is reproducible
on any machine at any hour.

That fixed the larger half. The other half cannot be pinned — wind *gusts*, and
this listens for eleven seconds, so it catches different weather each time.
Measured four times at the pinned worst case the tree came in at 0.0058, 0.0062,
0.0067. **The old 0.006 ceiling was sitting inside the noise band**, so whether
the check passed was a coin toss. It is 0.009 now, which is above the band and
still under a third of what the Hollow was doing the day the file was written.
A check that fails because it is two o'clock is a check people learn to ignore.

**A sealed thought now looks sealed on the tree.** It used to hang like any
other paper; you only found out it was waiting by opening it. It is drawn as a
narrow roll with a cord tied across it and no ink lines — the ink is missing
because the words genuinely are not on the device, which is the honest state.

The performance constraint from the treeline work applies here too, so this
costs **nothing**: one `iSealed` instanced attribute, one float per paper, no
extra draw call and no extra geometry. `float furl = mix(1.0, 0.34, iSealed)`
narrows the quad in the vertex shader, `vThread` is divided by `furl` so a
rolled paper keeps a normal-thickness thread, and the fragment shader branches
to cylinder shading plus a cord band. `stillSealed` was widened to
`Pick<Letter, 'by' | 'openAt'>` so the glow filter and the geometry ask the same
question — an unread sealed thought does *not* pull the "new" glow, because
there is nothing yet to read.

Verified by planting two sealed thoughts of hers and two open ones in the mock
and photographing the tree at 390×844: the silhouette difference survives being
small, which is the only distance that matters. `sealed`, `day`, `shaders` and
`tris` all pass.

**The rules went up the same day**, which armed the refusal path — and made it
worth reading the write path once more against a live project rather than a
mock. It had a hole.

`writeLetter` wrote the parent and `sealed/words` as **two awaited `setDoc`
calls**, and neither document may ever be updated (`allow update, delete: if
false` — a day that can be moved afterwards is not a day). So a thought whose
parent landed and whose words did not was *unrecoverable*.

The likely way there is not a network blip, it is a train. With persistence on,
`setDoc` resolves when the **server** acknowledges the write — so offline the
first `await` never returns, the second call is never reached, and the parent
alone sits in the outbox. Close the tab and it syncs the next morning as a
sealed thought with nothing behind it. Both writes are one `writeBatch` now,
which queues the pair together and commits all or nothing.

The reader gained the matching honest state, because a thought already in that
condition cannot be repaired: `readSealedLetter` returning `null` is now
recorded rather than discarded, so *"still coming"* and *"asked, and there was
nothing there"* are different things. They rendered identically before — as an
ellipsis that would sit there for ever, saying the one thing that was certainly
false.

## 7 Sep · Claude · The treeline stops being a cut-out

> *"i hope you are not planning to make it look good in a way that increases
> the game size and lag, cause id rather see the white than have the game
> lagging"*

**Nothing was added.** No geometry, no draw call, no texture, no uniform, no
allocation. One multiply and one subtract in a fragment shader that was
already running, and the triangle count is unchanged — `npm run tris` says so.

**Why they were white.** The wood stands between eighty and a hundred and
thirty metres out and the haze runs from sixteen to a hundred and fifty, so
the far trees came out about **ninety-four per cent fog** — and the fog colour
is within a few points of the horizon sky they stand against. Two nearly
identical pale colours, one in front of the other. They kept their outline and
lost everything inside it, which is the definition of a paper cut-out.

The haze now stops just short of finishing: `s * (1.0 - 0.30 * s)`, so a wood
on the skyline keeps about a third of its own colour. **The curve is bent at
the far end rather than scaled flat**, because the near haze was never the
problem — twenty metres of air should still soften a rock, and a flat ceiling
would have taken that with it.

**The mountains are untouched and should be:** `Horizon` carries its own
shader and never comes through `forms`, so the range still dissolves into the
sky completely, which is what it is for. Checked at noon, at dusk, and under
forced heavy overcast — the weather still reads as weather, and the trees are
legible in all three.

*(Backticks inside a GLSL template literal close the string. That is twice in
one session — water and now forms. The shader comments in this repo use single
quotes for identifiers, and that is why.)*

## 7 Sep · Claude · The water stops being a ladder

> *"i wanna improve the quality of some of the places, and how they feel"*

**First, the thing I nearly broke.** Every place looked washed out and grey —
flat sky, no blue at any hour — and I had a fix half-written for the cloud
layer before probing it. It was not a bug. `useHerSky` fetches **her real
weather**, in the mock too, and Kano was genuinely overcast all afternoon. The
palette was handing the dome the right blue the whole time. `?sky=0,0,0,0`
forces clear and the garden is bright and blue and completely fine. *If the
world looks grey, look out of her window before touching the shader.*

**Then the one that was real.** Under a clear sky the Wellspring still had hard
white bars ruled across it, evenly spaced, like a zip. Two causes, and finding
the second needed the first fixed to see it.

**One: the mesh could not carry the swell.** The waves are stated in cycles per
metre and the shortest is about 1.7 m; the Wellspring's ribbon was 200 rows
over 240 m, which is 1.2 m a row — *one and a half samples on the shortest
wave*. The garden's brook was 80 over 26, a third of a metre, and comfortably
fine. Same shader, two tessellations, and only the big one aliased. The
spacing now lives in `ROW_METRES` next to the waves it has to carry, and both
callers derive it: a ribbon is two vertices wide, so the Wellspring goes from
400 triangles to 1500 and there was never a reason to be careful with it.

**Two: every crest was a straight line.** A ribbon is two vertices wide, so the
'uv.x' terms can only *tilt* a crest, never bend one — and a very tight
specular then lights each line along its whole length at once. Straight crest
plus sharp highlight is a white rung. So the fragment stage now has a surface
of its own: three short ripples in real metres, across the channel as well as
down it. Every input is a varying, because the note in that file is right that
a uniform read by both stages at different precisions makes the program fail
to link **silently** — the water simply stops drawing, which is exactly what I
did to it once on the way (`p` used a line before it was declared; the console
had the answer immediately).

> **Two waves make a lattice, and three make a finer one.** At ±35° they
> crossed into a diamond net — passable on the Wellspring seen down its length,
> unmistakable on the brook seen from three metres. Three at unrelated angles
> only made the net finer. What actually worked was warping the coordinates
> first with two slow waves, so every crest follows a wandering line and
> nothing stays in step. **And amplitude has to fall as frequency rises**:
> slope is height times frequency, and slope is all the specular reads, so
> raising one alone makes the glitter *wider*, not finer — a ladder becomes a
> field of splashes.

The ripple fades out with distance, which is not a saving: it is the one thing
in the water with no geometry under it, so at sixty metres it is a fraction of
a pixel, and a moving fraction of a pixel is a shimmer.

**Measured:** `shaders`, `tris`, `sky` and `day` all pass. `npm run places`
fails on the tree's loudness — *not this work*: nothing in the three changed
files touches the audio path, and that check pins a fixed ceiling on a reading
that moves with the hour and with her weather. Written up under Known debts.

## 7 Sep · Claude · The Hollow says what each way in actually does

> *"i had to tell her how to play the race for her to […] a cleaner more
> organised way of representing and showing things, for all the games"*

**The explanations were already written. They were in `title` attributes.**
`invite.tip` and `live.tip` have always carried one line saying what each way
in does — and both were handed to the browser as a tooltip, which a phone does
not have. So the screen offered three unlabelled verbs and the only way to
learn what they meant was to be told by somebody who already knew, which is
exactly what happened.

**The shape was the other half.** One serif invitation with two words in small
capitals under it: the two alternatives read as a toolbar, and nothing
distinguished *playing alone* from *playing at the same moment as her* — which
is the only one of the three that depends on anything outside the screen.

Every way in is now the same row: the verb, and one line of what happens.
Left-aligned as a list, because three centred two-line blocks read as three
unrelated captions. The first keeps the serif and the light — it is still the
one to reach for, and that part was right. Scattergories' live-only screen is
the same list, one item long.

**And the live one says whether she is there**, in its own line — *Tife is
here now* against *only when Tife is here* — instead of being a door you tap
to find out about. It was already correctly disabled; it just never said so
where anybody would look.

**Two smaller things found while in here.** The card in front of you said
"enter to choose" — a keyboard instruction, on a phone — while the cards you
could *not* reach said "bring to the fire", the actual verb. The invitation was
sitting on the neighbours. And the coming-soon card said "the Hallow has
space".

`npm run hollow` was asserting the old wording and so failed on the fix. It
asserts the *intent* now — the card in front of you is the one asking to be
opened, and none of the others are — which is the thing that was ever worth
holding and survives the next change of verb.

## 7 Sep · Claude · The garden would not open, and why

> *"it just shows that first loading screen with opening.. and it stays"*

**My fault, from the service worker two days ago.** The garden was unopenable
on a device that had it cached. Written out because every step of it is a trap
that will be walked into again.

**The chain.** The worker precached only the *static* import graph of the
entry. The app dynamically imports `data/firebase`, the places and the games,
so those chunks were not in the shell. A deploy is a whole new build: every
chunk whose contents changed gets a new name and **the old names stop being
served**. A device holding a cached shell from the deploy before therefore
asks for a module that is nowhere — and `provider.tsx` fetched it with
`import(...).then(...)` and **no `.catch`**, so the rejection went nowhere,
`setConnection` was never called, and the door sat on `connecting` for ever.
Every other failure on that path was handled. The one that fetched the code to
handle anything was not.

> **The nastiest part, and the reason it was invisible: a missing asset did not
> come back missing.** `vercel.json` rewrote every unmatched path to
> `index.html`, so `/assets/index-OLD.js` answered **200, `text/html`**. The
> browser tried to run a document as a module and failed without a word — and
> the worker, seeing a same-origin 200, **cached the front page under the name
> of a script**. A fetch of the script's own URL from the console is what
> finally showed it. The rewrite now leaves `/assets/` alone so a missing file
> 404s honestly, and `keepable` refuses to store HTML where code was asked for.

**Five things changed.** The shell is now **every** chunk, not the walked graph
— a shell and the chunks it names are one thing, and splitting them across a
cache boundary let a deploy tear them apart. `install` calls `skipWaiting`,
because a broken cached shell never renders the renewal line, so the
replacement could never be asked for and the world could not be reopened at
all. `activate` keeps **one generation back** and `theRest` searches every
cache it kept, because a replacement worker takes over while pages are still
running the previous build and asking for its chunks by name. `provider` has
its `.catch`. And `index.html` carries a watchdog: nothing drawn after fifteen
seconds means this page is built out of something that is gone, so ask for it
again — **once**, guarded by `sessionStorage`, because a reload loop would be
worse than the thing it fixes.

**Measured, on a real two-deploy sequence** (`dist` served under Vercel's own
rewrite rules, a lazily-imported chunk genuinely renamed): before, the second
visit was a blank page and no console output at all; after, it heals itself and
opens. Shell 42 → 66 files, 1.11 MB gzipped, still no media in it.

**Two false starts worth keeping.** A comment appended to a source file to
force a "second deploy" changes nothing — minification strips it, the chunk
keeps its hash, and the harness proves nothing while looking like it passed.
And `npm run offline` had been printing *opening…* for an afternoon and passing,
because its only assertion was that something had been painted, and the shell
painting is not the garden opening. It asserts getting past the loading line
now, which is the one thing that would have caught this on the day.

## 7 Sep · Claude · The list came out

> *"i feel like thats useless, cause we would communicate and know about the
> movies we have anyways"*

**"The list" is gone** — the top half of the *our film* tab, where either of
you wrote down a film you meant to watch and then marked whether you had a
copy, and the row said in advance whether the two files were the same file.

It was built to answer a real question — *two different rips is a thing you
discover at nine in the evening* — and the owner's answer is that the two of
them already answer it by talking to each other, which is the one argument
this world always loses to. **Removed rather than hidden.** Nothing here is
allowed to be a feature nobody uses that still has to be kept working.

What went, in full: `FilmList` and the whole `.wanted` block in `styles.css`;
`Wanted`, `watchFilms` and `setFilms` off the `DataLayer` and out of both
implementations; the `films` field on `world/ours`; the `garden:films:v1` key
in the mock; and the section of `npm run screen` that drove it.

**What deliberately stayed**, because it sits next to it and is a different
thing: the *our film* tab itself and everything about playing a file off this
device, the shelf of films this browser can reopen, `fingerprint` in
`systems/film` — which is how the anchor names a film so both devices know
which one is on, and has nothing to do with the list — the queue, and the
archive.

**One thing was lost with it and is worth naming**: the one-press *we watched
it* that moved a film off the list and into the archive. Films go into the
archive by being typed in now, which is one more step on the one evening a
year it matters.

`noUnusedLocals` did most of the work — every orphaned handler and piece of
state announced itself. `npm run screen` drives the real night screen in a
browser and still says **the screen holds**.

## 6 Sep · Claude · The Harmattan gets people, and the film stops looping

> *"when she pauses from her end […] instead of pausing, it does this weird
> thing of like continues replaying the last second"*

**The film bug first, because it had a real cause.** She pauses; nine hundred
milliseconds later this device is nine tenths of a second past her; that falls
between `DRIFT` and `LURCH` so `correction` says *drift*; a rate nudge cannot
close a gap on a stopped film so a drift on a paused one becomes a **seek**.
The seek was performed first — and **a seek puts YouTube into `BUFFERING`**.
The state was then read, found to be `3`, and the line that pauses was gated on
`PLAYING`, so it never fired. The player carried on from where it had been
sent, drifted nine tenths of a second again, and was sent back again. A
one-second loop, for as long as anybody watched it.

Two rules now, and neither is enough alone: **read the state before this tick
touches it**, and **stop the film before moving it**. Both live in `settle` in
`systems/watching` — returned rather than done, the same way `correction`
already was, because an ordering bug inside a React effect is a bug nothing can
be pointed at. `npm run watch` has eleven new assertions and the two that
matter are *told to stop before it is told to move* and *a buffering player is
still a running player*.

---

**The Harmattan was a landscape with nobody on it.** Every named stretch was
geology and the one built thing — the town — was a curtain wall with nothing
behind it. So the second half of `Harmattan.tsx` is now architecture: farms on
the red mile, a ruin in the termite country, palms and wells in the wadi, a
gated street of horned Hausa rooflines with a minaret in its own square, the
dyers outside the wall, grain stored in the face of the scarp, and the farms
again coming home. The header table says which is where.

> **The lesson worth keeping, because it had already cost this file three
> times: a face built from separate tapers is a picket fence.** A taper is
> narrower at the top, so however much the feet overlap the crowns do not, and
> you get daylight between every slab. The wadi banks had been rewritten once
> already to fix it by regularising the heights — right about erosion, and the
> heights were never the problem. `sweepFace` sweeps one continuous surface
> the way the road itself is built, and the banks, the escarpment and the city
> wall all go through it now.
>
> It survived its own fix once: after the wall became a sweep, `addWall` was
> still drawing tapers *on top of* it and the picket line came back standing
> proud of a perfectly good wall. That function is `dressWall` now and draws
> only the buttresses and beams, so the mass and the dressing cannot be
> confused again.

**Measured:** 72,485 → 93,681 triangles over 3,366 m, worst chunk 3,908 →
3,820 (the town's continuous wall was *more* expensive than the street that
replaced it). Five chunks are drawn at once, so this is about 19k triangles a
frame — the garden draws 306k on a phone.

**Everything was looked at rather than reasoned about**, over CDP at
`?game=ember-rally&solo=1&stage=harmattan&rally=ride&from=<m>` — see
`NOTES.md` 31 Aug for the route. Six things were only wrong on screen: the town
read as a slot canyon, the torons as black bars, the palms as insects on
sticks, the stalk screens as packing crates, the dyers' frames as litter
scattered over a field, and the ruin was invisible among the mounds it was
meant to explain.

## 6 Sep · Claude · The garden keeps itself, and a thought can wait for a day

> *"we are only doing 1,2,3 and 7 from the upgrade.md file"*

Four things, from `UPGRADE.md` — which is the ranked list this came out of and
also records what was turned down, so nobody proposes the two suns again.

**Firestore now keeps a local copy.** `getFirestore(app)` was bare, so every
open of the garden was a cold read of the conversation, the memories, the
archive, the pot and the thoughts over whichever connection Kano was having.
It is `persistentLocalCache` with the multi-tab manager now. Writes queue
offline and send themselves, so a thought written with no signal genuinely
lands rather than appearing to. **Measured:** the lazy `firebase` chunk went
701 KB → 778 KB raw for the persistence code — it is behind the dynamic
boundary and not in front of the first frame.

**And there is a service worker.** `sw/worker.js`, generated into `dist/sw.js`
by `gardenWorker()` in `vite.config.ts`, which walks the entry's *static*
import graph — never `dynamicImports` — so the shell is exactly what the app
already loads and the places, games, admin and Firebase SDK stay lazy. 42
files, 692 KB gzipped, and install costs almost no network because everything
under `/assets/` is content-hashed and fetched with `cache: 'default'`, so the
browser hands back what the page just downloaded.

> **The one that would have been a silent disaster:** `firebase-messaging-sw.js`
> claimed scope `/`, and **two workers cannot share a scope** — registering the
> second does not run both, it *replaces* the first. Whichever registered last
> would have won and the other would have gone dark, with the two candidates
> being "the garden opens offline" and "she is told at all". The push worker
> now lives in `public/push/`, which is what makes `/push/` its scope; a worker
> is handed its push events because `getToken` was given its registration, not
> because of where it sits. **If it is ever moved back to the root the cache
> silently dies.**

Media is never cached — `<audio>` uses ranged requests and a cache that answers
one with a whole body is a stall with no error attached. That is also twelve of
the twenty megabytes in `dist` staying out of it.

**`npm run offline`** builds, serves, opens it in a real browser, waits for the
worker, then **kills the server** and asks for the world again. Nothing is
emulated. It also asserts no media got cached. It caught two of my own bugs
before it caught anything else: it held a reference to `#root` from before the
parser had made one, and it read the page too early.

**Coming back where you were** — `systems/whereYouWere`. iOS discards a
backgrounded home-screen app in seconds, and the world was starting over every
time. The place is written down as you move and read back on the way in, and it
**forgets after an hour**: a resume is for an interruption, not for a visit.
The door still opens, because `ui/Arrival` is the gesture the browser needs
before it will make a sound.

**Five things the browser already had.** Wake Lock (the screen dimming
mid-race was a defect), the home-screen badge driven off the count `Whisper`
already computes, vibration on go/impacts/finish — `knock` weighs the hit, and
it is in `Race.tsx` rather than `physics.ts`, which is pure and runs headless —
orientation held during a race, and a **share target**: she can send a
photograph from her camera roll straight into the Glasshouse. Orientation locks
*whichever way the phone is already held* rather than forcing landscape; this
world is portrait-first and seizing the phone would be overriding a design
decision rather than protecting one.

**A thought can be sealed until a day.** `letters/{id}/sealed/words`, refused by
`firestore.rules` until `request.time.toMillis() >= openAt`. The parent keeps
`body: ''` and the date, so what her device receives is a **gap** rather than
something censored on the way past — the question vine's shape, and the
archive's. `by` and `openAt` are repeated on the sealed document so the rule
needs no `get()`. Yours is never sealed to you.

**Measured / decided:**
- A sealed thought of hers **does not glow**. The glow means *there is
  something here to read*, and that is not true yet — a light that walks you
  across the meadow to a paper that cannot say anything is the world making a
  promise it has to break.
- Opening one does **not** mark it read. `readAt` can only be set once, and
  spending it on a paper that said nothing would waste the one visit its
  flower is lit.
- The words are fetched when the paper is opened, not with the tree.
- `sealUntil` returns the **first instant of that day in the writer's zone**.
  Not `now + n days` — "it opens on her birthday" must not mean "at twenty past
  four, because that is when I wrote it". It refuses the 31st of February
  rather than letting the calendar roll it into March.

**`npm run sealed`** proves it above the wire, with both people in one process
— so the words are sitting in a map hers can reach and she still cannot have
them. `firestore.rules` is the half it cannot run; same standing as the
archive's seal.

**`FIREBASE.md` was wrong and is fixed.** It said Cloud Storage did not exist;
the deployed function's own config names a live bucket. The table now carries a
*last checked* column, because being wrong there sends the next reader hunting
for a console step that was taken weeks ago.

## 5 Sep · Claude · The archive, and two things about the film's own keys

> *"we will be writing the movies we watched, so more like we can have this
> archive of our watched movies […] the other person cant see the rate untill
> he/she rates it […] the tab of watched, if we are in it, it will fill the
> whole screen"*

**A fourth tab on the night screen: `watched`.** Either of you puts a film in,
or moves one across from the wanted list with the new *we watched it* on its
row. Half-star ratings, dragged rather than tapped. A note each. The years
standing in the list. It is the first thing in the garden that grows without
limit, so it is the first thing with a Firestore **collection** of its own
rather than a field on `world/ours`.

**The ratings are sealed, and the shape is the question vine's.** The film is
public and carries `ratedWarm`/`ratedCool`; each score is a separate document
named for whose it is, and the rules refuse hers until both flags are true. A
sealed row therefore arrives with a **gap** rather than censored, and the flags
are what tell the screen the difference between *she has not rated it* and
*she has, and it is not yours yet*. Nothing above the seam has to guess and
nothing above the seam could be trusted to keep it. Scores are stored as
integers 1–10 (half-stars) because `firestore.rules` can pin an integer down
and cannot pin a float.

**Measured:** a revealed score can never change again — the rules refuse an
update once the other side is in — so `data/firebase` keeps revealed ones in
`localStorage` for good. Without it, opening the archive with 200 films in it
is 400 document reads before a single star appears, every session. Unsealed
ones are deliberately not kept: while she has not rated, yours is still yours
to revise.

**The tab takes the whole screen, and the picture *leaves* rather than
unmounts.** `.together.full.archive` puts `.together-screen` at `left: -200vw`.
Not `display: none`: that is a re-layout the embedded document can see and
YouTube's player is entitled to stop for — and a pause here is a pause on her
phone, so opening a list must not be able to end the film. Overflow past the
left edge never makes a scrollbar. Measured in the browser: the screen sits at
x −780 at its full 302 px width with the iframe still in the document, and the
panel takes 358 of 390 px.

`systems/archive` holds all of it that is arithmetic — the seal's four states,
the average, the year grouping — so `npm run archive` can check it without a
browser. 55 checks. The seal is the exact thing that cannot be seen from one
device: alone there is nobody to leak to, so a build that showed her rating the
moment she gave it would look perfect until the night it mattered. The mock
grew `rateAs(who, id, score)` beside `sayAs` for the same reason, and
`npm run screen` now drives the whole round trip through the real UI.

---

### And two corrections to the film's own controls, both reported

**One press over a full-screen film looks; two press stop.** It used to be
split by pointer type — a mouse paused on a single click, a finger revealed the
controls — which meant the same tap did two different things depending on what
you were touching the screen with. Both get the same rule now. The ordering is
the argument: pausing reaches across to her screen and showing your own
controls does not, so the gesture that costs nothing is the one that is easy to
make by accident. The first press does not wait to find out whether a second is
coming — it shows the controls either way and the second adds the pause on top,
so there is no window of nothing happening.

**Measured, and worth keeping:** the window is read off `event.timeStamp`, not
`performance.now()` inside the handler. One is when the browser made the event,
the other is when React got round to running you, and under software rendering
two presses sent back to back reached the handler **up to a second apart** —
which the app quite correctly called two single presses. A film is exactly the
busy machine this fails on. The same slowness is why `mouseDoubleClick` in
`screen-check` writes its four events without awaiting each acknowledgement:
built out of `mouseClick` the pair was reliably just too slow, and read as the
feature not working at all.

**Space plays and pauses whenever your field is empty, even with the chat up.**
The old rule stood aside for any focused field, which is right in principle and
wrong in the one arrangement this screen is built around: the composer sits open
beside the film all evening, so it holds the keyboard almost the whole time you
are watching, and every space went into an empty box instead of stopping the
film. The test is now *is there anything in it*. One letter typed and the key is
hers again; the line sent and it comes back. `spaceIsTheirs` in
`systems/watching` is the rule, kept away from the DOM so it can be checked; a
`<select>` and the inputs a space *operates* rather than types into keep it
whatever is in them.

**Also:** the tab row was already the full width of the panel at 390 px with
three tabs, so a fourth needed the row to give back a little tracking and size
rather than clip. The count on `watched` is the archive's size; the films
waiting on a rating from *you* are a dot, because "· 3 to rate" is another
eighty pixels and pushes the tab off the end of a panel that clips.

**`firestore.rules` has a new block and nothing works until it is published** —
the failure is quiet: the film appears and the rating is silently refused. Run
`npm run rules` and paste. `npm run screen` is green at 179; the two runs where
the film half failed were the check's own MediaRecorder fixture coming out at
1 KB instead of 3, which is an old flake and not this work.

## 8 Sep · Claude · The drift gets its dials

Nine numbers that decide how a drift feels have always been in `RallyTuning`,
doing real work, and none of them was reachable: the control room offered the
helper, the angle and the entry speed and nothing else. So when the drift
settled too slowly there was no dial to find — and the search landed on one
that sounded close and did something else entirely.

**A number that decides how the car feels and cannot be reached is worse than
a missing feature.** It is a wrong answer waiting to be given, and it was
given: an afternoon spent moving the wrong slider, and a correct conclusion
that the drift was broken.

All nine are dials now, in the order you would reach for them rather than the
order they run in — settling speed, what a held slide keeps, what throwing it
costs, how fast it swaps, what the angle costs, how far the arrows move it
across, how firmly it keeps its lane, the tightest arc it will draw, and the
most it can pull. `npm run tuning` says **47 of 47**.

**And three warnings, because these dials open real traps.** The one that
matters is the invariant that was silently false for months: a drift settling
under about 62% of the car’s top speed is beaten by clouting the rock, so
crashing becomes the quicker line and nobody drifts. The page now says so, in
the two speeds, before you leave the slider there.

Checked at 390 px: every one of the eleven drift rows fits on a single line,
the longest being *"The tightest arc the arrows can ask for · 25 m"*.

---

## 8 Sep · Claude · Crashing was faster than drifting

> *"its better to even hit something than start a drift […] if you hit
> something at top speed at most you get back to like 80 to 85km/hr, but then
> why the hell when i get in a drift the car goes all the way back to like
> 62km/hr"*

Measured, and worse than reported. In a car that tops out at **127 km/h**:

    clout the rock at full speed     127 → 77 km/h
    enter a drift at full speed      127 → 66, settling at 71

So the mechanic the whole game is built on — *drifting is how you buy going
fast* — cost more than crashing, at both the moment you feel most and the one
you live in. The quickest way through a corner was to bounce off it.

**Not a tuning mistake, and not new.** `driftTopSpeed` is an absolute speed,
and it has been 20 m/s (72 km/h) throughout. What moved is the other side of
the comparison: before the car work a wall cost almost nothing — 127 → **123**
, measured — so the two numbers were never seen together. Making stone hurt
properly is right, and it is what exposed this.

At 26 m/s the entry dips to 84 and settles at 90: above a wall at both
moments, 71% of top speed, and still nowhere near a shortcut — twelve seconds
of drifting covers 147 m where driving covers 387.

`npm run drift` now asserts it against the rock directly, because "the reward
mechanic must beat the punishment" is the kind of invariant that is obvious
once written and invisible for months when it is not.

**It reaches both phones without anything being published.** Only keys in
`DIALS` are ever sent — `changedOnly()` walks that list — so a constant like
this always comes from the code, under whatever set is in force.

---

## 8 Sep · Claude · The drift is ours again

> *"codex really fixed alot of things about the car, the speed, the feels,
> the corners […] but one thing codex wouldnt really get is how our drift
> works, it tried twice and failed badly"*

Correct, and the reason is not a bug. **The drift was not tuned, it was
replaced with a different mechanic**, by someone who had no way of knowing
there was a design to keep. Everything else about the car got better in the
same two commits and none of that was touched here.

### What ours is

From `PLAN.md`, and it is the only sentence that matters: *a drift is a game
mechanic, not a physics outcome — and the physics has to be told to get out of
the way.* While one is running the arrows steer the **path**, not the wheels:
the key you hold bends the line the car is travelling along, the same key
decides which way and how far it hangs, and **the other key swings it through
and hangs it the other way**. One drift carries you through a left and then a
right without ever hooking up.

### What it had become

A slip angle you hold. The side was fixed at the moment of the handbrake pull,
the arrows only deepened or shallowed the angle, and swapping sides needed a
second pull. Reasonable, well written, and a different game.

Two pieces of evidence rather than an opinion.

**Nine of the twelve drift numbers were wired to nothing** — `driftSwap`,
`driftTightness`, `driftGrip`, `driftScrub`, `driftSwingCost`, `driftHold`,
`driftTopSpeed`, `driftLineHold`, `driftPlace`, all still declared in
`RallyTuning` and `DEFAULTS`, and read by no line of physics.

> **Correction.** I first wrote this as "nine dead *dials*, still rendering on
> the tuning page". They are not dials: only `driftHelper`, `driftAngle` and
> `driftEnterSpeed` are in `DIALS` and reach the control room. The other nine
> are code constants, which is also why `npm run tuning` never saw them — it
> walks `DIALS`, and there are 38 of those. I asserted the stronger version
> without checking, twice in one day.

**And a held drift on the real Rootway**, one arrow, throttle pinned:

    before   83 · 73 ·  8 ·  0 ·  1 ·  2 ·  4    97% → 100% to the rock, touching 33%
    after    83 · 58 · 66 · 68 · 68 · 68 · 68    peaks at 81%, touching 0%

It drew its own circle, walked across the tunnel and stopped dead in the rock —
the exact failure recorded and fixed on 1 September, back again and worse. The
1 Sep `driftHold` work had gone with it: `driftSettled` had been redefined from
*seconds the pose has been held* to *seconds continuously sliding*, which is a
different quantity wearing the same name, and `DRIFT_ANGLE_COST` was gone.

### The one I broke, and how it was caught

I reported this finished with `npm run tuning` reporting **36 of 38**, and
called the two dead ones — `boostPower` and `boostSeconds` — pre-existing. They
were not. At HEAD it was 38 of 38 and it exited zero. I asserted that from a
plausible guess rather than from running it, and the owner asking *"you really
done??"* is the only reason it was found.

The cause is a seam rather than the drift. There are two things called drifting
in `physics.ts`: `car.drifting`, the deliberate state, and a local one meaning
*measured slip*. The ember used to fill from the state. It had been moved onto
the measured one, which was correct at the time **because the two had been made
the same thing** — the deliberate drift no longer existed. Bringing it back
parted them again, and the bar went on filling from the couple of seconds of
incidental slip in a lap while ignoring twenty-four seconds of actual drifting.

    slip over 0.14      2.57 s   against 2.52 s originally
    payouts                 2    against 2
    peak charge          1.77    against 1.74
    the bar              0.39    against 1.00

Everything measurable about the drift was identical; only the reward was
starved. Nothing failed, nothing looked wrong, and the economy the whole game
turns on had quietly stopped paying.

**Chasing it proved the restoration faithful.** With the ember taken out of the
test driver — the original always cancelled its own drifts with it at exactly
0.6 s, so its stickiness had never once been exercised — the two line up:

    original   23.48 s drifting, drifts of 5.5 · 2.7 · 2.6 · 12.7
    restored   24.17 s drifting, drifts of 5.8 · 2.8 · 2.6 · 13.0

`npm run drift` now asserts the seam, because a renamed state with a consumer
still reading its old meaning is a class of bug with no symptom at all.

### Why the check did not catch it

It could not: the check was written from the new model. Its road test used a
synthetic constant-radius track and a **closed-loop test driver** reading
`car.psi`, `slipOf(car)` and `car.n` and computing steering every frame. It
proved the drift was controllable by a controller. Nobody plays with one.

It also asserted, deliberately, that a slide may not steer toward the authored
racing line — which is one of ours *by design* and is why the drift keeps its
lane instead of washing wide. A check can encode a design decision so firmly
that reversing the decision reads as breaking the code.

`scripts/drift-check.ts` is rewritten around the design instead: the gesture,
the three ways out, the arrows swapping sides with no second pull, what it
costs, and the two things that must never become true — a drift quicker than
driving, and a drift that walks into the rock. It deliberately does **not**
assert a slip-angle window; the angle is `TUNE.driftAngle` scaled by the arrow,
so it is a dial's business and pinning it is how a tuning change becomes a
failing test.

### And the wheels, which looked straight

> *"the tire is supposed to kinda bends to the other direction while drifting
> […] well the tyres just kinda stays looking straight"*

The opposite-lock block was restored with the rest and was doing exactly what
it said: drawing the fronts at nine tenths of the slide angle, which points
them along the car’s path. Correct by its own description, and it looks like
nothing — **because the chase camera is aligned with the road**, and a
sustained drift travels down the road. So the body swings out to a visible
angle and the wheels, pointing along the path, sit dead ahead in the frame.
The car went sideways and its tyres did not.

It is also wrong about a car. A drifting car’s front tyres are the only two
still making a lateral force, and a tyre makes none at zero slip — so they sit
*past* the path by their own slip angle, not on it. That is `DRIFT_SHOW_BITE`,
eight degrees, added and then held to the steering lock the car actually has.

    two thirds of an arrow   16.6° → 26.4°, against a body hung out at 18.4°
    full arrow               31.5°, on the stops, against a slide of 26.4°

Still only `wheel.steer`, which the tyre model rewrites from `delta` at the top
of every step before it reads it — so this cannot reach the handling, and the
lap times say it did not.

### What was kept

Everything outside the drift. `npm run handling` passes all eleven, the fire
spirit still completes all four roads on the same tyre model, and the lap and
sector times in `npm run rally` are unchanged. Three things the new drift added
were genuinely better and stayed: a sideways car takes the room its nose and
tail need before the wall lets it through, exits are eased rather than snapped,
and the front wheels visibly countersteer — that last one is cosmetic again,
written over `wheel.steer` after the forces, because the arc now moves the car.

### Measured after

    tap, then let go            still drifting eight seconds later
    arrows alone                −18° → +18° → −18°, still on it at 65 km/h
    entry, then held            88 · 60 · 67 · 68 · 68 · 68 · 68   dial says 72
    held vs thrown              68 km/h · 66 km/h
    twelve seconds of road      driving 387 m · drifting 118 m
    rootway · moonbreak · harmattan   68–69 km/h at −26°, touching 0%

`scripts/drift-probe.ts` works again too — its wind-up held the car straight,
which stopped being viable when the car got quicker: the Rootway now turns
before 108 km/h, so it buried itself at 86 and never reached the speed the
probe starts from. It read as the probe being broken. The car had outgrown it.

---
## 5 Sep · Claude · Four attempts at a keyboard, all removed

> *"it kinda almost worked once, and i saw the screen literally while my
> keyboard was up, but then it never stayed again […] now even tho it goes up,
> the chat thinks that you are shrinking it, and i dont get to see the current
> last text im replying to […] if i cant get the screen, why give up my current
> text"*

Everything below is gone. This entry exists so nobody builds a fifth.

**What was tried, in order.**

1. `interactive-widget=resizes-content` in the viewport tag. Chrome honours it
   and shortens the layout viewport; Safari does not support it at all. *(This
   one stays — it predates this work and the Stars is built on it.)*
2. Hiding the transport while the composer had focus, to give the field room
   so the browser would have no reason to scroll.
3. `systems/viewport` — reading `visualViewport` and sizing the whole night
   screen to the visible area, so there was nothing above or below it to
   scroll to.
4. Reversing `.together-talk` so the composer sat directly *under the picture*
   at about 310 of 844 instead of 789, where no keyboard could cover it — and
   reversing `.together-said` with it so the newest line stayed on screen.

**Why they are all gone.** The first three never reliably held the film in
view; it worked once and then did not. The fourth held the film and took
something worse in exchange: with the conversation moved below the composer
and reversed, the message you were answering was no longer where you could
read it. Giving up the thing you cannot write without, in return for something
that only sometimes works, is not a trade.

**The measurement that made every attempt look right.** On a 390-wide phone
the film sits at 88–289 and stays there under Chrome with a keyboard up. That
is true, it is repeatable, and it is worthless: it is Chrome describing its own
viewport tag back to me. Every one of these was verified in an emulator on the
engine that already behaved, and the engine that misbehaves was never in the
room. Three separate NOTES entries say a version of this. It is the same
mistake each time.

**What the night screen does now:** nothing. A keyboard does whatever that
browser does with it. The conversation reads oldest to newest downward, the
composer is at the bottom, and the last thing said is directly above it —
measured at 744, with the composer at 775 and the field at 789. Focus changes
no geometry at all.

**If anyone picks this up again:** the Stars already solves its own version,
and solves it differently — `--talking-top` in `ui/Talking` positions against
`visualViewport.offsetTop` as it *reports* rather than predicting what the
browser is about to do. That is the shape that has held. And it should be
checked on the actual phone before it is called fixed, because none of this
was.

---
## 5 Sep · Claude · The seven-timezone batch

> *"dont do watching apart but together thing, dont do a date to look
> forward to, but do thee rest of the things you suggested"*

Four things, all of them following from the same fact: one of you is moving
about seven hours away, and almost nothing in the garden assumed that yet.

**Push for everything, not just the Stars.** `functions/index.js` had exactly
one trigger. It now has five — a message, a thought under the Tree, a picture
in the Glasshouse, a move in a game, an answer to the question — over one
shared `tell()` rather than five copies of the delivery. The thing worth
knowing: **the tag is what stops them erasing each other.** The worker
collapses notifications sharing a tag, which is right within a kind (four
moves is one "your turn") and catastrophic across them — an unread letter
swallowed by a game. Each kind carries its own now.

What is deliberately *not* sent: a letter’s text and an answer to the Tree’s
question. A letter is written to be found where it was left; a lock screen
spends it. And the question’s whole ritual is that neither of you sees the
other’s answer first — a notification carrying it would break the game it
belongs to. A memory’s caption does go, because a caption is an invitation
to go and look rather than a substitute for looking.

**Asleep is not away.** `likelyAsleep(hour)` in `systems/time`, off the clock
the corner already holds. Today both of you are on WAT and it changes nothing;
at seven hours apart, *away* and *asleep at 4am* are completely different
facts and only one of them means "don’t wait up".

**The shared film list** — `Wanted` in `data/types`, `FilmList` in
`ui/Together`, on the world document beside the shared screen. A row is a
title and two fingerprints; each of you marks it by choosing your own copy,
which costs nothing you were not going to do anyway, and the row then knows
whether your two downloads are the same download. **The point is the hour it
tells you.** Two different rips still play in step — that is what the nudge is
for — but finding out at three in the afternoon is an errand and finding out
at nine in the evening is a ruined night. That gap is the entire feature.

Marking also shelves the handle, so a marked row on a Chromium browser is a
one-press start — the fastest path on that tab, and the one an ordinary
evening takes.

**Two traps this left in `screen-check.mjs`,** both the same shape as ones
that have already cost a run here:

- `give()` found `.film-tab .film-input` — the *first* one. The list renders a
  picker per row, above the main one, so as soon as a row exists the harness
  would have been handing files to the wrong input while every assertion still
  passed for the wrong reason. Now it prefers the direct child.
- `.film-trouble` is worn by the list’s message as well now. The unscoped
  polls for it are narrowed to `:not(.wanted-trouble)`. This is the third time
  a shared class in this file has made a green mean nothing.

**And `PLAN.md`’s debt list was lying.** It still asked for the deletion of
`Water.tsx`, `Bottles.tsx`, `Lamps.tsx`, `SoftOrb.tsx` and `controls.ts`, all
five of which are gone. By the plan’s own rule — *an unticked box is an
instruction* — that sends the next reader hunting for files that do not exist.
Struck through rather than deleted, so it reads as done rather than as never
having been said.

---
## 4 Sep · Claude · Safari's keyboard, and up rather than across

> **Superseded.** Everything this entry describes was removed on 5 Sep — see
> *Four attempts at a keyboard, all removed*, above. It did not hold on the
> phone. Read it as a record of what was tried, not of what is there.

> *"the last fix you said you did about the movie screen staying fixed in view
> even when the keyboard is up didnt really work"*

It did not, and the reason is that I fixed one of the two things a keyboard
does and reported it as fixed.

**Chrome** honours `interactive-widget=resizes-content` in the viewport tag and
makes the *layout* viewport shorter. Everything anchored to the top stays put.
That was measured, it was true, and it is the whole of the Android story.

**Safari does not support that tag.** It leaves the layout viewport at full
height, shrinks the visible part, and then scrolls the page to bring the
focused field into view — dragging every `position: fixed` element up with it.
The film slid off the top of the screen, which is exactly what the screenshots
show, and no amount of measuring on Chrome would ever have found it.

There is no CSS for the visual viewport. `systems/viewport` reads it and
publishes two lengths and a class on the root: where the visible area begins,
and how much of it there is. A night screen sized to exactly those cannot be
scrolled off, because there is nothing above or below it to scroll to.

The other half of it is one line of stylesheet with a note on it: the film and
the panel become `position: absolute` inside the screen instead of `fixed` to
the window. Identical geometry today — the screen is `fixed; inset: 0`, so an
absolute child resolves against the same rectangle — and it is what makes them
*follow* the screen when the screen moves to sit over the visible area. Fixed
children would have stayed behind.

Simulated by writing the variables Safari would have produced: with the page
held ninety pixels up, the film moves from 88 to 178, so it lands at 88 on
screen — where it was. Without it, it lands at −2.

### And the conversation goes up, not across

Two mistakes in a row, and the same one underneath: I kept treating this as a
question about *which corner* when it is a question about *height*. The
conversation is where you are already looking — it has the composer in it, you
are typing into it — and sending it to the far side of the picture to dodge a
subtitle costs the thing it is solving for, because a column that changes sides
has to be found again every time it moves.

Straight up the same edge. It clears the words along the bottom and stays where
your eye already is, and the arrow is now the only two directions there are.

## 4 Sep · Claude · the transport goes whatever is playing

> *"What the hell is all this thing doing here when im trying to search"*

Fair. The rule I wrote was wrong, and it was wrong in a way that looked right
in the check because the check never searched with a film on.

Making room while somebody searches was tied to the screen being **dark** — on
the reasoning that a film that is actually playing has earned its controls, and
that hiding them would be hiding something you are watching. But the controls
are not the film. A title, a scrubber, a clock and five buttons is two hundred
pixels of a phone spent on a film you are not touching, sitting directly
between the search field and its results.

The picture keeps its place; the transport does not. Measured on a 390-wide
phone with a film on: the picture stays at **88–289** either way, and the room
below the search field goes from **315 to 427 pixels**.

The general shape of the mistake is worth keeping: *"never hide what they are
watching"* was a good instinct applied to the wrong object. The thing being
watched is the picture. Everything else on that screen is furniture, and
furniture can move.

### And the conversation has two corners, not four

Four was one of those choices that is really no choice — the extra two are the
same two answers mirrored, and nobody wants to press a button three times to
discover the third stop is the same as the first. Bottom right is where it
belongs and top left is where it goes when the subtitles want the bottom: a
place and its opposite, which is the whole of the question.

The control is an arrow to where it is *going* rather than a name for where it
already is. "Bottom right" written beside a thing visibly in the bottom right
is a label for something you can already see, and it costs three words on a
control that has to be small. The words stay in the `aria-label`, for anybody
reaching it by ear.

## 4 Sep · Claude · the film does not move, and the arrows

> *"what is the most important thing on the night screen? the movie ofcourse,
> so why should a keyboard push it up too while writing"*

### It was not the film that was moving it

Measured before changing anything, which turned out to matter. On a 390-wide
phone the picture sits at **88 to 289 and stays exactly there** when a keyboard
takes a third of the screen — `interactive-widget=resizes-content`, already in
the viewport tag, sees to that.

What was actually happening is one line further down. The panel below is left
with about a hundred and ninety pixels, the transport takes half of them, and
**the field being typed into ends up at 500–533 on a 500-pixel page** — below
the bottom edge. The browser then does the only sensible thing and scrolls to
reveal it, dragging the fixed layer and the film with it.

So the fix is not to pin the film. It is to stop giving the browser a reason to
scroll: the transport steps aside while somebody is writing, the same way the
dark screen steps aside while somebody is searching, and for the same reason —
it is not what you are doing. Measured after: film unchanged at 88–289, field
at **445–478, inside the page**.

### A bug found by measuring rather than by thinking

`onHunting(false)` rides on the search field's blur, and **a field that is
unmounted never blurs**. Switching to another tab with the keyboard still in
the search box left the night screen believing somebody was looking — for ever
— so the picture stayed hidden on a tab that has no search on it at all, which
reads as the film having vanished.

Found by measuring the film's box on the talk tab and getting `{top: 0, bottom:
0}`. Both halves clear their flag on unmount now.

### The arrows

`←` and `→` move fifteen seconds, which is the step every player has settled on
— long enough to skip past something, short enough to find your way back to it.
Holding control makes it a minute, for when you are looking for a scene rather
than a line. `↑` and `↓` are five per cent of the sound.

**Seeking is shared and the sound is not**, and that split is the whole design.
Moving the film is moving *the film*, which is the one thing the two of you are
doing together; turning it down is a fact about the room you are sitting in.
There is a check that the volume keys never reach the shared anchor.

They stand aside for exactly what space stands aside for: a field, a key
somebody has already handled, and a focused control — arrows move a slider and
space presses a button, and taking those would break the transport for anybody
who reaches it by tab. The one exception is the clear sheet over the film,
which is where focus lands after you click the picture.

**A word over the picture**, because both of these are otherwise invisible: the
scrubber is usually hidden and the volume fader lives in another room. Without
it you press and hope, then press again because you are not sure the first one
landed.

### And the checker, twice more

**An unwritten setting is not a missing one.** The volume baseline read
`localStorage` on a fresh profile, found no key at all, and compared a number
against `null` — failing against behaviour that was correct. The garden's
default is full; that is the baseline.

**And the same state-you-start-in shape as last time.** The "arrows do nothing
while writing" check focused a field that does not exist, because the section
before it leaves the film filling the screen and there is no panel beside it —
so the focus landed on nothing and the arrows fired exactly as they should when
nobody is typing. It leaves fullscreen first now, and asserts there is a field
to write in before asserting what happens when you write in it.

That is twice this has happened in two days. The lesson is not "remember to
exit fullscreen" — it is that **a check should assert its own preconditions**,
because a precondition that silently fails produces a failure that looks like
the feature.

## 4 Sep · Claude · room to choose, and a keyboard that comes up

> *"i can only scroll through like 1. video per the available view space which
> is literally so bad"*

### The half of the screen that was doing nothing

A phone showing the night screen is a picture, a transport, a row of tabs, and
then whatever is left — and what was left is about one search result. You
cannot choose between things you cannot see.

So while somebody is looking, the part that is doing nothing gets out of the
way. **Never the picture itself**: a film that is playing stays exactly where
it is, because searching for the next thing is not a reason to stop watching
this one. What goes is the dark rectangle standing in for a film nobody has
chosen and the transport for it — which is why the rules hang off
`.together-screen.dark` rather than off the search.

Measured on a 390-wide phone: the space under the search field went from
**315px to 637px**. Two results became six.

**Focus alone was not the right trigger.** You type a word, take your finger
off the field to scroll the results, and everything would spring back and shove
the list down mid-scroll. So a query still in the box counts as looking, and it
stops counting when the box is empty and nobody is in it — which is exactly
what choosing something does, since taking a result clears the field.

`Ink` learned to forward `onFocus` and `onBlur` for this, which the composer
wanted anyway.

### And a way to empty the field

Holding backspace is fine on a keyboard and miserable on a phone, where the
alternative is thirty taps or a select-all most people do not know is there.
The `×` is inside the field where every phone keyboard has taught people to
look, it appears only when there is something to clear, and it hands the
keyboard straight back — emptying a search is nearly always the start of a
different one.

### The conversation can be moved off the subtitles

Four corners. The reason there is a choice at all is subtitles: they are drawn
along the bottom of the picture where subtitles have always been drawn, and a
long line reaches a good way towards both bottom corners — so the one place the
conversation cannot always live is the place it started.

The top corners avoid them completely and cost a little sky; the bottom ones
are further out of the way of the film and sometimes in the way of the words.
Which matters more depends on the film, the subtitles and the person, which is
the shape of thing that should be a setting.

Two things fall out of moving it up: the lift over the transport belongs to the
bottom corners only, and the column has to grow *down* from a fixed top edge —
newest last either way, by a different route.

### Answering in the Stars puts the keyboard up

Two things were wrong, and the first was invisible: the focus effect watched
only `composing`, so it fired on the way *open* and never again. Swipe a line to
answer it while the composer is already up — which is most of the time, once
you are talking — and the quote appeared above a field that did not have the
cursor.

And on a phone the swipe itself takes the keyboard away, because the gesture
starts with a finger on a message. Answering had become: swipe, then tap the
box, then type.

`replyTo` is in the dependencies now — choosing something to answer is choosing
to write, every time and not only the first.

**A layout effect rather than an ordinary one**, and that is the iOS half.
Safari only raises the keyboard for a `focus()` inside the gesture that asked
for it; layout effects run during the commit, which React flushes in the same
task as the handler that set the state, while an ordinary effect runs after
paint with the gesture over and the focus granted silently with no keyboard
under it. **Unconfirmed on a real iPhone** — it is the known-correct shape and I
cannot observe it here.

### A green that was passing for the wrong reason

`.film-trouble` is worn by three different notices — a file that will not open,
subtitles that will not read, and a film with no sound. The subtitle-refusal
check asked for *any* of them and was matching the no-sound notice, so it would
have passed with the subtitle handling entirely broken. Each is asked for by
name now.

Worth generalising: a shared class is a fine thing for styling and a poor thing
to assert on. When a check reads an element by a class that more than one state
can wear, it is testing the stylesheet rather than the behaviour.

### And two more sleeps, one of which was hiding behind a better assertion

The subtitle read had grown past a second and a half, so four assertions
described a subtitle that had not arrived rather than one that was wrong.

The other is more interesting: `it is actually playing` compared the film's
position before and after a wait, read 3.78 and then 3.2, and called the film
stopped. What had happened is the correction loop pulling it back towards the
shared clock in between — **the loop working**. The assertion is now the
`running` primitive itself: two readings a quarter of a second apart, both
playing, the second later than the first. A gap the loop can close cannot fit
between them.

## 4 Sep · Claude · a tab of its own, and space

> *"you really put the movie capability thing in the worst place... why cant you
> give the local movie thing its own tab"*

Correct, and it was two mistakes at once. Choosing a film sat under the YouTube
search **inside the queue tab**, which pushed the queue itself — the list of what
the two of you have lined up, the whole point of that half — off the bottom of a
panel that is not tall. And it read as something fitted in wherever there was
room, which is exactly what it was.

Watching a film off the disk is not a footnote to searching YouTube. It is the
other answer to the same question, so `Tab` gained a third value and it stands
beside it: **talk · find & queue · our film**.

The transport got lighter with it. The subtitle picker moved onto the tab —
subtitles are a fact about *this copy*, chosen once and then left alone, and the
transport is for the things you reach for while the film is running. What stayed
there is what belongs to watching: which copy is loaded, the nudge, and the
no-sound notice.

### Space, which is one key with two jobs

They never overlap, because they are never wanted at the same moment: in front
of a film a space is the oldest gesture there is, and inside a sentence it is a
space. What separates them is only where the keyboard is pointing.

Three things it stands aside for, and the third is the one worth writing down:

- **A field**, ours or anybody else's, keeps its own spaces.
- **A key somebody has already handled**, and a modifier held down.
- **A focused control.** A space on a focused button *activates* it — that is
  what the browser does and what a keyboard user expects — so taking it would
  break `cc`, `stop` and everything else on the transport for anybody who
  reaches them by tab. The one exception is the clear sheet over the film,
  which is a button only because it has to be something: it is where focus
  lands after you click the picture, and exactly where a space should play.

Only while the screen is open. A tucked film is one you are half-watching from
somewhere else in the garden, and space belongs to wherever you actually are —
most sharply inside Ember Rally, where it is a driving control.

It also meant space had to stop opening the film chat's composer, which it did
as one printable character among all the others. Every other character still
does; a leading space was worth nothing as the first thing in a sentence anyway.

### The silent-audio notice was verified after all, and was worded wrong

I had written this up as *verified by construction rather than by observation*,
and that was a failure of imagination. **The test clips are canvas recordings,
which have no audio track at all** — so `webkitAudioDecodedByteCount` stays at
zero for them and the detection fires exactly as it would on an AC3 film. The
whole path was already being exercised: the four-second wait, the poll on the
sync loop, the state, the notice.

Finding that fixed the wording too. The same zero is produced by a track the
browser cannot decode **and** by a file with no sound on it — a screen
recording, something exported without its audio — so *"this copy's sound is in a
format the browser cannot play"* was a guess stated as a fact, and the wrong
guess every time somebody films their own thing. It says what is known first
and what is likely second.

### Two more that were only ever reasoned about

- **A queued film.** Queueing one and letting it come up is the only path into
  the invitation nobody had walked. It works: the anchor carries it, and the
  screen asks for a copy by the name it was queued under rather than going
  black.
- **The miniature asked for nothing.** The invitation was gated on the screen
  being *open*, so somebody who had folded the film into the corner and gone
  for a walk got a black rectangle when the other one put a film on — the exact
  failure this invitation exists to prevent, reproduced in miniature. It shows
  there now, with the stylesheet dropping the paragraph and keeping the name
  and the way in.

### And the checker, once more, in one lump

Four assertions failed in four different-looking ways on the first run of the
new section, and every one was the same thing: **the section before it leaves
the film filling the screen**, and in that state the panel beside it does not
exist. No transport, no tabs, no talk field, no fold-away. They were all looking
for controls that were correctly absent.

Worth remembering as a shape: when several checks fail at once and the failures
look unrelated, suspect the state the section *starts* in rather than the thing
each one is testing.

## 4 Sep · Claude · subtitles, the shelf, and the silence

The three things left out of "our own film", built in the order they matter.

### Subtitles are parsed and drawn here, not handed to a `<track>`

A `<track>` is less code and gives away the two things that matter most.

**Where the words go.** WebVTT positioning belongs to the browser, and over a
filled screen this app already has a conversation lying in the bottom-right
corner and a transport that comes and goes along the bottom edge. Subtitles
have to move out of the way of both — `::cue` cannot be told to, and
`.film-lines` steps up exactly as `.screen-chat` does, same distance, same
easing.

**And a `<track>` looks like a browser.** White on a black slab in the system
font, over a garden that has spent its whole life avoiding that.

What it costs is a parser, and a subtitle file is not hard to parse. What it
buys beyond position: **the arrow is looked for rather than assumed to be on
the second line** (SubRip numbers its cues, WebVTT usually does not, and files
in the wild do both), the cues are sorted because the reader walks forward
through them, and `cueAt` takes last frame's index so the ordinary case is two
comparisons rather than a search through nine hundred cues sixty times a
second.

Two things worth knowing:

- **Encoding.** A great many subtitle files are Windows-1252, and read as UTF-8
  every accented character becomes a black diamond — quietly, with the film
  playing perfectly. It is decoded **strictly** first; a file that is genuinely
  UTF-8 decodes, one that is not throws and is read again as Windows-1252,
  which cannot itself fail.
- **Nothing is ever assigned as markup.** `cueNodes` builds text nodes and
  `<em>`s; `<i>` survives because italics in a subtitle are meaning — a song, a
  thought, a voice from elsewhere — and every other tag is dropped rather than
  interpreted. `npm run film` checks that a `<script>` in a cue arrives as
  nothing.

The timing is the *local* file's, with no arithmetic at all: subtitles belong
to the copy on this machine, so they are read against `video.currentTime`,
which is exactly where the offset for a different rip has already put it. Two
people watching two encodes with two different subtitle files each see their
own, correctly, and neither has to know.

### The shelf: a handle is a bookmark, not a key

A browser cannot keep your file and should not be able to — choosing one grants
temporary access that dies with the tab, and the alternative is a website that
can read your disk whenever it likes. The File System Access API's *handle* is
the way through: storable, survives the tab closing, and grants nothing on its
own. Coming back to it asks once, with a click. The security bargain is
unchanged; the click replaces the hunt through a folder.

`systems/filmShelf` is **written to be absent rather than broken**. Safari and
Firefox have no handles, `canRemember` says so, and every way in falls back to
the file dialog that has always worked. A shelf that half-works is worse than
none, because the whole value is trusting the one button.

It reaches for IndexedDB rather than `localStorage` for one reason: a handle is
not a string. Structured clone is the only thing that keeps it a handle.

Three answers from `fileFrom`, and they are genuinely different: the file;
`null` with the row kept (permission refused, press it again); and `null` with
the row **forgotten** — the file has moved, been renamed, or is on a drive that
is not plugged in. A shelf that keeps offering a film that cannot be opened is
worse than an empty one.

### And the silence

H.264 video with AC3 sound in an `.mp4` — what a disc rip carries — plays its
picture perfectly in Chrome and decodes exactly zero bytes of audio, for ever,
with no error of any kind. It was the last remaining way for this to fail
without saying anything, and everyone it happens to spends five minutes on
their own volume controls first.

`Screen` gained an optional `quiet?()`. It is **polled rather than pushed**,
because the loop that would carry a message is already running every nine
hundred milliseconds and the question needs a few seconds of playback before it
has an answer. Silence is not zero — a film that opens on four quiet seconds
still *decodes* them — so zero means no track was decoded at all. Where the
property does not exist it says no rather than inventing an answer: a warning
nobody can act on is worse than none.

### Four real bugs, three of them found by the checks

- **A paused film could not drift back into sync.** `correction` answers with
  seek, drift, or hold, and drift nudges the playback rate — which does nothing
  to a paused video. Pause, one of you moves the scrubber a second, and neither
  screen ever closes the gap: you press play together and start out of step,
  which is the one thing that loop exists to prevent. A paused film seeks now.
- **`cc` did nothing while paused.** The subtitle redraw only happened on a
  frame or a seek, so turning them on between two lines showed nothing until
  the film moved. `show()` is separate from the frame loop for exactly this.
- **The way into fullscreen stood down whenever *anything* was fullscreen.**
  That reads as caution and is a way to get stuck: a request whose
  `fullscreenchange` never arrived leaves the document holding an element while
  this app believes it holds nothing, and the way in is then dead until a
  reload. Only *our* element is a reason to do nothing.
- **A handle with no permission gate would have been refused.** Not every
  handle comes from the picker; the origin's own storage hands out handles with
  no `queryPermission` at all, because there is nobody to ask. Treating a
  missing method as a refusal turns "always allowed" into "always denied".
  Found by the check, which is the only reason it was ever exercised.

### The check uses a real handle, and pretends only the dialog

The one part of remembering a film that cannot be automated is the native file
dialog, so that is the one part replaced: `showOpenFilePicker` is stubbed to
hand back a handle the page makes for itself out of the origin's own storage.
Everything after it is the app — `shelve` writing to IndexedDB, `recent`
reading it back, the row rendering, `fileFrom` asking permission, `getFile`.

**A fake handle would have passed a test the real thing fails.** IndexedDB
clones what it is given and a plain object with functions cannot be cloned, so
an invented handle would have been silently dropped at the moment of storing
and the shelf would have been empty for a reason no assertion was looking at.

The second night is simulated by a reload with the anchor still set, and the
film-has-moved case by deleting the file out from under the handle.

### The check was poisoning the machine it ran on

Worth its own heading, because it cost an hour and looked like nothing to do
with itself.

An unrelated tool failed with `fork: Permission denied`. What had actually
happened is that `npm run screen` leaks about a dozen processes per run:
`k.kill()` kills the Chrome that was launched and **none of its children**, and
Chrome is a renderer per tab plus a GPU process, a network service and a
storage service. Twelve strays and fifteen profile directories had built up
across a day of runs until the machine could no longer fork a shell.

`taskkill /pid … /T /F` takes the tree, and it is wired to `SIGINT` and
`SIGTERM` as well as the ordinary exit — interrupted runs were the main source,
and they are the same root cause as the earlier bug where a lingering browser
silently captured every later run's flags.

The profile directory is **not** deleted on the way out. Windows does not
release a folder the instant the process holding it dies, so a delete that
close to the kill fails quietly and leaves it anyway — which it did, three runs
running. They are swept on the way *in* instead, when the run that made them
finished long ago; anything still locked belongs to a run happening right now
and is skipped. At rest there is one directory and no processes.

### And two more sleeps that were races

Both surfaced only once the run grew past five minutes, and both reported true
statements about a finished film rather than anything about what was being
tested: `it moves` saw `8.5 → 0`, and the tuck saw `0 → 0`. The test clips are
seconds long and the run is minutes long, so by the time most assertions are
reached the film has ended and is sitting on its own last frame.

Lengthening the clips only moves the cliff. What removes it is one primitive —
`running()` — that says *there should be a film playing here*, and then waits
until two consecutive readings show it advancing rather than assuming that
writing the anchor was enough. It is not: an ended video told to play from zero
has to seek, load and start, and how long that takes is the browser's business.

### And the checker was wrong four more times, all the same way

Every one was a fixed sleep where a poll belonged, and each produced a message
that read as a missing feature: the shelf row arrives from a database read a
moment after the invitation renders, so "the shelf offers it back in one press"
failed against a shelf that was on its way; the same sleep meant the
film-has-moved press landed before there was anything to press, and reported
silence from a failure that had not been triggered. There is now one
`pressAgain` that waits, used both times.

One assertion also passed for the wrong reason and had to be tightened: "stops
offering it" tested for the word *again* anywhere in the invitation, and the
message explaining what happened ends with "choose it again below". It asks the
buttons now, not the prose.

## 3 Sep · Claude · our own film

> *"you honestly telling me despite us building this cool thing, we cant watch
> our own movie thats downloaded on our computer together?"*

Six years of that, and the answer turned out to be small, because **the hard
part was already built**. Keeping two people on the same second across a bad
connection is `positionOf` and `correction`, and neither of them has ever known
or cared what is playing.

### It rides in the field that was already there

`Watching` carries `videoId · title · playing · at · since · by · seq · queue ·
session`. Only the first names YouTube, and it is a string — so a film is
`film:<fingerprint>`, which cannot collide with an eleven-character video id in
either direction. **No schema change, no rules change, no migration, and a
queue can hold both kinds at once.** `Screen` in `systems/youtube` was already
an interface; `systems/film` is a second implementation of it over a `<video>`
element, and it satisfies it more easily than an iframe does.

The rejected options are written up at the top of `systems/film`, but the short
of it: **unlisted YouTube** is Content ID matching a commercial film days later
and taking a strike on the account you sign into everything with, and **cloud
storage** sends the file up once and back down *twice*, so a three-gigabyte film
costs nine gigabytes of somebody's data to watch, on two connections in Kano and
Lagos, for a file already on the disk.

### The fingerprint is deliberately not cryptographic

`crypto.subtle` is `[SecureContext]`, so it is `undefined` on the LAN dev server
a phone reaches at `http://192.168.x.x`. **`data/ids.ts` exists entirely because
of the same trap with `crypto.randomUUID`, and it failed silently both times.**
So: FNV-1a over three one-megabyte slices, twice with different seeds, carried
beside the exact byte count. Nothing here needs to resist an adversary — the
question is "are these the same file", asked of two people both trying to answer
yes.

**Three slices, and the middle one earns its place.** Two encodes of one film
often share a great deal of their opening — the same container defaults, the
same leading black — and differ where it matters. `npm run film` fails if it is
ever removed.

### Different rips are the normal case, not an edge case

You will both download separately, so the two files will not match, and that is
not a failure to prevent. Her copy is a perfectly good answer to "what should be
on this screen"; it is held under **the anchor's** fingerprint rather than its
own, the shared clock stays in one timeline, and each device keeps its own
translation into its own copy. Nudge until her laugh lands where yours does and
it stays nudged, per film, per device, never sent.

Every read from the player goes through `toShared`, every instruction through
`toHere`. With a matching file the offset is zero and both are the identity they
always were, which is why the arithmetic still reads the way it did.

### The check found a real hazard nobody would have looked for

Her clip ended and **stopped his film**. With a real film that is not a test
artefact: her rip has no credits, so she reaches the end four minutes early and
ends the evening for the person who still has four minutes left, with nothing on
either screen saying why. A copy that is not the one the anchor counts in now
keeps its ending to itself — it stops, because it has genuinely run out; it does
not decide the film is over.

### And one that built cleanly and read correctly

The film rendered at its own natural size in the corner of a black rectangle.
`.together-stage > *` sizes whatever is in the stage, and `YT.Player`
**replaces** the div it is handed — so the iframe is a direct child and gets the
rule, while a `<video>` appended into that div is a grandchild and does not.
`object-fit: contain` is the other half, and matters more than it looks: a film
is not 16:9, and without it everybody in a 2.39:1 picture is thin.

### What is checked

`npm run film` is the arithmetic — identity, fingerprinting, containers, names,
offsets — and `npm run screen` grew a section that plays a real one.

There is no ffmpeg on this machine, and committing a sample video to test a
feature whose whole point is that files stay off the wire would be a poor joke,
so **the page records its own**: a canvas, a `captureStream`, a `MediaRecorder`,
two clips kept as bytes on the checker's side so the *same* file can be handed
back after a reload. That reload is how the second person is simulated — the
mock keeps the anchor in `localStorage`, so what comes back knows exactly which
film is on and has nothing on the machine to play it with, which is her
situation precisely and not one that can be faked by hiding something.

The file goes in through the real `<input type="file">` with a `DataTransfer`.
**Nothing in `src/` knows the checker exists.**

Three of its own failures were the checker sampling before the browser had
finished opening a file. That is now polled in three places, and the note beside
each says so, because a fixed sleep twice read as the app failing to recognise a
file it had simply not finished reading.

### Two the checker taught me, at its own expense

**A green that proved nothing.** The nudge check wound the anchor back and
*paused* it, then compared two positions — and passed, because the pause never
stuck. Writing `playing: false` from a script while the video is still running
is, to this app, indistinguishable from the other person pressing play, which is
a rule it holds on purpose; so it wrote `true` straight back, the film ran on to
its end, and the position duly went up. It now measures the thing a nudge
actually claims — *this picture leads the shared clock by the offset* — with the
film left playing and nothing to fight. `lead: [-0.2, 1]`, `anchorAt: [0, 0]`.

**A check that went red because YouTube was down.** Half of `npm run screen`
needs a real iframe playing a real video — the sheet over it only matters
because an iframe swallows pointers, and click-to-pause can only be checked
against something that plays. One run could not reach `youtube.com` and
reported "no iframe", "stuck at playing" and "the controls stayed hidden",
which is three regressions' worth of message for a network that was not there.
It is asked once now, said out loud, and the checks that genuinely need it are
**skipped with a count** rather than failed — never silently passed. The film
half needs nobody's network and always runs.

**And a backtick inside a template literal**, in `screen-check.mjs` this time,
which is the same trap `npm run shaders` sweeps the shaders for. It ended the
template several lines early and reported a missing parenthesis somewhere else
entirely. Worth remembering that the trap is not specific to GLSL — anything
built as a template string can be closed by a stray backtick in a comment.

### Not in this, and worth knowing

- **Subtitles.** The big one. `cc` is hidden for a film rather than offered and
  ignored, because an `.mp4` almost never carries a track a browser will show.
  The real answer is a chosen `.srt` beside the film, converted to WebVTT and
  attached as a `<track>` — a feature rather than a line, and the obvious next
  one.
- **Remembering the file.** Chromium can persist a file handle through the File
  System Access API, so night two would be one click rather than a walk through
  a folder. Left out on purpose: it needs a second picker path and a permission
  re-grant flow, and a half-working one is worse than the file dialog.
- **Silent audio.** H.264 video with AC3 sound in an `.mp4` plays with no sound
  in Chrome rather than failing. Detectable after a few seconds through
  `webkitAudioDecodedByteCount`, not detected yet.

## 3 Sep · Claude · enter, backspace, and pressing the film

> *"backspace thinks it needs you to actually tap on the text field so it knows
> what to delete"*

### Everything but the letters was left to the textarea

Typing over a filled screen worked because the document listener handled
printable characters itself. Enter only *opened* the field and left sending to
the textarea's own handler; backspace was not handled anywhere at all, because
it is not a single character and fell straight through the test for one.

Both therefore worked if and only if the browser had happened to put the caret
in the field — and when it had not, you had to reach for the mouse and click it,
which is the exact thing this overlay exists to avoid. Letters going on and then
refusing to come off is the visible half of one bug.

The document listener owns all three now: a character appends, backspace erases,
enter sends whatever is there and sends nothing when there is nothing. A real
field that is not ours still keeps its own keys, and ours does too — the
textarea's handler runs first and calls `preventDefault`, so the document
listener has already stood aside by the time it looks.

Two things fell out of it:

- **Backspace on an empty line puts the overlay away.** Escape cannot do that
  job here: the browser takes Escape for leaving fullscreen and will not be
  talked out of it, so there was previously no way to change your mind about
  writing except to wait out the thirty seconds.
- **`draftRef` is assigned during render, not in an effect.** The listener is
  registered once and cannot close over `draft` without sending what was written
  one character ago; an effect that copies it afterwards is wrong by one tick.

### And the film answers a click again

The clear sheet over the iframe has to be there — an iframe swallows the pointer,
so without a layer of our own a mouse cannot reach the film at all, and on the
miniature nothing could be dragged. That was a real reason and it was the wrong
conclusion: on a device with a mouse the controls already come back on
*movement*, so spending the click on them too spent it twice and left click-to-
pause doing nothing.

It pauses now. A finger keeps the old behaviour, because a finger has no
movement to reveal anything with. The split is decided from `event.pointerType`
captured on pointerdown rather than from `matchMedia` — what was *used*, not
what is *plugged in*, which also gets a touchscreen laptop right.

`playPause` also moves the player itself now instead of leaving it to the next
tick of the sync loop, which was up to nine hundred milliseconds of a pause not
having happened yet.

### Two wrong diagnoses, kept here because they were expensive

The film click was intermittently "stuck at playing", and I twice fixed
something that was not it.

**First: a stale `PLAYING` event.** The theory was sound — a buffer finishing
after `applying` has expired is indistinguishable from somebody pressing
YouTube's own play — so I held unexpected state changes for 450 ms and re-asked
the player. **It was reverted, and it is worth knowing why: it makes things
worse.** The sync loop runs every 900 ms, so a hold can be outlived by a tick
that drags the player back to the anchor, and the press is then discarded
because the player no longer agrees with the event that reported it. Writing
immediately is what puts the anchor ahead of the loop.

**Second: the media query lagging.** Also wrong. What actually settled it was
pressing the transport button — which goes through exactly the same
`playPause` — and finding it just as stuck at the same moment and just as
reliable afterwards. The film had not finished its first buffer.

### The checker was wrong three separate ways

- **A lingering browser.** Chrome does not start a second browser on a profile
  another one holds; it hands the arguments over and exits. Runs interrupted by
  a timeout left one alive, and every run after it silently attached to *that*
  one — old flags, old tabs, old emulation. A fresh profile directory per run
  cannot be inherited.
- **`localStorage` carried between runs.** Where the miniature was last put down
  is deliberately kept, so a drag step that starts where the previous drag step
  finished has nowhere to go. Same shape as `garden:rounds:v1` in the chase
  check.
- **The pointer could not be emulated at all.** Headless Chrome here reports ten
  touch points and therefore `(pointer: coarse)` whatever it is told —
  `setDeviceMetricsOverride({mobile: false})`, `setTouchEmulationEnabled`,
  `--touch-events=disabled` and `setEmulatedMedia`'s pointer feature were all
  tried and none of them moves it. The same machine with a window answers
  `fine`. So `hasMouse()` in `ui/Together` takes `?mouse=1` in a development
  build, the same bargain `?mock=1` makes for the backend: the checker states
  what it is pretending rather than trying to trick the browser, and everything
  else under test stays real.

`npm run screen` is 46 checks and has now run clean four times in a row. Enter,
backspace and the click are all exercised with focus deliberately parked on the
film's own sheet, which is where it really is after you have clicked to pause —
anything that still works there is genuinely independent of it.

### And the overlay rests after fifteen seconds, not thirty

Asked for after using it, which is the only way this number was ever going to
be right. Thirty was a guess and it was a long one: it is most of a scene.

It changes nothing structural — `CHAT_REST_MS` is one constant — but it does
make the exception under it load-bearing rather than a nicety. A draft in
progress holds the overlay up for as long as there are words waiting to be
sent, and at fifteen seconds a pause for thought is an ordinary pause rather
than an unusually long one. Without that rule this would take the field away
mid-sentence often enough to be the next bug report.

## 3 Sep · Claude · the night screen, filled

> *"i want that same kinda full screen, where it actually is a full screen,
> without nothing on the screen, just the video im watching"*

Three things, and the first two turned out to be the same kind of bug: something
that works on exactly one of the two devices this garden runs on.

### The miniature could be dragged and not pressed

Reported as "on desktop it doesn't accept any touch". The pane moved perfectly
and nothing on it could be pressed — not the way in, not anything.

`onPaneDown` calls `setPointerCapture` so a drag cannot be lost out of a small
box, and **a captured pointer retargets the compatibility mouse events with
it**. `mousedown` and `mouseup` go to the pane rather than to whatever is under
the cursor, and the `click` a browser synthesises is aimed at the nearest common
ancestor of that pair — which, with capture in force, is always the pane. Every
`onClick` inside was correct and none of them was ever called.

**Touch was fine, which is why it survived.** A touch pointer is implicitly
captured to its own target anyway, and the click made from a tap is aimed at the
touch target rather than derived from the retargeted mouse pair.

- The tap is decided in `onPaneUp` now, from the same `moved` flag the drag
  already keeps. One path for both pointer types, and the drag keeps its
  capture.
- `.together-mini-reveal` stays a real button for the keyboard, and answers only
  to the keyboard — `event.detail === 0` is the split.
- `.together-mini-actions` swallows the press so its buttons get an ordinary
  click. **Play and pause is on the miniature now.** YouTube's own button is
  under our sheet by design, so "the play button doesn't work" was the honest
  reading of a picture with nothing to press.
- The duplicate pointer handlers on `.together-screen` are gone. They ran the
  whole gesture twice, the second run overwriting the first's captured pointer.

### The corner said whatever YouTube said

*open the night screen* is a length the column was laid out around. Then
something goes on and the same line starts carrying a name written by a stranger
— `shortTitle` in `systems/watching` cuts it to 34 characters on a word boundary.
CSS was already ellipsising it and that was not enough: an ellipsis only bites
after something upstream has decided how wide the column is.

### And the film gets the whole screen

Immersion was a *layout* — the picture on the left, a column down the right — so
on a desktop it was a video in a browser window with a tab strip, an address
bar, bookmarks and a taskbar around it, and a wide black gutter where a quarter
of the film should have been.

It asks the browser for the screen now: `requestFullscreen` on the pane root, so
the persistent iframe comes with it and the shared clock never restarts. The
request can be refused and a phone is never asked — `hasMouse()` — and both land
on the old layout, which is the fallback rather than an error path.

**The whole layout change is one number.** Everything in the immersive block
measures the film against `--immersive-chat`; `.filling` takes it to zero.

The conversation moves onto the picture. `ScreenChat`: bottom right, no panel,
no border, lines carried by a triple text-shadow rather than by a surface. It
rests after thirty seconds of nothing, comes back on a line arriving or on her
starting to type, and **you never go and find the field** — start typing and it
is there with what you typed already in it. `--screen-chat-scrim` is the dial
for the white kitchen, from nothing to a little, and it lives in the composer
because that is where you are when you discover you need it.

`useScreenTalk` is the one implementation of a sitting's conversation, shared by
the panel and the overlay. Same argument as the three composers in
`systems/useTyping`.

### Two silent ones found by looking rather than by thinking

- `savedScrim` read `Number(localStorage.getItem(k))`, and on a key that was
  never set that is `Number(null)` — **0**, finite, in range, and identical to
  somebody deliberately turning the backing off. The default shipped as the one
  end of the dial nobody chose, and it looked like the shadow was too weak.
- A `\s` lost to a shell heredoc made `shortTitle` cut on `/s+/g`, which
  silently deleted every letter *s* in the title. It compiled, it typechecked,
  and it read correctly in the source.

### `npm run screen`

Drives `Input.dispatchMouseEvent` and `Input.dispatchTouchEvent` rather than
calling `.click()`. **A synthetic click would have passed against the broken
build** — it skips the pointer pipeline, the capture and the retargeting, which
is the entire bug. It waits out the real thirty seconds too; a shortened timer
would only prove a shortened timer works.

Two of its own failures were the checker being wrong, and both are worth
knowing: `Emulation.setTouchEmulationEnabled` is a property of the page, so a
phone step leaves `(pointer: fine)` false for everything after it; and the
miniature's position is kept in `localStorage`, so a run that does not empty
that drawer measures the run before it.

## 3 Sep · Claude · the control room is Warm's room now

> *"in a case that she ever finds out about dev7731, can she sign in with her
> mail and password?"*

She could. `/dev7731` was hidden and nothing else, and the file said so in as
many words — a secret in the sense of not lying around, not in the security
sense. `atTheDoor()` only ever read the URL, and the page rendered inside the
provider, so **either** address signing in and landing on that path got the
whole room: the car republished under the other one mid-corner, the doors on the
wall, the sky pinned to an hour she is not living in.

The rules were already stricter than the interface. `rallyTuning` and the
world volumes are Warm-only in `firestore.rules`, and a handful of controls
disable themselves for Cool. So the server was never going to let her *publish*
the car — but she could open the room, read everything in it, and drive a
retuned car on her own phone, which is not what a hidden page was meant to mean.

- `mayOpenTheDoor(me)` in `systems/dev`, and `App` now decides through a
  `Doorway` component **inside** the provider — `atTheDoor()` can only see
  the address, and the address stopped being the whole question. Still ahead of
  `<Garden />`, so the control room still creates no Canvas.
- **The other branch is the garden, not a refusal.** Cool at that path gets the
  ordinary world, indistinguishable from any other path that isn't a thing. A
  "you cannot open this" announces that there is something to open.
- **The local mock stays open to both, deliberately.** There `me` is a
  localStorage key with a dropdown pointed at it, so a gate stops nobody with
  devtools — and "look at it as Cool" is a control *inside this room*, so the
  first use of it would lock you out of the only page holding the switch back.

### The thing that was actually broken on the way

`config.ts` promises in its own header that it falls through to
`process.env` off-Vite so check scripts can import it. `askedForTheMock()`
never got the memo and read `import.meta.env.DEV` bare, which is `undefined`
under Node — so importing `@/config` from any script threw before it could do
anything. Nothing hit it because no check imported config, transitively or
otherwise, until this one did. It reads `raw.DEV` now, the same fallback the
rest of the file uses.

`npm run door` is new. `DATA_BACKEND` is settled once at module load, so
seeing both answers means a child process per backend — there is no honest way
to ask twice in one. It also greps `App.tsx` for a branch straight off
`atTheDoor()`, because the boundary is worth exactly as much as its one call
site and a later tidy-up would put it all back, compile cleanly, and look right.

## 2 Sep · Claude · the fourth one, and a place to put the seam

> *"whatever emoji i tap to do the reaction with, its only the heart that
> appears"*

`watchMessages` built a `Message` field by field and did not know about
`marks`. So every emoji was written correctly, allowed by the rules,
round-tripped through Firestore, and dropped on the way in — leaving only
`hearts`, which `markBy` renders as a heart.

**That is the fourth time in two days**: `racing` written down and never
sent, `typing` sent and never read, `marks` written and refused by the
rules, and now `marks` allowed and never read. All four worked perfectly
against the mock, which keeps whole objects and has no rules in it, and all
four were found by somebody on a phone.

So messages got the same treatment presence did: `data/messages` holds the
reader and the write-patch side by side with no Firebase in them, and
`npm run seams` — renamed, because it is not only about presence now —
round-trips **every** field through both, walking an exported list rather than
one retyped in the test. A field written and not read, or read and never
written, is a failing check.

It also asserts the patch only ever touches keys under `hearts.` and
`marks.`, which are the two strings `firestore.rules` names in its
`affectedKeys` list — the other half of the same bug.

### And the marks themselves

**Centred, so they floated.** On a right-aligned message of yours the row sat
out in the middle of the sky attached to nothing. They hang off the same end
the message starts from now — hers at the left, yours at the right.

**And tiny.** 0.72 of an already small line, about eight pixels of emoji on a
phone. It is the entire content of the gesture and it was drawn like a
footnote.

### She reacted to something a long way up

A reaction on an old line is invisible in a sky you walk back through: it lands
hundreds of metres over your head and nothing at the bottom says so. Which
matters more here than in an ordinary chat, because reacting is *most* of what
happens to an old message — you do not reply to something from Tuesday, you put
a face on it.

There is one control for it, above "back to the newest" and built the same way,
because they are the only two things in this place that point somewhere else in
the sky. It wears **the mark she actually left** rather than a badge — the
difference between "you have something" and "she laughed" — and pressing it
walks you to the line.

Then it is gone. Not a count and not a queue: if she leaves three while you are
asleep, the newest is the one worth walking to and the others are on the way
past. A number in a circle would make this an inbox.

**No new field crosses the wire for it.** `hearts` already carries when each
reaction was left, and "have I seen it" is a fact about your eyes rather than
about the world, so it lives on the device. After four bugs in two days caused
by adding fields to seams, that is most of why it is built this way round.

### Scattergories

Three minutes to five. Twelve categories against one letter is a lot of
thinking, and the glass ran out with half the sheet blank often enough that the
round was about writing fast rather than about finding answers. Five is long
enough to get stuck on one, give up, and come back — which is where the good
ones are.

## 3 Sep · Claude · the scrubber, and who owns the film

Three reports about the shared screen, and the third one explained the other
two: *"the youtube play button plays for one second and then pauses itself."*

**The model was wrong, not the code.** The anchor was the truth and the player
obeyed it — right for *her* device, wrong for the one with a finger on it. The
sync loop reads the anchor every nine hundred milliseconds and makes the player
match, so pressing YouTube's own button changed something nobody had told the
anchor about, and it was dutifully undone. Pausing did the same in reverse,
which is why that "worked" for a second too.

YouTube's controls are ours now: a play or pause nobody here asked for is
written to the anchor, so it moves the shared screen exactly as our own button
does. `applying` — which already existed — is what stops it becoming a loop,
because every change this app makes to the player sets it first.

### And the same mistake, one layer up, was the sticky scrubber

`scrubTo` ran on **every pointer move**, and each one was a YouTube seek *and*
a write to the shared document. Dozens a second while a thumb was down. Three
faults compounding:

- **every move was a seek**, and the player takes a moment to honour one, so
  they queued up behind the thumb
- **every move was a write**, which came back through the sync loop and
  corrected this device toward a position it had already left
- **and the mark was drawn from the anchor**, not from the finger — so it never
  tracked the drag at all, it jumped to wherever the last round trip landed

Which is exactly *"you touch seek and hope and wait"*.

While a thumb is down the scrubber now owns the position entirely and tells
nobody: the mark follows the finger because it **is** the finger. One seek and
one write on release. The sync loop is suspended for the duration, because
mid-drag the anchor is still where the film was before you took hold of it and
correcting toward it is a fight with a round trip behind it.

Which is how the volume slider has always worked, and why that one always felt
right.

### ±15

Asked for, and the right ask. The line alone was the wrong shape for a thumb —
the only way to move a film was to land on a one-pixel line at the exact
fraction you wanted, on a phone, while it fought back. A jump you can take
without aiming is most of what anybody does with a scrubber anyway.

Either side of the line rather than in the transport row, because they are
*about* the line: you reach for them for the same reason you reach for it.

## 2 Sep · Claude · her weather

Asked why the garden was not reacting to real weather. It was not broken — it
had never been built. No weather call anywhere, no geolocation, and the whole
sky is `paletteAt(hour)`: **one number in, everything out.** The word
"weather" in `whoseHour` is metaphorical. This world had *time*, not weather.

### Whose

Hers, always — the same call `whoseHour` already made about the clock and for
the same reason: you can see your own sky out of the window. So it rides the
switch that exists rather than adding a second one, and there is no
arrangement where the sky is her midnight and the cloud is your afternoon.

Her coordinates were already on her profile, so there is no permission prompt
and nothing to ask for.

### Open-Meteo, and that choice is load-bearing

No API key. Which means no secret to keep, **no proxy in `functions/` to
build**, nothing to leak from a browser, and one fewer thing that can be down.
That is a third of the work of the alternative, and the harness asserts the
URL carries no key so nobody quietly swaps in one that does.

### One funnel, again

Weather is applied in `underSky`, once, on the palette — and arrives at the
sky dome, the fog, the grass, its wind, the clouds and the light without any
of them being told weather exists. Exactly the property that made swapping to
her clock free.

Four numbers and no more — cloud, rain, haze, wind — because the palette is
the only place weather can express itself here, and anything beyond what it
can *show* would be a number nobody reads.

Haze is where **harmattan** lands: Saharan dust reports as low visibility and
nothing else, so a hazy day in Kano and a foggy Shanghai morning arrive as the
same number. Which is right — from inside a garden they look the same.

### Two mistakes worth keeping

> **The first rain was brighter than a clear day.** I greyed the sky toward
> its own `skyBottom`, which at two in the afternoon is the *pale horizon* —
> so a downpour bleached the world. Overcast has to go toward a neutral that
> is darker, derived from the hour so a cloudy midnight stays black.

> **And `Color.lerp` extrapolates.** The mixes are built by adding two
> readings — rain and cloud both darken the grass — and they sum past one on
> the worst day of the year, which is the day nobody would be looking at a
> screenshot. Clamped.

### What it does not do

**There is no rain.** The only rain in this repo is inside Ember Rally, bound
to that road's own camera and materials, and none of it is reusable. So a
genuinely wet day reads as *very overcast and closed-in* rather than as rain —
convincing on its own, but rain and heavy cloud look more alike than they
should. That is the argument for building it, and it is the one piece of this
that is real work rather than a knob.

`?sky=cloud,rain,haze,wind` forces any weather, for looking at it. It also
skips the fetch entirely, which is how to see the garden with the network out.

## 2 Sep · Claude · three lights instead of a name

I argued against three dots on the grounds that they are somebody else's house
style. That was right about the *dots* and wrong about the **Stars**, and the
person looking at it every day said so.

The name was in there because the corner and the film chat both say it in
words, and consistency seemed like the point. It is not: those two are *made*
of words — a fold showing the last thing said, a room with a transcript in it —
and a row of dots in either would read as something broken. This place is made
of lights. A message arrives here as one and stays lit; "Tife is writing" in
the middle of that is a caption on a photograph.

So the Stars gets three of the same lights, breathing in sequence, and no text
at all. **Not bouncing** — nothing in this garden bounces, things breathe and
drift — and the stagger is what carries it: three lights pulsing together is a
heartbeat, which is what the presence lights already are, while a third of a
cycle apart the brightness travels along the row in the direction her words
will be written. It is the shape everyone already knows, built out of the one
material this sky has.

The words stay in the corner and the film chat, where the surroundings are
words, and stay in the Stars for anything reading the page aloud, where three
lights are worth nothing.

## 2 Sep · Claude · behind the keyboard, and refused by the rules

Two reports, and the first one turned the previous entry's guess into a fact.

### The light was behind the composer

> *"the only time it wasnt showing is when the keybard is up on mobile"*

Which is the case that matters and the one nothing could see. `.talking` is
sized to the **visual** viewport, so raising a keyboard halves it; the sky
hangs from 72% of that; and the newest message's foot lands underneath the
writing panel. The light was being placed perfectly — fourteen pixels below the
last message — and the last message was behind the composer.

Keyboard up is exactly when it is least affordable to be missing. It means you
are answering her, and *"she is writing too"* is never more worth knowing than
in the second before you both send.

The composer is a ceiling now: where there is no room under the message, the
light sits just above the panel instead. Still the lowest thing in the sky,
still on her side. There is a check that shrinks the surface the way a keyboard
does and asserts the two boxes do not overlap, because headless Chrome has no
keyboard to raise.

### And the reactions were refused by Firestore

*"it didnt sent nothing was saved"* — and it was the rules, exactly as
suspected. Messages are immutable apart from one field:

```
allow update: if ... .affectedKeys().hasOnly(['hearts'])
```

`marks` was added to the client and not to that list, so every one of the six
emoji was refused outright for touching a key that was not `hearts`. It worked
perfectly against the mock, which has no rules in it at all.

Now `hasOnly(['hearts', 'marks'])`, with the same per-key guard the hearts
have, so neither of you can change which mark the other one left.

**That is the third time in two days** that a field has been added at one end
of a seam and not the other: `racing` was written down and never sent,
`typing` was sent and never read, and now `marks` was written and never
allowed. Every one of them worked against the mock and did nothing at all
against the real backend, and every one was found by somebody on a phone.

`npm run presence` covers two of those three by round-tripping the field list.
The rules are the leg with no harness — nothing here can exercise Firestore's
own evaluator — so the honest mitigation is smaller: any new field on a
document either of you may *update* needs its key adding to an `affectedKeys`
list, and that is now said out loud in the rule itself.

## 2 Sep · Claude · and then nobody could find it

Third report on the typing light: after moving it into the sky it could not be
found at all. **Not reproduced** — it renders at full opacity, under the newest
message, in portrait, landscape and on a large phone, and every check passes.
So this is two changes made on suspicion rather than one made on evidence, and
that is worth writing down as such.

**One real latent bug, fixed whether or not it is this one.** The lane was
`position: fixed` and the loop placed it from a `getBoundingClientRect`.
Those are two different viewports on iOS — a rect is measured against the
*visual* one and a fixed element is placed against the *layout* one, and they
come apart by `visualViewport.offsetTop`, which is tens of pixels while the
URL bar slides and hundreds with the keyboard up. `.talking` already corrects
for this with `top: var(--talking-top)`; the lane did not. It is absolute
inside `.talking` now, so the measuring and the drawing happen in one space
and cannot come apart again. `offsetTop` is always nought in a headless
browser, which is why nothing caught it.

I tried to write a check that reproduces it by forcing `--talking-top`, and
**it does not** — pushing the surface down moves the messages with it, which is
not what iOS does. It was deleted rather than kept as a green test that proves
nothing.

**And the likelier explanation: it was too quiet.** It was set in the sans,
small, uppercase, widely tracked — this garden's voice for *machinery*: clocks,
counts, labels on controls. Right for a status line, wrong for this. Everything
else about it already says *her next message*: it stands where that message
will land, on her side, in her colour, under a light that has not finished
forming. It is in the serif her messages are written in now, at a size you can
read at a glance on a phone in daylight.

One thing the harness caught on me: I added an ellipsis, and `npm run typing`
failed on a check I had written myself a few hours earlier saying the garden
does not use them. It was right and I removed it.

## 2 Sep · Claude · the car was falling over

Reported from a phone with screenshots: the car lifts one side alarmingly high
when drifting, worst on the Harmattan, and — once looked for — on the Rootway
too, just less. The new road did not cause it; it made an old fault loud enough
to notice.

Measured before touching anything:

```
rootway     body 12.3°   road 11.5°   together 22.0°
harmattan   body 12.4°   road 22.3°   together 32.9°
```

**What the player sees is the sum of two things that were each bounded and
never bounded together.**

**The road.** `bank = clamp(-curv · 5.2) + camber` — the clamp was applied to
the corner's own roll and the authored camber added *outside* it. So a corner
that was both tight and deliberately off-camber could be drawn at twenty-two
degrees. The Stormcrown has camber too and had the same latent fault; nobody
had stacked one on a tight enough corner to see it. Twelve degrees is the whole
allowance now, camber included — steeper than any road anybody builds. **The
physics is untouched**: `camber` is still resolved down in full, because how
treacherous a corner *is* was never the problem.

**The body.** The target was clamped and then handed to a spring-damper — which
by definition overshoots, so the clamp bounded the *aim* and not the *result*.
Measured 12.4° against a stated limit of 10.6°, and the note in `rig.ts`
already said ten was "more than a real rally car". The aim is smaller now and
the result is clamped after the spring has had its say, with the velocity
killed at the limit so it does not sit there buzzing.

```
rootway     body  6.9°   road 11.8°   together 17.7°
moonbreak   body  6.9°   road 12.0°   together 18.9°
stormcrown  body  6.9°   road 12.0°   together 18.9°
harmattan   body  6.9°   road 12.0°   together 18.9°
```

`TUNE.leanLimit` is the new dial — a hard ceiling in degrees, separate from
`bodyLean`, because the two answer different questions: how *eagerly* it
leans, and how far it is ever allowed to get. Turning lean up now reaches the
ceiling sooner rather than going past it.

And `npm run rally` measures the sum on all four roads, driven by the spirit
rather than reasoned about. It was reported from a phone before it was ever
measured here, which is exactly why it now is.

### And nothing on the race screen

Asked for plainly: no media, no messages, nothing until the road closes. There
was a rule for this already and it had two holes.

**The whisper was excepted**, on the theory that a conversation you had
deliberately opened should survive a race. It should not — a road at a hundred
and thirty is not a place to read a message.

**And the shared film screen was not on the list**, not by decision but because
it used to be a child of `.corner` and was covered by hiding the corner. It is
its own node on the body now, so it needed naming. That is the exact cost of
moving something out of a container: every rule that reached it *through* the
container silently stops, and nothing says so.

Checked with a film playing and the corner up: all five go to opacity nought
the moment the road appears.

## 2 Sep · Claude · and it was in the wrong place

Second report on the same feature, and the placement was the bigger miss:

> *"now if i tap to write, even if i dont write anything, i cant really see
> that shes writing, because the place thats suppose to show shes typing is
> occupied by me"*

It lived on the "say something" button at the foot of the sky. Two things wrong
with that, and the second is the one worth writing down: **opening the composer
replaces that button** — so the one moment you most want to know she is
answering you was the exact moment it could not be shown. A control that hides
the thing it reports whenever you use the control.

It sits under the newest message now, on her side of the sky, which is where
her next line will actually land — so it is the same object as the thing it
announces: a light that has not finished forming, in the place the finished one
appears.

### Three bugs on the way there, none of which a test found

> **It got its own rung on the ladder.** The sky's layout is built from
> `column.children`, so putting the light *inside* `.sky-column` gave it a
> place in the stack and pushed every message down one — two of them ended up
> drawn on top of each other. Every check passed. It is a sibling with the
> column's geometry now, and there is a check for piled-up messages.

> **It was mounted, correct, and invisible.** The frame loop parks after four
> still frames, which is why sitting in a conversation costs nothing — and
> `writing` was not one of its dependencies, so her starting to type never
> woke the only thing that could position the light.

> **And then that dependency crashed the place.** `writing` was declared
> three hundred lines below the effect that now lists it, and a dependency
> array is evaluated during *render* — so it was a block-scoped read before its
> own declaration. The whole conversation went blank, and every check went
> quietly green, because an empty document has no indicator in it either. That
> is why the probe now asserts computed opacity and on-screen bounds rather
> than `querySelector` being truthy.

A fixed offset under the newest message was tried first and is wrong for the
obvious reason: that message is one line or four. The loop takes the ladder's
own foot, which is the number it has already computed.

## 2 Sep · Claude · the typing indicator did nothing

Reported after a real deploy: tried it twice, nothing happened. It was my bug
and a good one.

**The reader never parsed `typing`.** The write was right, the rules were
right, and it was driven end to end in a browser and passed — because the
*mock* merges a presence patch wholesale, and the real reader rebuilds a
`Presence` field by field and dropped it on the floor.

Which is the second time this exact thing has happened here, in the opposite
direction. There is a note in `flush` about `racing`: declared, documented,
validated in the rules, and never actually sent. Live rounds "worked" against
the mock and would have done nothing the first time they were tried for real.

**The two bugs are the same bug.** The mock and the wire are two
implementations of one interface, and a browser test only ever exercises the
mock — which cannot have this failure mode and so cannot catch it either.

So both halves moved into `data/presence`, as ordinary functions with no
Firebase in them, and `npm run presence` round-trips every field through
both. The field list is *exported and walked* rather than retyped in the test,
because a list written twice is what caused this. Adding a field to
`Presence` and forgetting one end of the wire is now a failing check instead
of something you find out about on a phone in another country.

## 2 Sep · Claude · the Stars, with the furniture gone

"say something" sat under the newest message at all times, in the emptiest and
quietest place in the garden, telling two people who came here to talk to each
other that they could talk to each other. It was the last piece of furniture
down there, and it was doing the job the hint above it had already been cut
for.

What is left is the line it was written on: one hairline, forty pixels of
target under one pixel of light, which reads as *somewhere to write* rather
than as a sentence about writing. It warms when you reach for it. The label
moved onto the button, so anything reading the page aloud still says what it
is.

## 2 Sep · Claude · the reaction bar, looked at

The six marks worked and looked terrible, and the report was exactly right:
*"you made it actually in the right sense and visually great? no, not even
close."* It was shipped on a passing test rather than on a screenshot, which is
the whole lesson.

What a photograph of it on a real phone showed:

- it opened **on top of the message you had just pressed**, so emoji were
  interleaved with words with nothing saying which belonged to which
- it had no surface at all, floating in the sky over three other messages
- the marks were 2.6rem apart and the bar three hundred pixels wide, so they
  stopped reading as one set of choices
- **"ANSWER THIS"** was a line of text laid across a message
- and the reply item was pre-lit, because `useMenuKeys` starts its ring on
  the first item — right for a keyboard, and on a phone it drew a warm ring
  around the one thing on the bar you are least likely to want

### What it is now

One row: six marks touching, a hairline, and **↩**. The return arrow says reply
everywhere on earth and takes a fifth of the room the words did.

**It has a surface**, and that is the second time this garden has had to argue
for one. The rule is no panels, no cards, no borders — and the music player
broke it first, for a reason written down beside it: *a text shadow is not
enough when the thing behind the text is also text.* This is precisely that
case, and the same warm dark glass fixes it.

**It is placed against the message, not the fingertip.** Given a fingertip it
opened above the fingertip, which is *inside* the message — so it sat across
the top line of the thing it belonged to. It takes the message's own top edge
and centre now, and clears it by twelve pixels.

277×49 where it was 258×82, and every one of the fourteen checks still passes.

## 2 Sep · Claude · she is writing

A typing indicator, and it turned out to be nearly free: presence already goes
over the Realtime Database several times a second while either of you is
moving, and already carries three live ephemeral flags — `racing`, `looking`,
`driving` — with a note explaining that it is *"the one channel that is
already live and already shared"*. This is the fourth. No new collection, no
new listener, no extra writes.

### Three decisions

**It is a time, not a boolean.** `typing: number` — when you were last known
to be writing. The boolean version has one failure that every chat app has
shipped at least once: a phone goes into a tunnel mid-sentence and the flag
stays true, so the other person watches *"she is writing…"* for the rest of the
evening. The fix people reach for is a clear-on-exit write, which is
unavailable in precisely the case that causes it. A timestamp goes stale by
itself. The worst a lost write can do is stop the indicator a few seconds
early, which nobody notices.

**It does not say where.** One bit: she is writing *something*. Not which room,
not how much, not for how long. This is meant to read as *she is thinking about
you right now*; anything more precise turns warmth into surveillance.

**Stopping is not an event.** No "stopped typing" message. Deleting a draft,
putting the phone down, and thinking for eight seconds all end it the same way
— the clock runs out — which is simpler and truer than detecting the
difference. The one exception is sending: that clears immediately, because
otherwise the indicator outlives the message it was announcing and reads as a
second one that never comes.

The refresh is 3s and the window is 7s, deliberately more than double, so one
lost write cannot make it flicker.

### No bouncing dots

Three grey circles are as recognisable as a brand mark, and they would be the
first thing in this garden borrowed from an interface rather than made for the
place. Each surface says it in its own vocabulary:

- **the Stars** — a message here *is* a light, so someone writing one is a
  light that has not finished forming. It breathes rather than blinks, because
  a blink is a notification and a breath is a person. Never fully out (reads as
  broken) and never fully in (reads as arrived — and it has not arrived, which
  is the entire message).
- **the corner** — a sentence on the fold, and it *outranks the unread count*.
  A count is the past; this is the next few seconds.
- **the film chat** — a line under the last thing said, where the next one will
  appear.

### Measured

`npm run typing` — 23 checks, all of them timing, because every bug this
feature can have is a timing bug and none is visible by reading. The one that
matters is driven end-to-end in a browser with **no clear ever sent**: her
presence is stamped eight seconds ago and nothing follows it, exactly as if the
tab had been killed mid-sentence. It goes off on its own.

### And one thing that was not mine

`npm run locks` was failing, and the failure looked like it might be. It was
not: the Hollow lands on the *standings* rather than the picker when something
is waiting for you — deliberate, and older than any of this work (`git log -S`
puts it several commits before this session started). The harness did not know,
so every `.game-card` query came back empty and got reported as a broken lock.
Both of its entry points step past the standings now, and all twenty pass.

## 2 Sep · Claude · the Harmattan

A fourth road: the Sahel with the dust wind blowing. Laterite, baobabs, termite
spires, a walled town you drive *through*, indigo dye pits, and an escarpment.

**One decision before any of it.** Not "Africa" — a continent is not a place,
and acacia-and-sunset would have been somebody's idea of one rather than
anywhere. The Sahel in harmattan season, which is the country this is being
built in, and specificity is the only thing that makes it read as real.

### What it has that the other three cannot

**It is daylight, and the engine had none.** Everything in Ember Rally is lit by
the car — two headlamp cones, a warm pool, a window of lanterns, and a black
world past them. That is written down as one of the four decisions the racer
follows from, and it is correct for a cave and two nights. Lit that way, every
baobab and wall on this road came out a black silhouette against a bright sky,
with headlight beams laid across ground you can already see.

So the shared light block gained a daylight term: one number, nought on the
three night roads, cross-fading the whole model to a sun and a strong sky fill.
Strong on purpose — in haze most of the light arriving has been scattered, so
contrast is *low* and value is high, and a hard sun with a weak fill reads as a
clear desert noon instead. The volumetric beams fade with it, because a visible
cone of headlight at midday is the single clearest tell that a scene is a night
scene with a bright sky pasted behind it.

**What hides the world is brightness.** The Rootway blinds you with dark, the
Stormcrown with cloud. Here it is luminous ochre with no horizon in it, and a
sun you can look straight at, because dust takes the corona off.

**Two new surface mechanics, and both are visible.**

`Band.sand` — drifts take a third of the grip, add rolling drag, and
*tramline*: they run in ridges and a wheel in a ridge is steered by it. And
where they lie is **dealt from the seed**, which deliberately breaks the
Moonbreak's rule that a seed may move scenery but never the racing line. Right
for the road you learn second, wrong for the one you finish on: the road is
learnable and the sand on it is not.

`Band.ruts` — the washboard a dry road wears into. Measured first as a pure
grip term and it cost **exactly nothing**: two runs down the Red Mile came out
at 10.11s each, dead level to the hundredth, because a car at top speed is
limited by drag and not by traction and had already stopped accelerating. It
also absorbs energy now, which is what a washboard really does — so the Red
Mile has a genuinely lower top speed than it looks, and it is the first
difficulty in this game that lives on a **straight**.

### Measured, not asserted

The Stormcrown was written as the finale and measured, later, as the easiest
road: nineteen corners in four and a half kilometres, never narrower than nine
metres, fifty-six per cent near-straight. So `npm run harmattan` builds all
four roads and compares:

```
Harmattan   3256m  31 corners  27 braking  tightest r16  narrowest 5.9m   8% straight
Rootway     2296m  15 corners  15 braking  tightest r24  narrowest 6.7m  14% straight
Moonbreak   3658m  23 corners  17 braking  tightest r22  narrowest 7.2m  36% straight
Stormcrown  5304m  41 corners  34 braking  tightest r18  narrowest 6.4m  10% straight
```

Two checks had to be *rewritten rather than passed*, and both were the test
being wrong. "More braking corners than any of them" is asking this road to be
longer than the Stormcrown, which is not the same as harder — density and the
longest gap without a brake are the real questions. And "a higher share of
corners needing a brake" is unwinnable: the Rootway is 100%, because it is a
cave with a road in it. What replaced it says what this road actually claims —
**there is nowhere on it to relax**, because every long straight has a bad
surface on it.

### Three things the harness caught that reading could not

> **A hole in the road.** The last hairpin was r16 on eight metres, off-camber,
> in half a gale, in sand. Four hard things at once; the crude driver beached
> on the verge at 2933m and sat at a tenth of a metre a second for the rest of
> the run. Nothing threw and the road was "completable". A corner you can get
> *stuck* on is not difficult, it is broken. It keeps the radius and gets the
> room back — nine and a half metres, the way a real hairpin is built.

> **Three banners standing in front of nothing.** They were hand-written
> offsets. Deriving them from the *bands* was the obvious fix and still wrong:
> the bands are not the road, `makeTrack` smooths the curvature over eleven
> metres, and a short sharp band comes out gentle. They are derived from the
> sampled and smoothed road now — the Moonbreak's rule one level further down.

> **The road disappeared.** In the wadi, laterite under deep drift landed
> within a few hundredths of the plain beside it, and there was no way to see
> where the driveable ground ended. Fixed twice over: the plain is greyer, and
> the road has a **berm** — the windrow of spoil a grader leaves, raised so it
> catches sun on one side and shadow on the other. Sand blows *off* a raised
> edge rather than gathering on it, so that line survives any drift. It is also
> just true of every graded road on earth.

### Still to come

The music slot (`music/harmattan.m4a`) is wired and empty. Rendered and looked
at at six points along the road; the town and the Cathedrals are the two that
came out best.

## 2 Sep · Claude · eight small ones

### The dead button was a near miss

*back to the games* did nothing. It was not dead — it was **24px tall**, and it
is the only way off the standings screen, so every miss read as a broken
control. This repo already worked this out once, for `.put-back`, and wrote
down why: *"at 31px tall they were under every published minimum."* This was
smaller than the one that got fixed. Padding on a coarse pointer; the look is
unchanged.

### A tap on the film was a tap on the world

Touching the miniature to move it also walked you into whichever place you were
standing in front of. `ui/Places` enters a place on any `pointerup` whose
target is not a form control — a fair rule when everything over the world was
made of buttons. The pane is not; it is a thing you pick up. It is named in
that guard now. **Anything laid over the world owns its own taps.**

### Somewhere to put it down

Ending a screen lived in exactly one place: open the whole thing, find *end
screen*. Right home for it, wrong that it was the only one. The ground opens
under the miniature while you carry it, at the bottom where a thumb already is.

Deliberate choices, given this ends the screen for **both** of you with no undo:
it is a journey rather than a tap (the miniature had a close button once, two
taps from resting, and it ended sessions by accident); it says *drag here to
end* and then *let go to end it*, so the last thing you read is the thing about
to happen; and it is a **sibling** of the pane, not a child — a target inside
that box would be trapped in its stacking context, which is the trap the pane
itself was moved out of the corner to escape a day ago.

One thing only a screenshot showed: the pane follows your finger and the target
is *under* your finger, so at the moment you most need to see it, the pane is
sitting on top of it. What you are carrying goes translucent over the target
now. Opacity and not a scale — the drag is measured from that element's box,
and shrinking it mid-gesture moves the ground while the finger is on its way.

### The long line was ours

Reported as a line that appears when you like a message. It was not iOS and it
was not a selection: `.said-hearts` carries a dark rounded surface, which
exists so a heart in the **corner** can be read over a noon meadow. In the
Stars the hearts are a *block*, centred under the message — so that surface
stretched the full width of the line and drew a bar across every message either
of you had reacted to. Scoped to the corner, where the reason for it lives.

### Press and hold, and six things to leave

Holding a message did nothing on a phone, because **iOS does not fire
`contextmenu` on a long press** — it raises its own selection callout. So the
menu was unreachable there, and holding a line selected it instead. There is a
recogniser now, and `.said` opts out of native selection so the two stop
competing for the same touch. Copying a line was never offered here; there are
two people in this conversation and they are both already looking at it.

Six marks — ♥ 😂 💀 👍 💃 🫤 — as one row, not six menu items: they are one
answer with six faces, and a list would turn picking one into a decision, which
is the opposite of what a reaction is for. **The heart stays the default** and
a double tap still leaves one with no menu in the way.

Stored as `marks` beside `hearts` rather than inside it, so `hearts` still
means *this person reacted, at this time* and every message ever hearted keeps
working and keeps reading as a heart. A heart writes no mark at all, so an old
one and a new one are the same shape on the wire.

Also measured and fixed: the menu clamped itself with two constants — 170 and
96 — chosen for a menu with two words in it. Six marks is 258px wide, and the
last two fell off the right of the screen. It reads its own box now.

### "done" means done

It said *done · Tife has been* after you had both finished. The list only knew
whether **your** side was over — `isDone` is documented as *"says nothing
about hers"* — so the nicest line it had was that she had turned up. The games
are symmetric, so the same `isDone` answers about her board when you hand it
the two sides the other way round. When you are both finished the whole
sentence is now one word.

### How long until the next one

A daily round is keyed by the local date, so what you are waiting for is
midnight **where you are standing** — not twenty-four hours from when you
played, which is what "once a day" sounds like and is the thing people guess
wrong. It appears only once the day is spent.

Stepped forward through `localDateKey` rather than computed, because the
computed version is where the bugs are: midnight in an arbitrary zone is not a
fixed offset from UTC, and twice a year the day is 23 or 25 hours long. Both of
those nights are in `npm run day`, and the first version of that test had the
*wrong date* in it — the short day is the 29th, not the 28th.

### And the Hollow got out from under the music

Measured: "Choose your game" was overlapping the music panel by seven pixels,
while nearly three hundred pixels of the same box sat empty below the games. On
a phone that breakpoint moves the corner to the top; the Hollow starts at
7.7rem, which is *inside* it. A floor that clears the panel, and the rest of
the slack spent centring the column in the room it has.

The first attempt put both rules on `.hollow-selector` and only half of it
took — `.hollow-selector:not(.hollow-way-threshold)` further down is more
specific and was already setting `justify-content: flex-start`. Media queries
do not add specificity. It is in the rule that owns the layout now.

### Housekeeping

`npm run pronouns` was failing **before any of this** — four error strings in
`ui/Together` written from one side. Tokenised. `npm run places` failing in
the earlier sweep was contention between concurrent headless runs, not the
check; it passes alone.

## 1 Sep · Claude · the film that rode off the screen with the music

Reported: the miniature is gone on the phone after coming back to the garden —
music still playing, and **visible on desktop, where it also drags correctly**.

That last clause is the whole diagnosis. The screen was rendered inside
`.corner`, the column holding the music and the last thing she said, because
that is where the way in lives. The corner **tucks**: a shove to the right
gives it `transform: translateX(100% + 2.5rem)` and `opacity: 0`. A child
cannot opt out of either — `position: fixed` makes it worse, not better,
because a transformed ancestor *becomes* the containing block, so the pane
travels with the column; and opacity applies to the whole subtree, so it fades
out on the way. The column is `pointer-events: none` when tucked, and it is a
stacking context at `z-index: 11`, quietly capping the pane's own 24.

Four ways to disappear, all firing at once, and **none of them can happen on a
desktop** — the corner only tucks on a coarse pointer (`cornerCanBeTucked`).
So it looked right in the place it was easiest to look at. The reliability work
on the corner shove the day before is very likely what made it start happening.

A thing you can drag anywhere is not part of any column. It renders into a node
of its own on the body now, made once and reused so the iframe is never
re-parented and never stops playing — see `paneHost` in `ui/Together`. The
stylesheet's `.corner:has(.together.full)` went with it: nothing in the corner
can see the screen any more, so `App` says `.corner.watching` outright rather
than the stylesheet inferring it.

Measured, on a phone-sized viewport: the corner tucks away, and the film stays
at opacity 1, untranslated, on screen, and reachable — through a reload.

### The film's chat is not the Stars

Asked for, and right: what is said in front of a film is not what is said in
the Stars. It is about the thing on the screen, it is half reaction, and it
stops meaning anything when the screen goes off. Opening a film and finding
this afternoon's conversation in it — then saying *"wait, go back"* into it,
forever, between a letter and a question — was wrong in both directions.

So a sitting: minted when a screen starts from nothing, carried on the shared
record, and the only thing that decides which lines belong to it. A new screen
is a new page. Ending one takes the conversation with it. Nothing is ever
merged into the Stars.

**It is not a field on `Watching`, deliberately.** A line written through
`setWatching` carries whatever playback position this device last knew about
— so typing during a scene she had just skipped would drag the film back to
where you were. Two documents, two concerns, no shared write.

Lines are appended with `arrayUnion` rather than read-modify-written. Two
people in front of the same film type at the same time constantly, and
rewriting an array loses whichever line lost the race — silently, and on
exactly the night it would matter.

And one thing only a screenshot showed: with the page starting empty every
sitting, the first line sat stranded at the top of a tall box, a screen away
from the field it was typed into. The room fills from the bottom now. That
never surfaced while the panel held the Stars, because the Stars is never
short.

## 1 Sep · Claude · the miniature that ended the film

Reported: touched the small screen once, it disappeared, and it would not come
back after a reload — though the music was still playing and the corner was not
tucked.

**Nothing was broken. The session had been ended.** The miniature carried a
`× close` beside its `open`, and that button empties the shared record for
*both* people — so the pane correctly stopped existing, and correctly stayed
gone through a reload, because `videoId` really was null. The music still
audible was the corner player, which is a different thing entirely. Every part
of the report was accurate and the diagnosis was one layer further down than it
looked.

Two taps on a two-hundred-pixel overlay, no confirmation, no undo, and it
reaches across to her device. **That control is gone.** Ending a screen lives in
the full view next to the thing it ends, where it is called *end screen* and you
can see what you are closing. The miniature offers *open*, and nothing else.

### Three real bugs found on the way

> **A drag delivered a click.** `preventDefault` on a pointerup does not stop
> the click that follows it, so moving the pane out of the way also opened it.
> The click is swallowed on the way up the tree now, the way `cornerSwipe`
> already did it.

> **The pane landed about twenty pixels from where it was dropped**, and after a
> cold load it ignored the stored position entirely. Both were the same
> mistake: the placement was a `useMemo` sizing the free space from a `ref`
> holding a guess, and the element does not exist until something is playing —
> so on a fresh load the effect ran against nothing and `[spot, open]` never
> changed again to make it re-run. It is a layout effect reading the live box
> now, keyed on `live` as well, with a `ResizeObserver` and a rotation
> listener. Measured: dropped and landed **0 px out**, and identical across a
> reload. Whatever is in storage is clamped into the viewport before it is
> applied, so no stored position can ever hide it.

> **The corner's shove ate its own safety net.** The listener that swallows the
> click after a sideways shove was removed on a `setTimeout(…, 0)` — which
> fires *before* the click, not after. So a shove that started on the play
> button also pressed it. Three hundred and fifty milliseconds now, and
> measured: the glyph is unchanged across a shove that starts on it.

### And the shove is reliable now

Three things were wrong with it and all three read as "sometimes it just does
not work":

- the axis was decided on a plain `dx > dy`, so a diagonal — which is what a
  thumb reaching across a phone actually draws — was a coin toss. It needs a
  clear lead now
- only distance counted, so a quick short flick did nothing at all
- the handle was placed from where the finger *ended*, and a sideways throw
  drifts vertically by nature. It uses where the finger landed, which is the
  deliberate half of the gesture

A vertical drag still leaves the corner alone; that is checked too.

## 1 Sep · Claude · five things on the shared screen

Codex did the design pass on the player; these are the five faults left in it.

**Suggestions are three now, and they rotate.** Four chips wrapped to a second
row on a phone and pushed the queue — the thing you opened the tab to look at —
off the bottom of the panel. Three is a *layout* fact, so it is held in
`npm run watch` rather than left to a stylesheet to be careful about. They are
drawn from a pool of eighteen and picked once per visit: a fixed set becomes
furniture within a week, and then the empty field is empty again, which is the
whole reason the suggestions exist.

**The progress line has a handle.** A one-pixel beam says how far through you
are and gives a thumb nothing to aim at.

**Seeking no longer shoves the corner off the screen.** The screen lives inside
the corner, and `useTuckOnSwipe` was taking every sideways drag in it — most of
all the one along the progress line, which is *the* horizontal gesture in a
video player. Dragging forward put the film away. The gesture now stands down
for `.together.full` entirely; the way out is the words in the top left, like
everywhere else here.

**The tucked pane goes where you put it.** Press, drag, let go, and it stays —
kept as fractions of the free space so a rotation cannot leave it off-screen,
and remembered per device like the volume faders. A press that does not move is
still a tap that opens it; six pixels separates them.

> The drag first went on `.together-screen` and did nothing, because Codex had
> moved the positioning up to `.together.tucked` and made the screen
> `inset: 0` inside it. The inline style was applied and the box did not move.
> **The element that has the position is the element that gets dragged.**

**And the world goes quiet in front of it.** Not turned down — gone, and the
animation loop with it. You opened it to watch something, and a meadow
breathing under a film is not atmosphere, it is a second thing playing. Both
conditions live in `App`'s one ambience effect, because `setMaster` has exactly
one owner and two writers is how you get a world that stays silent until the
next time somebody switches tabs.

> Verifying that needed a new number. `__gardenSound.rms` answers "is anything
> coming out", which is the same zero whether the world was silenced on purpose,
> the tab is hidden, or the AudioContext never unlocked — and in headless it
> never unlocks, so the first check passed *vacuously*. `worldSoundTelemetry`
> carries `master` now: the instruction rather than the result. 0 while
> watching, 0.85 after folding away.

## 1 Sep · Claude · the Glasshouse is a wall of pictures again

Reported: the photographs are blur unless you tap one, on phone and desktop
both, and it "used to be like before".

**The cause was one number, and the number was right for the wrong reason.**
`NEAR = 5` — only the five closest panes ever got their real photograph. That
was a fair constraint, because a pane took the *stored* copy, which is 2560
across: about seventeen megabytes of video memory each. Five really was all a
phone could hold.

But the 2560 was never for the pane. **The photograph you open is a DOM
`<img>` over the world**, so it takes the whole file and is as sharp as the
file is. A pane is a picture two metres away, behind glass, multiplied by a
glass body and sitting in fog — and 640 pixels is more than that can show.

    stored copy   2560 px   ~17 MB of VRAM     five panes
    pane copy      640 px   ~1 MB of VRAM      twenty, for less than two cost

So `Panes` downscales onto a canvas when it makes the texture, and `NEAR` is
20 with `REACH` 22 m — about a dozen bays, far enough that a picture has
resolved well before you reach it rather than while you stand in front of it.

Two things that were also wrong and are worth knowing:

> **Every pane disposed its photograph the moment it left range**, so walking
> back down the aisle decoded all of them again — the same pictures, over and
> over, and a fresh blur every time you turned around. There is a bounded
> least-recently-used cache now (`KEEP = 26`); the pane owns only its
> sixteen-pixel preview.

> **The aisle got faster in the same week** — `FOLLOW` went 3.4 → 7.2 on
> coarse pointers, which is a good change on its own. It is probably why this
> became noticeable now rather than in August: a pane that used to load as you
> arrived was suddenly loading after you had gone past.

> **For Codex:** `NEAR` was yours and I have changed it. I think the reasoning
> holds — the constraint was the texture size, not the count, and the count was
> paying for a resolution the pane cannot display — but the room is your work
> and if 20 reads as too busy the honest lever is now `PANE_PX`, not `NEAR`.

## 1 Sep · Claude · the two of you can watch something together

A shared YouTube screen, reached from the corner media control, synced between
two devices with no server in the middle.

**It is not a sixth place**, for the reason the music is not one: it is
something that happens *while* you are somewhere. So it lives in the corner the
player and the whisper already share, and the way in is a mark in that row —
inert and dim until she is actually online, because this is the one thing in the
garden that is worthless alone.

### How two phones stay on the same second

The same anchor the music uses, and it earns it more here. Nothing stores a
position that ticks: the shared record says *this video was `at` seconds in when
the server clock read `since`, and it is playing*, and both devices do the
arithmetic themselves. One write per press instead of a write a second from both
sides for the length of a film; no drift between updates; and a phone that was
asleep wakes up **where the film got to** rather than where it stopped.

Corrections are graded, because a seek is not free — the picture stalls and the
sound cuts, so a player that fixes a tenth of a second every two seconds is
*less* in sync than one that does nothing:

    under 0.75 s   leave it alone
    0.75 – 2.5 s   recover it by playing 6% faster or slower — invisible
    over 2.5 s     something real happened; seek

`npm run watch` holds all of that: the anchor arithmetic including the
asleep-phone case, every shape of YouTube link anybody might paste (nine of
them, plus four that must be refused), the queue's advance being *idempotent in
effect* so two devices ending a video in the same frame agree rather than fight,
and the two thresholds staying far enough apart to hide a correction in.

### Three things worth not rediscovering

> **`YT.Player` replaces the element you give it.** Hand it a node React
> rendered and the ref points at something detached, and React later tries to
> remove a child that is no longer its child. A plain div is created
> imperatively, appended into the element React owns, and handed over to be
> consumed.

> **A player built empty really asks YouTube for `/embed/` with no id**, which
> really fails — error 2, "that link isn't a video" — and the message lands on
> screen a beat before the video that was always going to replace it. It is
> constructed with the anchor's video, at the anchor's position.

> **oEmbed gives you a title with no API key.** A pasted link showed its own URL
> as its name in the queue, which is unreadable. `youtube.com/oembed` is public,
> free and unmetered, so a link now arrives called *Never Gonna Give You Up*
> even on a build with no key at all. Search still needs
> `VITE_YOUTUBE_API_KEY`; the asymmetry is deliberate — a missing key should
> cost the convenience, not the feature.

### The chicken-and-egg that shipped

Reported from the deployed site: both online, the corner offered to watch with
her, and tapping it did nothing at all.

`Together` began with `if (!live) return null`, and `live` means *a video has
been chosen*. So on a garden that had never watched anything the component
rendered nothing — you could not reach the search without a video and could not
get a video without the search. **The control worked perfectly and appeared to
be dead**, which is the worst shape a bug can have, and no amount of driving the
happy path would have found it because every check I wrote put a video on first.

It opens on `open || live` now. Nothing on is a real state: dark screen, the
invitation on it, and it lands on *up next* rather than *talk*, because choosing
something is the only thing there is to do. `npm run watch` cannot catch this
one — the fresh-start browser run in the scratchpad can, and does.

There is a *stop* beside *fold away* now too, which there wasn't: folding leaves
it playing in the corner, and there was no way to end a session at all.

### And the shape of it

The way in is a line of its own in the corner, not a fourth glyph in the
transport row — on a phone that row was already four things wide and a screen
is not a music control. In words, like everything else in that corner, and it
reports what is on while something is. Watch the `order` there: the player
stack is `column-reverse` under 544px, so document order alone dropped it
between the transport and the beam that measures it.

Screen across the top, transport under it — one beam, the same beam the corner
player uses, because a second visual language for "how far through this is"
would be two answers to one question. Then two words rather than tabs: *talk*
and *up next*. **The talk is the same conversation as the Stars**; a second chat
that only existed while a video was on would be somewhere for things to get
lost. Fold away leaves a small pane in the corner it came from, deliberately
lifted clear of the place name — every corner here is spoken for and a tucked
video is a guest.

> **I destroyed some of Codex's uncommitted work and had to rebuild it.** A
> regex meant to remove one dead helper from `ui/Talking` took `maskForLane`
> with it — a refactor of my inline lane mask that was in the working tree and
> not in any commit, so it could not be recovered. It is reimplemented to the
> contract its call site still described, including the fade beginning *before*
> the crossing rather than after it. **Do not use a `[\s\S]*?` regex to delete
> code in this repository**; two of us are in it and only one of us has
> committed.

## 1 Sep · Claude · the Stars has a rhythm now, and the drag is the hand

Six things, all reported from using it on a phone. The two that mattered are
the first two, and they turned out to be the same bug wearing two coats.

### The column had no order

Measured down one real phone-width conversation, the gaps between messages were

    10 · 12 · 22 · 24 · 25 · 29 · 35 · 45 · 45 · 48 · 52 · 80 px

which is not a rhythm. **The ladder spaced line *centres* using the heights the
browser laid out, and the frame loop then drew every line scaled about its own
centre.** So the gap you could see was `air + (h₁(1−s₁) + h₂(1−s₂))/2` — a
number that grows with the height of whatever is next to it. A paragraph opened
a hole beside itself; two short lines nearly touched. The measurement was also
stale, so it was not even consistently wrong.

It stacks by **drawn edges** now, rebuilt every frame from the same heights and
scales the drawing uses:

    up[i] = up[i−1] + air + drawn height of i

The gap is `air` by construction, at every scale, always. Same conversation:

    10 · 10 · 10 · 11 · 11 · 11 · 12 · 13 · 13 · 14 · 16 · 17 px

— air scaled with the line it sits above, so a receding column stays the same
column rather than a squashed one.

> One thing to know if you touch this: the lines are absolutely positioned at a
> shared anchor, so a transform places their **tops**, not their centres. The
> ladder therefore has to subtract `(h − h·s)/2` from every lift. Getting that
> wrong is what made my first attempt look *worse* than what it replaced.

### A long message was hidden entirely rather than clipped

The lane test faded a whole message by how much of its **full box** had reached
the controls, so anything taller than the lane could never be shown at all —
which is the hole at the bottom of the sky. The longest thing either of you had
written was the one thing you were not allowed to read.

A message is not an atom. There is a per-line `mask-image` now, in the
element's own coordinates, fading over about one line of text: what fits is at
full strength and the rest slides under the controls. Verified with a 411px
message on an 844px phone — fully readable, and the line above it clipping
cleanly at the player.

### The scrolling was not attached to the hand

`dy × 0.027` — so 37 px of thumb was always one message, whether that message
was "k" at twenty pixels or a paragraph at a hundred and seventy. On a normal
run of short lines the sky moved about **1.7× the finger**. That is what "going
past your fingers" is, and no amount of easing fixes it.

Drag is in pixels now, divided by what a message is really worth here. The
obvious way to get that number — the distance between two rungs — is wrong,
because walking also changes the ladder underneath the movement; it measured
**0.63×**. Differencing the ladder properly (build it half a step either side,
ask how far one piece of content actually travels) gives **1.03×**. Measured:
120 px of finger, 124 px of sky.

Momentum on release, exponential decay, no snapping. The velocity is taken over
at least 30 ms — browsers coalesce moves, and two samples 8 ms apart read as
1200 px/s from a hand that was barely moving.

### The corner

- **The tap that did nothing in the garden.** `.whisper-recent` was a `div`
  with a link role, and `systems/swipe` only stands aside for
  `button, input, textarea, select, a` — so the world took the pointer and six
  pixels of thumb turned a tap on her last message into a swipe of the garden.
  It worked with a mouse, which is why it looked like it worked. The corner and
  the player are named in that guard now, and the block is a real `<button>`.
- **The rectangle.** Two of them, in fact: `.whisper-recent:hover` drew a
  tinted, outlined, rounded box, and every browser paints its own tap highlight
  over what it thinks you pressed. Both gone; `-webkit-tap-highlight-color` is
  off globally rather than only on the road.
- **The blur.** `.whisper-hush`, a fixed sheet behind the panel. Worth knowing:
  a positioned child paints above every non-positioned sibling whatever the DOM
  order says, so the first version blurred the conversation it was meant to be
  standing behind. And with the world soft, the grey rounded beds under each
  line stopped being legibility and started being chat bubbles — so they come
  off while it is open.

### The iOS accessory bar

Investigated rather than guessed. The usual explanations were all ruled out by
measuring the live document: there is no `<form>`, there was exactly **one**
form control in the entire page, and autofill was already off. The bar is shown
because the focused element **is a form control** — that is the whole condition,
and the arrows are simply inert when there is nowhere to walk to.

So `ui/Ink`: a `contenteditable="plaintext-only"` element, used by both
composers. Same keyboard, same typing, same styling, and no accessory bar,
because WebKit has no form to offer to navigate. The document now reports
**zero** `input`/`textarea`/`select` elements while you are writing. The
Whisper's `<form>` went with it — a field and a submit button in a form is the
clearest possible instruction to iOS to show that bar.

`npm run locks` fails on `she sees it too, shut` — **that is not from this
work**; it fails identically at HEAD, checked in a throwaway worktree. Every
other check passes.

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
