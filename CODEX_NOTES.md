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

## 30 August 2026 - Codex - The Firstlight rebuilt as the expert road

- Extended Firstlight to 4.78 km and roughly three minutes at expert pace. Its
  new Suncoil climbs 21.7 metres around a sandstone spine, crosses a narrow high
  shelf, then falls through a radius-21.8-metre descending hairpin.
- Replaced the tiny side cut with a real 1,296-metre lower wash. The normal road
  remains broad and straight at the Y; a deliberate right move enters a route
  that stays as much as 18.7 metres below the main canyon for 47.2 seconds and
  rewards a mastered run by about 11.8 seconds.
- Rebuilt the fork visually around one sandstone island and a low, open ledge.
  The two canyon shells now separate only after the route decision, without a
  hanging roof, wall-through-road seam or forced shortcut entrance.
- Gave Firstlight its own exposed sandstone palette and dressing instead of
  inheriting Rootway roots, stalactites and cave lanterns. Added Coldfall pools,
  sparse sunrise guidance stones, a fixed three-rock terrace chicane and the
  central Suncoil landmark.
- Added a repeatable Firstlight course audit covering total time, vertical
  range, tightest radius, route length/depth/time advantage, fork opening and
  accidental cave-dressing leakage.
- TypeScript, the rally physics/course suite and the production build pass.
  Browser checks covered the road picker, start, rebuilt fork, Suncoil and
  Fallen Gate. The established Firebase bundle-size warning remains unchanged.

## 30 August 2026 - Codex - Phone heat and background-work pass

- Added one device-activity governor for the entire world. After five quiet
  seconds a visible non-game scene drops to a 12-fps weather cadence; a hidden
  page stops advancing the Canvas entirely. Any touch, pointer, wheel, key or
  remotely arriving message wakes it immediately.
- Game menus remain behind their existing 8-fps covered-world budget. Ember
  Rally countdown, driving and replay stay at the active tier rate; pause and
  finished screens now reduce the road to 12 fps. The quality watchdog can
  continue high -> medium -> low when a road genuinely misses budget, but no
  longer mistakes intentional idle/covered/paused cadence for poor hardware.
  The racer already scales tyre particles, sparks and marks with that tier, so
  the repeated step-down also reduces those and road resolution together.
- Gave Stars a phone-specific maximum DPR of 1.1 while retaining the existing
  desktop value. Its full-screen procedural dome is therefore no longer shaded
  at the grass meadow's 1.35 DPR on an ordinary touch phone; DOM conversation
  text remains native-resolution and unchanged.
- Removed the music player's two permanent requestAnimationFrame loops. The
  audio element now corrects shared playback from its own `timeupdate` events
  and visibility/anchor changes; the beam updates from media events plus one
  500-ms timer only while music is actually playing. Paused music performs no
  recurring player work.
- Made the Stars text placement and global place-title settlement loops
  demand-driven. They cancel after walk/gaze/slide motion settles and restart
  imperatively on the next activity, instead of remaining alive for the whole
  visit.
- Environmental synthesis is now independent of the chosen song's lifecycle.
  Hidden pages fade and suspend the shared Web Audio context and stop its
  control timer, while the separate music element may continue. Visible
  weather control runs at 20 Hz rather than display rate and falls to 2 Hz
  when the current authored room is silent or world sound is muted; loose
  burbles/crackles/shimmers are not created into a muted bus.
- Fixed a hidden-presence contradiction found during the same audit: the page
  correctly wrote offline on hide, but its 20-second heartbeat could write
  online again while still hidden. Hidden heartbeats are now no-ops, and the
  half-minute sky clock also sleeps until the page is visible.
- Reviewed the remaining global Firebase listeners. Messages, shared music,
  presence and the small world-document collections intentionally remain live:
  they deliver changes rather than polling, and scoping them would break the
  features that must reach a person outside their section. They are not a
  meaningful steady thermal cost compared with WebGL and were left intact.
