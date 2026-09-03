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
