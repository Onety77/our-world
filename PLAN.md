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
| **The Hollow** | a **cave**, firelit, embers climbing, rock that shifts in the light | games. Word Duel, Ember Rally and Scattergories live here. The room drifting slightly is deliberate and liked — keep it. |
| **The Stars** | a dark plain under an enormous sky, two lights, **one horizon glowing with her dawn** | **chat, and it is built.** Every message is a light: the newest hangs low over her dawn, older ones climb and recede into the star field until they are indistinguishable from stars. Scroll or drag to walk back through it. Answer any line and the quote sits above your reply; put a heart on one and **its light in the sky burns bigger, warmer and steadier for good**. The split horizon is the point: when it's night here it's morning there. |

More sections slot in later by adding one folder.

**Music is deliberately not one of them.** The Grove was going to be a fifth
place and that is the wrong shape: music is not somewhere you go, it is
something playing while you are somewhere else. A section would have meant
leaving the Tree to change a song and no music at all while writing one. It
lives folded in the bottom-right corner instead, everywhere — see `ui/Player`.

**And the conversation is folded into the *same* corner, for the same reason.**
The Stars is where a conversation lives and it should stay that way — but
answering her should not require leaving what you are doing, browsing to it and
entering it, because seven timezones apart the answer to that is "later", every
time. `ui/Whisper` is the last four things said and one line to write on, and
it stays up during a game. It is deliberately too small to read a year of: if
you want the conversation, the sky is still the place.

It shares the Player's corner rather than taking the opposite one, and **that
is not a detail.** It was put in the bottom left first, where the name of the
place and the way into it already live, and the collision was "solved" by
making the place card disappear — which is not resolving it, it is hiding the
evidence. **Every corner of this world is spoken for**: bottom left is the
place and its threshold, top left is the way back out, top right is the two of
you and your clocks, bottom centre is the row of marks. When something new
needs somewhere to live, it joins an existing corner or it does not exist. See
`.corner`.

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
- **"No interface" has exactly three exceptions, and each had to earn it.** The
  rule stands everywhere else. Ember Rally has an **ember bar**, because
  the three lamps on the back of the car could show *how much* you had but
  nothing could show *where it came from* — a reward you cannot aim at is not a
  reward, it is weather. It fills from one thing only: seconds spent drifting.
  Word Duel's time challenge has a **clock**, because a race against five
  minutes without a visible five minutes is just a duel you feel anxious
  during. And the racer has a **speedometer**, which is the newest and took the
  longest to justify: the wind, the field of view opening, the walls closing in
  and the gearbox climbing all say how fast you are going *while you are
  looking at the road*, which is better than a number — but every one of them
  is **relative**. They say faster and slower. Not one of them can say *this is
  as fast as it goes*, and without that the car reads as having no maximum,
  which is not a cosmetic problem: if you cannot tell you are at the top, you
  cannot tell whether the corner ahead is one you will make. All three are
  drawn as light or as plain text on the dark — no box, no border, no dial, no
  progress ring — and none exists outside the mode that needs it.
  **Scattergories asked for a fourth and did not get one.** Three minutes needs
  a clock and twelve lines need a progress count, and neither is an exception:
  a game played at a table has *a die you roll and a glass you turn*, so it has
  those, and they say the same two things as objects. The glass is better than
  a clock at the only job that matters — roughly how long is left, without
  reading a number every four seconds — and the twelve notches beat a bar,
  because a bar says "eight of twelve" and notches say *which* eight, which is
  what you want with forty seconds to go. When a rule looks like it needs an
  exception, look for the object first.
- **Honest states.** Never say "waiting for her" when the truth is "the server
  won't say". Never fake a rate, a time, a total. The notification toggle says
  *"while the garden is open"* because that is all a web page can do; a switch
  that implies more fails silently, at night, for somebody who was waiting.
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
- **An asynchronous round names itself; a live one cannot.** Every other round
  in the garden gets its id from the date, so both phones arrive at it
  independently and neither has to be told. A round the two of you open *at the
  same moment* has no such name — and deriving one from a shared clock bucket
  almost works and then fails at the boundary, which is the worst way for a
  thing to fail. So the invitation goes down the one channel that is already
  live and already shared: `Presence.racing` carries the key, she sees it within
  the second, and joins that round rather than inventing one. Ties are broken by
  user id, so exactly one of you yields and always the same one. **Adding a
  presence field needs `database.rules.json` updating too** — it has
  `"$other": { ".validate": false }`, so an unlisted field is silently rejected.
- **A word list can be *fair* and still be cruel.** The standard Wordle answer
  set is 2,315 words with no unfair plurals and nothing obscure by dictionary
  standards — and it contains several hundred nobody says out loud. Losing to a
  word you have never used is not losing a game. `word-duel/easy.ts` is the
  pile the game actually deals from, and it is filtered against `fair.ts` at
  load so a typo in it can only ever make the pile smaller, never deal a word
  the other player would be told is not in the book.
