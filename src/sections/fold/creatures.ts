/**
 * The animals, as parts and as joints.
 *
 * ---------------------------------------------------------------------------
 * **One instanced mesh for the whole herd, transformed on the processor every
 * frame.**
 *
 * The obvious build is a group per animal with its own meshes, and at six
 * animals that is eighteen draw calls added to a garden that renders whole
 * places in about that many. What is here instead is one geometry holding every
 * part of every animal, and a per-frame pass that writes each part's position,
 * rotation and scale straight into the instanced attributes. Ninety-odd parts
 * is a few hundred floats a frame, which is nothing, and the whole herd costs
 * one call.
 *
 * The price is that the shared form shader has no notion of a parent
 * transform — it leans, spins and offsets one instance and stops — so the
 * hierarchy has to be applied here, in `poseInto`. That is why a part names a
 * `joint` rather than being parented to one.
 *
 * **These are read at distance, in mist, and that is what they are built for.**
 * A walk cycle on a jointed skeleton would be invisible at thirty metres and
 * wrong at nine. What carries at both is silhouette, a head that comes up off
 * the grass, and a tail. Those are the three things that move.
 * ---------------------------------------------------------------------------
 */

import type { CreatureKind } from '@/data/types'
import type { FormInstance } from '@/world/forms'

/** Which animated transform a part hangs off. */
export type Joint = 'body' | 'head' | 'tail' | 'legs'

export interface Part {
  /** Position in the animal's own space, metres, origin between the feet. */
  at: [number, number, number]
  /** Half-extents. The base geometry is a unit icosahedron. */
  size: [number, number, number]
  joint: Joint
  /** Tilt about X then Z, radians. */
  lean?: [number, number]
  /** 0..1 along the animal's coat, dark to light. Resolved against the pair. */
  shade: number
}

/**
 * How an animal is standing this frame.
 *
 * Everything here is 0..1 or radians and comes from `conditionOf` plus the
 * clock — nothing in it is stored, and nothing in it is a mood the person is
 * told about in words.
 */
export interface Pose {
  /** Where the feet are, in section space. */
  x: number
  y: number
  z: number
  /** Which way it faces, radians about Y. */
  yaw: number
  /** Overall size, from `creatureScale`. */
  scale: number
  /** 0 standing, 1 lying down with its legs folded under it. */
  down: number
  /** 0 head up and looking, 1 head in the grass. */
  graze: number
  /** Radians, side to side. A tail, or a wing shuffle on the crane. */
  swing: number
}

const BODY: Part[] = [
  { at: [0, 0.62, 0], size: [0.30, 0.29, 0.60], joint: 'body', shade: 0.5 },
  { at: [0, 0.66, 0.34], size: [0.29, 0.30, 0.24], joint: 'body', shade: 0.62 },
  { at: [0, 0.63, -0.36], size: [0.28, 0.29, 0.24], joint: 'body', shade: 0.42 },
]

const LEGS: Part[] = [
  { at: [0.19, 0.30, 0.30], size: [0.068, 0.30, 0.068], joint: 'legs', shade: 0.24 },
  { at: [-0.19, 0.30, 0.30], size: [0.068, 0.30, 0.068], joint: 'legs', shade: 0.24 },
  { at: [0.19, 0.30, -0.30], size: [0.068, 0.30, 0.068], joint: 'legs', shade: 0.24 },
  { at: [-0.19, 0.30, -0.30], size: [0.068, 0.30, 0.068], joint: 'legs', shade: 0.24 },
]

/** Neck, head and muzzle. Shared by everything with four legs. */
const HEAD: Part[] = [
  { at: [0, 0.88, 0.52], size: [0.14, 0.20, 0.17], joint: 'head', lean: [-0.55, 0], shade: 0.58 },
  { at: [0, 1.04, 0.70], size: [0.145, 0.155, 0.20], joint: 'head', shade: 0.7 },
  { at: [0, 0.98, 0.89], size: [0.085, 0.085, 0.13], joint: 'head', shade: 0.3 },
]

function ears(spread: number, height: number, length: number, lean: number, shade = 0.34): Part[] {
  return [1, -1].map((s) => ({
    at: [s * spread, 1.10 + height, 0.63] as [number, number, number],
    size: [0.045, length, 0.055] as [number, number, number],
    joint: 'head' as Joint,
    lean: [lean, s * 0.3] as [number, number],
    shade,
  }))
}

/**
 * Every animal, as a list of parts.
 *
 * A closed set rather than anything procedural, because six hand-placed
 * silhouettes that read at thirty metres are worth more than a generator that
 * makes a hundred that do not. Adding one is adding a case here and a name to
 * `CREATURE_KINDS`.
 */
