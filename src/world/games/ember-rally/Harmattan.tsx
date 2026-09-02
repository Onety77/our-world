/**
 * The Harmattan — a road across the Sahel with the dust wind blowing.
 *
 * =============================================================================
 * **The first road in this game with the sun on it**, and everything here
 * follows from that one fact.
 *
 * The Rootway is a cave and the Moonbreak and the Stormcrown are night. All
 * three are lit by the car: two headlamp cones, a warm pool, a sliding window
 * of lanterns, and a black world beyond them. That is the whole visual grammar
 * of Ember Rally and it does not survive daylight — a headlamp at noon is not a
 * light, it is a lens flare.
 *
 * So this road inverts it. **What hides the world here is brightness.** The
 * harmattan carries so much Saharan dust that the sky loses its blue entirely
 * and goes the colour of the ground; there is no horizon, because the ground
 * and the sky are the same value; and the sun becomes a flat pale disc you can
 * look straight at without flinching. You can see about a hundred metres, and
 * it is nothing like the Stormcrown's cloud, because cloud is grey and this is
 * *luminous*. Being blinded by light rather than by darkness is the single
 * thing this road has that none of the others can.
 *
 * **One cool colour, and only one.** Everything is laterite, ochre and dust —
 * the road, the ground, the mounds, the walls and the sky, all inside about
 * thirty degrees of hue. Against that, indigo: the banners that mark the
 * corners, and the dye pits. Adire cloth and the Kano pits are what that blue
 * is, and it is the only colour on the road that is not made of iron oxide.
 * A single contrast doing the work the lanterns do underground.
 *
 * **The banners are the corner markers and they are also the wind gauge.**
 * Cloth on tall poles, and because they are cloth in a steady wind they lean —
 * so a banner tells you both that a corner is coming and which way the gale is
 * pushing before you can feel it. See `bannersFor` in `track.ts` for how they
 * are placed, which is off the smoothed road rather than by hand.
 *
 * **You can see the difficulty.** The two mechanics this road adds are surface
 * ones — drifted sand and corrugation — and a surface mechanic you cannot read
 * is a random number. Both are drawn into the road itself: sand pales the
 * laterite where it lies, and the corrugation is banded across the road. Where
 * the road looks pale and stripy is exactly where it will not do what you ask.
 * =============================================================================
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  Points,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three'
import { basisAt, roadPoint, type RoadBasis, type TunnelChunk } from './geometry'
import { random } from './model'
import {
  HARMATTAN,
  emptyRoad,
  roadAt,
  vergeWidth,
  type Track,
} from './track'
import { HarmattanSound } from './HarmattanSound'

const RING = 2
const CHUNK = 60
const PROFILE = 13

/* ---- the palette, which is iron oxide and one blue ------------------------ */

/** Laterite. Iron-rich, brick-red, and what a road here is actually cut from. */
const ROAD = new Color('#8a4526')
/** Where the wheels have polished it. Every road here has a worn line. */
const ROAD_WORN = new Color('#b37a54')
/** Blown sand lying on the road. Pale, and the thing you have to see coming. */
const SAND = new Color('#dcb87f')
/** The shoulder: dust, and looser than the road. */
const VERGE = new Color('#a06a3c')
/**
 * The berm — the windrow of spoil a grader leaves down both sides of a road.
 *
 * It is here for a reason that is half real and half a rescue. Real, because
 * every graded laterite road on earth has one and it is most of why such a
 * road reads as *cut into* the plain rather than laid on it. A rescue,
 * because it is the one part of the road that sand cannot hide: it is raised,
 * so it catches the sun on one side and shadows on the other, and that line
 * survives any amount of drift lying on the surface between the two of them.
 *
 * Which makes it the answer to the thing that broke the wadi. Wherever the
 * sand is deepest, you can still see exactly where the road goes, because you
 * are not looking at the road — you are looking at its two edges.
 */
const BERM = new Color('#71401f')
/**
 * Open ground away from the road, bleached by the haze.
 *
 * Paler and greyer than the road on purpose, and it had to be moved twice.
 * Laterite with sand blown over it lands almost exactly on the colour of dry
 * plain — measured off a screenshot in the wadi, a road under deep drift and
 * the ground beside it were within a few hundredths of each other, and the
 * road simply was not there any more. This is the other half of keeping it
 * findable; the berm below is the half that always works.
 */