- **A drift is a game mechanic, not a physics outcome — and the physics has to
  be told to get out of the way.** Simulated honestly, a handbrake turn sends
  the car one way and keeps sending it: once the rear has gone, steering has
  almost no authority, so the drift is something that happens *to* you. Ember
  Rally now switches to a different control model while drifting, where the
  arrows steer the **path** rather than the wheels, so one drift can be flicked
  through a left and then a right. Two things had to be disabled for it to work
  at all: the model's own anti-spin, which was pulling against the drift in a
  way the player could feel but not name; and most of the tyres' cornering
  load, because the friction circle was otherwise spending their whole budget
  on a lateral force that the drift overrides anyway — the car could not put
  any power down and came out of a long drift at a third of the speed. Where a
  game deliberately stops simulating, **say so at the top of the block.**
- **Evidence on the ground is what makes a moving thing real.** Dust and smoke
  hang in the *air* and drift away — they say something is happening, not that
  it happened *there*. Rubber left on the stone stays where the tyre was, so it
  is the only thing that proves the car and the road are touching. It also
  turns out to be the only feedback in the racer you can look *back* at: a few
  seconds after a bend, the road behind you is a drawing of what you did to it.
  `games/ember-rally/marks` — a ring buffer of flat quads, no decal targets, no
  persistence between runs.
- **A strip laid once a frame must be as long as the gap it is filling.** At
  forty metres a second and a fixed length, tyre marks came out as a dashed
  line of tiles. Size each one to the distance travelled since the last, lay it
  *behind* the wheel, and overlap it generously — the shader tapers both ends,
  so a strip sized exactly to the gap still leaves a faded seam.
- **Subtle means an order of magnitude quieter than the first attempt.** The
  glowing mineral veins went in four times too bright with bands four times too
  wide, and the tunnel came out looking like neon tubing stapled to the
  ceiling: the veins became the brightest thing on screen and the car, the road
  and the lanterns vanished behind them. A seam in rock is a hairline that
  catches the eye once. The fix was thinner bands, a much darker colour, a
  distance fade, and a hash to break the contours into flecks — a smooth
  contour is a *loop*, and unbroken it reads as somebody's doodle on the wall.
  **Look at the render before believing any emissive number.**
- **The road's right is −X, and half the racer's drawn detail was mirrored.**
  The car is modelled facing +Z, and in three.js's right-handed axes with +Y up
  the right-hand side of something facing +Z is **−X** — which is exactly what
  `basisAt` says (`rx = −cos(heading)`). The physics numbers its wheels
  right-positive, so `wheels[0]` is the front *left* while the mesh's
  `WHEEL_POSITIONS[0]`, at −x, is the front *right*. Nothing about how the car
  drove depended on it, and everything drawn from a wheel index did: the front
  wheels visibly steered the **wrong way**, and the spring that compressed, the
  disc that glowed and the smoke off a locked tyre were all on the wrong side
  of the car. `MESH_FOR_WHEEL` in `games/ember-rally/rig` is the mapping, and
  the steering angle is negated for the same reason. If you add anything drawn
  per corner, go through it.
- **Steady cornering has almost no lateral acceleration in the body frame.**
  `Fy/m − v·ω` is what the sideways *velocity* is doing, and in a settled
  corner the tyres are providing exactly the centripetal acceleration, so it is
  very nearly zero. Feeding it to the lateral load transfer meant a car at a
  full g transferred almost no weight — it leaned on turn-in, stood back up
  while still cornering hard, and `rollFront` had nothing to distribute. What a
  cornering car feels is `Fy/m`. The same mistake read 0.00 g at every speed in
  the understeer-gradient test and hid the gradient entirely.
- **Weight takes about a fifth of a second to arrive.** Load transfer computed
  straight from this instant's acceleration says the whole mass lands on the
  front tyres the moment you lift. It travels through springs. Left
  instantaneous, lifting off mid-corner turned the car nearly *six times*
  harder than staying flat and snapped it to forty-four degrees of slip — so
  the only two things you could do with a corner were plough into the outside
  of it or spin. One first-order lag is the difference between a car that
  rotates when you lift and one that throws you off.
- **Offer only as much steering lock as the tyres can use.** A cornering car at
  its limit is on a radius of `v²/μg`, and the angle that asks for is `L/R` plus
  the slip the tyres are running — at 38 m/s, about **two and a half degrees**.
  The racer offered *ten*. Four times more lock than was usable at any speed
  above about 20 m/s, so one touch of an arrow key put the front tyres four
  times past their peak slip angle instantly: they saturated, scrubbed, and the
  car washed wide. It reads as "the front tyres don't turn" *and* "it loses its
  balance and goes into the wall" — two complaints, one line. `maxSteer` in
  `games/ember-rally/physics` now derives the lock from the grip, so the two
  cannot drift apart again.
- **A car with no understeer gradient is not a car.** Stability is
  `K = W_f/C_f − W_r/C_r`: positive is understeer and self-correcting, negative
  is oversteer and divergently unstable above a critical speed. Give both axles
  the same cornering stiffness and make tyre force linear in load and `K` is
  *exactly zero* — balanced on a knife edge. That is what the four-wheel rewrite
  did, and every assist bolted on afterwards was hiding it. Two lines fixed it:
  the rear tyres are stiffer than the front, and peak force goes as `Fz^0.8`
  rather than `Fz` so load transfer costs real grip. `npm run rally` measures
  the gradient that comes out; keep it positive.