export function partsFor(kind: CreatureKind): Part[] {
  switch (kind) {
    /*
      The dog. The shared practice's animal, and the one the brief asked for —
      so it is the only one built to be looked at close up, because it is the
      one that comes over. Long tail, and it is the tail that does the work.
    */
    case 'dog':
      return [
        ...BODY,
        ...LEGS,
        ...HEAD,
        ...ears(0.115, 0.0, 0.10, 0.7),
        { at: [0, 0.80, -0.56], size: [0.055, 0.055, 0.30], joint: 'tail', lean: [-0.5, 0], shade: 0.46 },
        { at: [0, 0.92, -0.78], size: [0.05, 0.05, 0.18], joint: 'tail', lean: [-0.7, 0], shade: 0.52 },
      ]

    /*
      The hare. Short, low and almost all ears — the one animal on the hill
      whose silhouette is unmistakable at any distance, which is why it is the
      default for a practice nobody has chosen a creature for.
    */
    case 'hare':
      return [
        { at: [0, 0.44, 0], size: [0.22, 0.23, 0.36], joint: 'body', shade: 0.5 },
        { at: [0, 0.52, -0.22], size: [0.23, 0.25, 0.20], joint: 'body', shade: 0.4 },
        { at: [0.13, 0.20, 0.16], size: [0.05, 0.20, 0.05], joint: 'legs', shade: 0.28 },
        { at: [-0.13, 0.20, 0.16], size: [0.05, 0.20, 0.05], joint: 'legs', shade: 0.28 },
        { at: [0.15, 0.22, -0.18], size: [0.07, 0.22, 0.10], joint: 'legs', shade: 0.28 },
        { at: [-0.15, 0.22, -0.18], size: [0.07, 0.22, 0.10], joint: 'legs', shade: 0.28 },
        { at: [0, 0.66, 0.24], size: [0.13, 0.14, 0.16], joint: 'head', shade: 0.66 },
        { at: [0, 0.62, 0.38], size: [0.075, 0.075, 0.10], joint: 'head', shade: 0.3 },
        ...ears(0.075, -0.30, 0.24, 0.12, 0.4),
        { at: [0, 0.50, -0.40], size: [0.07, 0.07, 0.07], joint: 'tail', shade: 0.86 },
      ]

    /* The goat. Horns, a short tail carried up, and a squarer body. */
    case 'goat':
      return [
        ...BODY,
        ...LEGS,
        ...HEAD,
        { at: [0.075, 1.16, 0.60], size: [0.032, 0.13, 0.032], joint: 'head', lean: [-0.55, 0.22], shade: 0.16 },
        { at: [-0.075, 1.16, 0.60], size: [0.032, 0.13, 0.032], joint: 'head', lean: [-0.55, -0.22], shade: 0.16 },
        { at: [0.135, 1.04, 0.64], size: [0.04, 0.09, 0.045], joint: 'head', lean: [0.2, 0.5], shade: 0.34 },
        { at: [-0.135, 1.04, 0.64], size: [0.04, 0.09, 0.045], joint: 'head', lean: [0.2, -0.5], shade: 0.34 },
        { at: [0, 0.86, -0.52], size: [0.05, 0.11, 0.05], joint: 'tail', lean: [0.5, 0], shade: 0.4 },
      ]

    /*
      The crane. Two legs, a long neck and a beak — and the only one here that
      is taller than it is long, which is what makes a bird read as a bird from
      the far side of the fold.
    */
    case 'crane':
      return [
        { at: [0, 0.98, 0], size: [0.19, 0.20, 0.36], joint: 'body', shade: 0.62 },
        { at: [0, 1.00, -0.30], size: [0.13, 0.15, 0.22], joint: 'body', lean: [0.3, 0], shade: 0.3 },
        { at: [0.09, 0.49, 0.02], size: [0.035, 0.49, 0.035], joint: 'legs', shade: 0.2 },
        { at: [-0.09, 0.49, 0.02], size: [0.035, 0.49, 0.035], joint: 'legs', shade: 0.2 },
        { at: [0, 1.30, 0.20], size: [0.062, 0.30, 0.062], joint: 'head', lean: [-0.24, 0], shade: 0.7 },
        { at: [0, 1.60, 0.32], size: [0.075, 0.085, 0.10], joint: 'head', shade: 0.78 },
        { at: [0, 1.57, 0.48], size: [0.028, 0.028, 0.16], joint: 'head', shade: 0.14 },
        { at: [0.20, 1.00, -0.02], size: [0.055, 0.14, 0.30], joint: 'tail', lean: [0, 0.3], shade: 0.5 },
        { at: [-0.20, 1.00, -0.02], size: [0.055, 0.14, 0.30], joint: 'tail', lean: [0, -0.3], shade: 0.5 },
      ]

    /* The fox. A dog's frame, lower, with a brush that is half the animal. */
    case 'fox':
      return [
        { at: [0, 0.54, 0], size: [0.24, 0.23, 0.52], joint: 'body', shade: 0.56 },
        { at: [0, 0.57, 0.30], size: [0.23, 0.24, 0.20], joint: 'body', shade: 0.64 },
        { at: [0.16, 0.26, 0.26], size: [0.055, 0.26, 0.055], joint: 'legs', shade: 0.16 },
        { at: [-0.16, 0.26, 0.26], size: [0.055, 0.26, 0.055], joint: 'legs', shade: 0.16 },
        { at: [0.16, 0.26, -0.26], size: [0.055, 0.26, 0.055], joint: 'legs', shade: 0.16 },
        { at: [-0.16, 0.26, -0.26], size: [0.055, 0.26, 0.055], joint: 'legs', shade: 0.16 },
        { at: [0, 0.72, 0.46], size: [0.12, 0.14, 0.16], joint: 'head', shade: 0.68 },
        { at: [0, 0.67, 0.64], size: [0.06, 0.06, 0.14], joint: 'head', shade: 0.22 },
        ...ears(0.085, -0.32, 0.10, 0.0, 0.22),
        { at: [0, 0.60, -0.44], size: [0.11, 0.11, 0.22], joint: 'tail', lean: [-0.2, 0], shade: 0.7 },
        { at: [0, 0.62, -0.68], size: [0.10, 0.10, 0.18], joint: 'tail', lean: [-0.15, 0], shade: 0.88 },
      ]

    /* The ox. Heavy, low-headed and slow — the practice somebody has kept for
       a year looks like this, and it should look like it takes some moving. */
    case 'ox':
      return [
        { at: [0, 0.78, 0], size: [0.40, 0.38, 0.72], joint: 'body', shade: 0.46 },
        { at: [0, 0.86, 0.36], size: [0.38, 0.40, 0.26], joint: 'body', shade: 0.4 },
        { at: [0, 0.74, -0.44], size: [0.36, 0.36, 0.26], joint: 'body', shade: 0.36 },
        { at: [0.26, 0.38, 0.36], size: [0.09, 0.38, 0.09], joint: 'legs', shade: 0.2 },
        { at: [-0.26, 0.38, 0.36], size: [0.09, 0.38, 0.09], joint: 'legs', shade: 0.2 },
        { at: [0.26, 0.38, -0.38], size: [0.09, 0.38, 0.09], joint: 'legs', shade: 0.2 },
        { at: [-0.26, 0.38, -0.38], size: [0.09, 0.38, 0.09], joint: 'legs', shade: 0.2 },
        { at: [0, 0.94, 0.60], size: [0.19, 0.21, 0.22], joint: 'head', lean: [-0.3, 0], shade: 0.5 },
        { at: [0, 0.82, 0.82], size: [0.13, 0.13, 0.17], joint: 'head', shade: 0.3 },
        { at: [0.21, 1.04, 0.58], size: [0.045, 0.045, 0.17], joint: 'head', lean: [0, 0.9], shade: 0.12 },
        { at: [-0.21, 1.04, 0.58], size: [0.045, 0.045, 0.17], joint: 'head', lean: [0, -0.9], shade: 0.12 },
        { at: [0, 0.86, -0.68], size: [0.045, 0.20, 0.045], joint: 'tail', lean: [-0.1, 0], shade: 0.3 },
      ]
  }
}

