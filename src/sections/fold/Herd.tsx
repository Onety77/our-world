/**
 * Every animal on the hill, in one mesh.
 *
 * ---------------------------------------------------------------------------
 * The whole herd is a single instanced geometry whose attributes are rewritten
 * every frame — see the note at the top of `creatures.ts` for why that is
 * cheaper than a group per animal, and what it costs.
 *
 * **Nothing in here goes through React.** The poses are computed and written
 * straight into the buffers in `useFrame`, and the only state React sees is the
 * list of practices changing, which happens a few times a day.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Color,
  IcosahedronGeometry,
  Vector3,
  type InstancedBufferAttribute,
  type Mesh,
} from 'three'
import type { Practice } from '@/data/types'
import { conditionOf, creatureScale } from '@/systems/fold'
import type { SkyPalette } from '@/systems/palette'
import { buildInstanced, useFormMaterial, type FormInstance } from '@/world/forms'
import { blankInstance, partsFor, poseInto, type Part, type Pose } from './creatures'
import { foldHeight, standingFor } from './layout'
import { useMisted, type MistRef } from './mist'

/**
 * Where each animal is on screen, for the layer of words over the top.
 *
 * The same device the Lantern Walk uses and for the same reason: a screenshot
 * of this place looks identical whether tapping an animal works or not, so the
 * only way to test it is to be told where the animals think they are. Written
 * once a frame; read by the DOM, never by the scene.
 */
export interface Seen {
  id: string
  /** Screen pixels. */
  x: number
  y: number
  /** Rough half-width on screen, so a tap has something to be inside. */
  r: number
  /** Metres from the camera, for choosing between two that overlap. */
  away: number
}

export const seenAnimals: Seen[] = []

interface Animal {
  practice: Practice
  parts: Part[]
  owner: 'warm' | 'cool' | 'both'
  /** Index of this animal's first part in the shared buffers. */
  at: number
  /** Fixed per animal, so two of them never breathe in step. */
  phase: number
}