- **An assist that exists to hide an unstable car is a sign the car needs
  fixing.** There was a stability control here that steered *for* you whenever
  your input was near centre, a throttle cut that began at six degrees of slip,
  and a leash that clamped the car to sixteen. Each was reasonable on its own
  and together they meant every input you made was blended with one the game
  was making — which is what "the controls feel disconnected" actually is. They
  are gone. What is left is one honest traction control watching the rear
  wheels *spin*, and a countersteer assist that is named and stated.
- **The player needs a way to slow down.** The car drove itself forward at full
  power for a long time, on the argument that a forty-second race should be
  playable one-handed. It cost more than it bought: a driver who cannot lift
  cannot slow for a corner, so every corner had to be survivable flat out, and
  arranging that is what produced the assist stack above. Throttle and brake
  are real now, held at a stand the brake selects reverse, and the phone gets
  both from one thumb's vertical position.
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
- **A game you cannot put down is a game you can only play when nothing else is
  happening.** Escape used to fall through the racer to the garden's own key
  handling and walk you all the way out to the meadow, abandoning the run with
  no warning and no way back to it. Ember Rally now takes Escape in the
  *capture* phase and pauses: the world holds exactly where it is, and
  "leaving" means back to the Hollow's own fire rather than out into the grass.
  `ui/Places` also refuses to act on keys while `takenOverNow()` — the guard
  that stops it *drawing* over a game belongs on its keyboard too.
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

- **A meadow of one blade size cannot reach the treeline, and the attempt is
  what made the garden slow.** One instanced disc of grass has to choose: thin
  enough to cover the middle distance and you see the ground between the
  blades, dense enough to be turf and the budget runs out at twenty-six metres.
  It ran out at twenty-six metres, which drew a hard line across the garden
  with real grass in front of it and painted ground behind — everything past it
  was a lawn, and that is what the whole place was being judged on. `world/Grass`
  is **two layers** off one budget now: turf underfoot at thirty blades a square
  metre out to about eighteen, and *tussocks* — twice as tall, two and a half
  times as wide, at barely one a square metre — out to eighty. At forty metres a
  blade is a third of a pixel and a clump is four, so the far layer draws the
  clumps: it is what can actually be seen at that range, and it covers nine
  times the area for a fifth of the triangles. Two things make it a meadow
  rather than a field of spikes — the tussock's blades must be a *tight* clump
  (`clump`, and the first cut scattered them nearly two metres apart, which is
  seven separate blades standing a stride apart), and it needs fewer segments
  per blade, because a blade at seventy metres does not bend through an arc
  anybody can see.
- **Count the triangles before optimising anything. `npm run tris`.** The
  renderer says the garden is 1.7 million a frame, which is a number nobody can
  act on. Broken down, **sixty per cent of it was the treeline**: a hundred and
  fifty trees at *seven hundred leaf cards each*, standing seventy metres off
  with the fog already half way through them, where one leaf is three pixels
  across. `leafDetail` in `world/tree` takes a third of the cards and grows each
  one by one over the square root, so the leaf *area* — and therefore the crown
  and its silhouette — comes out exactly where it was. That is why it is a
  detail setting and not simply fewer leaves; fewer leaves is a balder tree and
  this is not. The wood's limbs went to five sides and lost their end caps at
  the same time, which is invisible (every segment begins inside something
  wider than the tip it grows from, so the caps have never once been on screen)
  and halves what the wood costs again. With the ground plane cut to the size
  the fog actually reaches, the frame went from 1.68 million triangles to 0.97
  — and the meadow now reaches three times further than it did.
- **A letter is given a height to hang at, not a length of thread.** The papers
  in the Tree of Thoughts hung a metre or so under whichever branch they were
  tied to, which is what a letter in a tree does — and since the crown of that
  tree begins seven metres up and is two thousand leaves thick, it meant every
  thought either of you had ever written was somewhere inside the foliage. You
  could not see them from the ground, you could not count them, and aiming a
  thumb at one was aiming at leaves. The one thing in the place you are meant to
  reach for was the one thing you could not find. `hangDrop` in
  `sections/tree/greatTree` gives each thought a height in the clear air under
  the crown and the thread is whatever reaches: six metres from a high limb, one
  from a low one. That difference is what makes them read as a curtain rather
  than as a shelf. **And the tap target has to move with the paper** — it was
  aimed at the knot, several metres above the thing being pointed at, so
  `paperCentre` is now the single answer to where a sheet is.
- **A hairline needs a floor in screen space.** The thread was two and a half
  centimetres of world, which at the twenty-seven metres the tree is read from
  is two thirds of one pixel: it flickered in and out as the tree moved and
  mostly was not there. Work out what a pixel is worth in metres at this depth
  (`projectionMatrix[1][1]` is `1/tan(fov/2)`, so it falls straight out) and
  never draw it thinner than about one and a half of them. The same trick a map
  draws a road with, and for the same reason. Anything else in this world that
  is genuinely thin — a wire, a crack, a rope — wants it too.
