/**
 * The bones of the Glasshouse: ribs, purlins, and the stone it stands on.
 *
 * All of it is one instanced box. A conservatory is a repeated arch and a few
 * long members, which is about the most instanceable thing there is — so the
 * whole structure, a hundred bays of it, costs one draw call and rides the
 * garden's own form shader, which means it agrees with the trees outside about
 * fog and about what "lit" means.
 *
 * It is deliberately not whole. The ribs are all there — iron outlasts glass —
 * and the glass is only where a memory has been hung, so an empty Glasshouse is
 * a skeleton against the sky and a full one is a tunnel of colour. That is the
 * section's one mechanic said in geometry: **the building is made of what the
 * two of you have kept.**
 */

import { makeRng, range, seedFrom } from '@/systems/rng'
import type { FormInstance } from '@/world/forms'
import { BAY, DWARF, EAVE, HALF, PLINTH, RIDGE } from './layout'

/**
 * Iron that has been outside for a long time.
 *
 * Not black. Painted ironwork weathers to a dusty blue-green over lead grey,
 * and the rust comes through at the joints — which is three colours picked per
 * instance and does more for this than any amount of geometry would.
 */
const IRON = ['#4a4f4c', '#3f4643', '#545a53', '#4e463c', '#5b5148'] as const

/** How thick a rib is, in metres. Slender: this is iron, not timber. */
const RIB = 0.075

/**
 * One arch, as a run of short straight segments.
 *
 * Vertical to the eaves and then a quarter of an ellipse over to the ridge,
 * which is the shape of every real glasshouse roof and the reason they read as
 * glasshouses from a distance. Straight segments rather than a swept tube: at
 * seven and a half centimetres thick nobody can see the facets, and it keeps
 * the whole building inside `buildInstanced` and its one box.
 */
function arch(z: number, seed: number, colour: (i: number) => string): FormInstance[] {
  const out: FormInstance[] = []
  const rng = makeRng(seed)
  let n = 0

  const put = (
    x: number,
    y: number,
    length: number,
    lean: number,
    thick = RIB,
  ) => {
    out.push({
      offset: [x, y, z],
      scale: [thick, length, thick],
      rot: 0,
      // Leaning about Z tips the segment within the x–y plane, which is the
      // plane the arch lives in. Leaning about X would tip it down the aisle.
      lean: [0, lean],
      phase: rng() * 6.28,
      color: colour(n++),
      // Wind bends by height above the foot, so the ridge moves and the
      // footings do not — see FORM_VERT. An arch is one continuous thing, so
      // every piece of it reports its real height.
      anchorY: y,
    })
  }

  for (const side of [-1, 1] as const) {
    // The upright, from the floor to the eaves.
    put(side * HALF, EAVE / 2, EAVE, 0)

    // The curve over the top. Eight segments a side is smooth at this scale.
    const STEPS = 8
    let px = side * HALF
    let py = EAVE
    for (let i = 1; i <= STEPS; i++) {
      const t = (i / STEPS) * (Math.PI / 2)
      const x = side * HALF * Math.cos(t)
      const y = EAVE + (RIDGE - EAVE) * Math.sin(t)
      const dx = x - px
      const dy = y - py
      const length = Math.hypot(dx, dy)
      // atan2(dx, dy) because a box's own long axis is Y: the angle wanted is
      // how far the segment leans *off vertical*, not its heading.
      put(px + dx / 2, py + dy / 2, length * 1.06, Math.atan2(dx, dy) * -1)
      px = x
      py = y
    }
  }

  return out
}

/**
 * Ribs and purlins for a building that has been built this far.
 *
 * `length` is how far along the Glasshouse runs, in metres. One bay past the
 * last memory always, so the end of it is scaffolding and sky rather than a
 * wall you have arrived at.
 */
