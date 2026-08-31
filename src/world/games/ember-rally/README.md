# Ember Rally

A short rally race through a tunnel under the garden. It is the only game here
that is a *place* rather than a board — see the "A game that is a place"
section of `../README.md` for how a game takes the world's Canvas.

## Where to start reading

| | |
|---|---|
| `model.ts` | what crosses the seam: a run, as four integers a sample |
| `track.ts` | the road, from authored pieces and a daily seed |
| `physics.ts` | the car: four wheels, four tyres, a gearbox and a handbrake |
| `tuning.ts` | the forty-one numbers that decide how it *feels*, and their defaults |
| `controls.ts` | a thumb and a keyboard, driving the same machine |
| `spirit.ts` | who you race when there is nobody to race |
| `geometry.ts` | the Rootway turned into rock |
| `Moonbreak.tsx` | the high causeway, drowned orchard, sky and water |
| `materials.ts` | how any of it is lit, which is: by your own headlamps |
| `car.ts` | the machine, lofted from a table of cross-sections |
| `rig.ts` | one car as a hierarchy of groups, and what may move |
| `marks.ts` | the rubber the tyres leave on the stone |
| `Race.tsx` | the Stage — everything that happens per frame |
| `Studio.tsx` | the car on a turntable, with no tunnel round it |
| `EmberRally.tsx` | the words: briefings, the seal, the result |
| `../../../../scripts/rally-check.ts` | the car, measured, with no browser |
| `../../../../scripts/tuning-check.ts` | proof that every dial still reaches the car |

## The four decisions everything else follows from

**The car's position is `s` and `n`** — how far along the road, and how far
right of the middle of it. Not a world position; the four wheels and the whole
tyre model live inside the road's frame. Hitting the rock becomes
`|n| > half the tunnel`; a run records as four small numbers a sample, which is
what makes an asynchronous ghost cheap enough to keep in a document; and the
inside line is *genuinely shorter*, because `ds/dt = v / (1 - n·κ)` falls out
of the geometry rather than being a rule somebody wrote. Take the apex and you
cover more road per metre driven, exactly as you do in a real car.

**The road is authored, the order is generated.** A seed picks from a library
of pieces — chamber, throat, sweep, hairpin, chicane, descent, rise — under a
grammar with four rules in it. Fully procedural roads are how you get a racer
whose every bend is the same bend.

The Moonbreak is the deliberate exception. It is a road to learn: the orchard
esses always lead to the Swaying Span, the span always spends its speed at
Tidecut, and the Sky Stair always throws you down the Fall into the Moonhook
still braking. Its seed moves trees, stones, puddles and moon pearls without
moving the racing line.

**It is laid out in named sections and reports where they landed.** `MOONBREAK`
used to be a hand-kept table of distances sitting next to the road — an arch at
68 m, a tube mouth at 1016 — with a note warning that they must never drift
apart from the corners they mark. The note was right and the arrangement was
the problem: every one of those numbers is a consequence of how long the bands
before it are, so changing the *shape* of a corner was fine and changing its
*length* silently invalidated everything downstream. Nothing threw; an arch
just ended up over a straight. The road was effectively frozen. `layMoonbreak`
now measures the table off the road as it lays it, which is what made a second
kilometre of new road possible at all.

**The light comes from the car.** There is no sun down here and no scene
lights: two headlamp cones, a warm pool travelling with the car, and a sliding
window of ten lanterns. Everything that draws includes the same block from
`materials.ts`, so nothing can disagree with anything else about what "lit"
means.

**There is almost no interface.** No clock and no map. Whether you are ahead is
whether you can see her. Where the corner goes is where the lanterns are, and
where the car wants to be is where the tyre marks already are.

**There are two exceptions now, and both had to earn it.**

**The speedometer**, top right, is the newer one and took the longest to
justify. Everything else the racer tells you about speed is *relative* — the
wind rising, the field of view opening, the walls closing on the edges of the
frame, the gearbox climbing — and all four are better than a number, because
you read them while looking at the road. But not one of them can say **this is
as fast as it goes**. Without that the car reads as having no maximum, which is
not cosmetic: if you cannot tell you are at the top, you cannot tell whether the
corner ahead is one you are going to make.