/**
 * The two coats an animal can have, dark to light.
 *
 * Keyed off whose practice it is, so a glance across the fold says which of you
 * has been keeping what — the same warm and cool the two lights in the Stars
 * use, pulled a long way down toward the ground so they read as an animal in a
 * field rather than as two coloured markers.
 *
 * **The shared practice gets neither.** It is drawn in the fold's own earth
 * colours, because it belongs to both of you and tinting it either way would be
 * the section quietly saying whose it really is.
 */
const COATS: Record<'warm' | 'cool' | 'both', [string, string]> = {
  warm: ['#3a2b21', '#a87a4e'],
  cool: ['#26303c', '#8496ac'],
  both: ['#332a24', '#9b8b76'],
}

/** The colour of one part, from its shade and whose animal it is. */
export function coatOf(owner: 'warm' | 'cool' | 'both', shade: number): string {
  const [dark, light] = COATS[owner]
  return mixHex(dark, light, Math.max(0, Math.min(1, shade)))
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (p: number, s: number) => (p >> s) & 255
  const out =
    (Math.round(ch(pa, 16) + (ch(pb, 16) - ch(pa, 16)) * t) << 16) |
    (Math.round(ch(pa, 8) + (ch(pb, 8) - ch(pa, 8)) * t) << 8) |
    Math.round(ch(pa, 0) + (ch(pb, 0) - ch(pa, 0)) * t)
  return '#' + out.toString(16).padStart(6, '0')
}