export function ironFrame(length: number): FormInstance[] {
  const out: FormInstance[] = []
  const bays = Math.max(2, Math.ceil(length / BAY) + 1)
  const rng = makeRng(seedFrom('glasshouse:iron'))

  for (let b = 0; b < bays; b++) {
    const z = b * BAY
    // Each rib picks its own colours, so no two arches weather alike.
    const seed = seedFrom(`glasshouse:rib:${b}`)
    const pigment = makeRng(seed)
    out.push(...arch(z, seed, () => IRON[(pigment() * IRON.length) | 0]))
  }

  /*
    The purlins — the long members that run the length of the building and hold
    the ribs apart.

    Structurally this is what stops a row of arches being a row of arches. It is
    also what draws the eye down the aisle: five lines converging on the far end
    is the entire perspective of the place, and without them the vanishing point
    is a guess.
  */
  const runs: [number, number][] = [
    [-HALF, DWARF + 0.03],
    [-HALF, EAVE - 0.15],
    [-HALF * 0.72, RIDGE - 0.85],
    [HALF * 0.72, RIDGE - 0.85],
    [HALF, EAVE - 0.15],
    [HALF, DWARF + 0.03],
    [0, RIDGE - 0.02],
  ]
  const span = bays * BAY
  for (const [x, y] of runs) {
    out.push({
      offset: [x, y, span / 2 - BAY / 2],
      // A box is a metre tall in Y by default, so a member running down the
      // building is a very long, very thin one turned onto its side.
      scale: [RIB * 0.8, span, RIB * 0.8],
      rot: 0,
      lean: [Math.PI / 2, 0],
      phase: rng() * 6.28,
      color: IRON[(rng() * IRON.length) | 0],
      anchorY: y,
    })
  }

  return out
}

/**
 * The old glazing, still in the roof.
 *
 * ---------------------------------------------------------------------------
 * **Without this it is a pergola.** The memories are the *coloured* glass and
 * that is the mechanic — but a building made only of arches and photographs is
 * a row of hoops with pictures hanging in it, and the first look at it proved
 * exactly that. What makes a conservatory legible from the inside in half a
 * second is glazing overhead: pale, filthy, and a lot of it broken.
 *
 * So the roof keeps its original panels, colourless and clouded, with about
 * two in five gone. The gaps are where the sky comes in, where the light that
 * lands on the floor comes from, and where the vines got in. That is the
 * brief's "the iron framework is still standing, but many panes are missing"
 * said as geometry rather than as atmosphere.
 * ---------------------------------------------------------------------------
 *
 * Opaque, on the ordinary form shader. Old horticultural glass is not
 * see-through — it is a milky sheet you can tell the weather through — and an
 * opaque one sorts correctly against a hundred other quads, which a
 * transparent one does not.
 */
export function roofGlazing(length: number): FormInstance[] {
  const out: FormInstance[] = []
  const bays = Math.max(2, Math.ceil(length / BAY) + 1)
  const rng = makeRng(seedFrom('glasshouse:glazing'))

  /** Milky, and never the same twice — a century of rain does not do even. */
  const CLOUD = ['#8e968f', '#98a099', '#848c86', '#9ba39a', '#7d857f'] as const
  const STEPS = 5

  for (let b = 0; b < bays; b++) {
    const z = b * BAY
    for (const side of [-1, 1] as const) {
      for (let i = 0; i < STEPS; i++) {
        // Two in five gone, decided by the bay and the panel so the same
        // holes are in the same places on both of your phones forever.
        const gap = makeRng(seedFrom(`glasshouse:gone:${b}:${side}:${i}`))
        if (gap() < 0.42) continue

        const t0 = (i / STEPS) * (Math.PI / 2)
        const t1 = ((i + 1) / STEPS) * (Math.PI / 2)
        const x0 = side * HALF * Math.cos(t0)
        const y0 = EAVE + (RIDGE - EAVE) * Math.sin(t0)
        const x1 = side * HALF * Math.cos(t1)
        const y1 = EAVE + (RIDGE - EAVE) * Math.sin(t1)
        const run = Math.hypot(x1 - x0, y1 - y0)

        out.push({
          offset: [(x0 + x1) / 2, (y0 + y1) / 2, z + BAY / 2],
          // A plane is 1×1 in x–y; the panel is as long as the run of roof it
          // spans and as deep as the bay it bridges. The depth is applied by
          // the lean below turning it into the z direction.
          scale: [run * 1.02, BAY * 0.97, 1],
          rot: 0,
          /*
            Lie it down along the bay, then tip it to the roof's angle. The
            order matters and is the same one FORM_VERT applies: about X first,
            which lays the panel flat, then about Z, which pitches it.
          */
          lean: [Math.PI / 2, Math.atan2(y1 - y0, x1 - x0)],
          phase: rng() * 6.28,
          color: CLOUD[(rng() * CLOUD.length) | 0],
          anchorY: (y0 + y1) / 2,
        })
      }
    }
  }
  return out
}

