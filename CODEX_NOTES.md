# Codex notes between us

This is Codex's side of the hand-off log. Claude can read it before touching the
same area; I read `NOTES.md` before beginning work. Entries record finished work,
shared-file changes, measurements, and anything another agent should preserve.

## 28 August 2026 - Codex - Rootwake lane tightened

- Reduced only Rootwake's generated half-width from 4.05 m to 3.70 m, taking
  its narrowest full deck from 8.1 m to 7.4 m. The ordinary Rootway, fork
  separation, centreline, timing, handling and shortcut advantage are unchanged.
- Reduced signature-corner relief from at most 0.82 m to 0.70 m per side, so the
  hard S and blind reverse do not swell back toward ordinary-cave proportions.
  Rendering and collision still consume the same width samples.
- Across seeds 1, 42 and 90210, mastered advantage remains 9.0-10.5 s, the main
  spirit stays on Rootway, and the shortcut precision run records only 0.0-0.1 s
  wall contact. Rally checks, typecheck, all 102 shaders and production build pass.

## 28 August 2026 - Codex - Moonbreak and Stormcrown audible-mix correction

- Corrected a real mix failure rather than adding another nominal sound layer.
  Live browser metering showed Stormcrown's environment at 0.016 RMS against a
  0.113 RMS engine (about 17 dB under it), while Moonbreak's open surface was
  only 0.013-0.025 RMS against a 0.058-0.108 RMS engine. Both systems existed,
  but normal driving buried them.
- Stormcrown's visible rain now remains audible through every altitude district.
  It has a continuous body plus irregular car/glass impacts; wind, cloud wash,
  cedar, exposed-air buffet, waterfalls and spray were brought into the same
  foreground world as the engine. Lightning keeps an immediate electrical tear,
  a delayed direct thunder body and a separate mountain return.
- Moonbreak now has readable open-water movement above the surface, causeway
  wind and spray, individual water slaps, orchard/reed texture, and stronger arch
  passes. The dive, submerged flow and pressure, tube ribs and stress creaks,
  creature pressure and resurfacing release now form one continuous transition.
- Added development-only Web Audio analysers to the engine and both environment
  voices. They publish RMS/peak and authored-state telemetry under
  `globalThis.__rallySound`, making future mix regressions measurable instead of
  subjective. They do not drive gameplay or render state.
- Added a fast final limiter at the shared ambience output. Individual voices
  already protect themselves; this catches only the combined engine plus close
  rain/thunder/plunge peaks that could otherwise crack a laptop speaker.
- Final live readings: Stormcrown weather ranged about 0.033-0.081 RMS against
  0.066-0.094 RMS engine. Moonbreak measured 0.054 against 0.103 on the open
  road and 0.067 against 0.064 through the dive transition. Browser console and
  Vite overlay were clean. Typecheck, all 102 shaders, rally simulation and the
  production build pass.

## 28 August 2026 - Codex - Stormcrown environmental soundscape

- Added a fully synthesized Stormcrown voice and an allocation-free frame bridge.
  It uses the same shared `AudioContext`, noise buffer and speaker-safe output as
  the car and the other roads; there are no samples or new network assets.
- Rainwood is close: two-band rain on the car/road, wet speed spray and cedar
  boughs. Gale Bend and the exposed shelf add cross-car wind and irregular low
  buffeting. Inside cloud, distant detail collapses into a middle-heavy moving
  wash and restrained pressure mode instead of becoming a cave.
- Thunder Stair keeps the cloud/mountain return while all three hairpins remain
  readable from the engine. The eye changes the weather's colour rather than
  silencing it: thin high air and the distant storm floor rise in the balance,
  but rain remains because rain particles remain visibly around the car.
- Stormfall restores rain and exposed wind as altitude falls. Its three visual
  waterfalls now have approach-shaped low roar and spray, panned to the actual
  authored side of each ribbon. Low cedar texture returns on the last run home.
- Each visible lightning stroke gets a short electrical tear, but repeated
  strokes within one channel share a single delayed thunder body. Direct low
  impact arrives first, followed by an asymmetric 2.75-second mountain return;
  thunder above the cloud is later and more remote. The twelve old rods produce
  brief speed-shaped air/metal passes and can take a little charge from a stroke.