Where it sits was decided by the thumbs and not by convention. Racing games put
it bottom right; bottom right here is the *pedal*, so on a phone it would spend
the whole race under a thumb, and both bottom corners are hands. The top of the
frame is receding tunnel roof — dark, empty, and on a phone the camera aims
high so there is more of it. No dial, no needle, no bezel: the number in the
garden's own serif, over a line of light that fills toward the top speed, which
is the same vocabulary the ember bar uses at the other end of the screen.

**The ember bar**, and it had to earn it too. The three lamps
on the back of the car show how much you are carrying and they are still there
— from directly behind, which is where you spend the whole race, they are the
prettier version. What they could never show is *where it comes from*. The
ember used to trickle in from three places at once — how sideways you were, how
close you were running to the rock, and a lump every time you let a drift go —
so the meter went up for reasons nobody could name, and a reward you cannot aim
at is not a reward, it is weather.

Now there is one source and one line of light that fills with it: **seconds
spent drifting**, six and a half for a full one. Which makes the loop the game
is actually about: drift to fill it, then spend it — and spending it also
cancels the drift, so the same press that fires you out of the corner is the
one that straightens the car up.

**The bar is a tank, not a token.** It was all-or-nothing for a long time: it
had to read full, pressing it spent everything, and what you got back was a
flat one and a half seconds however much you were carrying. Both halves were
wrong the same way — they made the bar a button that is sometimes available
rather than something you own. Carrying three quarters of a bar and not being
allowed to touch any of it is the worst state a resource can put a player in,
and a fixed burn means a full bar and a nearly-full one are worth the same, so
there is never a reason to wait.

So: press it with anything in the bar and it burns what is there. A quarter is
about a second of shove out of a hairpin; a full one is nearly five down a
straight. The bar drains in front of you while it burns, because it *is* the
boost rather than a gauge showing it — and going into a drift stops the burn
and **keeps whatever is left**, so flicking into a corner half way through is a
decision rather than a mistake. The line goes white while it is being spent, so
a bar at a third is never ambiguous about which way it is heading.

## How fast it goes

**131 km/h flat out, 143 on the ember, and both are reached and held.** That
matters more than the numbers. It used to run to 167 and nearly 200 — down a
tunnel between four and seven metres wide — and the worse half of that was not
the speed but the *shape*: drag rises with the square of velocity, so a
terminal velocity that far away is one the car spends the entire straight
creeping toward and never arrives at. It reads as a car with no maximum at all.
You hold the throttle, the number keeps going up, and you arrive at the corner
carrying a speed you never chose.

`DRAG` in `physics.ts` is where a top speed actually lives, and more than twice
it fixes both: slower, and — the part that matters — *there* by the first third
of a straight. The fire-spirit's lap times barely moved and it hits the walls
less often, which is the whole argument in one measurement: the road did not get
slower, the car got controllable.

`TOP_SPEED` is not a limit. It is what the car does, and half the game
normalises against it — how far the camera stands off, how wide the lens opens,
how loud the wind is, how full the meter reads. Measure it with `npm run rally`
after touching drag, gearing or torque and write the answer there.
`SPEED_CEILING` is a backstop well above anything reachable, because a clamp
you can feel is a wall, and the moment a player feels it drag has stopped being
the thing that decides a straight.

## The car

Four wheels, each with its own load, its own slip and its own share of one
budget of grip. An engine with a torque curve driving the rears through five
ratios and a plated differential. Brakes at both ends, a handbrake at one.

**The handbrake is not a grip multiplier.** It is a torque, applied to two
wheels, large enough to stop them turning; once they have stopped, their
longitudinal slip is total and the friction circle has nothing left to spend on
holding the back of the car in line. Everything that follows — that it works
better on the brakes, that it does almost nothing below walking pace, that
lifting off mid-corner tightens your line, that the inside front locks first
under braking and its disc glows before the others — falls out of the model
rather than being written down anywhere.

**It understeers, on purpose, and that is what makes it drivable.** Stability
is the understeer gradient, `K = W_f/C_f − W_r/C_r`. Positive means the car
corrects itself; negative means it has a speed above which a nudge sends it
away. Two things keep `K` positive here: the rear tyres are stiffer than the
front, and peak force goes as `Fz^0.8` rather than `Fz`, so leaning on the
outside pair costs real grip and the roll balance is a knob that works.
`npm run rally` prints the gradient — a road car is 2–6°/g, and this one sits
just under two.

