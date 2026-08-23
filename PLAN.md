# The Garden — what this is, and the whole plan

Read this first. Then `FIREBASE.md` for go-live state, then
`src/world/games/README.md` before touching games. Keep this file current — it
exists so any session can pick the project up cold.

---

## What is being built

A private world for exactly **two people** — the owner and their long-distance
partner (Kano ↔ Lagos today; one moves to **China** soon, so ~7 timezones
apart). It is a **surprise gift**; she has not seen it.

**It is not a site and not an app.** It is a small set of beautiful 3D places
you move between, each holding one thing the two of you actually do together.

### The pivot (Aug 2026) — read this before touching anything

The first build was a walkable world: an avatar, a meadow, travel between
landmarks. **That was cut.** It was ceremony wrapped around the activities, and
the activities are the entire point. Gone for good:

- the character, the cape, the gait, sitting, walking, `body`/`intent`
- travel-between-places, tap-to-walk, arrival gates
- the "where is she" navigator arrow, presence *as a walking figure*
- buying and placing decor (lamps/benches/swings/carpets) — noise

**What replaced it:** the garden is the home, and its places are the levels.
You swipe horizontally to browse living previews of the Tree, Wellspring,
Hollow and Stars without leaving the garden. Tapping **enter this place** moves
the camera inside and reveals that place's activities. No feet, no avatar.
Browsing chooses a place; entering uses it.

---

## The sections

Each is a distinct environment. Same sky and time of day across all of them, so
it reads as one world seen in four places.

| Section | The place | The activity |
|---|---|---|
| **The Tree of Thoughts** | a great tree in a bright meadow, wind, dappled light | write a thought → **one flower grows**. Over months the ground fills with flowers, each one a thought you can open and read. |
| **The Wellspring** | a **river** between stone banks, mist, reeds | money the two of you have really set aside. **The more saved, the fuller and faster the river runs.** Never labelled "saved" — it is *ours*. |
| **The Hollow** | a **cave**, firelit, embers climbing, rock that shifts in the light | games. Word Duel and Ember Rally live here. The room drifting slightly is deliberate and liked — keep it. |
| **The Stars** | a dark plain under an enormous sky, two lights, **one horizon glowing with her dawn** | **chat, and it is built.** Every message is a light: the newest hangs low over her dawn, older ones climb and recede into the star field until they are indistinguishable from stars. Scroll or drag to walk back through it. The split horizon is the point: when it's night here it's morning there. |

More sections slot in later by adding one folder.

**Music is deliberately not one of them.** The Grove was going to be a fifth
place and that is the wrong shape: music is not somewhere you go, it is
something playing while you are somewhere else. A section would have meant
leaving the Tree to change a song and no music at all while writing one. It
lives folded in the bottom-right corner instead, everywhere — see `ui/Player`.

### Movement

Outside a place, swipe/drag horizontally, use arrow keys, or use the dots to
browse. The selected environment is pulled back like a living level entrance;
tap it to move inside. Inside, swipes belong to the activity and Escape/back
returns to the garden. Day/night still runs on your own clock.

The outside is its own scene (`world/GardenHub.tsx`), not a distant camera on
the full section. Its four landmarks coexist in one meadow. Full section
components do not mount until entry; this separation keeps browsing a world
with destinations instead of becoming four full-screen pages.

### Coming in

There is a door. `ui/Arrival` covers the world on every load: what this is, in
three lines, and a way in. It had been cut with travel-between-places and its
styles left behind in `styles.css` with nothing rendering them, so the garden
dropped you into the meadow out of a blank screen.

It also does the one piece of real work only a deliberate gesture can: browsers
will not make a sound until somebody has touched the page, so the wind starts
when the door opens rather than on the first stray click. When the real backend
is live, signing in belongs here — same page, same words, with two fields
instead of a way in.

### Looking around

**Inside a place the camera turns too, at about a third of the range.** The
garden takes the full sweep because looking around *is* what you are doing out
there; a place is composed around an activity and must not swing off it — but
rigid was worse, and next to a garden that follows your hand a place that does
not moves reads as a painting hung in front of you. `PLACE_TURN` in
`world/SlideCamera`, scaled again by each section's own `sway`.

**The pointer turns the camera, it does not merely nudge it.**
`systems/pointerLook` carries two things: `eased` (a -1..1 pointer position, for a
metre or so of parallax shift) and `gaze` (a real yaw and pitch in radians).
Parallax alone was all there was for a long time, and it is why nobody had
ever seen the sun: the sun sits sixty degrees up and a camera that leans a
metre sideways is looking at the same patch of grass.