- **A clamp is not a wall.** Ember Rally ended with `if (car.s >= track.length)
  car.s = track.length`, and a car with its position pinned still has all of its
  speed. Every single run therefore ended the same way: fifty-eight metres of
  coast was less than half what the car needed to stop, so it arrived at the
  last ring of the tunnel doing thirty and *sat there* while the brake bled off
  against nothing — with its nose in the open end of the mesh. The sweep had no
  end cap, so what you looked at while your result came up was a black
  rectangle. Three separate things had to be true for that to be one bug, and
  all three are worth keeping: the road is long enough to stop in (measure it —
  `scripts/rally-check` drives the roll-in), the mesh is *closed* (`capEnd`
  carries the sweep on for six rings, shrinking toward a point, so the end is a
  rock apse lit and coloured like the rest of the tunnel rather than a disc
  glued over a hole), and the physics has a back wall that stops the car the
  same way the sides do — impact once, on the step contact begins.
- **An ending is a shape, and it has to be lit.** Closing the hole was the bug
  fix; it was not an ending. What the road ends in now is *composed*: a throat
  where the vault comes down, so the hall opens all at once rather than
  gradually; the finish line as two standing stones with fire on them that you
  go **between**; an avenue of braziers down both walls — the only evenly spaced
  lights on the whole road, because everywhere else a lantern is information
  about a corner and here there is nothing left to say; and at the end of it,
  on the centreline against the back wall, the fire you set off from. The car
  comes to rest six metres short of it. Half the work was the light: a hall lit
  only at ankle height is a lit floor under a black lid, so every other station
  is up the wall.
- **The door has to be a place.** `ui/Arrival` is the first thing either of you
  ever sees and it was a vertical gradient with a warm smudge low down and
  forty-six dots on it. Every part of that was the right *idea* — night above,
  her dawn below, which is what the Stars is built on — and none of it read,
  because a wash of colour is not somewhere you are standing however carefully
  it is graded. What fixed it was depth, in four layers and no canvas: a
  **horizon** (two ridges and a generated wood along the near one — one
  silhouette is the whole difference between a background and a landscape), the
  dawn moved to sit *behind* the hills where a sun would be, three sheets of
  cloud lit from underneath and crossing over two minutes, and a star field with
  half a dozen real stars in it. The colours are lifted straight out of
  `systems/palette` — `#070d16` is the garden's own zenith at midnight — so the
  door is a view of this world rather than a title card in front of it.
- **A control bound to one key is bound to one keyboard.** The ember could not
  be spent, and the reason was not in the game: it was on `alt`, and on a great
  many keyboards the right-hand alt is **AltGr**, which a browser reports as
  `AltGraph` and not as `Alt`. It never matched. Nothing on screen said
  anything except "alt for the ember", so the bar filled up and the button did
  nothing and there was no way to find out why. A bare alt is also the
  operating system's — on Windows it reaches for the menu bar, and a control
  that has to fight the window manager for every press will keep going wrong on
  machines nobody here has. `BOOST_KEYS` in `games/ember-rally/controls` is a
  *set* now — shift, E, alt and AltGr — and the hint teaches shift, because
  there is one under each hand and this game is played on the arrows by some
  people and on WASD by others. **Bind the second key when you bind the first.**
- **An idle that does not move is the worst sound a synthesised engine makes.**
  Standing still, `revs` and `throttle` are both exactly zero, so the racer's
  note came out at exactly 34 Hz, at exactly one gain, with exactly one
  modulation depth at exactly 17 Hz, held for as long as you sat there. Nothing
  makes that noise. It is a test tone, and a test tone is not boring after ten
  seconds — it is *irritating*, which is a much worse failure than dull. Two
  things fixed it, and neither is the note. **It hunts**: three slow wobbles at
  rates with no common multiple, moving the pitch, the level and the firing
  depth, so the pattern never comes round twice. And **an idle is mechanical,
  not tonal** — what you hear from outside a car at rest is the top end, so the
  body of the note drops by two thirds and a layer of jittered ticks carries it
  instead, at about eight a second rather than the honest thirteen, because at
  thirteen they run together into the burr this was trying to escape. In a cave
  each one comes back off the rock, so sitting on the line has a room in it.
  Measured rather than guessed: the steady top-end floor is **5.6 dB** lower and
  a tick now stands **9.3 dB** out of it where the old buzz managed 4.4 — the
  top end went from a wash to events. All of it is scaled by `idleness` and
  gone the instant there is throttle or revs, so the car being *driven* is
  untouched.