**The steering ratio is derived, not chosen.** A cornering car can only use so
much lock: at the limit it is on a radius of `v²/μg`, and the angle that asks
for is about two and a half degrees at 38 m/s. Offer ten — as this did — and
one touch of a key puts the front tyres four times past their peak slip angle,
where they saturate and wash wide. `maxSteer` works the usable angle out from
the grip and adds a margin to overdrive it with.

**Lift off and it rotates.** That is the whole reason for a throttle. Weight
moves onto the front tyres, the rear goes light, and the car turns about 45%
harder than it does flat out — enough to point it somewhere, nowhere near
enough to spin it. Trail-braking turns it harder still. Both are measured by
`npm run rally`; if lifting ever stops being worth doing, the throttle has
become a key you hold down.

The weight takes about a fifth of a second to arrive, because it travels
through springs. Without that lag, lifting mid-corner unloaded the rear in one
step and snapped the car to forty-four degrees.

There is **one** assist left, and it is named where it happens: `CATCH` applies
about a third of the countersteer for you once the car is well out of shape,
because two arrow keys cannot modulate opposite lock. A traction control
watches the rear wheels *spin* — which is what traction control is — rather
than watching how sideways the car is, and the handbrake bypasses it.

Three earlier assists are gone: a stability control that steered for you near
centre, a throttle cut that began at six degrees of slip, and a leash that
clamped the car to sixteen. Together they meant every input you made was
blended with one the game was making, which is exactly what "the front tyres
don't do proper corners" feels like from the driver's seat.

**You drive it.** `↑`/`W` is the throttle, `↓`/`S` the brake — and held at a
stand, the brake selects reverse, after which the two pedals swap jobs the way
they do in any car. `A`/`D` steer, **space is the handbrake**, **alt spends a
measure of ember**. Lift off and engine braking slows it; it will roll to a
stop on its own.

On a phone the left thumb steers and the right thumb *is* the pedals: where it
sits vertically, measured from wherever it landed, runs from full throttle
through off, onto the brake, and at the bottom of its travel onto the handbrake
as well. A hairpin is one long pull downward, which is what it is in a car. A
quick tap is the ember.

The car used to drive itself forward at full power, always, so that it could be
played one-handed. That is why the assists above existed: a driver who cannot
lift cannot slow down for a corner, so every corner had to be survivable flat
out. Giving the throttle back removed the reason for all of them.

## The drift is a game, and the rest is a car

**This is the one place the simulation is switched off, on purpose.**

Left to the tyres, pulling the handbrake in a corner does what it does in life:
the rear lets go, the car rotates, and it keeps rotating the way it was sent
until it hits something. Steering has almost no authority once the back is
gone — so the drift is not a thing you *do*, it is a thing that happens to you.
You press the button and then watch. Correct physics, no fun at all.

So while you are drifting, **the arrows steer the path, not the wheels**:

| | |
|---|---|
| the key you hold | bends the line the car is travelling along |
| the same key | decides which way it hangs, and how far |
| **the other key** | swings it through and hangs it out the other way |

Which is what lets one drift carry you through a left *and then* a right —
flick, flick — and makes staying in it something you do with your hands rather
than a state you wait out.

Three ways out, and no others. **The ember** cancels it instantly and leaves you
going fast, which is why the boost button is worth holding on to through a
corner. **Two seconds** with the arrows near centre and it lets go. And below
walking pace there is nothing to drift.

It is built on `course = psi + beta` — where the car is *going* is where it is
pointing plus how far it is hung out. Commanding those two separately is the
whole trick: `turn` bends the course, `driftAngle` sets the pose, and the car's
own rotation is whatever keeps both true. The path may pull a little more than
the tyres could, which is what makes a drift genuinely quicker through a tight
corner — and it scrubs speed, which is what stops it being quicker through
everything.

### The arrows ask for a line, not for a force

**A held stick holds an arc.** Which sounds like the same sentence as the one
above and is not, and getting it the wrong way round made long corners
impossible in a way that took a measurement to see.

The command used to be a yaw rate capped in *g*, on the reasoning that a flat
cap in radians a second would be a gentle curve at 20 m/s and a pirouette at
45. True, and the cure was worse. A constant lateral g is a constant *force*,
and the arc a constant force draws is `v² / a` — it opens up with the square of
the speed. So holding the stick still through a corner while the car gained
speed made the car turn **less** every second, while the corner needed it to
turn **more** every second, and the two gaps added.