/**
 * Turn one animal's parts and one pose into instances, written in place.
 *
 * ---------------------------------------------------------------------------
 * Writes straight into the buffers rather than allocating, because this runs
 * once per animal per frame and a garbage collection during a graze is a
 * visible hitch. `at` is the index of the first part in the arrays; the return
 * is the index after the last.
 *
 * The hierarchy is applied by hand — joint first, then the animal's own yaw and
 * position — because the shared form shader knows nothing about parents. Order
 * matters and is the same order `FORM_VERT` uses on its own two rotations:
 * lean, then spin.
 * ---------------------------------------------------------------------------
 */
export function poseInto(
  parts: Part[],
  pose: Pose,
  owner: 'warm' | 'cool' | 'both',
  at: number,
  out: {
    offset: Float32Array
    scale: Float32Array
    rot: Float32Array
    phase: Float32Array
    lean: Float32Array
    anchorY: Float32Array
    colour: Float32Array
  },
  colourOf: (hex: string) => [number, number, number],
): number {
  const cy = Math.cos(pose.yaw)
  const sy = Math.sin(pose.yaw)

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    let [px, py, pz] = part.at
    let leanX = part.lean?.[0] ?? 0
    const leanZ = part.lean?.[1] ?? 0

    /*
      Lying down is a rotation of the whole body about the hips plus a drop,
      not a separate set of parts. The legs go with it and end up under the
      animal, which at any distance this is read from is exactly what folded
      legs look like.
    */
    if (pose.down > 0) {
      const drop = pose.down * 0.34
      py -= drop
      if (part.joint === 'legs') {
        // Folded: shortened and tucked in under the barrel.
        py -= pose.down * 0.06
        pz *= 1 - pose.down * 0.45
      }
      leanX += pose.down * 0.12
    }

    if (part.joint === 'head') {
      /*
        The head comes down to the grass and forward, about the base of the
        neck. Two thirds of a metre of travel on a full-grown animal, which is
        the difference between an animal looking at you and an animal eating.
      */
      const g = pose.graze
      const pivotY = 0.66
      const pivotZ = 0.34
      const a = g * 0.95
      const dy = py - pivotY
      const dz = pz - pivotZ
      py = pivotY + dy * Math.cos(a) - dz * Math.sin(a) * 0.0 - g * 0.30
      pz = pivotZ + dz * Math.cos(a) + dy * Math.sin(a) * 0.0 + g * 0.14
      leanX += a
    }

    if (part.joint === 'tail') {
      // Side to side about where it joins, which is all a tail has to do.
      const s = Math.sin(pose.swing) * 0.5
      px += pz * -s * 0.5
      leanX += pose.down * 0.5
    }

    // Into the animal's own footing: scale, then yaw, then translate.
    const sx = px * pose.scale
    const sy2 = py * pose.scale
    const sz = pz * pose.scale

    const o = (at + i) * 3
    out.offset[o] = pose.x + sx * cy + sz * sy
    out.offset[o + 1] = pose.y + sy2
    out.offset[o + 2] = pose.z - sx * sy + sz * cy

    out.scale[o] = part.size[0] * pose.scale
    out.scale[o + 1] = part.size[1] * pose.scale
    out.scale[o + 2] = part.size[2] * pose.scale

    out.rot[at + i] = pose.yaw
    out.phase[at + i] = i * 0.7
    out.lean[(at + i) * 2] = leanX
    out.lean[(at + i) * 2 + 1] = leanZ
    /*
      Nought, and on purpose. `iAnchorY` drives how far the wind bends a piece,
      and it is measured from the foot of the thing it belongs to — a tree bends
      and a blade of grass does not. An animal is not blown about by the
      weather, so every part of it is at the ground as far as the wind knows.
    */
    out.anchorY[at + i] = 0

    const [r, g, b] = colourOf(coatOf(owner, part.shade))
    out.colour[o] = r
    out.colour[o + 1] = g
    out.colour[o + 2] = b
  }

  return at + parts.length
}

/** A shared, unposed instance so the buffers can be sized once. */
export function blankInstance(): FormInstance {
  return { offset: [0, -999, 0], scale: [0, 0, 0], rot: 0, phase: 0, color: '#000000' }
}