- **A meter you are not allowed to spend is worse than no meter.** The ember
  bar was all-or-nothing: it had to read full, pressing it spent the lot, and
  what came back was a flat one and a half seconds however much you were
  carrying. Both halves are the same mistake — they make the bar *a button that
  is sometimes available* rather than something you own. Carrying three
  quarters of a bar and being refused all of it is the worst state a resource
  can put a player in; and if a full bar and a nearly-full one buy exactly the
  same thing, there is never a reason to wait, which is the opposite of what a
  meter is for. It is a tank now: any amount is spendable, a full one burns for
  `BOOST_SECONDS`, and **the bar drains as it burns** because it *is* the boost
  rather than a gauge attached to one. Going into a drift stops the burn and
  keeps the remainder, so half-spending it into a corner is a decision. One
  consequence worth stating: a value that both fills and drains is ambiguous at
  rest, so the line has to say which way it is going — `.burning` goes white
  and stops breathing.
- **Weight is not in the physics. It is in the camera and in the overshoot.**
  The car had four wheels, load transfer with a fifth-of-a-second lag, a real
  understeer gradient and a friction circle, and it still felt like a cardboard
  box — because none of that can be *seen*. Two things were hiding it, and
  neither is a force:

  **The camera had no mass.** It sat at `car.s - back` with `back` a function
  of speed alone, so it accelerated precisely as hard as the car did, always,
  and the gap between you and the thing you are driving never changed by a
  centimetre. A rigid gap is the strongest possible signal that nothing weighs
  anything — it is how you film a model on a stick. `surge` in
  `games/ember-rally/camera` lags the real longitudinal g and moves the camera
  a metre and a half: the car pulls away under power and comes back at you
  under braking. It is worth more than any number in `physics.ts`.

  **The body was on a lag, not on springs.** `value += (target - value) * rate`
  creeps to its target, arrives and stops; it can *never* go past. So however
  hard you turned in, the shell tipped over smoothly and sat there. A real body
  is second order — it leans over, goes a little beyond where it will settle,
  and comes back — and that overshoot is the whole cue that there is a mass up
  there being thrown about. `BODY_ROLL` and friends are stated as a frequency
  and a damping ratio, because those are the two things that mean something:
  about one and a half hertz is a car, four is a go-kart, and a ζ under one is
  what lets it overshoot at all.

  Two smaller ones in the same family: the road is keyed off **distance**, not
  time, so bumps live at a place — the frequency rises with speed for free and
  the front axle hits them before the rear does; and the camera never stops
  trembling above about half speed, because nothing on stone is ever that
  still.

  **All of it is visual.** Roll, pitch, heave and travel are read by `rig.ts`
  and by nothing else, so `npm run rally` prints lap times identical to the
  digit before and after. That is the check: if a "feel" change moves a lap
  time, it was not a feel change.
- **A terminal velocity you never reach reads as no top speed at all.** Drag
  goes as the square of speed, so a car whose limit is a long way off spends
  the *whole* straight still accelerating — you hold the throttle and the
  number keeps climbing, and you arrive at the corner carrying a speed you
  never chose. "It feels like it doesn't have a maximum" is exactly what that
  is, and no amount of grip in the tyre model is the fix. `DRAG` in
  `games/ember-rally/physics` is where a top speed actually lives; more than
  twice what it was brings the car from a hundred and sixty-seven kilometres an
  hour to a hundred and thirty-one **and** — the part that matters — makes it
  get there in the first third of a straight and sit on it. The spirit's lap
  times barely moved and it hits the walls less, which is the whole argument in
  one measurement: the road did not get slower, the car got controllable.
  `TOP_SPEED` is not a limit, it is *what the car does* — half the game
  normalises against it, so measure it and write the answer down.
- **A backstop you can feel is not a backstop.** `SPEED_CEILING` sits well
  above what the car reaches on the ember, because a velocity clamp that gets
  met is a wall — and the moment a player can feel it, drag has stopped being
  the thing that decides a straight. If the boost is running into it, the boost
  is wrong, not the ceiling.
- **A test harness that hangs is worse than one that fails.** `rally-check` had
  nine bare `while (speedOf(car) < 42)` spin-up loops, which are fine right up
  until the day the top speed is lowered past one of them — and then the check
  does not report anything, it just never returns: no output, no error, and no
  clue which of the nine it is sitting in. `windUpTo` gives up after a bounded
  number of steps and throws with the number it actually reached. Any loop in a
  harness that waits for the thing under test to do something needs the same.
- **A meter you are not allowed to spend is worse than no meter, and a fixed
  payout makes the meter pointless.** Covered under the ember above; the same
  shape will turn up again the next time anything in this garden accumulates.
- **Talking is not somewhere you go.** This is the *Grove* argument, and it
  applies to the conversation for exactly the reason it applied to music. Seven
  timezones apart, the moments you are both awake are a sliver — so if the only
  way to answer her is to leave what you are doing, browse to the Stars and
  enter it, then the answer is "later", every time. `ui/Whisper` folds the last
  four things said and one line to write on into the bottom-left corner of
  every screen, mirroring the Player in the bottom-right. It is deliberately
  *small*: enough to answer with, not enough to read a year of, because a
  bigger one would make the Stars pointless. And it stays up during a game,
  which is the entire point — she says something while you are three guesses
  into a word duel, and a chat that hides exactly when you are busy is a chat
  you cannot use.