Measured through a 53-metre corner, holding one command:

| | 1s | 2s | 3s | 4s |
|---|---|---|---|---|
| the corner asks for | 0.38 | 0.42 | 0.45 | 0.47 rad/s |
| the drift gave | 0.33 | 0.30 | 0.28 | 0.26 rad/s |

The car tucked to the inside for the first two seconds, then washed out across
the road and into the wall — and no timing on the entry could prevent it,
because the fault accumulated *after* the entry. It only ever showed in one
place: a corner long enough for the speed to change while the drift was held,
which is exactly the kind of corner a drift is for.

So `DRIFT_RADIUS` is a curvature and the g cap is a ceiling on top of it rather
than the control itself. The same test now shows the gap flat at zero for four
seconds at every corner tried. **A constant that happens to be right on the one
corner you are looking at is not a fix**; the way to tell is to publish the
number and try a second corner.

Two things it must not do, both of which it did first time round. The model's
own anti-spin — `CATCH` and the `MAX_SLIP` leash — is disabled while drifting,
because a hand on the wheel and a deliberate drift pulling opposite ways is an
argument the player can feel but cannot name. And the tyres are relieved of
most of their cornering load, because otherwise the friction circle spends
their entire budget on a lateral force that is being overridden anyway: the car
could not put any power down mid-drift and came out of a long one at a third
of the speed it went in. `wheel.slipAngle` stays truthful throughout, so the
smoke and the tyre marks still know the tyre is sliding.

`npm run rally` drives all four behaviours and prints whether the flick
actually swapped sides and how much speed a long drift keeps.

### The Moonbreak is the next one along, and had to be harder than the Rootway

The Rootway is fifteen corners in two and a quarter kilometres, all of them
needing a brake, at its tightest twenty-four metres of radius on eight and a
half metres of road. The first attempt at hardening the Moonbreak turned the
same dials on the same corners — tighter radii, less width — and changed
nothing anybody could feel, because the road was still the same road and it
still asked the same *kind* of question.

So the difficulty here is made of three things a cave structurally cannot do:

**Open water.** Nothing to lean on. Where the Rootway closes the rock in until
there is one line through, this narrows to seven metres with the verge nearly
gone and the drop either side.

**A road that moves.** The Swaying Span is the first piece of road in the game
that is not standing still — see `Band.sway` and `swayRollAt`. The deck rolls
about its own length and gravity takes the car down the slope, so the force has
a cause you can see: a cable ten metres up swings ten times as far as the deck
it holds, which is what you actually watch. The wave *travels* along the span,
so how far it has rolled when you reach a given plank depends on how fast you
got there, and it cannot be learned as "lean left here".

**Height.** Thirty metres up the Sky Stair to a crest that turns while you
cannot see over it, then the Fall gives all of it back at ten per cent into the
Moonhook — arriving somewhere tight while still going downhill, which is the
single hardest thing in driving. It is also why the causeway's flank now
reaches the water at whatever height the road is: a fixed one-metre skirt was
right for a flat road and turned the crest into tarmac hanging in mid-air.

`npm run moonbreak` builds both roads and compares them, rather than trusting a
number somebody wrote down, and drives the span twice — once with the hands
still, once working — because a section nobody can drive is not difficulty, it
is a wall. The first tuning of the swing failed exactly that test before the
road was ever played.

### The Stormcrown is the last one, and it was the easiest

The same problem as the Moonbreak's, one degree worse, because this is the road
you finish on. Measured against the other two before any of this: nineteen
corners in four and a half kilometres with **seven** of them needing a brake,
never narrower than nine metres, hairpins twelve and a half metres wide, and
fifty-six per cent of it within a whisker of straight. The Rootway asks for a
brake fifteen times in half the distance.

And it had the best idea of the three while spending none of it: you climb
*through* the weather — under the cloud in hammering rain with the cedars
close, into the blind middle of it, and out above into clear sky with the storm
going on below you — and every bit of that was drawn while nothing at all
happened to the car.

So the mountain is a mountain now: a hundred and forty metres of it, with the
cloud band raised to match so the three weathers land on the three parts of the
road that earn them. And three things neither of the others can have:

