/**
 * The camera for the garden, outside any place.
 *
 * It stands on the meadow a little way back from whichever place is selected
 * and *turns* with the pointer. That verb is the whole point. The camera it
 * replaced only ever shifted a metre or so sideways, which meant the sky, the
 * sun and the moon — all of which are rendered every single frame — had never
 * once been inside the frame. Sixty degrees of elevation is not something you
 * can lean your way to.
 *
 * So: the resting frame is composed, and everything past its edges is found by
 * looking. Push the pointer up and the trees run out of the top of the picture
 * and you get sky, weather and whichever of the two lights is up. Push it down
 * and you are looking at the grass by your feet. Push it sideways and you can
 * see the next place along before you have swiped to it.
 *
 * Per the technical law, none of this touches React: the slide position, the
 * gaze and the camera are all read and written imperatively, every frame.
 */

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { useSections, slide, slidePosition } from '@/systems/sections'
import { eased, gaze, stepPointerLook } from '@/systems/pointerLook'
import { groundHeight } from '@/systems/terrain'
import { anchorAt } from './layout'

/** Eye height above whatever the ground is doing underneath, in metres. */
const EYE = 4.5

export function HubCamera() {
  const { camera } = useThree()
  const index = useSections((s) => s.index)

  const eye = useRef(new Vector3())
  const target = useRef(new Vector3())
  const time = useRef(2.3)

  // Start already at the selected place rather than flying in from wherever
  // the last section left the camera.
  useEffect(() => {
    slide.at = useSections.getState().index
    slide.drag = 0
  }, [])

  useFrame((_, rawDelta) => {
    // A frame that took longer than a twentieth of a second is a stall, not
    // motion. Clamping keeps a hitch from throwing the camera across the field.
    const delta = Math.min(rawDelta, 1 / 20)
    time.current += delta
    stepPointerLook(delta)

    if (!slide.grabbing) {
      slide.at += (index - slide.at) * (1 - Math.exp(-3.4 * delta))
    }

    const anchor = anchorAt(slidePosition())

    // --- where the camera stands ------------------------------------------
    const breathX = eased.x * 1.05
    const bob = Math.sin(time.current * 0.31) * 0.13
    const drift = Math.sin(time.current * 0.19 + 1.7) * 0.22

    const standX = anchor.x + breathX + drift
    const standZ = anchor.z + anchor.stand
    // Riding the real terrain height is what stops the camera clipping through
    // a rise as it slides between places that sit two metres apart in height.
    const standY = groundHeight(standX, standZ) + EYE + bob

    eye.current.set(standX, standY, standZ)
    camera.position.lerp(eye.current, 1 - Math.exp(-5.2 * delta))

    // --- where it is looking ----------------------------------------------
    // The resting aim, as an angle rather than a point, so the gaze can simply
    // be added to it. Aiming at a point and then nudging the point is how you
    // get a camera that turns less the further away the thing it is watching.
    const dx = anchor.x - camera.position.x
    const dy = anchor.y + anchor.aim - camera.position.y
    const dz = anchor.z - camera.position.z
    const flat = Math.hypot(dx, dz) || 1

    // atan2(x, z) so that direction is (sin, cos) — three.js looks down -z, so
    // the resting yaw lands near pi and the gaze is *subtracted* to turn the
    // camera the same way the pointer moved.
    const yaw = Math.atan2(dx, dz) - gaze.yaw
    const pitch = Math.atan2(dy, flat) + gaze.pitch

    const cosPitch = Math.cos(pitch)
    target.current.set(
      camera.position.x + Math.sin(yaw) * cosPitch * flat,
      camera.position.y + Math.sin(pitch) * flat,
      camera.position.z + Math.cos(yaw) * cosPitch * flat,
    )
    camera.lookAt(target.current)
  })

  return null
}