- `weather.ts` now publishes the real car `s` and speed alongside cloud/altitude/
  flash. `StormcrownSound.tsx` reads those values without React state, detects
  authored districts/events, ducks ready/pause/finish, rejects restart teleports,
  and fades/stops every node on unmount.
- Validation: typecheck, rally simulation (4.79 km, 178.9 s spirit pace), the
  102-shader/169-file sweep, production build and a live 77 km/h Stormcrown run
  with pause/resume pass. Browser errors and overlays: none. Existing Three.js
  Clock deprecation and the large Firebase/events chunk warning are unchanged.

## 28 August 2026 - Codex - Moonbreak environmental soundscape

- Added a fully synthesized Moonbreak world voice with no downloaded samples
  and no second `AudioContext`. `ambience.synthesisBus()` exposes the existing
  speaker-safe graph and shared noise buffer to both road soundscapes.
- The open causeway now has speed-shaped crosswind, distant water and wet-edge
  spray. Orchard branches and the resurfaced reeds use separate close textures;
  broken arches produce paced overhead compression/stone/glass events.
- The Drowned Mile has a staged plunge, underwater flow and pressure, tube-rib
  speed markers, glass/structure resonance, a distinct resurfacing release, and
  a low pressure swell synchronized to `Deepwater`'s 21-second large-creature
  crossing. It is environmental tension, not a monster call or extra music.
- `MoonbreakSound.tsx` reads the race's existing per-frame `deep` truth and
  infers road speed without React updates. Mutable frame state and a memoized
  arch list avoid sixty allocations a second. Pause/ready/finished states duck;
  restarts cannot trigger a fake gust, dive or resurfacing event; unmount fades
  and destroys every continuous node.
- Fixed an older runtime-only `Deepwater` GLSL failure: `${FOGGED}` had been
  interpolated in the middle of a `//` comment, injecting uncommented prose into
  the compiled swimmer shader. The source-level shader sweep could not see it.
- Validation: typecheck, rally simulation, 102-shader/167-file sweep, production
  build, and a live Moonbreak run to 107 km/h with pause/resume and no browser
  errors. The existing large Firebase/events chunk warning is unchanged.

## 27 August 2026 - Codex - Ember Rally contact, nitro and exhaust feedback

- Loose ground is now detected per contact patch for visuals. One tyre crossing
  the Rootway's stone edge starts throwing warm earth immediately; all four
  build separate clod-and-dust wakes once the whole car is on the verge. The
  handling threshold remains unchanged.
- Nitro's twin physical exhaust columns are wider and roughly four metres long,
  with a white-hot core, a 24-particle ignition pressure front, continuous
  pipe-rooted flame, a stronger camera catch and a substantially louder air/
  turbo layer. The complete car still passes through the speaker safety chain.
- The silencers now read the live countdown pedal rather than the physics
  throttle, which is intentionally locked at zero before the green. They glow
  under pre-start load and emit short twin exhaust pulses while revving and
  pulling away; the haze retires at road speed and never competes with nitro.
- Validation: typecheck, `npm run rally`, the 102-shader sweep, production
  build, and a live browser error/overlay check pass. The existing large-chunk
  build warning is unchanged.

## 27 August 2026 - Codex - Rootwake entrance rebuilt as a real two-way fork

- Removed the added lintel, jambs and rubble mouth. The broken entrance was two
  complete swept cave shells beginning on the same centreline, plus route
  culling that hid the unchosen road only 5 m into a much longer junction.
- Rootwake now peels right with a restrained entrance offset while the ordinary
  Rootway remains untouched and continues left. The common chamber supplies the
  early floor; the shortcut draws only a warm outer half-shell during the fork
  and closes into a complete tunnel after the roads are 12.4-21.0 m apart.
- Both route meshes remain visible until 18 m beyond physical separation. The
  three mouth lights now trace the choice: one shared marker and two positioned
  on Rootwake's actual centreline. No veil, breakable barrier, or hanging roof
  remains.
- Route commitment preserves the car's world-space position and heading when
  moving from the shared main-road frame to the independent shortcut frame.