Now: ±29° of yaw and +44°/−26° of pitch. That is enough to find the sun from
about eight in the morning to four in the afternoon, and the moon through the
night — the numbers were chosen against the celestial arc in `world/Sky`,
not by eye. Push the pointer up for sky, weather and whichever light is out;
down for the grass at your feet; sideways to see the next place along before
you have swiped to it. On a phone there is no hover, so a **vertical drag**
turns the view and springs back on release; horizontal already belongs to
browsing, and the swipe recogniser throws vertical away.

### Where the garden actually is

**`HUB_ORIGIN` is (110, 0), not the origin.** The world terrain carves the
river's valley along x = 0 — a trench thirteen metres wide at the bed and five
deep, with grass stripped out of it by `dryLand` so water can be seen. The
garden used to lay its landmarks from −30 to +30, which put the Wellspring and
the Hollow *at the bottom of that trench* with no grass around them.

The Tree of Thoughts section had the same bug and it is the same fix:
`MEADOW_X` in `sections/tree/layout`. The great tree stood on the floor of
the channel, five metres below its own flowers, in a meadow with no grass in
it. **Anything that stands on the ground must be clear of x = 0 unless it is
the river.**

---

## The design law (non-negotiable)

- **No cards, no borders, no rounded rectangles, no panels.** Text sits on the
  world with a dark lift shadow. Anything rectangular must become a real thing
  (paper, stone, water, light) or not exist.
- **Imperfect on purpose.** Stones lopsided, layouts jittered, nothing on a
  perfect grid. Grids read as forms.
- **Mobile is the primary surface.** Verify at 390×844 before calling anything
  done. Swipe must feel native there.
- **Two people, forever.** No leaderboards, no per-person scores. Nothing may
  make being far apart feel worse.
- **Honest states.** Never say "waiting for her" when the truth is "the server
  won't say". Never fake a rate, a time, a total.
- **Everything touchable announces itself.** The recurring historical failure
  was building things nobody could find.

## The technical law

- **Nothing is lit by scene lights.** Grass, ground, trees, stone and every
  landmark use custom shaders taking one ambient level and one sun colour —
  which is how a hundred and fifty trees cost two draw calls. A `<pointLight>`
  dropped into the garden does *nothing*, silently. The Hollow needed firelight
  on its own rock, so the shared form shader has room for exactly one local
  light (`uEmber*` in `world/forms`), in the landmark's own space, costing one
  multiply when its power is zero. Use that, not a light.
- **Waves are sized in metres, not in uv.** `world/water` is shared by the
  Wellspring and by its preview out in the garden, and those are 240 m and 26 m
  long. Frequencies stated per uv gave one a ripple every metre and the other
  froth in fourteen-metre slabs. Pass `length`.
- **The hand is Homemade Apple** (OFL, self-hosted in `src/fonts`), aliased as
  `Garden Hand` so one `@font-face` swaps it everywhere. Small x-height, wide
  slow rhythm, long ascenders — every size it is set at needs more leading than
  a printed face would, and those sizes move together with it.
- **Writing makes a sound, and it is a pen, not a keyboard.** `ambience.nib()`
  — a few milliseconds of bandpassed noise with a fast decay, jittered every
  stroke, over a much quieter low thump for the sheet itself. Driven off the
  value changing rather than keydown, so it survives autocorrect, composed
  input and paste. There is **one** `AudioContext` for the whole garden and
  it is module-level (`ambience` in `systems/ambience`); browsers cap them and
  a second would need its own gesture to unlock.
- **Ids come from `data/ids`, never from `crypto.randomUUID` directly.** That
  function is `[SecureContext]`, so it is `undefined` on `http://192.168.x.x`
  — which is how the garden is opened on a phone (`host: true` in vite.config).
  Every write built its id with it, so on a phone *every* write threw and did
  nothing: planting, saving and sending all failed silently and it looked
  exactly like a dead database.
- **A write that can fail is wrapped in `attempt()`** (`systems/trouble`), and
  there is an `unhandledrejection` backstop. The bug above was invisible for a
  whole evening because three separate async writes rejected with nobody
  listening. Nothing may fail quietly.
- **Presence is a heartbeat from App**, every twenty seconds. Nothing called
  `publishPresence` between the avatar being cut and the music arriving, so
  `online` was false for both people forever — and anything resting on "are we
  both here" silently could not work.
