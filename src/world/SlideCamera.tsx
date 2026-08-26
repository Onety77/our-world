/**
 * The camera, which is the only thing that moves.
 *
 * One place is on screen at a time and it sits at the origin, so this is not
 * really travel — it is framing. Two things stop that feeling like a
 * slideshow:
 *
 *   Under the fade between places the camera slides bodily sideways, so the
 *   world is *moving* when the next place appears rather than cutting to a
 *   static shot.
 *
 *   The pointer leans it, always. With no avatar and nothing to walk, that
 *   lean is what tells your eye this is a space and not a photograph: near
 *   things shift against far things every time your hand moves.
 */

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { SECTIONS } from '@/sections/registry'
import { SLIDE_DISTANCE, slide, slidePosition, useSections } from '@/systems/sections'
import { eased, gaze, stepPointerLook } from '@/systems/pointerLook'
import { stepTreeOrbit, treeOrbit } from '@/systems/treeOrbit'

/** How quickly the camera settles onto the place you asked for, per second. */
const FOLLOW = 4.2

/**
 * How much of the garden's turn a place gets.
 *
 * Inside a place the frame is composed around an activity — a tree you are
 * reading thoughts off, a river whose level is the whole message — so it must
 * not swing off it. But it was completely rigid, and next to a garden that
 * turns to follow your hand, a place that does not moves reads as a painting
 * hung in front of you. A third of the range, and it is enough.
 *
 * A section's own `sway` scales this again, so a place that wants more or less
 * can say so without touching this file.
 */
const PLACE_TURN = 0.34

/**
 * The shape of frame every section's camera was composed for.
 *
 * Roughly a laptop. A phone held upright is nothing like it, and the field of
 * view is *vertical* — so a portrait screen sees exactly as much sky as a
 * landscape one and far less to either side. The Tree of Thoughts, framed to
 * fill a wide frame, came out with its crown cut off the top of a phone.
 */
const DESIGNED_FOR = 1.6

/**
 * How far to stand back on a narrower screen.
 *
 * A partial correction on purpose. Backing off far enough to recover the whole
 * horizontal field would put the subject somewhere in the middle distance,
 * which is worse than a slight crop; this is enough to fit what was composed
 * and no more.
 */
function backOffFor(aspect: number): number {
  if (aspect >= DESIGNED_FOR) return 1
  return Math.min(1.5, 1 + (DESIGNED_FOR / Math.max(aspect, 0.3) - 1) * 0.18)
}

export function SlideCamera() {
  const { camera, size } = useThree()
  const index = useSections((s) => s.index)
  const entered = useSections((s) => s.entered)

  const here = useRef(new Vector3())
  const look = useRef(new Vector3())
  const drift = useRef(Math.random() * 100)
  const browse = useRef(1)

  // Start framed on whatever place we opened on, rather than sliding in from
  // the first one.
  useEffect(() => {
    slide.at = useSections.getState().index
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20)
    const section = SECTIONS[index]
    const circlingTree = entered && section.id === 'tree'
    drift.current += delta
    stepPointerLook(delta, PLACE_TURN)
    stepTreeOrbit(delta, circlingTree)
    browse.current += ((entered ? 0 : 1) - browse.current) *
      (1 - Math.exp(-3.2 * delta))

    /*
      Chase the place we're heading for.

      Without this the offset below never settles and the camera sits
      permanently shoved nine metres to one side — which looks, convincingly,
      like the scenery has been built off-centre. Skipped while a finger is
      down, because then the drag *is* the position and easing would fight it.
    */
    if (!slide.grabbing) {
      slide.at += (index - slide.at) * (1 - Math.exp(-FOLLOW * delta))
    }

    /*
      How far this place is from being centred, in index space. Non-zero only
      while a swipe is in flight or a fade is running, and it is what the
      lateral slide is driven from — so the world pushes with your thumb and
      keeps going as the fade takes over.
    */
    const off = slidePosition() - index
    const shove = Math.max(-1.4, Math.min(1.4, off)) * SLIDE_DISTANCE

    const sway = section.camera.sway ?? 1
    const idleX = Math.sin(drift.current * 0.11) * 0.25
    const idleY = Math.sin(drift.current * 0.079 + 1.7) * 0.14

    // Outside, the place is a destination in the garden rather than the
    // entire interface: pull back and lift enough to read it as a living
    // level preview. Entering closes that distance and restores its authored
    // camera, which is the felt transition from looking at a world to being
    // inside it.
    const browseLift = browse.current * 3.4
    const browseBack = browse.current * 10

    // Stand further off on a narrow screen, along the line the place was
    // framed from — so the composition is the authored one, just smaller.
    const back = backOffFor(size.width / Math.max(1, size.height))
    const baseX = (section.camera.position[0] - section.camera.target[0]) * back
    const baseZ = (section.camera.position[2] - section.camera.target[2]) * back
    const orbitCos = Math.cos(circlingTree ? treeOrbit.current : 0)
    const orbitSin = Math.sin(circlingTree ? treeOrbit.current : 0)
    const orbitX = baseX * orbitCos + baseZ * orbitSin
    const orbitZ = -baseX * orbitSin + baseZ * orbitCos
    const from: [number, number, number] = [
      section.camera.target[0] + orbitX,
      section.camera.target[1] + (section.camera.position[1] - section.camera.target[1]) * back,
      section.camera.target[2] + orbitZ,
    ]

    const parallax = (eased.x * 1.6 + idleX) * sway
    const orbitRadius = Math.hypot(orbitX, orbitZ) || 1
    const parallaxX = circlingTree ? (orbitZ / orbitRadius) * parallax : parallax
    const parallaxZ = circlingTree ? (-orbitX / orbitRadius) * parallax : 0

    here.current.set(
      from[0] + shove + parallaxX,
      from[1] + browseLift + (-eased.y * 0.9 + idleY) * sway,
      from[2] + browseBack + parallaxZ,
    )
    /*
      The resting aim, turned by the gaze.

      Worked out as an angle rather than by nudging the target point, for the
      same reason the garden's camera does it that way: nudging a point turns
      the camera less the further away the thing it is watching happens to be,
      so the Hollow — whose subject is two metres off — would swing wildly
      while the Wellspring, looking down two hundred metres of river, would
      barely move at all.
    */
    const tx = section.camera.target[0] + shove * 0.55
    const ty = section.camera.target[1]
    const tz = section.camera.target[2]

    const dx = tx - here.current.x
    const dy = ty - here.current.y
    const dz = tz - here.current.z
    const flat = Math.hypot(dx, dz) || 1

    const yaw = Math.atan2(dx, dz) - gaze.yaw * sway
    const pitch = Math.atan2(dy, flat) + gaze.pitch * sway
    const cosPitch = Math.cos(pitch)

    look.current.set(
      here.current.x + Math.sin(yaw) * cosPitch * flat,
      here.current.y + Math.sin(pitch) * flat,
      here.current.z + Math.cos(yaw) * cosPitch * flat,
    )

    camera.position.copy(here.current)
    camera.lookAt(look.current)
  })

  return null
}
