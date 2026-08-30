/**
 * The light that gets into a slot canyon, and the road named after it.
 *
 * ---------------------------------------------------------------------------
 * A slot is roofed nearly all the way along. The sun does not light the floor
 * of one; it finds the gaps, and what arrives is a handful of shafts standing
 * in the dark like columns — which is the whole reason this road is called
 * what it is, and the one thing that makes it look like nowhere else here.
 *
 * **They are landmarks before they are scenery.** Every other road teaches you
 * where you are with something you are told to read: the Rootway's lanterns,
 * the Stormcrown's amber cairns. This road has no signs at all. It has light
 * coming through the roof at fixed places, and after two runs you know the
 * canyon by which shaft you are under — which is a nicer thing to learn than a
 * row of markers, and it costs the road nothing to say.
 *
 * **Cones, not volumetrics.** Each shaft is an open cone with the beam shader
 * on it, the same one the headlamps use: additive, brightest at its throat,
 * gone by the floor, with dust drifting through it so it is never a clean
 * solid. Every shaft on the road is one merged geometry and one draw call. A
 * phone renders this for nothing, which is the only reason it can be here at
 * all — see the note on the frame budget in `World`.
 *
 * They lean. The sun is barely over the rim at this hour, so the light comes
 * in at an angle rather than straight down, and it leans the *same way* along
 * the whole canyon because there is only one sun. Getting that wrong — each
 * shaft tilted its own way — reads instantly as decoration rather than as
 * daylight, which is the difference this file is for.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo } from 'react'
import { BufferGeometry, ConeGeometry, Matrix4, Euler, Vector3 } from 'three'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useBeamMaterial, type RallyLights } from './materials'
import { random } from './model'
import { roadAt, type Track } from './track'

/** Metres between shafts, before the roll of the dice either side of it. */
const EVERY = 210

/** How far off vertical the light comes in, radians. One sun, one angle. */
const LEAN = 0.28

export function FirstlightWorld({ track, lights }: { track: Track; lights: RallyLights }) {
  const shafts = useMemo(() => build(track), [track])
  useEffect(() => () => shafts.dispose(), [shafts])

  /*
    Warmer than the headlamps and much weaker.

    A shaft of morning sun is not a spotlight — it is the *air* being lit, and
    the moment it reads as bright it stops reading as air. But the first pass
    at this was a third of a headlamp and it read as nothing at all: a faint
    wash on the sand that could have been a texture. The beam shader multiplies
    by 0.075 before it gets anywhere near the screen, so a number that looks
    reckless here is a column of dust on the road.
  */
  const material = useBeamMaterial(lights, '#ffd9a0')
  useEffect(() => {
    material.uniforms.uPower.value = 1.35
  }, [material])

  return <mesh geometry={shafts} material={material} frustumCulled={false} renderOrder={3} />
}

/**
 * Every shaft on the road, merged.
 *
 * Placed off the track's own seed so the canyon is the same canyon on both
 * phones — a landmark that moved between devices would be worse than no
 * landmark, because the two of you would be describing different roads.
 */
function build(track: Track): BufferGeometry {
  const rng = random(track.seed ^ 0x51f7a3)
  const road = roadAt(track, 0)
  const parts: BufferGeometry[] = []
  const spin = new Matrix4()
  const place = new Matrix4()
  const point = new Vector3()

  for (let s = 90; s < track.length - 120; s += EVERY * (0.68 + rng() * 0.64)) {
    roadAt(track, s, road)

    /*
      Where the roof opens is where the canyon is *widest*, which is not a
      decoration either: a slot narrows and widens along its length, and the
      light gets in at the wide parts. Tying the two together means the shafts
      land where the road has room, so they never arrive in the middle of the
      one corner you cannot afford to be distracted in.
    */
    const roof = Math.max(6, road.ceiling)
    if (roof > 21) continue

    // A cone standing on its point on the floor, opening upward to the gap.
    const radius = road.width * (0.5 + rng() * 0.28)
    const cone = new ConeGeometry(radius, roof, 7, 1, true)

    /*
      `uv.y` runs 0 at the tip and 1 at the base of a cone, and the beam shader
      wants 0 at the source. The cone is built point-down and then flipped, so
      the throat of the shaft — up at the roof — is where the light is
      strongest, and it has faded out by the time it reaches the sand.
    */
    spin.makeRotationFromEuler(new Euler(Math.PI, 0, LEAN * (0.8 + rng() * 0.4)))
    cone.applyMatrix4(spin)

    // Slightly off the middle, because a slot is not symmetrical and the sun
    // is on one side of it.
    const across = (rng() * 2 - 1) * road.width * 0.35
    point.set(road.x, road.y, road.z)
    point.x += Math.cos(road.heading) * across
    point.z += -Math.sin(road.heading) * across
    place.makeTranslation(point.x, point.y + roof * 0.5, point.z)
    cone.applyMatrix4(place)

    parts.push(cone)
  }

  if (parts.length === 0) return new BufferGeometry()
  const merged = BufferGeometryUtils.mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  return merged ?? new BufferGeometry()
}