const GROUND = new Color('#a8865e')
/** Ironstone. The rubble the rain left standing on the plain. */
const STONE = new Color('#6d3f26')
/** Termite earth — the mounds are darker and greyer than the plain. */
const MOUND = new Color('#9a6a41')
/** Baobab bark: silver-grey, and the only pale thing growing. */
const BARK = new Color('#a49a86')
/** Its canopy in harmattan, which is nothing. A baobab in dust is bare. */
const BOUGH = new Color('#8e8471')
/** Rendered earth on a wall, lighter than the ground it is made of. */
const WALL = new Color('#b58150')
/** The torons — palm beams, weathered nearly black. */
const TORON = new Color('#3b2a1c')
/** Indigo. The banners and the pits, and the only cool colour on the road. */
const INDIGO = new Color('#243a6b')
/** Indigo in the sun, on cloth rather than in a pit. */
const INDIGO_LIT = new Color('#3c58a0')
/** Polished brass on a pole finial, which is the only thing that glints. */
const BRASS = new Color('#c89a4c')

function hash3(a: number, b: number, c: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return value - Math.floor(value)
}

class CourseMesh {
  readonly position: number[] = []
  readonly color: number[] = []
  readonly surface: number[] = []
  readonly index: number[] = []

  get count() {
    return this.position.length / 3
  }

  vertex(point: Vector3, color: Color, wet = 0, rough = 0.5) {
    this.position.push(point.x, point.y, point.z)
    this.color.push(color.r, color.g, color.b)
    this.surface.push(wet, rough)
  }

  quad(a: number, b: number, c: number, d: number) {
    this.index.push(a, b, c, a, c, d)
  }

  build() {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.position), 3))
    geometry.setAttribute('aColor', new BufferAttribute(new Float32Array(this.color), 3))
    geometry.setAttribute('aSurface', new BufferAttribute(new Float32Array(this.surface), 2))
    geometry.setIndex(this.index)
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
    return geometry
  }
}

const point = new Vector3()
const tint = new Color()

function addBox(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  y: number,
  along: number,
  across: number,
  high: number,
  color: Color,
  rough = 0.78,
) {
  const base = mesh.count
  for (const ds of [-along, along]) {
    for (const dy of [0, high]) {
      for (const dn of [-across, across]) {
        roadPoint(road, n + dn, y + dy, point, basis)
        point.x += basis.fx * ds
        point.y += basis.fy * ds
        point.z += basis.fz * ds
        mesh.vertex(point, color, 0, rough)
      }
    }
  }
  mesh.quad(base, base + 4, base + 5, base + 1)
  mesh.quad(base + 2, base + 3, base + 7, base + 6)
  mesh.quad(base, base + 2, base + 6, base + 4)
  mesh.quad(base + 1, base + 5, base + 7, base + 3)
  mesh.quad(base + 4, base + 6, base + 7, base + 5)
  mesh.quad(base, base + 1, base + 3, base + 2)
}

/** A four-sided tapered stump: the shape almost everything here is made of. */
function addTaper(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  y: number,
  high: number,
  wideAt: number,
  wideTop: number,
  color: Color,
  lean = 0,
  rough = 0.85,
) {
  const base = mesh.count
  for (const [dy, r] of [[0, wideAt], [high, wideTop]] as const) {
    for (const [ds, dn] of [[-r, -r], [r, -r], [r, r], [-r, r]] as const) {
      roadPoint(road, n + dn + lean * (dy / Math.max(0.001, high)), y + dy, point, basis)
      point.x += basis.fx * ds
      point.y += basis.fy * ds
      point.z += basis.fz * ds
      mesh.vertex(point, color, 0, rough)
    }
  }
  for (let k = 0; k < 4; k++) {
    const a = base + k
    const b = base + ((k + 1) % 4)
    mesh.quad(a, b, b + 4, a + 4)
  }
  mesh.quad(base + 4, base + 5, base + 6, base + 7)
}

/**
 * A baobab.
 *
 * The one silhouette on this continent nobody mistakes for anything else: an
 * enormously fat trunk that barely tapers, then a sudden stop, then a handful
 * of stubby branches thrown out sideways. In harmattan it is bare — the leaves
 * go with the rains — which is why the branches are drawn and no canopy is.
 * Upside-down-looking is the point; getting it wrong would look like an oak.
 */