- Added fork-separation reporting to `npm run rally`. Seeds 1, 42 and 90210 keep
  8.1 m of deck, 26-39 m signature corner radii, zero/near-zero wall time, and
  9.0-10.5 s mastered advantage. A live straight ride stayed on the main road;
  a Rootwake ride entered the branch and completed the race.
- Validation: typecheck, rally checks, shader sweep, production build and live
  browser screenshots pass with no Vite overlay. Preserve `separateAt`, the
  full-junction visibility window, and route-aware lantern placement.

## 26 August 2026 · Codex · in progress — Ember Rally's third road

- Working name: **The Stormcrown**.
- Design contract: the longest and most demanding authored course; a rain-dark
  cedar ascent, a road above the cloud, the three-hairpin Thunder Stair, the
  narrow Crown's Edge, and a waterfall descent home.
- Difficulty must come from readable road shape, braking landmarks, width,
  elevation, and wetness—never surprise obstacles on the driving line.
- Shared files expected to change: the rally model, track sampler, race stage,
  course picker/CSS, rally checks, and rally README. The new environment lives
  in its own `Stormcrown.tsx` file.
- I will replace this in-progress note with measured length, pace, geometry cost,
  and verification results when the road is finished.

## 26 August 2026 - Codex - Rootwake rebuilt as an independent tunnel

- Replaced the old side-by-side ledge shortcut. Rootwake now has independent
  sampled world coordinates, heading, curvature, width, banking, grade, tunnel
  shell, collisions, camera placement and physical distance metric.
- It appears about 20-25 seconds into Rootway, descends more than 30 m behind
  solid rock, and rejoins around 285 m (roughly ten seconds) before the finish.
  Only three amber mouth markers are lit; the tunnel beyond is headlight-only.
- Recordings now store the selected route. Ghosts, replays, tyre trails, vehicle
  rig placement and geometry chunk culling all use that recorded route.
- Removed the old falling/recovery state. Rootwake is a closed road with real
  walls; a correctly placed car cannot be declared to have fallen through it.
- Measured over seeds 1, 42 and 90210: 1.096-1.136 km hidden centreline, 8.1 m
  narrowest deck, hard corner radii 33-55 m, blind very-hard radii 26-39 m,
  mouth at 20.3-25.1 s, and 9.6-11.2 s saved at equal mastered pace.
- Validation: `tsc -b --noEmit`, `npm run rally`, `npm run shaders`, and
  `npm run build` pass. Browser ride-through reached the hidden route and
  rejoined normally with no wall contact or runtime errors.
- Main shared files: `track.ts`, `geometry.ts`, `physics.ts`, `spirit.ts`,
  `model.ts`, `Race.tsx`, `camera.ts`, `rig.ts`, `scripts/rally-check.ts`, and
  the Ember Rally README. Preserve the route bit and `roadAtRoute` calls when
  changing recordings, cameras, or car placement.

## 26 August 2026 - Codex - Rootwake concealed entrance

- Replaced the exposed entrance-shell intersection with a one-use natural veil
  18 m into the branch: thin curved roots, an off-centre spider web and caught
  leaves. It is visual only and never changes speed or collision state.
- Crossing it hides the static veil, throws 58 bark/leaf/web fragments forward,
  adds a restrained camera shove, and calls the new dry `EngineVoice.brush()`
  effect rather than the stone impact voice.
- The entrance's simultaneous main/branch geometry window was reduced from
  about 100 m to 24 m. At the exit the original broader physical merge remains,
  with the destination tunnel made visible early enough to prevent a black gap.
- Added repeatable `?veil=hold` and `?veil=exit` inspection positions alongside
  the existing `?rally=ride&shortcut=1` route check.
- Verified the entrance before impact, a complete breakthrough and finish, and
  the exit merge in the browser. The complete run ended with `veilBroken=true`,
  `shortcut=false`, zero strikes and no wall contact. Typecheck, rally, shader
  sweep and production build all pass.

## 26 August 2026 - Codex - Rally pause keyboard navigation

- Moved the pause overlay's `back to it`, `from the top`, and `leave the road`
  choices onto the Rally's shared arrow-and-Enter action system.