- Browser telemetry in an idle Stars visit reported about 10 fps on the
  headless 60-Hz/software renderer (the requested cap is 12), 10 draw calls and
  1,838 triangles. The full five-place audio suite, shader suite, Rally physics
  and course audit, tuning connectivity, TypeScript and production build pass.

## 30 August 2026 - Codex - Firstlight removed

- Removed the Firstlight from both Ember Rally course pickers and from the
  shared stage model, leaving Rootway, Moonbreak and Stormcrown in the linear
  three-road browser.
- Deleted its world component, full track/band definition, lower-wash route,
  sandstone geometry branches, course-card art and dedicated rally audit. The
  removal cuts more than eight hundred source lines rather than merely hiding
  the road from the menu.
- Old saved rounds or live keys that still name the removed road now fall back
  safely to Rootway, so stale Firebase data cannot open an undefined course or
  crash the rally screen.
- TypeScript, the production build and the complete remaining-road simulation
  pass after the removal.

## 31 August 2026 - Codex - Wheel-to-wheel transport, Step 1

- Kept the adaptive delayed interpolation buffer and moved live car delivery
  onto a dedicated Realtime Database child for each race and each person. The
  listener feeds the buffer directly, outside the coalesced world-presence
  store and without causing React renders during a race.
- Added compact versioned frames carrying a monotonic sequence, sender race
  clock, recorder-compatible car, forward/lateral velocity, yaw rate, steering
  and corrected send time. Malformed, duplicated and out-of-order frames are
  refused before they reach the road; a sender reconnect can safely restart
  its sequence.
- Added a matching local two-client stream, 60-ms write throttling, exact-room
  isolation, auth-change cleanup, explicit close cleanup and Realtime Database
  `onDisconnect` removal. The previous `presence.driving` route remains as a
  temporary compatibility fallback for a phone on the earlier cached build.
- Added production diagnostics for the latest race to `/dev7731`:
  actual queue/flush/receive counts, missing and reordered sequences, arrival
  gap, jitter, delivery age, stream errors, adaptive delay and dry-frame rate.
  It stores no positions, room names or route history.
- Added guarded `liveRaces` Realtime Database rules and regenerated the files
  in `rules-out/`; those rules must be published before the direct path can be
  measured on the deployed site.
- `npm run rally-stream`, `npm run wire`, `npm run rally`, `npm run lobby`,
  TypeScript, the rule JSON checks and the final production build pass. The
  established Firebase chunk-size warning remains unchanged.

## 31 August 2026 - Codex - Wheel-to-wheel smoothing, Step 2

- Replaced straight-line opponent interpolation with bounded, monotone cubic
  motion. The direct stream's velocity shapes acceleration, braking and lane
  changes between real positions without being allowed to overshoot either
  reported point or reverse the car unexpectedly.
- Gave the live opponent continuous wheel speed, real transmitted front-wheel
  steering and turn-responsive body lean. Saved replays and an older cached
  phone retain their previous position-based fallback.
- Limited missing-update prediction to a short easing coast. At 30 m/s it can
  bridge roughly 5.4 metres, then approaches rest instead of blindly driving
  through a corner for the full disconnect timeout.
- Moved the position-free last-race diagnostic report from tab-only session
  storage to durable same-origin storage, with migration of the old report, so
  it remains visible when `/dev7731` opens in another tab or installed window.
- Expanded `npm run wire` with direct-motion acceleration, lane-change,
  steering, mixed legacy/direct and dropped-update checks. The wire suite,
  rally-stream suite, TypeScript and production build pass.

## 31 August 2026 - Codex - Keyboard and touch interaction pass

- Audited the interaction path from Arrival and the five-place browser through
  each place, game selection, waiting room, game setup, pause/result choices,
  question history, message actions and opened Glasshouse memories.
- Rebuilt the shared Arrow/Enter menu behavior so arrow selection no longer
  moves browser focus or draws the browser's square/circle focus chrome. Tab
  and native Enter still work normally; text fields keep their caret keys.