- **An overlay that owns a corner has to say so.** The corner conversation does
  not fill the screen, so it looked like it did not belong in
  `systems/attention` — but the bottom left is *also* where the name of the
  place and the way into it live, and two of those in one corner is neither of
  them. It is also the only overlay you type into while the world is still
  browsable: without registering, the arrow keys in "how are you" walk you from
  the Tree to the Stars while you write it.
- **The message is the control.** The first cut of replying and hearting put a
  heart and the words "answer this" under *every* line, which is how you would
  build it if you had never used a chat: two controls per message, permanently,
  in a place whose entire design is words hanging in a sky with nothing else in
  them — and a conversation of forty messages had eighty buttons in it. Every
  chat anybody actually uses solves this the same way, and it is worth knowing
  why it works: there is nothing to draw, nothing to lay out, nothing to hide on
  a small screen, and no decision about which line gets the buttons.
  **Right-click** for a two-item menu, **double-click or double-tap** for a
  heart, **swipe a line left** to answer it. The two touch gestures are what a
  phone has instead of a right button and they are the two everybody already
  knows, so nothing has to be discovered by reading a label. What stays visible
  is *state* — a heart that has been left — and never a control. See `ui/Said`.
- **The swipe writes `translate`, not `transform`.** The Stars writes a
  transform into every line every frame; a transform from a gesture would be
  gone by the next tick. This is the same rule as the drift-in animation and
  the same reason.
- **A menu takes its key in the capture phase.** Escape in the Stars means
  "leave the place" to `ui/Places`, so dismissing a two-item menu also walked
  you out of the conversation and into the meadow — exactly the bug Ember
  Rally's pause had, fixed the same way. A key belongs to the topmost thing
  that wants it.
- **A shell must not name another game's mechanic — including the ordinary
  one.** `live` fixed the live round; `invite` fixes the async one, which is
  the one that will actually get used. "vs {her name}" is true of a duel and
  says nothing about what pressing it *does*: Word Duel leaves her a word to
  come back to, the racer puts a line down the Rootway for her to chase, and
  those are the things somebody is choosing between.
- **A reaction should change the world, not count.** A heart on a message
  everywhere else is a small grey number underneath it. Here it changes the
  *sky*: the light for that message burns bigger, warmer, brighter and breathes
  more slowly, and goes on doing it for as long as the conversation exists — so
  walking back through a year of it, the nights that mattered are the bright
  ones. It is pulled toward ember rather than replaced by it, because whose
  message it was is still the first thing the colour has to say. One heart each
  and no picker: there are two people here forever, so a reaction is a yes or
  it is nothing, and six alternatives would be six ways of saying something
  weaker than the one they replaced.
- **A quote is an id, never a copy.** A reply stores the id of what it answers
  and resolves it against the same list it is drawn from, so a quote can never
  show words that are not in the conversation, and a conversation that runs for
  years never accumulates two versions of anything. The message may be older
  than the loaded window, and then there is nothing to quote — which the reply
  *says*, rather than rendering blank and looking broken.
- **Games were being chosen from a paragraph.** The Hollow listed each one as a
  title, two lines and three words in small capitals, which is a settings
  screen: nothing about it looked like a thing you play, and with two games in
  the row there was no way to tell them apart at a glance because both were a
  block of text in the same face at the same size in the same place. Each game
  now draws itself — `Emblem` on `GameDefinition` — out of *its own parts*, not
  a screenshot and not an icon: Word Duel is five stones with a word half
  worked out on them because its board is stones, and the Rootway is two pairs
  of headlamps in the dark because that is the whole picture of the race. Both
  are gradients, so they are sharp at any size and cannot go stale. And the
  shell stopped naming other people's mechanics: `live` on the definition is
  what a game calls its own live round, because "time challenge" was Word
  Duel's clock and the racer inherited a label for a clock it does not have.
- **Three layers of grass, not two, and the mistake was instructive.** Turf out
  to eighteen metres and tussocks beyond it left a *gap in kind* — a continuous
  surface next to a scatter of separate clumps at one a square metre, with
  nothing in between — so the middle distance, which is where the horizon and
  the landmarks are, came out as polka dots on bare ground. Reaching further
  had cost evenness, which is the wrong trade: an even field that stops is
  better than a patchy one that does not. What closes it is a layer whose
  *density* steps down rather than one that changes character, and it came out
  cheaper than the two it replaced.
- **A round document is a seal, so a blind round is four of them.** The rules
  withhold the *opening* move of a round — seq 0 — until yours exists, and
  everything after it is open, because a turn-based game where you cannot see
  her turn is not a game. Scattergories is the opposite shape: all four sheets
  have to be blind, or whoever plays second reads the first list and writes
  around it, which is not a harder round, it is a much worse game. Four sheets
  at seq 0..3 would leave three of the four readable. So each round of a match
  is *its own round document* — `scattergories:2026-08-24` and then `-r2`,
  `-r3`, `-r4` — and every sheet is the seq 0 of one of them. The existing seal
  covers all four and `firestore.rules` was not touched. When a game needs a
  guarantee the rules do not offer, check whether it needs a different *shape*
  before it needs a different rule.