function addBaobab(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  seed: number,
) {
  const big = 0.8 + hash3(seed, 1, 3) * 0.7
  const trunk = 5.4 * big
  const fat = 1.5 * big
  addTaper(mesh, road, basis, n, 0, trunk, fat, fat * 0.72, BARK)
  // Three to five limbs, short, thick, and going out rather than up.
  const limbs = 3 + Math.floor(hash3(seed, 2, 9) * 3)
  for (let i = 0; i < limbs; i++) {
    const spin = (i / limbs) * Math.PI * 2 + hash3(seed, i, 4) * 1.1
    const reach = (1.5 + hash3(seed, i, 5) * 1.5) * big
    const rise = (1.1 + hash3(seed, i, 6) * 1.5) * big
    const base = mesh.count
    const thick = 0.3 * big
    for (const [dy, r, outN, outS] of [
      [0, thick, 0, 0],
      [rise, thick * 0.55, Math.cos(spin) * reach, Math.sin(spin) * reach],
    ] as const) {
      for (const [ds, dn] of [[-r, -r], [r, -r], [r, r], [-r, r]] as const) {
        roadPoint(road, n + dn + outN, trunk * 0.86 + dy, point, basis)
        point.x += basis.fx * (ds + outS)
        point.y += basis.fy * (ds + outS)
        point.z += basis.fz * (ds + outS)
        mesh.vertex(point, BOUGH, 0, 0.9)
      }
    }
    for (let k = 0; k < 4; k++) {
      const a = base + k
      const b = base + ((k + 1) % 4)
      mesh.quad(a, b, b + 4, a + 4)
    }
  }
}

/**
 * A termite mound.
 *
 * Cathedral mounds: a metre or two across at the foot and four or five high,
 * with buttresses and spires. Drawn as a steep taper with two or three smaller
 * ones leaning on it, which is enough — at a hundred and thirty kilometres an
 * hour through dust, a mound is a silhouette and a silhouette is a shape.
 *
 * They are the only thing on this road that will stop a car, so they are kept
 * on the verge and never over it.
 */
function addMound(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  seed: number,
) {
  const high = 3.2 + hash3(seed, 7, 1) * 2.4
  const foot = 0.85 + hash3(seed, 7, 2) * 0.6
  addTaper(mesh, road, basis, n, 0, high, foot, foot * 0.12, MOUND)
  const spires = 2 + Math.floor(hash3(seed, 7, 3) * 2)
  for (let i = 0; i < spires; i++) {
    const spin = hash3(seed, i, 11) * Math.PI * 2
    const out = foot * (0.7 + hash3(seed, i, 12) * 0.6)
    tint.copy(MOUND).multiplyScalar(0.86 + hash3(seed, i, 13) * 0.22)
    addTaper(
      mesh, road, basis,
      n + Math.cos(spin) * out, 0,
      high * (0.42 + hash3(seed, i, 14) * 0.34),
      foot * 0.42, foot * 0.06, tint,
      Math.cos(spin) * 0.3,
    )
  }
}

/**
 * A run of town wall, with its torons.
 *
 * Sudano-Sahelian building: earth, battered so it leans inward as it rises,
 * buttressed at intervals, and stuck through with the palm beams that hold the
 * scaffolding every time it is re-plastered. The torons are the detail that
 * makes it unmistakable — nothing else on earth looks like a wall with sticks
 * coming out of it — and they are drawn at head height because that is where
 * they are, and because a driver's eye is at head height.
 */
function addWall(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  high: number,
  seed: number,
) {
  const side = Math.sign(n)
  tint.copy(WALL).multiplyScalar(0.9 + hash3(seed, 3, 1) * 0.18)
  addTaper(mesh, road, basis, n, 0, high, 1.05, 0.78, tint, -side * 0.16, 0.92)
  // A buttress, most of the time.
  if (hash3(seed, 3, 2) > 0.42) {
    addTaper(mesh, road, basis, n - side * 0.5, 0, high * 0.72, 0.55, 0.34, tint, -side * 0.1, 0.94)
  }
  // The beams. Two rows on a tall wall, one on a short.
  const rows = high > 4.4 ? 2 : 1
  for (let r = 0; r < rows; r++) {
    const y = high * (0.52 + r * 0.28)
    for (const ds of [-0.55, 0.55]) {
      const base = mesh.count
      const stick = 0.11
      for (const dn of [0, -side * 0.62]) {
        for (const [dy, dz] of [[-stick, -stick], [stick, -stick], [stick, stick], [-stick, stick]] as const) {
          roadPoint(road, n + dn, y + dy, point, basis)
          point.x += basis.fx * (ds + dz)
          point.y += basis.fy * (ds + dz)
          point.z += basis.fz * (ds + dz)
          mesh.vertex(point, TORON, 0, 0.95)
        }
      }
      for (let k = 0; k < 4; k++) {
        const a = base + k
        const b = base + ((k + 1) % 4)
        mesh.quad(a, b, b + 4, a + 4)
      }
      mesh.quad(base + 4, base + 5, base + 6, base + 7)
    }
  }
}