- Preserved the Tree's authored controls: Left/Right still circles the tree,
  while Up/Down chooses between its visible rituals and Enter opens one.
- Added missing keyboard choice handling to the Tree and Wellspring actions,
  Hollow waiting list, live race room, Scattergories opening, message menu,
  Glasshouse threshold and opened-memory actions. Question archives now move
  with Left/Right, and the Glasshouse aisle walks by bay with Up/Down.
- Added horizontal finger swiping to both Ember Rally road pickers: ordinary
  road choice and the wheel-to-wheel invitation road. Vertical page movement
  remains native and a completed swipe cannot accidentally enter the card.
- Verified in the browser at 390 x 844 that both road pickers move Rootway to
  Moonbreak by a real pointer swipe, keyboard selection leaves focus on the
  page with no outline, Enter opens the chosen road, and the live waiting room
  changes and confirms its choice by keyboard. TypeScript and production build
  pass.

## 1 September 2026 - Codex - Stars conversation overhaul

- Replaced the mobile Stars' fixed player/composer reservations with a measured
  visual-viewport lane. An opened music panel hides only the sky it physically
  occupies; folding it immediately gives that space back, and keyboard resize
  or collapse now wakes and remeasures the messages on the same frame.
- Rebuilt history rendering as a small moving window around the current read
  head. At least thirteen nearby lines are ready without laying out the whole
  500-message feed, drags are faster and no longer sticky, new arrivals do not
  displace history being read, and a return-to-newest light appears only when
  it is useful.
- Messages now appear optimistically with the same id and timestamp Firebase
  will store, removing the visible database round trip without duplicates.
  A refused write remains visibly marked rather than silently disappearing.
- Enter is a newline and the visible send light is the only send action.
  Mobile text semantics opt out of autofill/form navigation, multiline messages
  preserve their breaks, and scrolling outside the composer while its keyboard
  is open is distinguished from a tap-to-dismiss gesture.
- Reply quotations are real buttons that travel to the quoted message, including
  distant messages inside the loaded history window. The stray corner handle is
  no longer rendered while its music/conversation panel is already open.
- Verified folded/open player layouts, history scrolling, newest return, quote
  travel, multiline entry, send and desktop layout at 390 x 844 and 1365 x 768.
  Browser console/error checks, TypeScript and the production build pass; only
  the established Firebase bundle warning remains.

### Mini-chat follow-up

- Removed the full Stars reply gestures from mini-chat message lines, so its
  context menu can no longer offer “answer this”; existing hearts remain
  visible as message state.
- The recent-message area is now a mouse, touch and keyboard shortcut directly
  into the full Stars conversation. The mini composer remains independent.
- Enter and the visible SEND button now share the same reliable send path.
  Mini-chat sends are optimistic too, use the eventual Firebase document id,
  keep focus in the field and visibly retain a failed write.
- Verified both send paths and the Tree-to-Stars shortcut at 390 x 844. Browser
  error checks, TypeScript and the production build pass.

## 1 September 2026 - Codex - Closed-app message notifications

- Added a device-specific Firebase Web Push registration behind the existing
  profile switch. Tokens are private to their Warm/Cool owner, refresh on each
  signed-in visit, are removed when switched off or signed out, and stale FCM
  addresses are cleaned by the server after a failed delivery.
- Added the background messaging service worker. A closed or locked installed
  app can now show one replacing message notification; tapping it opens the
  Stars, or asks an already-open garden to make its normal eased trip there.
- Added the `notifyNewMessage` Firestore function. It derives the recipient on
  the server, reads only that person's devices, sends a compact data-only push,
  caps scaling at two instances, and never exposes the other person's tokens
  to client code.
- Prevented duplicate alerts between the old live-page listener and Web Push.
  Added the VAPID setup and one-time deploy instructions.
- Generated the updated rules. TypeScript, production Vite build, function
  syntax check and the rules generator pass.