- **Duplicate cancellation is the game, so it cannot be a dictionary.** Two
  people, forever, and no leaderboard: what makes a Scattergories answer good
  here is not that a word list allows it, it is that *she did not also think of
  it*. So there is no dictionary and nothing is ever rejected for not being a
  word — `rules.same()` decides only whether two answers are the same answer,
  by case, punctuation, leading articles and a plural fold, and everything else
  is settled by the two of you with `Strike`. A dictionary would have added a
  way to be told no by a computer, which this world does not have anywhere
  else.
- **`clip-path` cuts the outline off too.** The hourglass bowls are tapered
  with `clip-path`, and their `inset 0 0 0 1px` ring follows the element's
  *box* — so the clip removed both diagonals and the empty bowl had no sides at
  all, which is why a full glass read as an orange funnel with a stem.
  `drop-shadow` traces the alpha shape instead. Any time a clipped element
  needs an edge, the shadow has to be an outer one.
- **`.glass i` (0,1,1) beats `.glass-thread` (0,1,0).** A tag in the selector
  outranks a bare class, so `left: 0; right: 0` on the shared rule won over
  `left: 50%` on the specific one and the falling sand was drawn hanging off
  the left edge of the glass. The third time this exact trap has been hit here
  — `.threshold > button` over `.to-waiting`, `.waiting` colliding with
  `.whisper-fold.waiting` — so: **a shared rule that positions its children
  must be scoped as tightly as the rules that override it**, or measure the
  child's box and see, because it renders without error and looks like an
  animation glitch.
- **The corner was anchored to something that hides.** On a phone the music and
  the conversation dock at `top: 7.2rem`, measured off the two of you and the
  clocks — but `ui/Overlay` hides that block both when the screen is taken and
  when you are inside a place, and the corner did not know about either. It
  had been hanging in mid-air in every place and over the middle of the board
  in every game since the day it was written, and nothing caught it because
  every screenshot of it had been taken at 1280 wide. `.corner.clear` puts it
  on the top edge when the top is free and `.only` when the way back out has
  gone too. **Any fixed offset measured off another element's height is a bug
  waiting for that element to be conditional** — and the phone is where it
  shows.
- **A countdown is not per-frame motion, even though it looks like one.** The
  hourglass counted down on `requestAnimationFrame` and set React state every
  frame, which re-rendered twelve inputs, twelve notches and the whole sheet
  sixty times a second — on the one screen in the game where somebody is
  typing. It bought nothing: the sand crosses the glass in three minutes, so a
  frame of it is a fifth of a pixel, and the only other reader shows whole
  seconds. The frame loop stays, because that is what keeps the arithmetic
  honest across a stall; the *publishing* is throttled to the second it
  displays. **Ask what the smallest visible change is before deciding how often
  to say something changed** — measured with a MutationObserver on the clock:
  360 updates in six seconds became 6.
- **A spacing constant is a resolution assumption.** Every line in the Stars was
  lifted by `age * 74` — about one line of serif and a timestamp, which is true
  on a laptop, where almost everything either of you says fits on one line, and
  false on a phone, where the column is 78% of 390px and the same sentence
  takes three. Two people's messages printed straight through each other on the
  primary surface. `ladder()` in `ui/Talking` measures the laid-out lines and
  spaces them centre to centre — centres, because the per-frame `scale()` is
  about each element's own middle and so cannot move them — and a
  `ResizeObserver` re-measures when the phone turns or a font lands late.
  `offsetHeight` is layout and ignores transforms, so it can be read while the
  sky is moving. **Anything that positions text by a number of pixels per item
  is wrong the moment the item wraps.**
- **A billboard needs a falloff, and a lattice needs a jitter.** The Stars had
  both bugs at once and both read as rendering faults. The dome lit a whole
  hash *cell* per star, so every star was a seven-pixel grey square; and the
  motes were seeded by `(i * 2654435761) % 1000`, a linear congruence with no
  mixing, so ninety of them came out as two or three neat diagonal lines
  drifting across the sky. A star sits at its own point inside its cell and
  falls off from there; a mote is a radial speck and is seeded by a hash. Look
  at any full-screen render of a particle field before believing it is a field.
- **The Hollow could not answer the question it exists to answer.** The note at
  the top of `Round` has said it from the beginning: in an asynchronous game
  the good feeling is not winning, it is *opening the Hollow and seeing that
  she has been*. But finding that out meant opening each game, waiting for its
  round to load, and reading whatever briefing it happened to show — one game
  at a time. With two games that is tedious; with the five the plan is heading
  for it is the reason nobody would check. **What is waiting** is one line per
  game, all of them at once, set apart under the row behind a hairline —
  because it is not a game and must not read as one, and a card in the row
  would be a thing you cannot play sitting between two you can.
- **Every state a challenge list shows has to be one you are allowed to know**,
  and that is the whole design of it. Her opening move is sealed until yours
  exists, so before you have played, "has she been?" genuinely has no answer on
  your device — `watchRound` reports an empty move list, which is correct and
  is **not** the same as "she has not played". Hence the four states in
  `useStandings`, and hence their wording: *your move* is used where you have
  not played, because it is true whether or not she has; *waiting for her* only
  once your own move has lifted the seal; *she has been* only when both are
  actually there. Verified by seeding a round where she has played and you have
  not — the list says "your move", and cannot say anything else.