- Up/down and left/right now wrap through all three choices, the active choice
  receives the existing visible selection treatment, mouse focus stays in sync,
  and Enter confirms it. Escape still resumes immediately.
- Live browser checks confirmed resume, restart (speed reset near zero), and
  return-to-menu. Browser errors were empty; typecheck and production build pass.

## 26 August 2026 - Codex - Tree interaction area cleared

- Removed the ornamental `one thought, one flower` line and shortened the
  permanent turn instruction.
- Moved the Tree's writing, question, archive, and turn controls out of the
  centre projection into a narrow lower-left ritual rail above the place name.
  This is scoped to the Tree; other section thresholds retain their layouts.
- Added a compact phone treatment. At both 1837x872 and 390x844, the tree and
  its lower buds remain central while the controls stay against the edge.
- Browser hit-layer checks confirmed representative letter/bud coordinates now
  resolve to the 3D `surface`, not the threshold overlay. Browser errors were
  empty and the production build passes.

## 26 August 2026 - Codex - Mobile garden and Tree composition

- Rebuilt the narrow-screen browsing header as three non-overlapping bands:
  garden identity, compact shared presence, then one music/messages utility
  shelf. `Warm (you)` can no longer print through the garden title.
- The folded conversation no longer lays the newest message across the world on
  phones. It shows `messages` or an unread count, while its full accessible
  label still names the sender and unread total; opening it preserves the full
  conversation.
- Tightened the mobile place invitation into a bottom composition with a soft
  ground vignette, restrained type, and a 44px enter target. The five visible
  dots stay small but each now has a measured 44x44 tap target.
- Inside the Tree, the 44px back control and utility shelf have a 6px minimum
  measured gap at 390px width. The tree threshold stays at the lower edge and a
  centre hit-layer sample still resolves to the 3D surface.
- Verified at 504x894 and 390x844, including the expanded message composer.
  Browser errors were empty and the production build passes.

## 26 August 2026 - Codex - Garden header simplified and Wellspring aligned

- Removed the garden name/subtitle from `Places` entirely. The name remains on
  the arrival page, but no longer repeats after entering the browsable world on
  either desktop or mobile.
- Presence now shows the profile names without a visible `(you)`. The current
  profile name uses its own warm/cool colour, and the existing spark plus away
  opacity continue to communicate live presence. Screen readers still receive
  `name, you, online/away` on the editable profile button.
- With branding gone, the mobile presence row moved to the top edge and the
  compact messages/music shelf moved to 60px, reducing persistent top UI to
  98px at 504px width.
- The entered Wellspring threshold is now a lower-left mobile ritual rail like
  the Tree: measured x=16px, width=288px at both tested sizes, with the central
  river still resolving to the 3D surface.
- Verified mobile at 504x894 and 390x844 and the title-free desktop at 1365x768.
  React review found no new state/effects or duplicate markup; browser errors
  were empty and the production build passes.

## 26 August 2026 - Codex - Hollow mobile composition rebuilt

- Reworked the closed game takeover utility UI into the same single-line
  messages/music shelf used elsewhere. Full latest-message text no longer lies
  over Word Duel or Ember Rally, while both controls remain available and can
  still expand.
- Rebuilt the Hollow selector for one deliberate mobile decision: one compact
  game page, 44px previous/next and page targets, a single status line, and no
  repeated next-game or keyboard furniture on touch-sized screens.
- Compacted the chosen-game view so the emblem, identity, description and all
  play modes fit together without the former blank middle of the screen.
- Reflowed Word Duel as one instrument instead of a board floating above a
  floor-pinned keyboard. The board, 44px-height letter targets, feedback and
  actions remain together at both 482x850 and 375x667.
- Changed Ember Rally's phone course picker from three vertically stacked roads
  into a native horizontal snap horizon. Dots, arrows and swipe keep the visible
  road in sync; Enter opens the selected road. All three road cards and the way
  back fit inside one short-phone viewport.
- Shared files changed for this pass: `src/styles.css` and
  `src/world/games/ember-rally/EmberRally.tsx`. Desktop rules and game logic were
  intentionally left intact.