## 1 September 2026 - Codex - The Glasshouse, rebuilt around the pane

- Rebuilt the leave-memory ritual as a three-by-two pane composer. A photograph
  can be turned in quarter rotations, dragged to choose exactly what its glass
  will keep, or nudged with the arrow keys. Rotation is baked once from the
  original pixels; the chosen crop is shared by the WebGL pane and opened view.
- Opening a memory now preserves that authored frame instead of unexpectedly
  expanding the full photograph. Pressing and holding reveals the original
  proportions only while held, then release returns it to its pane.
- Repaired the mobile aisle gesture with pointer capture and a post-drag tap
  guard, stopped browser overscroll from stealing it, added an in-world walking
  guide, and made phone movement settle promptly without losing its softness.
- Found the real cause of the very slow memory approach: the overlay reduced
  the world to eight frames per second while the camera was still moving, then
  the safety delta clamp turned that into literal slow motion. Open memories
  now keep a measured 30 fps lane while other covered scenes remain throttled.
- Tiered the surrounding trees, vines and floating motes by device quality so
  mobile spends its detail on the glass, flowers and photographs themselves.
  Existing memories remain centred through backward-compatible crop defaults.
- Updated the Glasshouse documentation and Firestore crop validation. Verified
  the mobile and desktop room in-browser, including swipe travel, quick camera
  arrival and press/hold release; rules, TypeScript and production build pass.

## 1 September 2026 - Codex - The last step out of Stars scrolling

- Kept the new message spacing, momentum and touch mechanics intact, but made
  the reading-lane mask continuous before and through each boundary crossing.
  Individual messages no longer acquire a full fade band in a single frame.
- Replaced the rounded, one-message-at-a-time mobile column anchor with an
  interpolation between neighbouring message heights, and hid newly windowed
  lines until their first measured transform is applied.
- Verified the Stars at 390 x 844 with real pointer travel. Browser error and
  overlay checks, TypeScript and the production build pass.

## 1 September 2026 - Codex - Corrected the iOS keyboard workaround

- Confirmed the Previous/Next/Done strip is WebKit's native form assistant and
  cannot be removed by HTML, CSS or JavaScript in the installed web app.
- Removed the ineffective contenteditable workaround. WebKit treats an editable
  host as a native text editor too, so it retained the strip while weakening
  selection, dictation, composition and accessibility.
- Restored proper controlled textareas across the main Stars composer, mini
  chat and shared-watch fields. Preserved multiline input, Return behaviour,
  native plain-text paste, focus restoration, placeholders and auto-growing.
- TypeScript and the production build pass. Actually hiding the system strip
  remains possible only through a native iOS wrapper such as Capacitor.

## 1 September 2026 - Codex - Quiet foreground messages and Stars presence

- Made operating-system notifications exclusive to a closed or backgrounded
  garden. A visible page now keeps the established authored message tone and
  unread light without also raising an iOS notification banner.
- Guarded that rule in the live listener, Firebase foreground receiver,
  messaging service worker and Cloud Function. The server checks the existing
  presence heartbeat; the worker checks actual visible windows at delivery, so
  navigation and visibility races do not leak duplicate notifications.
- Gave the mini-message light a finite two-ring arrival ripple followed by its
  existing slow unread breath, including a reduced-motion treatment.
- Added a wordless presence mark to the Stars: Warm and Cool sit as two small
  lights on one thread. Online lights glow, an absent light becomes hollow and
  the thread breaks, so either person leaving is visible without restoring the
  old names or top-bar weight.
- TypeScript, Cloud Function syntax and the production build pass. The updated
  `notifyNewMessage` function was deployed successfully to `our-world-c9a07` as
  active revision `notifynewmessage-00002-tec`.

## 1 September 2026 - Codex - Watch Together became the Night Screen

- Moved the Watch Together entrance to the final row of the expanded music
  shelf. Folded music is small again, and either person can prepare the room
  before the other arrives.