**The gale is real.** `Band.gale` is how exposed each piece of road is — nought
in the cedars, one on the shelves and along the summit ridge — and its
*direction* falls out of the road's own heading against the weather's bearing,
so the same wind shoves you on one shoulder, becomes a headwind on the climb,
and changes side on you halfway round a hairpin, none of it authored. Gusty
rather than periodic, which is the whole difference from the Moonbreak's
swinging span: that is a sine you learn to lean on, this is not. It is visible
in the rain, which slants over as a gust arrives and stands up again in the
trees — the same trick the span's cables play, and the difference between a
hazard and a bug.

**Corners that lean the wrong way.** `Band.camber` — the first time the road's
roll has ever been in the physics. There is a comment in the Rootway's `seep`
admitting the gap: an off-camber corner was wanted there and could not be had,
because `bank` is a *drawing* rule and one would have looked treacherous while
driving identically. Four of them now: the scoured shoulder at Gale Bend that
teaches the idea, Thunder Stair II that punishes it, and the two fords on the
descent, where the reason is a waterfall you can see coming from four hundred
metres away.

**Height, and a summit.** A hundred and forty metres up over two and a quarter
kilometres, a ridge six and a half metres wide in the full gale with the storm
spread out underneath, and twelve hundred metres of descent at a tenth to pay
for it.

`npm run storm` builds all three roads and compares them, then drives the same
corner twice with each new mechanic switched off in the track. A hazard that
measures the same either way is scenery, and this road was full of scenery.

## The road, and what is on it

There are three. The Rootway closes around the car and derives its speed from
walls and headlamps. **The Moonbreak** opens everything the other road closes:
a pale raised causeway over black water, low edge stones passing in rhythm,
wind-bent orchard trees, ruined arches and one moon held over the horizon.
**The Stormcrown** climbs out of both of them — cedars, a cloud you go into and
come out above, and weather that is finally allowed to touch the car. The same
`Track`, car, tyre model, controls, camera and ghost cross all three; only the
authored bands, dressing and rendered place change.

**The light comes from the car, and almost nothing else glows.** That is the
rule the whole tunnel is composed against, so every addition has to justify
itself against it:

| | |
|---|---|
| **tyre marks** | short dark strips wherever a tyre is sliding, locked or spinning up, fading over twelve seconds. They appear in corners and almost never on a straight, so the road behind you is a drawing of what you just did to it |
| **stone teeth** | stalactites off the vault, stalagmites on the verge. Never on the driveable road and never low enough to touch — they are there so the headlamps have something to find, sweep along, and let go |
| **mineral veins** | hairlines of cold green in the walls, broken into flecks, gone by the middle distance. The one thing down here that is *already lit* when you arrive, so the far end of a straight is not a black hole |
| **water** | drips off the roof where the rock is wet. Vertical, in a world where everything else streams past horizontally, which is what makes them read as scale |
| **roots** | the Rootway is named for them. Through the vault, down a wall, low overhead in the tight sections |
| **lanterns** | a sliding window of ten, warm fire or cold fungus. The only *placed* light on the road |

### How it ends

Both ends of the tunnel are **closed with rock**. `capEnd` in `geometry.ts`
carries the sweep on for six more rings with the cross-section shrinking toward
a point and travelling forward as it goes, so the road finishes in an apse —
lit, coloured and kneaded like the rest of the tunnel, rather than a disc glued
over a hole. It used to simply stop, which leaves an opening the exact shape of
the tunnel's mouth, and since you are *inside* the mesh looking down it what
that read as was a black rectangle across the end of the road.

You saw it on every run, because the car reached it on every run: the coast
after the flag was fifty-eight metres and the roll-in needs well over a
hundred, `car.s` was clamped rather than stopped, and a clamped car keeps all
of its speed. So it arrived at the last ring at thirty metres a second and sat
there with its nose in the hole while the brake bled off against nothing and
the result came up. Three bugs, one symptom. All three are fixed: `COAST` is
measured against what the car actually does, `END_WALL` is a back wall the
physics stops against the same way it stops against the sides, and the brake
during the roll-in tapers with speed — firm while there is speed to lose, below
the reverse-select threshold by the time the car is walking.