- Browser-checked selector, mode choice, Word Duel, all three Rally roads and
  Rally ArrowRight/Enter at 482x850 and 375x667. Browser errors were empty,
  `git diff --check` is clean apart from existing line-ending notices, and the
  production build passes with only the established Firebase chunk warning.

## 26 August 2026 - Codex - Stars mobile conversation lane

- Rebuilt the phone Stars around a protected reading lane. `Talking` measures
  the actual back/music controls above and the writing/voice controls below;
  each drifting message now fades before any part of its laid-out height enters
  either control zone. Safe areas, long wrapped messages, player expansion and
  composer height therefore do not rely on guessed pixel offsets.
- Moved the newest-message origin slightly upward on phones and widened the
  usable conversation column without changing the desktop sky or the 3D
  message-light field.
- Joined `say something` and voice-lights into one bottom speaking rail. The
  voice entry is now a restrained three-point constellation instead of a large
  glowing orb floating beside whichever message happened to be there.
- Opening voice-lights now creates a full-width lower Stars drawer. It dims the
  conversation, removes the writing invitation, disables the sky-comet hit
  layers behind it, and gives close/slot controls phone-sized targets. Opening
  the text composer similarly removes the voice entry and carries the writing
  field on its own low light pool.
- Shared files changed: `src/ui/Talking.tsx` and `src/styles.css`. The per-frame
  lane uses cached message heights and control geometry, so it adds no React
  frame updates and no per-message layout reads during animation.
- Browser-checked closed conversation, composer and voice drawer at 450x892 and
  375x667. Interactive snapshots retained accessible labels for writing,
  recording slots and closing. Browser errors were empty and the production
  build passes with only the established bundle warning.

## 26 August 2026 - Codex - Voice-lights are desktop-only

- Supersedes the mobile voice-light drawer work above at the owner's request.
  At 544px and below the beacon, drawer, accessible comet hit areas and all
  voice-light UI are absent; the text composer takes the full lower width.
- The 3D `VoiceComets` mesh is also invisible on mobile and skips its per-frame
  pulse/projection work there. The two permanent warm/cool Stars lights remain;
  they are part of the place, not recordings.
- Desktop is unchanged and still exposes the full voice-light experience.
  Verified at 375x667 (no voice-light controls in the interactive tree) and
  1200x800 (voice-lights present). Browser errors were empty and build passes.

## 28 August 2026 - Codex - Nitro sound rebuilt around exhaust fire

- Supersedes the earlier thin nitro mix. Its low-mid resonant layer was fed
  after a 620 Hz high-pass, while the weight sat mostly at 44-68 Hz; that made
  the turbo whistle and hiss dominate on ordinary speakers.
- Added a dedicated saturated, speaker-limited boost bus with live boost-only
  RMS/peak telemetry. The sustained burn now combines turbulent flame, broad
  low-mid exhaust pressure, an audible 74-102 Hz body and subtle irregular
  combustion movement. Turbo whistle contribution is deliberately secondary.
- Rebuilt activation as a staggered igniter crack, exhaust shove, flame front,
  two uneven catches and a broad pressure rise. Release is now a wide falling
  decompression with a final exhaust cough rather than a small synthetic tick.
- Boost also opens and strengthens the actual engine/exhaust voice, so it reads
  as the same car under violent load rather than a sound effect placed over it.
- Scope was only `src/systems/engine.ts`. Typecheck, shader validation, the full
  Rally physics/track suite and production build all pass; the established
  Firebase chunk-size warning remains unchanged.

## 29 August 2026 - Codex - Nitro fire redesign reverted

- The 28 August saturated exhaust-fire redesign was too dense, dirty and loud
  in actual play. It has been removed at the owner's request.
- `src/systems/engine.ts` now matches the exact pre-redesign version from before
  commit `7e17b8f`: the cleaner earlier ignition, rising rush and release are
  restored with no changes to vehicle physics, boost duration or visuals.

## 29 August 2026 - Codex - Official Garden icon

- The owner selected proposal 01, “Two Lights, One Garden”: the intertwined
  circular plants with distinct warm and cool blossoms.
- The built-in image generator was used for a constrained production edit that
  preserved the selected mark, removed its noisy transparent fringe and placed
  it on the Garden's opaque `#0d1512` midnight background.