- **Foliage is leaf cards, not blobs.** Leaf clusters were squashed
  icosahedra, and however hard they were squashed they read as green cotton
  wool. Real game foliage is flat planes; without a texture to cut leaves out
  of one, the plane *is* the leaf — a five-vertex lens with its spine lifted
  out of plane, because a perfectly flat card has one normal and therefore one
  shade. They need `doubleSided`, or half of every crown is a hole. Leaf size
  and spray spread both have a floor tied to the *tree*, not the branch, or the
  deepest limbs — which carry most of the crown — go bald.
- **What a letter hangs from comes off the real branches.** `sections/tree/
  greatTree` grows the tree once at module load and both the mesh and the
  letters read from it. A pure formula was tried first, to keep a thought's
  place stable, and it produced papers dangling in clear air with their threads
  running up into nothing. What must never move is the *flower* on the ground —
  that is still a pure spiral in `layout.ts`.
- **The clocks and the distance show only in the open garden.** Inside a place
  they are somebody else's text over the thing you came for.
- **Every place has its own weather, and the sound is half of it.** There used
  to be one ambient bed — wind — playing everywhere, so you carried meadow wind
  down into a cave and along a river. That is worse than silence: the ear knows
  a cave is not windy. `systems/ambience` now holds six layers and each place is
  a *mix* of them, crossfaded on the way in — air, leaves, water, fire, room
  tone and the Stars' rare shimmer. Adding a place means adding a column to
  `MIX`. The place is set from `App`, which is the only thing that knows both
  which section is on screen *and* whether you have gone into it; from outside,
  looking at all four across a valley, what you hear is the wind.
- **Anything louder than the world ducks the world.** A car voice from
  `ambience.engine()` drops the ambient bed to almost nothing for as long as it
  lives, automatically, rather than the racer having to remember to ask.
- **Section cameras are composed for a landscape frame, and the field of view
  is vertical.** A portrait phone therefore sees exactly as much sky and far
  less to either side, and the Tree came out with its crown cut off. See
  `backOffFor` in `world/SlideCamera` — it stands further off along the line
  the place was framed from, partially, because backing off far enough to
  recover the whole horizontal field is worse than a slight crop.

  **A chase camera cannot be fixed the same way.** Standing further off makes
  a racer worse, not better. At 390×844 a sixty-degree camera has *thirty*
  degrees of horizontal view — a telephoto — and Ember Rally came out as a
  toy car in the middle of a tall black picture. `portraitAmount` in
  `games/ember-rally/camera` blends four things at once instead: the camera
  comes in nearer, drops, opens right up, and aims a metre and a half higher
  so the car sits low with the tunnel running away above it. Vertical
  distortion at the edges is the price, and inside a tube nobody sees it.
- **A game may take the world.** `GameDefinition.Stage` mounts inside the
  garden's own Canvas, in place of the section, with `SlideCamera` stood down
  and the sky skipped — see `games/stage.ts` and the Stage section of
  `games/README.md`. Ember Rally is a road under the garden, not a board over
  it. It is emphatically *not* a second `<Canvas>`: that would be a second
  WebGL context (phones ration them), a second shader pipeline that drifts out
  of agreement with this one about what "lit" means, and a second render loop
  competing for the frame. The racer this replaced was a 2D canvas laid over
  the world and that is most of why it read as a different program.
- **Colours are converted sRGB→linear on the way in.** `new Color('#4a5b72')`
  is about 0.02 in the shader, not 0.28. An ambient chosen to look like a
  plausible mid-grey is therefore *nothing*, which is exactly how the Rootway
  spent an afternoon rendering as a black rectangle with a car in it. Pick
  these against a render, never against a swatch.
- **`computeVertexNormals` averages every face meeting at a vertex**, and two
  of the things you naturally want to build break on it. A flat end cap
  sharing its rim with the cylinder wall comes out as one smooth curve, so
  every hub, lamp bezel and exhaust on the car looked like a party hat — caps
  need their own copy of the rim. And a ribbon made visible from both sides by
  emitting both windings has, at every vertex, two opposite normals that
  average to *zero*: the wheel arches rendered as arch-shaped holes. Close the
  shape instead.