/**
 * An indigo banner: a pole, a brass finial, and a length of cloth.
 *
 * The corner markers, and the only thing on the road that reads clearly at a
 * hundred metres through dust — a dark vertical against a bright ground is the
 * one contrast the haze cannot flatten. The cloth is drawn as a strip leaning
 * away downwind, so the banner says which way the gale is pushing as well as
 * that a corner is coming.
 *
 * Both halves matter. The Rootway hangs lanterns, the Moonbreak sets pearls
 * and the Stormcrown stacks cairns, and all three of those only say *here*.
 * This one says here, and which way, and how hard.
 */
function addBanner(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  seed: number,
) {
  const high = 4.6 + hash3(seed, 5, 1) * 1.1
  addTaper(mesh, road, basis, n, 0, high, 0.09, 0.07, TORON, 0, 0.6)
  addTaper(mesh, road, basis, n, high, 0.26, 0.15, 0.02, BRASS, 0, 0.12)

  /*
    The cloth. A flat strip hanging from the top of the pole and blown out to
    one side — the lean is a constant here rather than animated, because this
    is baked geometry and a banner that flaps would have to be its own draw
    call fifty times over. The wind on this road is a *steady* one; a harmattan
    blows for six weeks. A banner standing at a constant angle is what that
    actually looks like, and it is also the honest thing to draw.
  */
  const drop = 3.1 + hash3(seed, 5, 2) * 0.9
  const blow = 1.3 + hash3(seed, 5, 3) * 0.6
  const base = mesh.count
  // Wide enough to be a *shape* at a hundred metres through dust rather than a
  // blue line. This is the one thing on the road that has to be legible when
  // nothing else is, so it is drawn bigger than a real banner would be.
  const wide = 0.62
  for (const [dy, out] of [[0, 0], [-drop, blow]] as const) {
    for (const ds of [-wide, wide]) {
      roadPoint(road, n + out * 0.35, high - 0.35 + dy, point, basis)
      point.x += basis.fx * (ds + out)
      point.y += basis.fy * (ds + out)
      point.z += basis.fz * (ds + out)
      mesh.vertex(point, dy === 0 ? INDIGO_LIT : INDIGO, 0, 0.75)
    }
  }
  mesh.quad(base, base + 1, base + 3, base + 2)
  mesh.quad(base + 2, base + 3, base + 1, base)
}

/** The rim of a dye pit: a low ring of packed earth around a disc of indigo. */
function addPit(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  radius: number,
  seed: number,
) {
  const sides = 9
  const rimBase = mesh.count
  // The dye itself: a flat disc, sunk a little, and very dark.
  roadPoint(road, n, -0.12, point, basis)
  mesh.vertex(point, INDIGO, 1, 0.02)
  for (let k = 0; k <= sides; k++) {
    const a = (k / sides) * Math.PI * 2
    roadPoint(road, n + Math.cos(a) * radius, -0.12, point, basis)
    point.x += basis.fx * Math.sin(a) * radius
    point.y += basis.fy * Math.sin(a) * radius
    point.z += basis.fz * Math.sin(a) * radius
    mesh.vertex(point, INDIGO, 1, 0.02)
  }
  for (let k = 1; k <= sides; k++) mesh.index.push(rimBase, rimBase + k, rimBase + k + 1)

  // And the earth wall around it, stained.
  tint.copy(VERGE).lerp(INDIGO, 0.34)
  const wallBase = mesh.count
  for (const dy of [0, 0.34]) {
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2
      const r = radius * (dy === 0 ? 1.24 : 1.06)
      roadPoint(road, n + Math.cos(a) * r, dy, point, basis)
      point.x += basis.fx * Math.sin(a) * r
      point.y += basis.fy * Math.sin(a) * r
      point.z += basis.fz * Math.sin(a) * r
      mesh.vertex(point, tint, 0.5 + hash3(seed, k, 1) * 0.3, 0.4)
    }
  }
  for (let k = 0; k < sides; k++) {
    mesh.quad(wallBase + k, wallBase + k + 1, wallBase + sides + 2 + k, wallBase + sides + 1 + k)
  }
}

/**
 * The road, in the same cullable chunks the other three courses use.
 *
 * The one thing done differently here is the surface colour, and it is doing
 * real work rather than decoration: sand pales the laterite exactly where the
 * sand is, and the corrugation bands it exactly where the ripples are. Both
 * of those are read straight off `roadAt`, so what you see is what the physics
 * is using — a drift cannot be drawn somewhere it will not be felt, and there
 * is no second copy of either number to drift out of step.
 */