What is there instead is **composed as an arrival**, and it is the one place on
the road where the lighting rule above is deliberately relaxed:

- a **throat** — the tightest section on the whole road, twenty-four metres of
  it, so the hall opens all at once instead of gradually;
- the **line**, as two standing stones with fire on top, one either side, in
  the mouth of the hall. You go *between* them. No flag, no banner, no line
  painted on the rock — none of those are things that exist in a cave;
- an **avenue** of braziers down both walls, evenly spaced and alternating
  ground level and head height. Even spacing is allowed here and nowhere else:
  everywhere else a lantern says which way a corner goes, and here there is
  nothing left to say about the road;
- and the **fire**, on the centreline against the back wall, bigger than the
  one you left. The car comes to rest six metres short of it. The road is a
  loop through the rock under the garden, so it is the same fire.

The tyre marks are deliberately not a decal system — no render targets, no
texture the road is drawn into, nothing kept between runs. A ring buffer of
flat quads, the same shape as `particles.ts`. They are short-lived, so the road
always looks freshly driven and never accumulates a lap's worth of scribble.

### The Rootwake

The choice appears about twenty to twenty-five seconds after the start. The
normal Rootway bends left through its broad, lit cave; three low amber lights on
the right mark a smaller throat. Once that throat is entered, Rootway is gone.
Rootwake drops more than thirty metres through solid rock and follows its own
centreline, closed stone shell, camera path, collision walls and road metric.
It is not a second strip visible beside the main road.

The hidden tunnel is roughly 1.1 km of physical road and takes about 38–44
seconds in the repeatable precision drive. Its narrowest deck is 7.4 m, with a
hard S and a blind reverse whose tightest radius lands around 26–39 m across
the tested seeds. The corner width includes enough apex room that a car centred
on sound stone never triggers a false fall or an invisible edge. The two roads
join again about 285 m—roughly ten seconds—before the finish.

The shared progress coordinate is now only a timing and recording index. Every
consumer that needs the car's actual place—tyres, body, camera, headlights,
ghosts, replays, tyre trails and chunk culling—reads the selected route. The
recording packs that route choice as a state bit, so a ghost cannot appear in
the wrong cave. `npm run rally` measures both routes at equal curvature-limited
pace: mastering Rootwake saves 9.0–10.5 seconds on the tested daily seeds.

Only the mouth is announced. The broad chamber remains one floor while the
ordinary road continues left and a warmer worn deck peels right. One amber stone
sits in the shared chamber and two belong to Rootwake's own centreline, lighting
the narrow throat without naming it. The branch draws only the outer half of its
shell while the roads divide; at 58 m the complete tunnel closes around it.
There is no veil, breakable door, lintel, or second roof occupying the chamber.
Both routes remain drawn through the whole physical fork and only cull after
solid rock genuinely separates them.

After that threshold there is no route lighting and the ordinary road cannot
be seen. Headlamps pick out worn stone, an ochre scar before the hard S, and a
cold quartz rib at the blind reverse. The fire-spirit stays on the normal road;
learning the dark tunnel belongs to the player.

### The Drowned Mile

A kilometre of the Moonbreak's middle goes **under** the water instead of over
it — about half a minute of glass tunnel nineteen metres down, and the one
place on either road where the sky is not the ceiling.

It replaces the Mirror Flats and the Falling Garden and deliberately keeps
their driving: the long fast straight, the pair of opposing sweeps, the changes
of weight. Not laziness — those were already the right shapes in the right
order, and **what changes here is where you are, not what you are doing**. A set
piece that also asks you to learn six new corners is two things at once, and
the driver ends up looking at the road instead of at the water.

The vertical profile is the whole design, and it is written as five acts: an
approach, level and wide, with the mouth in sight a long way off; a lip that
tips the horizon out of the frame before the water closes over; a hundred and
thirty metres of straight ten-per-cent dive, so it reads as *falling*; the
deep, level, with the fast bands intact; and the mirror of the dive on the way
out. Nineteen metres is chosen — deep enough to be dark and to hold something
large moving in it, shallow enough that the surface is still a lit ceiling with
the moon in it. Past about twenty-five it stops reading as water at all and
becomes a cave, which is the other road's job.