/**
 * The walls: a low course of stone, and the plain glazing above it.
 *
 * ---------------------------------------------------------------------------
 * **What makes a memory read as glass rather than as a poster.** The first
 * version left the walls entirely open between the ribs, on the reasoning that
 * the glass *is* the memories — and the result was a shelter with pictures
 * hanging in it and the meadow visible at ankle height straight through the
 * building.
 *
 * A wall panel is one bay wide and runs from the dwarf wall to the eaves.
 * `taken` is the set of panels a memory occupies, and those are left out: the
 * photograph is set into the wall exactly where a pane of plain glass would
 * otherwise be. Of what remains, some is still glazed and some is long gone,
 * and the gaps are where the meadow, the wood and the weather get in.
 * ---------------------------------------------------------------------------
 */
export function wallGlazing(length: number, taken: ReadonlySet<string>): FormInstance[] {
  const out: FormInstance[] = []
  const bays = Math.max(2, Math.ceil(length / BAY) + 1)
  const rng = makeRng(seedFrom('glasshouse:walls'))
  const CLOUD = ['#8a918b', '#939a93', '#818880', '#969d94'] as const
  const high = EAVE - DWARF

  for (let b = 0; b < bays; b++) {
    for (const side of [-1, 1] as const) {
      if (taken.has(panelKey(b, side))) continue
      /*
        Mostly glazed, and it was not.

        Two panels in five missing was chosen when the camera looked straight
        down the middle and the walls were seen edge-on. Now that it turns to
        face them you are looking *at* a wall — and a wall that is forty per
        cent holes reads as a building site rather than as an old conservatory.
        One in six keeps the gaps as events: somewhere the meadow gets in,
        somewhere a vine came through. Fixed by bay, so they never move.
      */
      const gone = makeRng(seedFrom(`glasshouse:wallgone:${b}:${side}`))
      if (gone() < 0.17) continue

      out.push({
        offset: [side * HALF, DWARF + high / 2, b * BAY + BAY / 2],
        // A metre-square plane laid into the wall plane: as wide as the bay,
        // as tall as the glazed height, then turned to face across the aisle.
        scale: [BAY * 0.96, high * 0.97, 1],
        rot: Math.PI / 2,
        phase: rng() * 6.28,
        color: CLOUD[(rng() * CLOUD.length) | 0],
        anchorY: DWARF + high / 2,
      })
    }
  }

  return out
}

/** How a wall panel is named, so the glazing and the panes agree about it. */
export function panelKey(bay: number, side: -1 | 1): string {
  return `${bay}:${side}`
}

/**
 * The terrace: a level stone plinth, and the flags laid on top of it.
 *
 * ---------------------------------------------------------------------------
 * The plinth is deep — seven metres — and that is not decoration. A building
 * lying a hundred metres along Z crosses about four and a half metres of
 * meadow roll, and a conservatory does not undulate; so it stands on one level
 * terrace, set above the highest ground it will ever reach (`GLASS_Y`) and
 * reaching down well below the lowest. Without the depth the meadow simply
 * grows up through the floor at every crest.
 * ---------------------------------------------------------------------------
 *
 * The flags on top are separate, slightly uneven slabs rather than one painted
 * surface, because the whole place is lit by pools of coloured light lying
 * across this floor — and light falling on a flat plane with no edges in it
 * has nothing to break on, so it reads as a projected image instead of as
 * light on stone.
 */