- Rebuilt the full experience as an opaque, dedicated Night Screen environment
  on desktop and mobile: one true video rectangle, a responsive control room,
  warm/cool presence lights, shared chat and a readable discovery/queue lane.
- Search now responds while typing, cancels stale requests, offers useful
  starting prompts and separates “play now” from “add next.” YouTube search is
  restricted to embeddable, syndicated results so it offers fewer dead ends.
- Repaired Next at the player boundary. Queue changes now load the new id into
  the persistent iframe immediately instead of only changing the shared title
  and clock while the old picture remained.
- Covered YouTube refusals with the garden's own readable state, kept the raw
  iframe unfocusable underneath, and made the miniature reveal only Open and
  Close when tapped. On mobile it sits below the media dock instead of across
  the place title.
- Found and fixed a room-level scroll leak during browser verification: the
  shared chat's `scrollIntoView` was scrolling the entire Watch place upward.
  It now scrolls only its own conversation lane.
- Verified the empty, unavailable, full desktop, full mobile, folded miniature,
  miniature actions and close states in-browser. Watch checks, TypeScript and
  the production build pass.

## 1 September 2026 - Codex - Question recovery and dev7731 control

- Found why an answered-but-unfinished Tree question could disappear: the live
  selector treated the newest Firestore document as active even when an older
  round was still waiting for one person.
- Made the oldest unfinished round the safe default and stopped question
  creation whenever *any* unfinished round exists. The next twelve-hour growth
  window now starts from the latest actual completion across recovered rounds.
- Added a Questions tab to dev7731 with the complete opened-round timeline,
  answer-status indicators, before/active/after context and a `make active`
  control for any unfinished round. Completed answers remain immutable and the
  other person's answer remains sealed until both have answered.
- Added the shared `questionControl/ours` pointer and strict warm-only Firestore
  rules. Existing data is not migrated, copied or deleted; the missing live
  question is recovered from its original document and answer subcollection.
- Added regression coverage for buried rounds, explicit activation and stale
  completed pointers. Question checks, generated rules, TypeScript and the
  production build pass.

## 1 September 2026 - Codex - The Tree's exact question lifecycle

- Clarified that twelve hours is not a repeating interval: the growth clock is
  minted by the second answer and runs once from that exact completion moment.
- Added the only expiry the ritual permits. A question untouched by both people
  may fade after twenty-four hours; the first answer removes that expiry
  forever, so the other person can arrive three days or three weeks later.
- Repaired the visual ritual as well as the clock. When both answers meet, the
  answered round blooms into the vine and a new bud remains visibly growing.
  Touching that bud opens a quiet sheet explaining that its twelve-hour growth
  began when both answers met and roughly how long remains.
- Marked untouched expired rounds honestly in dev7731 and prevented them from
  being reactivated. Extended the control-pointer rule with the same rule.
- Added real local-backend walks for 23-hour survival, 24-hour replacement and
  a one-answer question still active after 72 hours. Questions and TypeScript
  checks pass.

## 2 September 2026 - Codex - Stars scrolling, without the hidden steps

- Replaced the changing message-height estimate with a bounded inverse of the
  actual visual ladder, so a pixel of finger travel produces a pixel of text
  travel through both one-line replies and long paragraphs.
- Removed the every-two-message animator teardown. A larger overlapping window
  now shifts only near its edge, newly mounted lines join the existing clock,
  and only that small window is built instead of remapping the full history.
- Moved inertial advancement ahead of layout so each frame uses one read head,
  stopped stale flick velocity after a held release, normalized wheel units and
  made the newest/reply jumps cancel any motion already in flight.
- Fixed the CSS specificity error that re-enabled selection inside `.said`, and
  explicitly claimed touch defaults when a message begins its own hold gesture.
  The editable composer remains selectable and otherwise unchanged.
- A 10,000-case variable-height motion probe stayed within 0.104 px; computed
  browser styles, TypeScript, the production build and whitespace checks pass.