- **Looking must not create.** `useStandings` deliberately does not call
  `openRound`, which `useRound` does. Otherwise every glance at the list would
  write a round document for a game nobody played, and "nothing opened today"
  would become a state that could never be seen twice.
- **The way in carries the answer.** The point of the feature is not having to
  open anything, so the label says *"1 for you"* or *"she has been"* underneath
  itself and the list is only for finding out *which*. That means the watchers
  belong to the Hollow rather than to the rows — which is also why there is one
  hook for all the games instead of one per game.

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
Always shoot desktop **and** 390×844, at more than one hour of day. The corner
bug above is exactly what skipping the phone hides: it was in every place and
every game, and every screenshot that would have shown it had been taken at
1280 wide.

**Anything the app writes every frame cannot be posed from the console.** The
hourglass is written straight to the node's style each tick, so setting
`style.transform` to look at it half-drained is overwritten before the shutter
opens — and a `setInterval` fighting it only races. Inject a stylesheet rule
with `!important` instead: it beats an inline non-important style, and it holds
still. Same for the ember bar and the speedometer.

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

`?shot=1` also publishes what the car is doing to `window.__rally`, once a
frame. The headless harness answers every question about the *model* but none
about the wiring — whether a key reaches the tyres runs through the browser's
events, the controls, the frame loop and the session, none of which exist in
Node — and the renderer is far too slow here to watch the answer. Without it
the only available check was "no exception was thrown", which is not a check.
It found a real bug within a minute of existing: the car could not reverse
while scraping the rock, which is exactly when you want to.

Nor does counting the cost: `npm run tris` prints what each part of the garden
spends in triangles, which is the only useful form of "is it slow". The renderer
will tell you the frame is a million and a half; it will not tell you that
sixty per cent of that is leaves on trees nobody can see.

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
- [x] **The meadow reaches the treeline, and the garden got faster doing it.**
      Grass in two layers off one budget — turf underfoot, tussocks out to
      eighty metres — so the bald mid-field is gone; `leafDetail` on the
      treeline and a ground plane sized to the fog it actually reaches. The
      frame went from 1.68 million triangles to 0.97 while the grass tripled
      its range. `npm run tris` says where the rest of it goes
- [x] **The way in is a place.** Horizon, wood, cloud and a real star field,
      with her dawn coming up behind the hills in the world's own colours
- [x] **The thoughts hang where you can see them.** Long threads from the real
      branches down into the clear air under the crown, a thread with a floor
      in screen space so it never dissolves, and the tap target moved onto the
      paper rather than the knot
- [x] **The Rootway ends somewhere.** A throat, a hall, a finish between two
      lit stones, an avenue of braziers and the fire on the centreline against
      a closed rock wall — plus the three separate bugs that made every run
      finish parked in a hole in the mesh
- [x] **The Rootway has a top speed you can feel**, and a speedometer that
      says what it is — the third and last exception to "no interface". Plus a
      restart in the pause menu, and each game naming its own live round
      instead of inheriting Word Duel's clock
- [x] **The Hollow's games are chosen from objects, not paragraphs.** Each game
      draws its own emblem out of its own parts — `Emblem` on GameDefinition
- [x] **The Stars, upgraded.** Reply to any line with the quote above it, a
      heart that changes the light in the sky rather than counting, a tone for
      something sent and something arriving, real system notifications with an
      honest setting, and the two rendering faults in the sky itself — square
      stars and motes in diagonal lines — found and fixed
- [x] **The conversation reaches everywhere**, folded into the bottom-left
      corner opposite the music
- [x] **What is waiting.** One line per game, all at once, set apart under the
      Hollow's row — the first thing in the garden that can answer "has she
      been?" without opening anything. Read-only, and every state in it is one
      the seal actually permits
- [x] **Scattergories, the third game.** One letter, twelve categories, three
      minutes, four rounds. A tumbling die and a running glass instead of a
      clock and a bar; 206 categories in nine groups and the real twenty-sided
      die's faces; duplicate cancellation, alliteration bonus and challenges,
      with no dictionary anywhere. Sealed by giving each round its own round
      document, so every sheet is a seq 0 and `firestore.rules` did not change.
      Three ways in — *roll for her*, on your own, roll together
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

- **Two things from the Scattergories brief are not built, deliberately.**
  *Progress sparks in the live round* — seeing how many lines she has filled
  while you both write — needs a per-round presence field that both of you
  write to during play, which is a `firestore.rules` change and a second write
  path, and it would be the first thing in the world that leaks *something*
  about her answers before the reveal. It wants its own decision, not a
  side-effect of building the game. And *the explanation round-trip* — she
  writes why her answer fits, and only then do you decide — needs a challenge
  to survive a device going away and come back, which is a third move kind and
  a state machine across two sessions. What is built is the honest half: a
  challenge is one long press, she sees it, and it counts for that round only.
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