export function buildHarmattan(track: Track): TunnelChunk[] {
  const rings = Math.floor(track.length / RING) + 1
  const chunkCount = Math.ceil(track.length / CHUNK)
  const meshes = Array.from({ length: chunkCount }, () => new CourseMesh())
  const spans: { from: number; to: number }[] = []
  const road = emptyRoad()
  const basis: RoadBasis = { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 }

  for (let chunk = 0; chunk < chunkCount; chunk++) {
    const mesh = meshes[chunk]
    const first = Math.floor((chunk * CHUNK) / RING)
    const last = Math.min(rings - 1, Math.floor(((chunk + 1) * CHUNK) / RING))
    spans.push({ from: first * RING, to: last * RING })

    for (let ring = first; ring <= last; ring++) {
      const s = ring * RING
      roadAt(track, s, road)
      basisAt(road, basis)

      /*
        How far out the ground goes before it stops being drawn.

        Wide on the plain, because the plain is the point of the plain; narrow
        in the wadi and inside the walls, where something is genuinely close.
        `room` already carries this — it is how far the walls stand back — so
        the ground follows it rather than a second table of section ranges.
      */
      const inTown = s > HARMATTAN.gateAt - 20 && s < HARMATTAN.gateOut + 12
      const out = road.width + vergeWidth(road.room) + (inTown ? 1.4 : 6 + road.room * 22)
      const offsets = [
        -out, -out, -road.width, -road.width * 0.92, -road.width * 0.62,
        -road.width * 0.31, 0,
        road.width * 0.31, road.width * 0.62, road.width * 0.92, road.width,
        out, out,
      ]
      /*
        The road is *crowned* — high in the middle, falling away either side —
        because a road that sheds water is built that way and because it puts a
        little of the sand at the edges where sand goes. Nothing in the physics
        reads this; the physics has `camber`, which is authored. This is the eye.
      */
      const drop = inTown ? -0.3 : -1.1
      /*
        Crowned in the middle, and bermed at both edges.

        The berm is the raised bit at index 1 and 11. Inside the walls there is
        none — a swept street between two buildings has a gutter, not a
        windrow — which is one more small way the town is unlike everywhere
        else on the road without anybody being told so.
      */
      const berm = inTown ? 0.02 : 0.34
      const heights = [drop, berm, 0.02, 0.05, 0.075, 0.092, 0.1, 0.092, 0.075, 0.05, 0.02, berm, drop]
      const base = mesh.count

      /*
        The corrugation, drawn.

        Ripples every couple of metres, banded across the road — which is both
        what a washboard looks like from a car and, at this sampling, the only
        honest way to draw it: the real ones are a hand's breadth apart and
        would alias into a shimmer at any speed worth driving. What is wanted
        is for the eye to read *this stretch is corrugated* from thirty metres
        away, and a coarse band does that where a fine one would not.
      */
      const ripple = road.ruts * (ring % 2 === 0 ? 1 : 0)

      for (let k = 0; k < PROFILE; k++) {
        roadPoint(road, offsets[k], heights[k], point, basis)
        const surface = k >= 2 && k <= 10
        const edge = k === 2 || k === 10
        const shoulder = k === 1 || k === 11
        let color = GROUND
        let rough = 0.95
        let wet = 0
        if (edge) {
          tint.copy(VERGE).multiplyScalar(0.82 + hash3(ring, k, 6) * 0.22)
          color = tint
          rough = 0.7
          wet = road.wet * 0.6
        } else if (surface) {
          const away = Math.abs(offsets[k] - road.line)
          const worn = 1 - Math.min(1, Math.max(0, (away - 0.3) / 1.25))
          tint.copy(ROAD).lerp(ROAD_WORN, worn * 0.5)
          /*
            And then the sand goes on top, because it is on top.

            Capped at just over half, and that cap is the whole lesson from
            looking at the wadi: at nine tenths the deepest drifts turned the
            road the same colour as the ground either side of it, and **the
            road disappeared.** A surface hazard you cannot locate is not a
            hazard, it is a fog — you could no longer see where the driveable
            stone ended, which is the one thing this game never takes away from
            you on any of the other three roads.

            Squared, so a dusting barely shows and a real drift is
            unmistakable; the same curve the physics uses for the pull, so what
            looks bad is exactly what drives badly. But the laterite always
            shows through, and the edges of the road stay findable.
          */
          tint.lerp(SAND, road.sand * road.sand * 0.46)
          tint.multiplyScalar((1 - ripple * 0.17) * (0.93 + hash3(ring, k, 2) * 0.11))
          color = tint
          rough = 0.18 + road.sand * 0.5
          wet = road.wet
        } else if (shoulder) {
          // The berm keeps its own colour: sand blows off a raised edge rather
          // than gathering on it, which is exactly why it stays readable.
          tint.copy(BERM).lerp(SAND, road.sand * 0.2).multiplyScalar(0.9 + hash3(ring, k, 4) * 0.18)
          color = tint
          rough = 0.9
          wet = road.wet * 0.4
        } else {
          tint.copy(GROUND).multiplyScalar(0.84 + hash3(ring, k, 8) * 0.26)
          color = tint
        }
        mesh.vertex(point, color, wet, rough)
      }

      if (ring > first) {
        const previous = base - PROFILE
        for (let k = 0; k < PROFILE - 1; k++) {
          mesh.quad(previous + k, previous + k + 1, base + k + 1, base + k)
        }
      }
    }
  }

  const chunkFor = (s: number) => Math.max(0, Math.min(chunkCount - 1, Math.floor(s / CHUNK)))
  const frameAt = (s: number) => {
    const at = roadAt(track, s)
    return {
      at,
      frame: basisAt(at, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 }),
    }
  }
  const rng = random(track.seed ^ 0x1cf05a)

  /*
    Baobabs, on the plain and nowhere else.

    Sparse on purpose: a baobab stands alone, which is most of why it looks the
    way it does, and a road lined with them would read as an avenue of oaks. One
    every seventy metres or so, well back from the verge, and the one at the
    Baobab Bend is placed rather than dealt because a corner named after a tree
    should have the tree on it.
  */
  for (let s = 30; s < HARMATTAN.cathedrals.from; s += 52 + rng() * 60) {
    const { at, frame } = frameAt(s)
    const side = rng() < 0.5 ? -1 : 1
    addBaobab(meshes[chunkFor(s)], at, frame, side * (at.width + 6 + rng() * 16), rng() * 900)
  }
  {
    const s = HARMATTAN.baobabBend + 18
    const { at, frame } = frameAt(s)
    addBaobab(meshes[chunkFor(s)], at, frame, at.width + 5.5, 42)
  }
  // A few more thinning out along the scarp, because the plain is still there.
  for (let s = HARMATTAN.scarp.from; s < track.length - 40; s += 90 + rng() * 80) {
    const { at, frame } = frameAt(s)
    addBaobab(meshes[chunkFor(s)], at, frame, -(at.width + 9 + rng() * 12), rng() * 900)
  }

  /*
    The mounds, thick enough on the ground that the road is a corridor. This is
    the one place where something hard is close, so they crowd the verge and
    stop dead at the edge of it.
  */
  for (let s = HARMATTAN.cathedrals.from - 20; s < HARMATTAN.cathedrals.to + 30; s += 4 + rng() * 7) {
    const { at, frame } = frameAt(s)
    const side = rng() < 0.5 ? -1 : 1
    const out = at.width + vergeWidth(at.room) + 0.4 + rng() * rng() * 7
    addMound(meshes[chunkFor(s)], at, frame, side * out, rng() * 900)
  }

  /*
    The wadi banks: cut earth, close, and high enough to take the wind away.
    Drawn as a run of leaning slabs rather than one long wall, because a river
    bank is cut by water and water does not cut straight lines.
  */
  /*
    The wadi banks.

    Regular, and that is a correction. The first version dealt the height and
    the lean of every slab independently and came out as scattered cardboard —
    a bank is *cut by water*, so it is a continuous face with erosion in it,
    not a heap. So the height moves slowly along the road rather than per
    slab, they all lean the same way, and they sit well below the road so
    nothing floats.
  */
  for (let s = HARMATTAN.riverBed.from - 30; s < HARMATTAN.riverBed.to + 40; s += 2.6) {
    const { at, frame } = frameAt(s)
    // One slow wave plus a faster one: erosion, rather than noise.
    const cut = 3.4 + Math.sin(s * 0.055) * 1.5 + Math.sin(s * 0.19) * 0.7
    for (const side of [-1, 1]) {
      tint.copy(GROUND).multiplyScalar(0.72 + hash3(s, side, 3) * 0.2)
      addTaper(
        meshes[chunkFor(s)], at, frame,
        side * (at.width + vergeWidth(at.room) + 0.35), -1.6,
        cut + hash3(s, side, 7) * 0.5, 1.5, 1.15, tint,
        side * 0.55, 0.95,
      )
    }
  }

  /*
    The town: two storeys of earth either side of the street, and the gate.

    The gate itself is drawn as the wall closing right in and then opening
    again, which is what a gate in a curtain wall actually is. There is no arch
    over the road: an arch you drive under at ninety would be a guess about the
    car's height, and this game has never once put a thing above the road that
    could be hit.
  */
  for (let s = HARMATTAN.gateAt - 26; s < HARMATTAN.gateOut + 6; s += 2.2) {
    const { at, frame } = frameAt(s)
    const nearGate = Math.abs(s - HARMATTAN.gateAt) < 14
    const inside = s > HARMATTAN.town.from && s < HARMATTAN.town.to
    const high = nearGate ? 7.2 + rng() * 1.6 : inside ? 4.4 + rng() * 2.6 : 3.2 + rng() * 1.4
    for (const side of [-1, 1]) {
      addWall(
        meshes[chunkFor(s)], at, frame,
        side * (at.width + vergeWidth(at.room) + 0.55), high, s * 3 + side,
      )
    }
  }

  /* The pits, which come from the track's own puddles — see `dressHarmattan`. */
  for (const pit of track.puddles) {
    const { at, frame } = frameAt(pit.s)
    addPit(meshes[chunkFor(pit.s)], at, frame, pit.n, pit.radius, pit.s)
  }

  /* The banners. Placed by the road in `bannersFor`, drawn here. */
  for (const s of HARMATTAN.banners) {
    if (s >= track.length) continue
    const { at, frame } = frameAt(s)
    // Outside of the corner, where it is in your eyeline on the way in.
    const side = at.curv === 0 ? 1 : Math.sign(at.curv)
    addBanner(meshes[chunkFor(s)], at, frame, side * (at.width + 1.6), s)
  }

  /* Ironstone, from the track's boulders, so the physics and the eye agree. */
  for (const stone of track.boulders) {
    const { at, frame } = frameAt(stone.s)
    tint.copy(STONE).multiplyScalar(0.8 + hash3(stone.seed, 1, 2) * 0.35)
    addBox(
      meshes[chunkFor(stone.s)], at, frame, stone.n, -0.1,
      stone.size * 0.8, stone.size, stone.size * 0.75, tint, 0.92,
    )
  }

  return meshes.map((mesh, index) => {
    const geometry = mesh.build()
    if (!geometry.boundingSphere) geometry.boundingSphere = new Sphere()
    return { ...spans[index], geometry }
  })
}