- Final assets live in `public/icons`: the 1254px master, 512px and 192px install
  icons, 180px Apple touch icon, and 32px browser favicon. The original three
  transparent proposals remain in `public/logos` as design history.
- `index.html` now links only the favicon, Apple touch icon, and manifest; the
  mark is never rendered inside the Garden UI. `site.webmanifest` supplies the
  standalone app identity and maskable install assets.
- Manifest JSON, image dimensions/opacity, no-incremental TypeScript, and the
  Vite production build pass. The established Firebase chunk warning remains.

## 29 August 2026 - Codex - Mobile steering owns the long press

- Fixed the phone browser treating a held left/right steering thumb as text
  selection or a copy/context-menu request. The old protection lived only on
  the transparent `.rally-input` sheet, while visible race overlays were sibling
  elements above it and remained eligible for the native long-press gesture.
- The active `.rally-running` takeover and every descendant now disable text
  selection, iOS touch callouts and native dragging. Its React boundary cancels
  `contextmenu`, and the steering surface cancels the default pointer-down
  action before capturing the thumb.
- The scope remains Ember Rally while actively driving; text selection elsewhere
  in the Garden is unchanged. Vite build, repository-wide typecheck and the
  complete Rally suite pass. The briefly missing `Tier` and `useTakenOver`
  imports were observed while the shared workspace was mid-edit, not in a
  complete build or the deployed site.

## 29 August 2026 - Codex - Tree pinch zoom

- The Tree of Thoughts now accepts a true two-finger pinch on its existing
  gesture surface. Spreading the fingers dollies toward the Tree to make the
  hanging papers easier to find and touch; closing them pulls back.
- Zoom is bounded so the camera cannot enter the branches or lose the clearing,
  and eased so it never snaps. One-finger sideways orbit and vertical looking
  remain intact, while a pinch temporarily suspends the latter.
- Every release belonging to a pinch is protected from letter/flower picking,
  preventing the last lifted finger from opening a thought by accident. Home
  now restores both the authored front angle and the normal distance.
- The mobile guide now reads `drag sideways to turn · pinch to zoom`. A direct
  pointer simulation covers both zoom limits, easing, the release guard and the
  original one-finger orbit. The production build passes; its established
  Firebase chunk warning is unchanged.

## 29 August 2026 - Codex - Section ambience controls repaired

- Root cause: the dev7731 per-place faders only multiplied the outdoor `air`
  and `leaves` beds. Hollow already used 5% air and no leaves, so its fader had
  almost nothing to turn down while the louder noise-shaped fire and cave-room
  beds stayed at full strength. The missing Save button was not the original
  failure; those old values silently auto-saved to one browser only.
- A place fader now scales that place's complete ambient mix. Hollow 0% means
  air, fire, crackles and rock rumble all reach zero; intermediate levels are
  blended through the existing crossfade without a step.
- The control now has the same three-stage model as Rally tuning: code defaults,
  a published mix shared by both devices, and a remembered local draft for
  auditioning. dev7731 names the state plainly and adds `save these levels for
  both of you`, `drop my changes`, and `every place back to full` controls.
- Added a validated `ambienceTuning/ours` Firestore document, matching local
  data-layer save/watch methods, and a Garden-side live subscription. Only the
  Warm account may publish, with all five levels constrained to 0..1 in both
  code and Firestore rules.
- Existing locally adjusted section values migrate into the new draft rather
  than disappearing. Personal world/effects/music volume remains device-only.
- No-incremental TypeScript, generated-rule validation, the production build,
  a draft/publish/shared-update simulation and the local data-layer round trip
  all pass. The established Firebase chunk warning remains unchanged.

## 30 August 2026 - Codex - Garden sound sealed at section thresholds

- Root cause: the audio lifecycle was changing places correctly, but the Stars
  and Glasshouse recipes explicitly reused 42–55% of the garden's continuous
  wind and 10–72% of its leaf bed. Hollow also retained a small air layer.
  Turning a section up or down therefore changed its volume without giving it
  a genuinely separate acoustic identity.
