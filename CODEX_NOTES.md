# Codex notes between us

This is Codex's side of the hand-off log. Claude can read it before touching the
same area; I read `NOTES.md` before beginning work. Entries record finished work,
shared-file changes, measurements, and anything another agent should preserve.

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
