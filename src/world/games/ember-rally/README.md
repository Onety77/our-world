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
| `controls.ts` | a thumb and a keyboard, driving the same machine |
| `spirit.ts` | who you race when there is nobody to race |
| `geometry.ts` | the road turned into rock |
| `materials.ts` | how any of it is lit, which is: by your own headlamps |
| `car.ts` | the machine, lofted from a table of cross-sections |
| `rig.ts` | one car as a hierarchy of groups, and what may move |
| `marks.ts` | the rubber the tyres leave on the stone |
| `Race.tsx` | the Stage — everything that happens per frame |
| `Studio.tsx` | the car on a turntable, with no tunnel round it |
| `EmberRally.tsx` | the words: briefings, the seal, the result |
| `../../../../scripts/rally-check.ts` | the car, measured, with no browser |

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

**The light comes from the car.** There is no sun down here and no scene
lights: two headlamp cones, a warm pool travelling with the car, and a sliding
window of ten lanterns. Everything that draws includes the same block from
`materials.ts`, so nothing can disagree with anything else about what "lit"
means.

**There is almost no interface.** No clock, no speedometer, no map. Whether you
are ahead is whether you can see her. Where the corner goes is where the
lanterns are, and where the car wants to be is where the tyre marks already
are.

**The one exception is the ember bar, and it had to earn it.** The three lamps
on the back of the car show how much you are carrying and they are still there
— from directly behind, which is where you spend the whole race, they are the
prettier version. What they could never show is *where it comes from*. The
ember used to trickle in from three places at once — how sideways you were, how
close you were running to the rock, and a lump every time you let a drift go —
so the meter went up for reasons nobody could name, and a reward you cannot aim
at is not a reward, it is weather.

Now there is one source and one line of light that fills with it: **seconds
spent drifting**, about five for a full one. It stops at full, and spending it
takes the lot — so the bar is only ever doing one of two things, filling or
asking to be used. Which makes the loop the game is actually about: drift to
fill it, then spend it, which also cancels the drift and fires you out of the
corner.

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

## The road, and what is on it

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

The tyre marks are deliberately not a decal system — no render targets, no
texture the road is drawn into, nothing kept between runs. A ring buffer of
flat quads, the same shape as `particles.ts`. They are short-lived, so the road
always looks freshly driven and never accumulates a lap's worth of scribble.

## Switches

`?rally=car` parks the camera beside the car and circles it in the tunnel.
`?rally=ride` hands your car to the fire-spirit, which drives the whole road
end to end the same way every time. `?rally=studio` puts the car on a turntable
with no tunnel at all, doing everything it can do — steering, braking, leaning
on its springs, discs coming up cherry — and `&at=13.5` pins that to one moment
so a given view is repeatable. All three exist because "drive until you can see
it" is not a check anybody can repeat.

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

## What is not built yet

One road. The notebook has four more — the Understream (wet stone and shallow
water), the Moonbreak (a cliff tunnel open to the night sky), the Ember Vault
(fast, wide, built for overtaking) and the Old Garden (broken paving and
overgrown shortcuts) — and each is a different weighting of the same pieces
plus a surface or two. `StageId` in `model.ts` is where they go.

No garage, no upgrades, no car collection, no championship table, no
customisation. The handling has to feel wonderful before the game is allowed to
grow.