/* -------------------------------------------------------------------------- */

const SKY_VERT = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/*
  The harmattan sky.

  -----------------------------------------------------------------------------
  **There is no blue in it and there is no horizon.** That is not stylisation —
  it is what the sky does when there are enough microns of Saharan dust between
  you and it. The blue goes first, because dust scatters long wavelengths and
  the short ones never make it through; then the horizon goes, because the
  ground and the air end up the same value and there is no line where one stops.

  So this is built the opposite way round from the Stormcrown's sky. That one
  is dark and has a bright thing in it. This is *bright everywhere* and the only
  structure in it is a very slight lift toward the zenith and the sun, which is
  a flat pale disc with no glare around it at all — the dust takes the corona
  off, which is why a harmattan sun is the one you can photograph by eye.

  The disc is deliberately hard-edged and dim. A bloom on it would be wrong
  twice: wrong about the physics, and wrong about the feeling, which is of a
  sun that has been *turned down* rather than one that is blazing.
  -----------------------------------------------------------------------------
*/
const SKY_FRAG = /* glsl */ `
  varying vec3 vDirection;
  uniform float uTime;
  uniform float uSun;

  void main() {
    vec3 dir = normalize(vDirection);
    float up = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

    // Ochre at the ground line, warmer and paler overhead. Thirty degrees of
    // hue across the whole sky, which is what makes it read as air rather than
    // as a gradient somebody chose.
    vec3 low  = vec3(0.784, 0.560, 0.353);
    vec3 high = vec3(0.867, 0.706, 0.494);
    vec3 sky = mix(low, high, pow(up, 0.75));

    // The sun: low, ahead, and flat. \`uSun\` fades it where the scarp or the
    // town wall would be between you and it.
    vec3 toSun = normalize(vec3(0.34, 0.20, -0.92));
    float near = dot(dir, toSun);
    float disc = smoothstep(0.9975, 0.9990, near);
    float wash = smoothstep(0.86, 1.0, near) * 0.22;
    sky += vec3(0.30, 0.24, 0.13) * wash * uSun;
    sky = mix(sky, vec3(0.98, 0.93, 0.80), disc * 0.85 * uSun);

    // Dust moving across it. Very slight — the sky is not meant to have detail,
    // it is meant to have none, and this is only enough to stop it looking like
    // a flat fill on a large screen.
    float drift = sin(dir.x * 3.1 + uTime * 0.04) * sin(dir.y * 4.7 - uTime * 0.03);
    sky *= 1.0 + drift * 0.018;

    gl_FragColor = vec4(sky, 1.0);
  }
`