- **A loop over a fixed array of lights must skip the empty slots.** The cave
  shader ran all ten lantern slots on every fragment whether or not any of them
  were lit. One `if (uLamps[i].w < 0.01) continue;` took the whole racer from
  **0.4 frames a second to sixty** under SwiftShader — a hundred and fifty
  times — because the unlit slots were the majority of the cost of every pixel
  on screen. Anything with a slot window pays for it this way. Look for it
  before blaming geometry.
- **Wind a cylinder's wall outward.** `drum()` in `games/ember-rally/car` wound
  its barrel the wrong way for a very long time, so with front-face culling on
  **every hub, bezel and exhaust drew only its two end caps**. It went unnoticed
  because what you see of a lamp is its lens, and a lens is a cap. If a
  procedural solid looks thin or hollow, check the winding before the normals.
- **The wheels hang off the road; the body hangs off the springs.** Parenting
  the wheels to the body meant that when the shell leaned into a corner all
  four wheels leaned with it about the middle of the car — outside pair into
  the stone, inside pair in the air. A real car rolls *over* its wheels. The
  rig is `root → ground` (the road's own bank and slope, carrying the hubs)
  `→ body` (the car's roll, pitch and heave, carrying the shell). See
  `games/ember-rally/rig`.
- **A car is mostly tyre, and a lamp is not white.** Both are proportion
  mistakes that only show in a render. A polished rim out to two-thirds of the
  wheel reads as a brass coin; a lens emitting at full strength tone-maps to a
  flat white disc. Neither is visible in the source, and both pull the eye off
  the car every time it passes a light.
- **A contact force is per second; an impact is not.** The racer's wall
  handling charged its whole speed penalty every physics substep, so a car
  sliding along a wall lost five per cent of its speed a hundred and twenty
  times a second and stopped dead. Impacts fire once, on the step contact
  begins; scraping is scaled by `dt`.
- **Nothing explains a game while you are playing it.** A line appears only
  when it carries something the board cannot show — that you are choosing a
  word rather than guessing one, that there is nothing to guess yet, how it
  ended. Six rows *is* "six goes"; saying so is noise laid over the thing you
  came for. And if a conditional line is removed, keep its wrapper: `.game` is
  a three-row grid and dropping the first child handed the board the wrong row.
- **The middle of the Hollow is kept dark, deliberately.** A board is drawn
  across the centre of the screen and the camera drifts through forty degrees,
  so nothing bright may sit behind it — the room is lit by five small hearths
  against the walls, and their positions were *solved* by projecting them
  through the camera at every angle it reaches rather than judged by eye from
  one. A light that looked safely off to the side swung straight behind the
  tiles as the camera moved.
- **Anything that fills the screen asks `systems/attention` first, and anything
  ambient hides for it.** The place name, the marks, the two of you and the
  distance, the invitation — all four were rendered unconditionally by
  components with no idea anything else was on screen, so a game board drew
  straight through the row of games behind it and the clocks in the corner.
  One question in one place, so the next overlay joins automatically.
- **A full-screen thing must dismiss on `click`, never on `pointerdown`, and
  must stay solid while it fades.** Dismissing on the way down leaves the
  matching `pointerup` with nothing on top to land on — and tap-to-enter is a
  `window` listener, so opening the arrival gate also walked you straight into
  whichever place was selected. Window listeners that act on a gesture call
  `takenOverNow()`, not a value closed over when the effect was bound.
- **Side effects never go inside a `setState` updater.** React runs updaters
  during render and may run them more than once; a store write in one updates
  another component mid-render. Guard with a ref and do the work outside.
- **Never animate `transform` on anything that needs one for layout.**
  `@keyframes drift-in` ended on `transform: none` with `fill-mode: both`,
  which *persists* and overwrote the `translateX(-50%)` that centres four
  different things — the threshold in every place, the toast, the prompt and
  the placing hint all sat half their own width right of centre. It animates
  the independent `translate` property now, which composes instead of
  replacing.
- **Every custom shader ends with**
  `#include <tonemapping_fragment>` + `#include <colorspace_fragment>`.
  One ACES pipeline, exposure **0.98**, set in the Canvas. A shader missing
  those two lines renders dark and wrong. This unification was the single
  biggest visual win of the project — do not regress it.
- **GLSL traps already paid for:** per-instance data must be *instanced*
  attributes; reversed-edge `smoothstep` is undefined (write
  `1.0 - smoothstep(lo, hi, x)`); a uniform read by both stages at different
  precisions **fails to link silently** (pass a varying); `patch` is reserved.
- **Money is integer minor units** (kobo). Never floats. The FX rate is typed
  in and stored per contribution so history never re-values itself.
- **Per-frame motion never goes through React** — imperative reads, direct DOM
  writes. React state at 60fps = visible stutter.
- **The data seam**: all storage goes through `DataLayer` (`src/data/types.ts`),
  implemented twice (`local.ts`, `firebase.ts`). The local mock must behave
  identically, including withholding sealed moves. If Firestore is unreachable
  from China, write a third implementation; nothing above the seam changes.
- **Sealing**: a round's opening move (seq 0) is a blind commit; rules refuse
  to return hers until yours exists. `firestore.rules` is a template —
  `npm run rules` fills addresses from `.env.local` into `rules-out/`.

## How to verify (do not skip)

Dev server `npx vite --port 5291 --strictPort`. Drive the real app with
Playwright + SwiftShader (`--use-gl=angle --use-angle=swiftshader
--enable-unsafe-swiftshader`), screenshot, **and look at the image**. Switches:
`?hour=13`, `?section=river`, `?game=ember-rally&solo=1`. The racer adds three
of its own, for the same reason: `?rally=car` orbits the camera round the car
in the tunnel, `?rally=ride` lets the fire-spirit drive *your* car so the whole
road can be looked at end to end the same way every time, and
`?rally=studio&at=6` puts the car on a turntable with no tunnel at all. Most
of the garden runs ~30fps under SwiftShader; eased motion therefore takes
~10× longer than it will in reality — wait 10–15s before judging a transition.
Always shoot desktop **and** 390×844, at more than one hour of day.

**Two things about screenshotting the cave, learned the hard way.**

`page.screenshot` goes through the compositor and needs a frame committed
inside its deadline, and the cave can take several seconds a frame in software
— so it simply times out, and the same blocked main thread makes Playwright's
own actionability polling time out too. Press the buttons *first*, while the
page is still cheap, then wait, then read `canvas.toDataURL()` directly.
`?shot=1` turns on `preserveDrawingBuffer` for exactly this and nothing else.

And **the clock barely advances**. `delta` is capped at a twentieth of a second
per frame — correctly, so a backgrounded tab does not simulate four minutes at
once — so on a renderer taking seconds a frame, anything driven by elapsed time
crawls. Waiting for a turntable to reach the angle you want is not a plan;
`?rally=studio&at=13.5` asks for it. Any future scripted view wants the same
switch.

Physics does not need a browser at all: `npm run rally` drives the car headless
and prints acceleration, top speed, cornering grip, what the handbrake does and
whether the fire-spirit can still get round five real roads without spinning.
Run it after touching `physics.ts`, and if a number moves a long way, the
handling changed.

---

## Where the work stands

- [x] One unified render pipeline, ACES 0.98 — the fix that made it look real
- [x] Cave: real 3D firelit room, rock/ember/flame shaders
- [x] Word Duel: full game, stones not squares, sealed opening move
- [x] **Ember Rally, rebuilt as a place.** The first version was a 2D canvas
      laid over the world — flat trapezoids and a polygon car — and none of it
      survives. It is now a real tunnel in the garden's own renderer: a road
      swept from authored pieces under a daily seed, a hand-built rally car of
      wood and brass whose two headlamps are the light the whole cave is drawn
      from, a car solved in the road's frame so the inside line is
      genuinely shorter, drifting that is weight transfer rather than a lane
      number, sealed qualifying runs, her run as a ghost with a line of pale
      fire behind it, a fire-spirit that actually drives, a cut two-car replay,
      and a synthesised engine with a gearbox living in the garden's one
      `AudioContext`. No clock, no speedometer, no meter, no map: the ember you
      have left is the three lamps on the back of your own car. See
      `world/games/ember-rally/README.md`.
- [x] **The car, taken on its own.** A round spent on nothing but the machine,
      because the whole game rests on it. The bicycle model is gone: four
      wheels, each with its own load, slip angle, slip ratio and share of one
      friction circle; an engine with a torque curve through five ratios and a
      plated diff; brakes at both ends and a handbrake that is *a torque large
      enough to stop two wheels turning* rather than a number that lowers rear
      grip. Wheelspin, lockup, lift-off oversteer and a disc that glows on the
      corner doing the work all fall out of that rather than being written
      down. Controls split so the keyboard can brake and *then* rotate — space
      is the handbrake, alt is the ember. The engine voice was rebuilt around
      it with ten voices and a cave reverb, every one driven by a number the
      tyre model already had. The car itself gained a light pod, brake lamps,
      exposed springs, brake discs, a driver, and wheels that are mostly tyre.
      Measured headless by `npm run rally`; reviewable by `?rally=studio`.
- [x] Letters, savings pot, profiles, Firebase layer + rules (needs console steps)
- [x] Two-layer section shell: browse living level entrances, then enter
- [x] Registry, swipe camera, mouse parallax, shared sky/clock
- [x] The Tree of Thoughts: environment + thought→flower + reading a flower
- [x] The Wellspring as a river, level driven by the total, relabelled "ours"
- [x] The Hollow as a game lobby (Word Duel first, Ember Rally second) using
      the cave
- [x] The Stars: split-horizon environment, no chat functionality yet
- [x] **The garden rebuilt.** Turning camera; garden moved off the river's
      trench and its places spread thirty metres apart with their own framing;
      trees grown from `world/tree` (leaning boles, real limbs, leaf hung off
      the ends) instead of balls on cylinders; `world/water` — meandering
      ribbons, glitter, shore — shared by the Wellspring and its preview; the
      range on the horizon rebuilt low, hazy and snowless; slope lighting on
      the ground; one local light in the form shader for the Hollow's fire
- [x] **The Stars, built.** Messages as lights in the sky; `Message` through
      the `DataLayer` seam with both implementations and `firestore.rules`;
      words are DOM over the scene so they stay sharp and selectable
- [x] **The Tree of Thoughts, fixed.** The great tree grown from the shared
      generator; thoughts hang as papers on threads again (`hangSpot`, and
      `world/Letters` was orphaned — nothing had imported it); a thought's
      flower is a whole plant standing over a metre rather than a 34 cm cone
      invisible in 76 cm grass
- [x] **The trees, properly.** Recursive branching with apical dominance,
      leaves only at the last tips, taper by da Vinci's rule. The two earlier
      attempts and exactly why each failed are written down in `world/tree`
- [x] **Music, with real sync.** Position is stored as an *anchor* (`at` at
      `since`) and reconstructed from the server clock, so two phones agree
      from one fact and a device that slept catches up correctly. Shared while
      you are both here, your own when you are not — see `systems/listening`
- [x] **The Hollow is a row of games**, with a way in for two and a way in for
      one. Solo rounds have their own ids and never appear in her Hollow
- [ ] Visual polish and full desktop/mobile screenshot sweep of both modes
- [ ] Delete the dead world: Figure, People, cloth, gait, body, benchSpots,
      Benches, Placed, CameraRig walking, places/*, navigation, Catalogue,
      placing, Flora-as-decor
- [ ] Full regression + screenshot sweep, update the in-world guide

## After that

1. **Go live** — owner does the console steps in `FIREBASE.md`, then a real
   two-device test. The Stars now has a `messages` collection, so its rule
   block has to go up with the rest.
2. **Real music files.** Everything is built and `Track.url` is null — the
   list, the transport and the sync all run on the clock without it, so the day
   files are uploaded it simply makes sound. Storage rules get written then.
3. **More games** on the round/moves model: Ultimate Tic-Tac-Toe, Hidden Fleet,
   Dots & Boxes. One folder each; the registry auto-loads them, and the
   Hollow's row picks them up with no changes.
4. PWA install + push notifications ("she left a thought").

## Known debts

- `FIREBASE.md` has a garbled commented-out table row (a stray user edit).
- Word list ships ~86KB lazy-loaded — keep it out of the main bundle.
- `dist/` may be stale; never judge by build output.
- **`world/Water.tsx` is dead and collides by name with `world/water.ts`,
  which is live and shared.** Nothing imports the old one; it should go. It is
  named here rather than deleted because this is not a git repository and a
  deletion could not be undone. The other orphans are `world/Bottles.tsx`,
  `world/Lamps.tsx`, `world/SoftOrb.tsx` and `systems/controls.ts`.
- The Wellspring's banks sit twelve metres from the water when the pot is
  empty, which is what "narrow and low in its bed" means but reads oddly with
  nothing saved. Worth a look once there is a real balance in it.
- `src/fonts/caveat-latin.woff2` is no longer referenced — the hand is
  Homemade Apple now and only Caveat's *extended* latin is still wired up.
  Vite will not ship it, so it costs nothing but a look.
- The Stars keeps the whole conversation in memory (500 by default) and does
  not page. Deliberate at two people; revisit if it ever runs for years.