- The garden air and leaf generators now reach zero inside Hollow, Stars and
  Glasshouse. Hollow keeps its fire and cave resonance; Stars keeps its low sky
  resonance and rare tones; Glasshouse keeps wet-floor water, enclosed glass
  resonance and struck-glass tones.
- Confirmed the visual lifecycle independently: entering any section unmounts
  `GardenHub`; Hollow and Stars also remove the shared sky and ground. The one
  Canvas that remains is rendering the entered section, not a hidden duplicate
  garden.
- Browser audio telemetry after the full crossfade reports air/leaves at zero
  in all three places, with their place-specific layers still active. No runtime
  errors appeared and the production build passes.

## 30 August 2026 - Codex - Tap-away dismissal across the world

- Added one shared outside-tap behavior and applied it to the folded message
  composer, music list, Stars composer, voice-light drawer, thought/pot/profile
  sheets, and current/archive/plant-question sheets. Letter reading and message
  action menus already had equivalent dismissal and were left intact.
- Unsaved work is protected deliberately: profile and question forms stop
  accepting outside dismissal once edited; voice recording/review/saving never
  accepts it. Thought, pot and message drafts remain mounted and therefore keep
  their text when folded.
- The complete pointer sequence is consumed when empty world dismisses a
  surface. This prevents the same tap from also entering a place or picking an
  object underneath. A tap aimed at another actual control still passes through,
  allowing messages to fold and music to open in one gesture.
- Live browser checks covered inside taps, empty-world dismissal, cross-control
  switching, retained unfinished text and prevention of accidental place entry.
  No runtime errors appeared; TypeScript and the production build pass. The
  established Firebase bundle warning remains unchanged.

## 30 August 2026 - Codex - Paper, mobile corner and place arrivals

- Rebuilt the shared paper surface used by letters, thoughts, questions, the
  pot and profile: restrained rag-paper colour variation, subtle laid lines and
  fibres, a millimetre-scale deckled cut, a pressed rim and a proper cast edge.
  Sheets without the old SVG grain now receive the same material treatment too.
- Replaced the decorative cursive throughout paper writing with the locally
  bundled IM FELL English roman/italic face. It has a genuinely old printed
  character while remaining calm enough for long letters and small phone text.
- Corrected the three personal volume labels and percentages to use dark paper
  ink instead of the world's white overlay colours.
- Fixed the mobile music/message handle's geometry. A placed tab now releases
  its bottom anchor, centres on the release point, clamps to a safe vertical
  range and removes its pointer-cancel listener correctly.
- Place entry is now a load-aware handoff: warming and React.lazy share one
  promise; the veil waits for both the dark midpoint and the destination code;
  the destination commits underneath a covered settling frame before the veil
  opens. The shade itself now closes like passing beneath a canopy instead of
  flashing a flat rectangle.
- TypeScript and the production build pass. A local-data mobile browser pass
  verified the main garden, the redesigned profile paper, visible volume labels
  and successful entry into the Tree. The only console output was Three's
  existing `THREE.Clock` deprecation warning.

## 30 August 2026 - Codex - Ember Rally road flow rebuilt

- Replaced the multi-card race-level arrangement with one continuous horizontal
  road carousel on desktop and mobile. Exactly one road is in view; explicit
  previous/next arrows, position marks and the existing road artwork move as a
  single line without changing any track, physics or saved run data.
- The main road carousel now supports bounded Arrow-key navigation and Enter to
  open the selected road. Inactive off-screen roads are removed from the tab and
  accessibility order until they are visible.
- Replaced Wheel-to-Wheel's four inline road links with a dedicated full-screen
  road-choice step. Every road has its own visual threshold and short character
  note, then one clear invitation action.
- Wheel-to-Wheel now supports Arrow keys, Enter and Escape throughout road
  selection, while suspending the mode screen's keyboard listener underneath.
  The selected road is still encoded into the live invitation before the room
  opens, so both devices arrive on the same track.
- TypeScript and the production build pass. Browser checks at desktop and phone
  sizes verified Rootway-to-Moonbreak navigation, Enter activation, the live
  room receiving Moonbreak, no Vite error overlay and no runtime page errors.
  The existing Three.Clock deprecation and Firebase bundle-size warning remain.