const DUST_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  varying float vFade;
  void main() {
    vec3 p = position;
    // Blowing, not falling. The whole difference between this and the
    // Stormcrown's rain: dust does not come down, it goes past.
    p.x += sin(aPhase + uTime * 0.9) * 1.4;
    p.y += sin(aPhase * 1.7 + uTime * 0.6) * 0.7;
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    float far = length(view.xyz);
    vFade = 1.0 - smoothstep(6.0, 46.0, far);
    gl_PointSize = aSize * (34.0 / max(1.0, far));
    gl_Position = projectionMatrix * view;
  }
`

const DUST_FRAG = /* glsl */ `
  varying float vFade;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float round = 1.0 - smoothstep(0.22, 0.5, length(d));
    if (round <= 0.01) discard;
    gl_FragColor = vec4(0.86, 0.71, 0.49, round * vFade * 0.5);
  }
`

/** How many grains ride with the camera. Cheap; they are two triangles each. */
const GRAINS = 900

/**
 * The sky, the sun, and the dust in front of your face.
 *
 * Three things and no more, for the same reason the Stormcrown keeps its world
 * to three: the road geometry is already the expensive part and a course this
 * long cannot afford a second expensive thing. The haze that actually hides the
 * distance is not here at all — it is the scene fog, set from `Race`, because
 * fog is what every other object on the road has to agree with.
 */
export function HarmattanWorld({ track }: { track: Track }) {
  const skyRef = useRef<Mesh>(null)
  const dustRef = useRef<Points>(null)

  const middle = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    let minY = Infinity, maxY = -Infinity
    for (let i = 0; i < track.x.length; i += 20) {
      minX = Math.min(minX, track.x[i]); maxX = Math.max(maxX, track.x[i])
      minY = Math.min(minY, track.y[i]); maxY = Math.max(maxY, track.y[i])
      minZ = Math.min(minZ, track.z[i]); maxZ = Math.max(maxZ, track.z[i])
    }
    return {
      x: (minX + maxX) * 0.5,
      y: minY + (maxY - minY) * 0.4,
      z: (minZ + maxZ) * 0.5,
      size: Math.max(maxX - minX, maxZ - minZ) + 2400,
    }
  }, [track])

  const sky = useMemo(() => new ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: BackSide,
    uniforms: { uTime: { value: 0 }, uSun: { value: 1 } },
  }), [])

  const dust = useMemo(() => new ShaderMaterial({
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
  }), [])

  const grains = useMemo(() => {
    const rng = random(track.seed ^ 0x77a1)
    const position = new Float32Array(GRAINS * 3)
    const size = new Float32Array(GRAINS)
    const phase = new Float32Array(GRAINS)
    for (let i = 0; i < GRAINS; i++) {
      position[i * 3] = (rng() - 0.5) * 60
      position[i * 3 + 1] = rng() * 16 - 2
      position[i * 3 + 2] = (rng() - 0.5) * 60
      size[i] = 0.6 + rng() * rng() * 2.6
      phase[i] = rng() * Math.PI * 2
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(position, 3))
    geometry.setAttribute('aSize', new BufferAttribute(size, 1))
    geometry.setAttribute('aPhase', new BufferAttribute(phase, 1))
    geometry.boundingSphere = new Sphere(new Vector3(), 60)
    return geometry
  }, [track])

  useFrame((state, delta) => {
    sky.uniforms.uTime.value += delta
    dust.uniforms.uTime.value += delta
    const camera = state.camera
    if (skyRef.current) skyRef.current.position.copy(camera.position)
    // The dust rides with the camera so nine hundred grains cover a whole road.
    if (dustRef.current) dustRef.current.position.set(camera.position.x, camera.position.y - 4, camera.position.z)
  })

  return (
    <group>
      <mesh ref={skyRef} material={sky} position={[middle.x, middle.y, middle.z]} renderOrder={-10}>
        <sphereGeometry args={[middle.size * 0.5, 24, 16]} />
      </mesh>
      <points ref={dustRef} geometry={grains} material={dust} frustumCulled={false} />
      <HarmattanSound track={track} />
    </group>
  )
}

