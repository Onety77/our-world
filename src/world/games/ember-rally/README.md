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

**There is no interface.** No clock, no speedometer, no meter, no map. How much
ember you have left is the three lamps on the back of your own car, filling one
at a time. Whether you are ahead is whether you can see her. Where the corner
goes is where the lanterns are, and where the car wants to be is where the tyre
marks already are.

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

Two places it is deliberately dishonest, and both are stated in the source
where they happen. `CATCH` applies a third of the countersteer for you, because
half this game is played with two arrow keys and a switch cannot modulate
fifteen degrees of opposite lock. And there is a traction control: past about
sixteen degrees of slip *without* the handbrake, the throttle backs off, so an
accidental power-slide gathers itself up while a deliberate one is untouched.

Controls are `A`/`D`, `S` to brake, **space for the handbrake**, **alt for the
ember**; or, on a phone, left thumb to steer, right thumb held for the corner
and tapped for the ember. The keyboard gets the brake and the handbrake apart
because it has the fingers for it, and being able to load the front and *then*
rotate is the difference between driving the car and operating it.

## Switches

`?rally=car` parks the camera beside the car and circles it in the tunnel.
`?rally=ride` hands your car to the fire-spirit, which drives the whole road
end to end the same way every time. `?rally=studio` puts the car on a turntable
with no tunnel at all, doing everything it can do — steering, braking, leaning
on its springs, discs coming up cherry — and `&at=13.5` pins that to one moment
so a given view is repeatable. All three exist because "drive until you can see
it" is not a check anybody can repeat.

`npm run rally` drives the car in Node and prints what it actually does: 0–100,
top speed, cornering grip, how far the handbrake will rotate it and whether it
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