export function Herd({
  practices,
  palette,
  today,
  mist,
}: {
  practices: Practice[]
  palette: SkyPalette
  today: string
  mist: MistRef
}) {
  const animals = useMemo<Animal[]>(() => {
    let at = 0
    return practices.map((practice, i) => {
      const parts = partsFor(practice.creature)
      const animal: Animal = {
        practice,
        parts,
        owner: practice.by,
        at,
        phase: i * 1.9 + practice.id.length * 0.31,
      }
      at += parts.length
      return animal
    })
  }, [practices])

  const total = useMemo(
    () => animals.reduce((n, a) => n + a.parts.length, 0),
    [animals],
  )

  const geometry = useMemo(() => {
    const base = new IcosahedronGeometry(1, 1)
    /*
      Built from blanks and then written every frame. The instance *count* is
      what has to be right here; every number in the buffers is replaced before
      the first draw.
    */
    const items: FormInstance[] = Array.from({ length: Math.max(1, total) }, blankInstance)
    const built = buildInstanced(base, items)
    built.instanceCount = total
    base.dispose()
    return built
  }, [total])

  useEffect(() => () => geometry.dispose(), [geometry])

  /*
    Subdivision one rather than zero, and it is the difference between an animal
    and a heap of gravel. A unit icosahedron has twenty flat faces; scaled to a
    long thin barrel those faces are big enough to read individually, and the
    animal comes out looking chipped from stone. One subdivision is eighty faces
    and about a hundred triangles a part — call it fourteen hundred an animal,
    eight thousand for a full hill, which is under one per cent of the frame.
  */
  const material = useFormMaterial(palette, { sway: 0.02 })
  useMisted(material, mist)

  const buffers = useMemo(() => {
    const a = geometry.attributes as unknown as Record<string, InstancedBufferAttribute>
    return {
      offset: a.iOffset.array as Float32Array,
      scale: a.iScale.array as Float32Array,
      rot: a.iRot.array as Float32Array,
      phase: a.iPhase.array as Float32Array,
      lean: a.iLean.array as Float32Array,
      anchorY: a.iAnchorY.array as Float32Array,
      colour: a.iColor.array as Float32Array,
      attrs: [a.iOffset, a.iScale, a.iRot, a.iPhase, a.iLean, a.iAnchorY, a.iColor],
    }
  }, [geometry])

  /** sRGB hex to the linear triple the shader wants. Cached — see below. */
  const colourOf = useMemo(() => {
    /*
      Memoised because `new Color(hex)` parses a string and converts colour
      spaces, and this would otherwise run once per part per frame — about five
      thousand string parses a second for a picture that changes twice a day.
    */
    const cache = new Map<string, [number, number, number]>()
    const c = new Color()
    return (hex: string): [number, number, number] => {
      const had = cache.get(hex)
      if (had) return had
      c.set(hex)
      const made: [number, number, number] = [c.r, c.g, c.b]
      cache.set(hex, made)
      return made
    }
  }, [])

  const { camera, size } = useThree()
  const point = useMemo(() => new Vector3(), [])
  const clock = useRef(0)
  const eased = useRef(new Map<string, { x: number; z: number; down: number }>())
  const mesh = useRef<Mesh>(null)

  useFrame((_, delta) => {
    clock.current += delta
    const t = clock.current
    seenAnimals.length = 0

    for (const animal of animals) {
      const { practice } = animal
      const condition = conditionOf(practice, today)
      const spot = standingFor(practice.id, condition.away)

      /*
        A slow wander, so nothing on the hill is a statue.

        Small — a metre and a half over about a minute. An animal that walks
        properly needs a gait, and a gait that is wrong is far more noticeable
        than an animal that grazes on the spot; this is the amount of movement
        that says alive without claiming to walk.
      */
      const wander = condition.awake * 1.5
      const wx = spot.x + Math.sin(t * 0.09 + animal.phase) * wander
      const wz = spot.z + Math.cos(t * 0.071 + animal.phase * 1.3) * wander * 0.7

      /*
        Eased toward, never snapped to.

        The standing spot moves the moment a practice is kept — an animal that
        was thirty metres away is suddenly nine — and a creature that teleports
        across the fold the instant you answer a word is the one thing here that
        would look like a bug rather than like coming when it is called. So it
        *walks* over, at about two metres a second, which takes it a few seconds
        and reads as exactly what it is.
      */
      let held = eased.current.get(practice.id)
      if (!held) {
        held = { x: wx, z: wz, down: condition.awake < 0.3 ? 1 : 0 }
        eased.current.set(practice.id, held)
      }
      const chase = 1 - Math.exp(-0.55 * delta)
      held.x += (wx - held.x) * chase
      held.z += (wz - held.z) * chase
      const wantDown = condition.awake < 0.3 ? 1 : 0
      held.down += (wantDown - held.down) * (1 - Math.exp(-1.4 * delta))

      const y = foldHeight(held.x, held.z)

      /*
        Which way it is facing.

        A well-kept animal looks at you; everything else faces the way it
        happens to be wandering. That single rule is most of what makes the
        near one feel like it noticed you come up the hill.
      */
      const drifting = Math.atan2(
        Math.cos(t * 0.09 + animal.phase) * 0.2,
        -Math.sin(t * 0.071 + animal.phase * 1.3) * 0.2,
      )
      const yaw =
        condition.mood === 'near'
          ? Math.atan2(-held.x, 14 - held.z) + Math.sin(t * 0.3 + animal.phase) * 0.12
          : drifting

      /*
        Grazing: head down most of the time, up every so often to look about.
        The near one keeps its head up, because it is watching you.
      */
      const look = Math.sin(t * 0.23 + animal.phase * 2.1)
      const graze =
        condition.mood === 'near'
          ? 0.06 + Math.max(0, look) * 0.1
          : held.down > 0.5
            ? 0.15
            : 0.55 + look * 0.42

      const pose: Pose = {
        x: held.x,
        y,
        z: held.z,
        yaw,
        scale: creatureScale(practice.days),
        down: held.down,
        graze: Math.max(0, Math.min(1, graze)),
        // A wag, and only when it is pleased to see you.
        swing:
          condition.mood === 'near'
            ? t * 6.5
            : t * 0.7 + animal.phase,
      }

      poseInto(animal.parts, pose, animal.owner, animal.at, buffers, colourOf)

      /*
        And where that landed on screen, for the tap.

        ---------------------------------------------------------------------
        **Asked of the scene graph, never worked out again**, and the first
        version did work it out again — it projected the animal's *local*
        position straight through the camera, which treats a point in the
        section's own coordinates as a point in the world. The whole place is
        drawn in a group at x = 480, so every animal reported itself four
        hundred and eighty metres away and eleven thousand pixels off the left
        of the screen. Nothing looked wrong; the picture was identical. Only
        the published numbers said so, which is the entire argument for
        publishing them.

        The Lantern Walk has the same note for the same reason. `localToWorld`
        asks the object that actually drew it.
        ---------------------------------------------------------------------
      */
      point.set(pose.x, y + pose.scale * 0.7, pose.z)
      if (mesh.current) mesh.current.localToWorld(point)
      const world = point.clone()
      point.project(camera)
      if (point.z < 1) {
        const px = (point.x * 0.5 + 0.5) * size.width
        const py = (-point.y * 0.5 + 0.5) * size.height
        const away = world.distanceTo(camera.position)
        // A metre across at this distance, in pixels.
        const scale = (size.height * 0.5) / Math.max(0.001, away * Math.tan(0.5))
        seenAnimals.push({
          id: practice.id,
          x: px,
          y: py,
          r: Math.max(18, scale * pose.scale * 0.9),
          away,
        })
      }
    }

    for (const attr of buffers.attrs) attr.needsUpdate = true
  })

  if (animals.length === 0) return null
  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={3}
    />
  )
}

/**
 * Which animal a tap landed on, or null.
 *
 * Nearest first, so the one in front wins where two overlap — which on a hill
 * seen end-on happens constantly.
 */
export function whichAnimal(x: number, y: number): string | null {
  let best: Seen | null = null
  for (const seen of seenAnimals) {
    if (Math.hypot(seen.x - x, seen.y - y) > seen.r) continue
    if (!best || seen.away < best.away) best = seen
  }
  return best?.id ?? null
}