**Going under is a change to the light, not a thing drawn on top of one.** Every
material in this game reads the same handful of uniforms — that was built so
the tunnel and the car could never be lit by two different ideas of "lit", and
it turns out to be exactly what a dive needs. Move those five numbers and the
whole world goes under together, including the parts nobody thought about.
Anything else — a blue pane over the camera, a second fog — puts the car in one
world and the water in another, which is the version that looks like a filter.

The fog does most of it, and does two jobs at once. Pulling it from 62–235
metres in to 12–78 is what water *is*, and it also means the heaviest part of
the road to draw is the part you can no longer see. **The Drowned Mile is the
cheapest kilometre on the Moonbreak** — the one place with fish in it draws less
than the one place with trees.

Three things learned building it, all of them the same lesson from different
directions:

- **Anything that draws itself must fog itself.** The glass, the shoals and the
  silt are the only things on either road that do not go through the shared
  materials, and the first version of the tube proved what that costs: nine
  hundred metres of it stayed the same brightness to the vanishing point, which
  read as a lit plastic pipe. The fog numbers now travel on `deep` for exactly
  those four shaders, and there is still only one set of them.
- **The sky under the water can only be the fog colour.** It was a hand-picked
  dark teal for ten minutes and drew a hard horizontal seam across the middle
  of the frame, where the underside of the surface stopped and the dome behind
  it began. Everything fades to `uFogColor`; the dome does not fade to
  anything, because it *is* the distance.
- **Water is a mirror at grazing angles, and the surface has to be opaque with
  range.** It faded *out* with distance at first, so the far half of the lake
  was a window and the drowned avenue nineteen metres below came through as a
  dark lump on the horizon — which gave away the dive before you reached the
  mouth.

`Deepwater.tsx` owns everything down there that moves, and it is kept apart
from `Moonbreak.tsx` for one reason: everything in that file is built once into
the road's chunks and never thinks again, and everything in this one has to be
counted. A shark, two shoals and a couple of hundred grains of falling silt is
a budget, and a budget wants a wall around it. Four extra draw calls, and the
whole lot is switched off above the water rather than drawn at zero opacity.

## The car is tuned from the control room, not from here

**Roughly forty of the numbers that used to be constants in `physics.ts`,
`camera.ts` and `controls.ts` now live in `tuning.ts`**, and the **car** tab of
`/dev7731` has a slider for each of them, ten groups at a time. Grip, weight, gravity, the steering ratio and how fast
your hand moves it, the brakes and their balance, the handbrake, all three
helpers, the drift, the ember, and where the camera sits.

The defaults in that file are exactly what those constants were, so a device
that has never opened the control room drives precisely as it did before any of
this existed. `npm run rally` reports the same numbers it did the day before
the split, and that is the check that matters when touching it.

Three layers, in order: **the code** (`DEFAULTS`), then **what has been
published** (one Firestore document, warm only), then **this device's draft**
(localStorage). So the loop is safe — you drag sliders for an hour on your own
phone and hers does not move, and one deliberate button sends the set to both.

Two things worth knowing before changing anything there:

- **Some dials are derived rather than stored, because the honest control is
  not always the raw constant.** Nothing in the model sets a top speed — drag
  does — so the top-speed dial states a speed and works backwards to the drag
  that produces it, *including* compensating for the power dial. Without that
  term, winding the power up would quietly raise the top speed past what the
  top-speed dial claimed, and the dial would be a label rather than a control.
- **A dead dial still renders.** It has a slider, a value and a note; it moves
  when you drag it; the car does nothing. `npm run tuning` exists entirely to
  catch that: it drives the car once per dial and insists something measurably
  changed. Three of the forty-one cannot be reached from any realistic lap —
  slide catching and spin protection stand down inside a drift and the car is
  otherwise very hard to get sideways, and grip-off-the-line needs a driver bad
  enough to leave the road — so those are put into the state directly instead,
  the same way `rally-check` does it.

## Switches

`?rally=car` parks the camera beside the car and circles it in the tunnel.
`?rally=ride` hands your car to the fire-spirit, which drives the whole road
end to end the same way every time. `?rally=studio` puts the car on a turntable
with no tunnel at all, doing everything it can do — steering, braking, leaning
on its springs, discs coming up cherry — and `&at=13.5` pins that to one moment
so a given view is repeatable. All three exist because "drive until you can see
it" is not a check anybody can repeat.