export function flagstones(length: number): FormInstance[] {
  const out: FormInstance[] = []
  const rng = makeRng(seedFrom('glasshouse:flags'))
  const run = length + BAY * 4

  /*
    The body of the terrace. Four boxes rather than one, so its own top face is
    never a single quad the size of a runway — which is where the depth buffer
    starts arguing with the flags laid on it.
  */
  for (let i = 0; i < 4; i++) {
    const span = run / 4
    out.push({
      offset: [0, -PLINTH / 2 - 0.06, -BAY * 1.5 + span * (i + 0.5)],
      scale: [HALF * 2 + 0.5, PLINTH, span + 0.02],
      rot: 0,
      phase: 0,
      color: '#4a4944',
    })
  }

  /*
    The dwarf wall, in courses, and it belongs *here* rather than with the
    glazing.

    It went in with the wall glass first, which was wrong in a way worth
    keeping written down: the glazing is instanced off a `PlaneGeometry`, and a
    plane has no depth — so the wall's z-scale did nothing at all and every
    course came out as a flat slab standing across the aisle. A hundred metres
    of low stone wall rendered as a row of fence posts, and it looked exactly
    like that. **An instance's scale means nothing the base geometry does not
    already have.**
  */
  const courses = Math.ceil(run / 1.1)
  for (let i = -2; i < courses; i++) {
    for (const side of [-1, 1] as const) {
      const wall = makeRng(seedFrom(`glasshouse:dwarf:${i}:${side}`))
      const height = DWARF + range(wall, -0.02, 0.02)
      out.push({
        offset: [side * (HALF + 0.03), height / 2, -BAY * 1.5 + i * 1.1 + 0.55],
        // Overlapping slightly, so the courses read as one wall with joints in
        // it rather than as blocks with gaps between them.
        scale: [0.24, height, 1.14],
        rot: 0,
        phase: wall() * 6.28,
        color: pickStone(wall()),
      })
    }
  }

  const ACROSS = 4
  const DEEP = 1.3
  const rows = Math.ceil(run / DEEP) + 2

  for (let r = -2; r < rows; r++) {
    for (let c = 0; c < ACROSS; c++) {
      const w = ((HALF * 2) / ACROSS) * range(rng, 0.9, 0.985)
      const d = DEEP * range(rng, 0.88, 0.97)
      out.push({
        offset: [
          -HALF + ((c + 0.5) * (HALF * 2)) / ACROSS + range(rng, -0.03, 0.03),
          // Sunk into the plinth, so only the top faces show and no slab
          // stands proud of its neighbour.
          -0.055 + range(rng, -0.01, 0.01),
          r * DEEP + range(rng, -0.05, 0.05),
        ],
        scale: [w, 0.12, d],
        rot: range(rng, -0.015, 0.015),
        phase: rng() * 6.28,
        color: pickStone(rng()),
      })
    }
  }
  return out
}

/**
 * Pale wet limestone, in five weathers.
 *
 * Mid, and it has been both. Nearly black swallowed the pools; pale grey
 * washed them out, because an additive glow only shows against something with
 * headroom left. This sits where a colour laid on it still reads as a colour.
 * Cool and low in saturation so that what is on it is the event, never the
 * stone itself.
 */
function pickStone(t: number): string {
  const STONE = ['#6f6c65', '#67645d', '#77736a', '#615e58', '#6b6760'] as const
  return STONE[Math.min(STONE.length - 1, (t * STONE.length) | 0)]
}

/**
 * The vines.
 *
 * They come in through the broken roof and go where the iron is, which is what
 * a climbing plant actually does — it needs something to hold. So they are
 * seeded along the ribs, thickest at the deep end where the building is oldest
 * and thinning toward the open end, and that gradient is the second thing
 * telling you which way through time you are looking.
 *
 * `oldest` is the metre mark of the far end and `newest` of the near one, so
 * the growth follows the building rather than a fixed number of bays.
 */
export function vines(length: number, count: number): FormInstance[] {
  const out: FormInstance[] = []
  const rng = makeRng(seedFrom('glasshouse:vines'))
  const LEAF = ['#54633f', '#465733', '#61704a', '#3d4c2d', '#6b7752'] as const

  for (let i = 0; i < count; i++) {
    /*
      Biased toward z = 0, which is the oldest end.

      Squaring a uniform draw is the cheapest honest way to get "more of them
      down there": it is not a rule anybody wrote, it is a distribution, so the
      thinning reads as growth rather than as a fade.
    */
    const along = rng() * rng() * length

    // On the iron, which means on a rib: either an upright or the curve.
    const side = rng() < 0.5 ? -1 : 1
    const up = rng()
    const t = up < 0.62 ? 0 : ((up - 0.62) / 0.38) * (Math.PI / 2)
    const x = side * HALF * (t === 0 ? 1 : Math.cos(t))
    const y = t === 0 ? up * (EAVE / 0.62) * 0.62 : EAVE + (RIDGE - EAVE) * Math.sin(t)

    // A cluster of leaves rather than one, so a vine is a mass and not confetti.
    const leaves = 2 + ((rng() * 3) | 0)
    for (let l = 0; l < leaves; l++) {
      const size = range(rng, 0.11, 0.26)
      out.push({
        offset: [
          x + range(rng, -0.16, 0.16),
          y + range(rng, -0.22, 0.22),
          along + range(rng, -0.3, 0.3),
        ],
        scale: [size, size, size],
        rot: rng() * Math.PI * 2,
        lean: [range(rng, -1.2, 1.2), range(rng, -1.2, 1.2)],
        phase: rng() * 6.28,
        color: LEAF[(rng() * LEAF.length) | 0],
        anchorY: y,
      })
    }
  }
  return out
}