Pausing offers three things and not two: carry on, **from the top**, or leave.
It used to offer the first and the last, which quietly made "I got that corner
wrong and want another go" into leave, read the briefing, press start, sit
through the countdown — and it turns out that is most of what pausing is for.

`?from=<metres>` stands the car that far up the road before the flag drops, and
pairs with `?rally=ride` — the spirit picks it up from wherever it is put down.
The road is fifteen hundred metres long and the software renderer that
screenshots run on takes seconds a frame, so looking at the *end* of it by
driving there is not a plan. Same argument as `&at=` on the turntable.

`?stage=moonbreak` opens that road and skips the course picker and the menu,
which is the fourth of these and exists for the same reason as the other three:
there are three roads now, some of them are several minutes long, and the interesting
part of it is nine hundred metres in. With `?rally=ride&from=1250` that is one
URL instead of four screens and a minute of driving. It deliberately skips only
the *menus* — not the countdown, not where the car starts, not how anything
drives. A hook that quietly alters what it is showing you is worse than no hook,
because you cannot tell.

`?shot=1` publishes what the car is doing to `window.__rally` once a frame —
including `drawnSteer`, the angle the *rendered* front wheels make with the
rendered car, which is how the mirrored-wheel bug was finally settled — and
keeps the canvas readable. The headless harness answers every question about
the model but none about the wiring — whether a key reaches the tyres runs
through the browser, and none of that exists in Node.

`npm run rally` drives the car in Node and prints what it actually does: the
understeer gradient, whether it straightens itself after a kick, 0–100,
top speed, cornering grip, brief high-speed steering corrections, how far the
handbrake will rotate it and whether it
comes back, and five real roads driven end to end looking for spins, stalls and
anything gone NaN. Tuning a tyre model by driving it is how you get a car that
is right on one machine.

## What the checks cover

`npm run tuning` moves every dial in `tuning.ts` to both ends of its travel and
drives the car, insisting the drive comes out different. It does not check that
the change is *correct* — that is what driving it is for — it checks that the
wire is connected, which is the one thing about a slider you cannot see by
looking at it.

`npm run rally` drives the physics in Node, which answers every question about
the *model* and none about the wiring. It now also drives both roads end to end
— the Moonbreak was added the day it stopped being the only new thing anybody
was looking at, on the grounds that a road nothing drives in Node is a road
whose corners have never been proved to have a line through them.

Three of its sections are there because of a specific bug that nothing else
could have caught:

- **A long drift, held on one side** measures the gap between what the drift
  turns and what the corner asks for, second by second, at a constant command.
  Not where the car ends up — a constant command holds an *arc*, so it can hold
  a wrong one perfectly, and the entry angle would swamp the signal. The fault
  was that the gap itself grew; a gap that stays put is a drift you can hold.
- **The Drowned Mile** checks the one thing about the dive that is a number
  rather than a picture: how long you are under. It also checks that the road
  comes back to the height it left from, and that the waterline crossings the
  tube and the light are told about are where the road actually goes under.
- **The meters survive a restart** is a store test rather than a car test, and
  it guards a rule rather than a value: *the effect that sets a DOM node is the
  cleanup that clears it, and no other code may*. Breaking that froze the
  speedometer and the ember bar on every attempt after the first, which looked
  random, moved nothing in the physics, threw nothing, and could not appear in
  a screenshot.

`npm run shaders` sweeps every `/* glsl */` template for the one mistake this
codebase keeps making: a backtick inside a shader, which ends the shader. It is
never reported as a shader error, because the shader is never compiled — it is
a parse error several hundred lines away, often in a file nobody touched, and
it has cost real time four times now. The check cannot look for a backtick
*inside* the template, because by definition there is never one there; it looks
for the symptom instead. GLSL ends on a brace or a semicolon and prose ends on
a word, so a shader that ends on a word closed itself in a comment.

## What is not built yet

One road. The notebook has four more — the Understream (wet stone and shallow
water), the Moonbreak (a cliff tunnel open to the night sky), the Ember Vault
(fast, wide, built for overtaking) and the Old Garden (broken paving and
overgrown shortcuts) — and each is a different weighting of the same pieces
plus a surface or two. `StageId` in `model.ts` is where they go.

No garage, no upgrades, no car collection, no championship table, no
customisation. The handling has to feel wonderful before the game is allowed to
grow.
