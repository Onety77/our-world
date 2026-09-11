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
 *
 * **And it is lived on.** Everything above was true of a road with nobody on
 * it. Every named stretch was geology — a red plain, termite country, a dry
 * river, an escarpment — and the one built thing, the town, was a curtain wall
 * with nothing behind it, which rendered as a slot canyon and told you nobody
 * was home.
 *
 * So the second half of this file is architecture, and each stretch is a
 * different answer to the two questions this landscape actually asks — *where
 * is the water* and *what does the wind do to you*:
 *
 * | | |
 * |---|---|
 * | **the red mile** | millet farms: grain in drums up off the ground, compounds behind stalk screens, and field boundaries close enough to the verge to measure the speed against |
 * | **the cathedrals** | nobody. One ruined compound with a mound coming up through the yard, which is the stretch explaining itself |
 * | **the wadi** | the only water: doum palms on the bank tops, wells and drying frames where the banks fade |
 * | **the town** | bastions at both gates, a street of horned Hausa rooflines, and a minaret bristling with torons standing in its own square |
 * | **the pits** | the dyers, outside the wall because the work stinks — and the one place the indigo arrives in quantity |
 * | **the scarp** | a bluff cut into the inside of every hairpin, with grain stored in the face of it |
 * | **home** | the farms again, on both sides, with the lights on |
 *
 * Four rules hold across all of it and are worth knowing before adding to it:
 * nothing over the road, nothing inside the verge, silhouette before detail
 * (a hundred metres of dust deletes anything smaller than about half a metre),
 * and the colour law above is not relaxed for any of it. The long note above
 * `addGranary` carries the reasoning; `sweepFace` carries the one technical
 * lesson, which is that **a face built from separate tapers is a picket fence
 * however carefully the tapers are chosen** — it cost three places in this file
 * before it was understood.
 * =============================================================================
 */

import { useEffect, useMemo, useRef } from 'react'
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
import { HARMATTAN_RING as RING } from './harmattanSurface'
import { HARMATTAN_SKIRT, harmattanVerge, landFor } from './harmattanLand'
import { Sahellife } from './Sahellife'
import { baobab, doumPalm, ironstone, termiteMound } from './sahelProps'

const CHUNK = 60

/** Vertices across the drawn road: four each side outside it, and the road's own nine. */
const DRAWN = 17
/** The road's nine, across and up — the same crown as `harmattanProfile`. */
const ROAD_ACROSS = [-1, -0.92, -0.62, -0.31, 0, 0.31, 0.62, 0.92, 1]
const ROAD_CROWN = [0.02, 0.05, 0.075, 0.092, 0.1, 0.092, 0.075, 0.05, 0.02]

const smooth01 = (from: number, to: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

/* ---- the palette, which is iron oxide and one blue ------------------------ */

/** Laterite. Iron-rich, brick-red, and what a road here is actually cut from. */
const ROAD = new Color('#8a4526')
/** Where the wheels have polished it. Every road here has a worn line. */
const ROAD_WORN = new Color('#b37a54')
/** Blown sand lying on the road. Pale, and the thing you have to see coming. */
const SAND = new Color('#dcb87f')
/** The shoulder: dust, and looser than the road. */
const VERGE = new Color('#a27952')
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
const BERM = new Color('#835b3a')
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
/* The mounds', the baobabs' and the palms' colours live with their shapes, in `sahelProps`. */
/** Rendered earth on a wall, lighter than the ground it is made of. */
const WALL = new Color('#b58150')
/** The torons — palm beams, weathered nearly black. */
/*
  Grey-brown, not black. Nearly black, every beam end seen square-on read as a
  black dash painted on the wall — a street of barcodes. Palm wood weathers
  pale, and a pale stick with a shadow under it is a stick.
*/
const TORON = new Color('#7a6552')
/** Indigo. The banners and the pits, and the only cool colour on the road. */
const INDIGO = new Color('#243a6b')
/** Indigo in the sun, on cloth rather than in a pit. */
const INDIGO_LIT = new Color('#3c58a0')
/** Polished brass on a pole finial, which is the only thing that glints. */
const BRASS = new Color('#c89a4c')
/**
 * Millet thatch, a season old and bleached.
 *
 * Deliberately close to `SAND` and deliberately not the same: a thatch cap
 * against a dust sky has to read as *a made thing* rather than as another
 * drift, and the difference that does it is a little more brown and a little
 * less light — straw goes grey-gold, blown sand stays pale.
 */
const THATCH = new Color('#b8975e')
/** Under the eaves, and the north face of every cap. */
const THATCH_SHADE = new Color('#7c6237')
/** Smoothed mud plaster — a wall somebody keeps. Lighter than what it is made of. */
const RENDER = new Color('#c39a6a')
/** A flat mud roof, packed and swept. Darker than the walls it sits on. */
const ROOF = new Color('#8d6339')
/** Dead thorn, and the stalk screens. Bone, weathered out of every colour. */
const THORN = new Color('#847865')
/** Undyed cotton on a drying line — warm, so it never competes with the indigo. */
const CLOTH = new Color('#d8cbb0')
/**
 * Dry-laid laterite blocks, where the road's edge has to be held up — the
 * retaining walls under the scarp's switchbacks. Cut from the same iron as the
 * road, so darker and redder than the dust over the plain.
 */
const RETAINING = new Color('#8a5b3d')

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

  /** For fanning a cone or a cap, where a quad would have a corner to spare. */
  tri(a: number, b: number, c: number) {
    this.index.push(a, b, c)
  }

  /** Which of the index the wheels may stand on, as [from, to) pairs. See `roadSurface`. */
  readonly tread: number[] = []

  /** A quad a wheel may stand on: the road, its verge and the berm, and not the skirt. */
  deck(a: number, b: number, c: number, d: number) {
    const at = this.index.length
    this.quad(a, b, c, d)
    if (this.tread.length && this.tread[this.tread.length - 1] === at) this.tread[this.tread.length - 1] = at + 6
    else this.tread.push(at, at + 6)
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
 * An N-sided tapered drum, and the shape this file did not have.
 *
 * -----------------------------------------------------------------------------
 * Everything here was built out of `addTaper`, which is four-sided, and four
 * sides is a box however you angle it. **The Sahel is round.** A grain store is
 * a coiled mud drum, a hut is a drum, a well head is a ring, a minaret is a
 * tapering cylinder — and all of them drawn square read as sheds.
 *
 * Six sides is the number, not eight. At a hundred metres through this much
 * dust the silhouette is all anybody gets, and six is where a drum stops having
 * corners; the two extra sides cost triangles on every granary on the road and
 * buy a difference nobody can see. Eight is kept for the minaret alone, which
 * is the one thing here you look *up* at.
 *
 * `rTop` of nearly zero makes a cone, which is how every thatch cap on this
 * road is drawn — so the same function is the mud below and the straw above,
 * and they cannot end up different shapes by accident.
 * -----------------------------------------------------------------------------
 */
function addRound(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  y: number,
  high: number,
  rBase: number,
  rTop: number,
  sides: number,
  color: Color,
  rough = 0.9,
  turn = 0,
) {
  const base = mesh.count
  for (const [dy, r] of [[0, rBase], [high, rTop]] as const) {
    for (let i = 0; i < sides; i++) {
      const a = turn + (i / sides) * Math.PI * 2
      roadPoint(road, n + Math.sin(a) * r, y + dy, point, basis)
      const ds = Math.cos(a) * r
      point.x += basis.fx * ds
      point.y += basis.fy * ds
      point.z += basis.fz * ds
      mesh.vertex(point, color, 0, rough)
    }
  }
  for (let i = 0; i < sides; i++) {
    const a = base + i
    const b = base + ((i + 1) % sides)
    mesh.quad(a, b, b + sides, a + sides)
  }
  // Fanned from the first vertex of the top ring rather than from a new centre
  // one: a cap this small is flat either way, and it saves a vertex per drum
  // on a road that ends up with a few hundred of them.
  for (let i = 1; i < sides - 1; i++) {
    mesh.tri(base + sides, base + sides + i, base + sides + i + 1)
  }
}

/**
 * One toron — a palm beam left sticking out of a wall.
 *
 * They are not decoration. A mud wall is re-rendered by hand every year after
 * the rains, and the beams are the permanent scaffolding somebody stands on to
 * do it; that is why Sudano-Sahelian architecture bristles. Which also means
 * they belong on anything tall enough to need maintaining and on nothing else.
 *
 * Extracted from `addWall`, which grew this inline first and is now one of
 * three callers. Written once, because two copies of a beam would be two beams
 * that could end up different thicknesses.
 */
function addBeam(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  y: number,
  s: number,
  outN: number,
  outS: number,
  len: number,
  thick: number,
) {
  const base = mesh.count
  // The cross-section: up, and the horizontal perpendicular to the beam.
  const px = -outS
  const pz = outN
  for (const t of [0, len]) {
    for (const [du, dp] of [[-thick, -thick], [thick, -thick], [thick, thick], [-thick, thick]] as const) {
      roadPoint(road, n + outN * t + pz * dp, y + du, point, basis)
      const ds = s + outS * t + px * dp
      point.x += basis.fx * ds
      point.y += basis.fy * ds
      point.z += basis.fz * ds
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

/*
  The baobab and the termite mound used to be built here out of four-sided
  tapers, in the road's frame, at the road's height. The baobab came out a
  windmill and the mound a pyramid. Both are in `sahelProps` now, built in the
  world and stood on the ground.
*/

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
function dressWall(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  high: number,
  seed: number,
) {
  const side = Math.sign(n)
  tint.copy(WALL).multiplyScalar(0.9 + hash3(seed, 3, 1) * 0.18)
  /*
    **The articulation only. The wall itself is swept — see `sweepFace`.**

    This used to draw the mass as well, as a taper every couple of metres, and
    that was the hoodoo problem: a taper is narrower at the top, so the tops
    never met however much the feet overlapped. Once the mass became one
    continuous surface, leaving this drawing tapers *on top of it* produced the
    same picket line standing proud of a perfectly good wall — the bug survived
    its own fix, which is why the mass and the dressing are now different
    functions with different names.

    A buttress, most of the time. Never always: a wall buttressed at even
    intervals is a colonnade.
  */
  if (hash3(seed, 3, 2) > 0.42) {
    addTaper(mesh, road, basis, n - side * 0.5, 0, high * 0.72, 0.55, 0.34, tint, -side * 0.1, 0.94)
  }
  // The beams. Two rows on a tall wall, one on a short.
  const rows = high > 4.4 ? 2 : 1
  for (let r = 0; r < rows; r++) {
    const y = high * (0.52 + r * 0.28)
    /*
      Slimmer than they were. At the density the town now has, beams at eleven
      centimetres read as black bars stuck to the wall rather than as sticks
      poking out of it — the shape is right and the weight was wrong. A toron
      is a palm rafter; seven centimetres is what one looks like.
    */
    for (const ds of [-0.55, 0.55]) {
      addBeam(mesh, road, basis, n, y, ds, -side, 0, 0.52, 0.07)
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
    The cloth is not drawn here any more. It was — a flat strip at a fixed
    lean, because baked geometry cannot move — and it read as a blue plank
    nailed to the pole. It flies now, one instanced draw for every banner on
    the road, wider and dyed: see the banners in `Sahellife`, which finds this
    pole with the same hash.
  */
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
  /*
    The dye itself: a flat disc, glossy, inside its rim.

    It used to be sunk twelve centimetres, which put it *under* the drawn verge
    it sits in — so the pits rendered as their brown rims round a patch of
    ordinary ground, and the one place the road's indigo was meant to arrive in
    quantity showed none. Just above the verge now, inside a rim a third of a
    metre high, it reads as a full vat. And a shade brighter than the banners'
    indigo, because a wet surface darkens and this one is wet.
  */
  const dye = new Color('#2d4f98')
  roadPoint(road, n, 0.07, point, basis)
  mesh.vertex(point, dye, 0.5, 0.05)
  for (let k = 0; k <= sides; k++) {
    const a = (k / sides) * Math.PI * 2
    roadPoint(road, n + Math.cos(a) * radius, 0.07, point, basis)
    point.x += basis.fx * Math.sin(a) * radius
    point.y += basis.fy * Math.sin(a) * radius
    point.z += basis.fz * Math.sin(a) * radius
    mesh.vertex(point, dye, 0.5, 0.05)
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
/* ---- the built world ------------------------------------------------------
 *
 * **What this road was missing was people.**
 *
 * Every named stretch of it was geology — a red plain, termite country, a dry
 * river, an escarpment — and the one built thing, the town, was a wall with
 * nothing behind it. A wall with nothing behind it is a corridor, not a place,
 * and driving past it told you nobody lived there.
 *
 * So everything below is somewhere somebody works, and each stretch is a
 * different answer to the same two questions this landscape asks: *where is
 * the water*, and *what does the wind do to you*. The farms shelter behind
 * screens and store grain off the ground; the wadi is where the wells and the
 * washing are; the city turns its back to the wind and puts its wealth inside
 * a wall; the dyers are outside that wall, because dyeing stinks; the scarp
 * stores grain in the cliff because the cliff is dry.
 *
 * **Four rules hold across all of it:**
 *
 * 1. **Nothing above the road, ever.** No arches, no gantries, no overhanging
 *    eaves. That rule predates this file and is not being spent here.
 * 2. **Nothing inside the verge.** Every placement below starts from
 *    `width + vergeWidth(room)`, the same line the walls stand on, so no
 *    building can creep into a corner the car is entitled to use. None of it
 *    is collidable — the physics has never known about scenery — which makes
 *    a building the car could reach a bug you could drive *through*.
 * 3. **Silhouette first.** A hundred metres of dust flattens everything into
 *    an outline, so every one of these is built to be recognised as a shape:
 *    a cone on a drum, a horned roofline, a bristling tower. Detail below
 *    about half a metre is not drawn, because it cannot be seen.
 * 4. **The colour law stands.** Iron oxide and one blue. The indigo on the
 *    drying frames is the only cool thing added, and it is put where the road
 *    already had indigo — the pits — so the payoff lands in one place instead
 *    of being sprinkled down the whole road.
 * -------------------------------------------------------------------------- */

/**
 * A continuous face swept along the road — a cliff, a bank, or a city wall.
 *
 * ---------------------------------------------------------------------------
 * **This is the fix for the thing that made three different places on this road
 * look like cardboard.**
 *
 * The wadi banks, the escarpment and the town wall were all built the same way:
 * a leaning `addTaper` every couple of metres. It seems reasonable and it does
 * not work, for a reason that is only visible once it is rendered. A taper is
 * *narrower at the top*, so however much the bases overlap, the tops do not —
 * and what you get is a picket line of separate slabs with daylight between
 * them. The wadi's own note in this file admits the first attempt "came out as
 * scattered cardboard" and tried to fix it by regularising the heights, which
 * treated the symptom: the heights were never the problem, the gaps were.
 *
 * A cut bank and a city wall are both **one surface**. So this sweeps one:
 * a strip of vertices along the road with the face, the top and the back
 * carried between stations, exactly the way the road itself is built a few
 * hundred lines below. There is no seam to see because there is no seam.
 *
 * Split at chunk boundaries — a quad cannot span two meshes — by starting a
 * fresh strip whenever the chunk changes, which duplicates one station's
 * vertices and nothing else.
 * ---------------------------------------------------------------------------
 */
function sweepFace(
  meshes: CourseMesh[],
  chunkFor: (s: number) => number,
  frameAt: (s: number) => { at: ReturnType<typeof emptyRoad>; frame: RoadBasis },
  from: number,
  to: number,
  step: number,
  shape: (
    s: number,
    at: ReturnType<typeof emptyRoad>,
  ) => { n: number; foot: number; high: number; thick: number; lean: number; color: Color } | null,
) {
  let previous = -1
  let lastChunk = -1

  for (let s = from; s <= to; s += step) {
    const chunk = chunkFor(s)
    const { at, frame } = frameAt(s)
    const cut = shape(s, at)
    if (!cut) {
      previous = -1
      continue
    }

    const mesh = meshes[chunk]
    const base = mesh.count
    // Four along the profile: the foot of the face, its top, the back of the
    // top, and the back at the foot. Front, crown and back get a quad each.
    const stations: [number, number][] = [
      [cut.n, cut.foot],
      [cut.n + cut.lean, cut.foot + cut.high],
      [cut.n + cut.lean + cut.thick, cut.foot + cut.high],
      [cut.n + cut.thick, cut.foot],
    ]
    for (const [n, y] of stations) {
      roadPoint(at, n, y, point, frame)
      mesh.vertex(point, cut.color, 0, 0.95)
    }

    if (previous >= 0 && chunk === lastChunk) {
      mesh.quad(previous, previous + 1, base + 1, base)
      mesh.quad(previous + 1, previous + 2, base + 2, base + 1)
      mesh.quad(previous + 2, previous + 3, base + 3, base + 2)
    }
    previous = base
    lastChunk = chunk
  }
}

/**
 * A granary: a coiled mud drum with a conical thatch cap.
 *
 * **The most useful silhouette in the Sahel and the one this road most needed.**
 * Grain is stored above the ground, away from damp and animals, in a drum you
 * enter through the top — so the shape is a fat cylinder wearing a hat, and it
 * is unmistakable at any distance in any light. Clustered, they say *farm*
 * faster than any other object could.
 *
 * `scale` takes the same shape from a grain bin at a metre and a half to a
 * dwelling hut at three, because they genuinely are the same building at two
 * sizes. The cap always overhangs — that is what a cap is for — and always
 * out-tops the drum by a good margin, because the overhang is the shadow line
 * that stops the whole thing reading as a chess pawn.
 */
function addGranary(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  s: number,
  scale: number,
  seed: number,
) {
  const r = 0.78 * scale * (0.88 + hash3(seed, 11, 1) * 0.3)
  const drum = 1.7 * scale * (0.85 + hash3(seed, 11, 2) * 0.35)
  const turn = hash3(seed, 11, 3) * 6.28

  // Pushed along the road by `s` the same way every other builder does it: the
  // road frame is fixed per ring, so the offset goes on afterwards.
  const at = { ...road, x: road.x + basis.fx * s, y: road.y + basis.fy * s, z: road.z + basis.fz * s }

  tint.copy(RENDER).multiplyScalar(0.84 + hash3(seed, 11, 4) * 0.28)
  // A slight batter — mud drums are thicker at the foot, and it is what stops
  // a cylinder looking extruded.
  addRound(mesh, at, basis, n, 0, drum, r, r * 0.93, 6, tint, 0.92, turn)

  // The cap. Nearly a point, and wider than the drum by a clear margin.
  tint.copy(THATCH).multiplyScalar(0.86 + hash3(seed, 11, 5) * 0.26)
  addRound(mesh, at, basis, n, drum, 0.85 * scale, r * 1.22, 0.04, 6, tint, 0.98, turn)
  // One dark course under the eaves. Two triangles' worth of the shadow a real
  // overhang throws, and it is what makes the cap sit *on* rather than *near*.
  addRound(mesh, at, basis, n, drum - 0.1 * scale, 0.1 * scale, r * 1.24, r * 1.22, 6,
    THATCH_SHADE, 0.98, turn)
}

/**
 * A flat-roofed earth house, with horns.
 *
 * ---------------------------------------------------------------------------
 * **The horns are the whole reason this is not a box.** Hausa builders finish
 * a parapet with raised pinnacles at the corners — *zanko* — and they are the
 * single most recognisable thing about a northern Nigerian roofline. Without
 * them a mud house at a hundred metres is a crate; with them it is
 * unmistakably a house, and the road suddenly has a vernacular instead of
 * geometry.
 *
 * The parapet matters for the same reason. A flat roof is a room here — you
 * sleep on it in the hot season — so it has a wall round it, and that lip is
 * what catches the low sun and separates the roof from the sky.
 *
 * `storeys` of two gives the town its height. Everything else on this road is
 * single, because out on the plain it is.
 * ---------------------------------------------------------------------------
 */
function addHouse(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  s: number,
  along: number,
  across: number,
  storeys: number,
  seed: number,
) {
  const high = storeys * (2.5 + hash3(seed, 13, 1) * 0.7)
  const at = { ...road, x: road.x + basis.fx * s, y: road.y + basis.fy * s, z: road.z + basis.fz * s }

  tint.copy(WALL).multiplyScalar(0.86 + hash3(seed, 13, 2) * 0.26)
  addBox(mesh, at, basis, n, 0, along, across, high, tint, 0.9)

  // The parapet: a shallow lip standing a little proud of the walls.
  tint.copy(ROOF).multiplyScalar(0.9 + hash3(seed, 13, 3) * 0.2)
  addBox(mesh, at, basis, n, high, along * 1.06, across * 1.06, 0.42, tint, 0.92)

  /*
    The horns, one at each corner of the parapet, leaning very slightly out.

    Small — half a metre — and that is deliberately at the edge of what the
    dust will carry. Four of them together make a *toothed* roofline, and the
    tooth is the thing the eye reads, not any single spike.
  */
  for (const ds of [-1, 1]) {
    for (const dn of [-1, 1]) {
      addTaper(
        mesh, at, basis, n + dn * across * 0.92, high + 0.42,
        0.46 + hash3(seed, dn, ds) * 0.3, 0.14, 0.03, tint, dn * 0.07, 0.92,
      )
      // The horn sits at the corner, so it needs pushing along the road too.
      const spike = mesh.count - 8
      for (let v = spike; v < mesh.count; v++) {
        mesh.position[v * 3] += basis.fx * ds * along * 0.92
        mesh.position[v * 3 + 1] += basis.fy * ds * along * 0.92
        mesh.position[v * 3 + 2] += basis.fz * ds * along * 0.92
      }
    }
  }

  /*
    A way in, and a way to see out, on the face toward the road.

    Without them a house of any shape was a crate — the horns made the roofline
    a house and the walls stayed a box. A dark doorway in a raised frame of
    paler plaster is the whole of it: the frame is where a Hausa house carries
    its decoration, and it is what makes a dark rectangle read as a door rather
    than a hole.
  */
  const side = Math.sign(n) || 1
  const face = n - side * across
  const opening = new Color('#2a1f18')
  const along_ = (ds: number) => ({ ...at, x: at.x + basis.fx * ds, y: at.y + basis.fy * ds, z: at.z + basis.fz * ds })
  if (hash3(seed, 13, 5) > 0.2) {
    const doorway = along_((hash3(seed, 13, 6) - 0.5) * Math.max(0, along - 0.75) * 2)
    tint.copy(RENDER).multiplyScalar(1.1)
    addBox(mesh, doorway, basis, face - side * 0.02, 0, 0.64, 0.025, 2.45, tint, 0.9)
    addBox(mesh, doorway, basis, face - side * 0.05, 0, 0.44, 0.03, 2.05, opening, 0.97)
  }
  if (storeys > 1) {
    for (const k of [0, 1]) {
      if (hash3(seed, 13, 7 + k) < 0.35) continue
      const pane = along_((k - 0.5) * along * 0.9)
      addBox(mesh, pane, basis, face - side * 0.04, high * 0.68, 0.24, 0.03, 0.42, opening, 0.97)
    }
    // Beams on anything tall enough to be re-rendered from a ladder.
    for (const ds of [-along * 0.5, along * 0.5]) {
      addBeam(mesh, at, basis, face, high * 0.62, ds, -side, 0, 0.5, 0.09)
    }
  }
}

/**
 * The minaret, and the one thing on this road you look up at.
 *
 * ---------------------------------------------------------------------------
 * **This is the set piece.** A Sudano-Sahelian mosque tower — Djenné, Agadez,
 * Bobo-Dioulasso — is a tapering mass of mud bristling with palm beams on
 * every face, and there is nothing else on earth shaped like it. It is the
 * single most recognisable silhouette this continent has, and against a dust
 * sky with no horizon in it, a dark bristling vertical is exactly the kind of
 * shape the haze cannot flatten.
 *
 * **It is placed to be seen twice**: once rising over the wall on the long
 * approach to the gate, when it is the only thing telling you there is a city
 * ahead, and again from inside the street. Everything else on this road is
 * dealt from a seed; this is put where it is on purpose, because a landmark
 * that lands somewhere different every morning is not a landmark.
 *
 * Eight-sided where everything else is six — it is the one object here big
 * enough for the extra faces to be visible, and the extra roundness is what
 * separates a tower from a chimney.
 * ---------------------------------------------------------------------------
 */
function addMinaret(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  s: number,
  high: number,
  seed: number,
) {
  const at = { ...road, x: road.x + basis.fx * s, y: road.y + basis.fy * s, z: road.z + basis.fz * s }
  const rBase = 1.5
  const rTop = 0.72

  tint.copy(WALL).multiplyScalar(0.92 + hash3(seed, 17, 1) * 0.16)
  addRound(mesh, at, basis, n, 0, high, rBase, rTop, 8, tint, 0.93)

  /*
    Four rows of beams, thinning with the tower.

    Every face, not just the two you can see — the road bends past this and the
    silhouette has to hold from any angle, and half a bristle from the wrong
    side would look like damage rather than architecture.
  */
  for (let row = 0; row < 4; row++) {
    const t = 0.24 + row * 0.19
    const y = high * t
    const r = rBase + (rTop - rBase) * t
    const out = 0.62 - row * 0.07
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + (row % 2) * 0.39
      addBeam(mesh, at, basis, n + Math.sin(a) * r * 0.9, y, Math.cos(a) * r * 0.9,
        Math.sin(a), Math.cos(a), out, 0.085)
    }
  }

  /*
    The crown: a short collar, then the finial.

    A real one is topped with an ostrich egg on a spike, which is both true and
    far too small to draw. The collar is what actually reads — a tower that
    simply stops looks snapped off, and the step is what makes it *finished*.
  */
  tint.copy(RENDER).multiplyScalar(0.96)
  addRound(mesh, at, basis, n, high, 0.5, rTop * 1.18, rTop * 1.05, 8, tint, 0.9)
  addRound(mesh, at, basis, n, high + 0.5, 0.9, rTop * 0.62, 0.05, 8, tint, 0.88)
  addTaper(mesh, at, basis, n, high + 1.4, 0.5, 0.07, 0.02, BRASS, 0, 0.14)
}

/**
 * A gate bastion.
 *
 * The gate used to be drawn as the curtain wall closing in and opening again,
 * which is honest about what a gate *is* and says nothing about arriving
 * somewhere. A city gate on this continent is two towers — the wall thickens,
 * stands up, and watches the road — and passing between two masses is the
 * moment that makes a town a town rather than a stretch with walls on it.
 *
 * Crowned with pinnacles, which is the same gesture as the horns on a house
 * roofline, at the scale of a fortification.
 */
function addBastion(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  s: number,
  high: number,
  seed: number,
) {
  const at = { ...road, x: road.x + basis.fx * s, y: road.y + basis.fy * s, z: road.z + basis.fz * s }
  const side = Math.sign(n) || 1
  const rBase = 2.15
  const rTop = 1.62

  tint.copy(WALL).multiplyScalar(0.88 + hash3(seed, 19, 1) * 0.18)
  addRound(mesh, at, basis, n, 0, high, rBase, rTop, 6, tint, 0.93)

  for (let row = 0; row < 2; row++) {
    const y = high * (0.44 + row * 0.26)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + row * 0.5
      addBeam(mesh, at, basis, n + Math.sin(a) * rTop * 1.05, y, Math.cos(a) * rTop * 1.05,
        Math.sin(a), Math.cos(a), 0.66, 0.1)
    }
  }

  // The crown of pinnacles.
  tint.copy(RENDER).multiplyScalar(0.94)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const spike = mesh.count
    addTaper(mesh, at, basis, n + Math.sin(a) * rTop * 0.82, high, 0.85, 0.2, 0.04, tint, 0, 0.9)
    const push = Math.cos(a) * rTop * 0.82
    for (let v = spike; v < mesh.count; v++) {
      mesh.position[v * 3] += basis.fx * push
      mesh.position[v * 3 + 1] += basis.fy * push
      mesh.position[v * 3 + 2] += basis.fz * push
    }
  }
  void side
}

/**
 * A drying frame hung with indigo.
 *
 * ---------------------------------------------------------------------------
 * **The payoff of the whole colour law.** Everything on this road is iron
 * oxide, and the one blue has so far been two banners a corner and a disc of
 * dye in the ground. Cloth on a frame is that blue *standing up, in quantity,
 * moving* — and it is put in the dyers' quarter where the pits already are, so
 * the road builds to one place where the colour finally arrives instead of
 * scattering it thinly over three kilometres.
 *
 * Historically exact and useful for it: dye pits sit outside the city wall,
 * because the work stinks, and the finished cloth is dried and beaten right
 * beside them. So the frames belong exactly where the road already put the
 * pits — which is how a landscape ends up looking like it grew rather than
 * having been arranged.
 *
 * The cloth hangs and blows the same way the banners do, and for the same
 * reason: a harmattan blows for six weeks, so a constant lean is the honest
 * thing to draw and a flap would be a draw call per sheet.
 * ---------------------------------------------------------------------------
 */
function addRack(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  s: number,
  seed: number,
) {
  const at = { ...road, x: road.x + basis.fx * s, y: road.y + basis.fy * s, z: road.z + basis.fz * s }
  const high = 2.5 + hash3(seed, 23, 1) * 0.8
  const span = 1.5 + hash3(seed, 23, 2) * 1.1

  for (const ds of [-span, span]) {
    const post = mesh.count
    addTaper(mesh, at, basis, n, 0, high, 0.1, 0.08, THORN, 0, 0.9)
    for (let v = post; v < mesh.count; v++) {
      mesh.position[v * 3] += basis.fx * ds
      mesh.position[v * 3 + 1] += basis.fy * ds
      mesh.position[v * 3 + 2] += basis.fz * ds
    }
  }
  // The bar, along the road between the posts.
  addBeam(mesh, at, basis, n, high - 0.12, -span, 0, 1, span * 2, 0.07)

  /*
    The cloth: two or three lengths, hung from the bar and blown downwind.

    Some of it undyed, and that is not variety for its own sake — a yard where
    everything is already blue is a yard with nothing being *made* in it. The
    pale lengths are what say the blue arrived from somewhere.
  */
  const sheets = 2 + Math.floor(hash3(seed, 23, 3) * 2)
  for (let k = 0; k < sheets; k++) {
    const ds = -span + ((k + 0.5) / sheets) * span * 2
    const wide = span / sheets - 0.08
    const drop = 1.5 + hash3(seed, 23, 4 + k) * 0.8
    const blow = 0.5 + hash3(seed, 23, 8 + k) * 0.5
    const pale = hash3(seed, 23, 12 + k) > 0.72
    const base = mesh.count
    for (const [dy, out] of [[0, 0], [-drop, blow]] as const) {
      for (const dz of [-wide, wide]) {
        roadPoint(at, n + out * 0.4, high - 0.2 + dy, point, basis)
        const along = ds + dz + out * 0.5
        point.x += basis.fx * along
        point.y += basis.fy * along
        point.z += basis.fz * along
        mesh.vertex(point, pale ? CLOTH : dy === 0 ? INDIGO_LIT : INDIGO, 0, 0.8)
      }
    }
    mesh.quad(base, base + 1, base + 3, base + 2)
    mesh.quad(base + 2, base + 3, base + 1, base)
  }
}

/*
  The doum palm used to be built here: a forked post with seven flat blades on
  each fork, which came out as insects on sticks however wide the blades were
  drawn. It is in `sahelProps` now — a ball of fans on each fork, over a skirt
  of dead ones — and it still grows in the wadi and nowhere else, because the
  wadi is the only place on this road the water table is close.
*/

/**
 * A stalk screen, or a thorn fence — the cheapest thing on the road and one of
 * the most useful.
 *
 * Millet stalks lashed into a mat, or cut thorn piled into a ring: both are
 * what actually encloses a compound out here, and both read at distance as a
 * low broken line of bone against the ground. Their whole job is to say *this
 * ground belongs to somebody* — which is what turns three granaries in a field
 * into a farm.
 *
 * Drawn as one thin panel plus a few proud stakes rather than as a row of
 * sticks. A real screen is fifty uprights; fifty boxes per fence, on a road
 * that wants a few hundred metres of fencing, is thousands of triangles for a
 * texture nobody can resolve.
 */
function addScreen(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  s: number,
  along: number,
  seed: number,
) {
  const at = { ...road, x: road.x + basis.fx * s, y: road.y + basis.fy * s, z: road.z + basis.fz * s }
  /*
    Low, and broken along the top.

    The first pass drew one panel at a metre and a half with three small stakes
    on it, and rendered it looked like a packing crate — a solid pale slab
    lying in the field. Two things fix it and both are about the *edge*: the
    panel is shorter than a person, so it reads as something you look over
    rather than a wall, and the stakes are tall enough and numerous enough to
    make the top a broken line instead of a sawn one. A fence is only ever
    recognised by its top edge.
  */
  const high = 0.8 + hash3(seed, 31, 1) * 0.35
  tint.copy(THORN).multiplyScalar(0.8 + hash3(seed, 31, 2) * 0.3)
  addBox(mesh, at, basis, n, 0, along, 0.07, high, tint, 0.95)
  const stakes = 4 + Math.floor(hash3(seed, 31, 9) * 3)
  for (let k = 0; k < stakes; k++) {
    const ds = -along + ((k + 0.5) / stakes) * along * 2
    const stake = mesh.count
    addTaper(
      mesh, at, basis, n, 0,
      high + 0.35 + hash3(seed, 31, k + 3) * 0.75, 0.06, 0.035, tint,
      (hash3(seed, 31, k + 20) - 0.5) * 0.16, 0.95,
    )
    for (let v = stake; v < mesh.count; v++) {
      mesh.position[v * 3] += basis.fx * ds
      mesh.position[v * 3 + 1] += basis.fy * ds
      mesh.position[v * 3 + 2] += basis.fz * ds
    }
  }
}

/**
 * A well head, with the forked posts a rope runs over.
 *
 * In the wadi and nowhere else, because that is the only place on this road
 * where the water table is within reach. It is small and it is close to the
 * verge on purpose: a well is a reason for a track to leave the road, and a
 * well nobody could walk to would be an ornament.
 */
function addWell(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  s: number,
  seed: number,
) {
  const at = { ...road, x: road.x + basis.fx * s, y: road.y + basis.fy * s, z: road.z + basis.fz * s }
  tint.copy(RENDER).multiplyScalar(0.82 + hash3(seed, 37, 1) * 0.2)
  addRound(mesh, at, basis, n, 0, 0.62, 0.95, 0.86, 6, tint, 0.95)
  // The dark mouth, a shade set down inside the rim.
  addRound(mesh, at, basis, n, 0.5, 0.06, 0.66, 0.66, 6, TORON, 0.98)
  for (const ds of [-0.85, 0.85]) {
    const post = mesh.count
    addTaper(mesh, at, basis, n, 0, 2.1 + hash3(seed, 37, ds) * 0.4, 0.1, 0.07, THORN, 0, 0.92)
    for (let v = post; v < mesh.count; v++) {
      mesh.position[v * 3] += basis.fx * ds
      mesh.position[v * 3 + 1] += basis.fy * ds
      mesh.position[v * 3 + 2] += basis.fz * ds
    }
  }
  addBeam(mesh, at, basis, n, 2.05, -0.85, 0, 1, 1.7, 0.06)
}

export function buildHarmattan(track: Track): TunnelChunk[] {
  const rings = Math.floor(track.length / RING) + 1
  const chunkCount = Math.ceil(track.length / CHUNK)
  const meshes = Array.from({ length: chunkCount }, () => new CourseMesh())
  const spans: { from: number; to: number }[] = []
  const road = emptyRoad()
  const basis: RoadBasis = { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 }
  const land = landFor(track)
  /*
    The cross-section, drawn — and past the verge it is no longer the one the
    wheels use.

    Across the road and the verge this is exactly `harmattanProfile`'s plane,
    the one cross-section the road is drawn from. That profile carried on at
    the same slope for up to thirty-five metres and ended in a one-metre skirt
    with the sky under it. There is ground under everything now (see
    `harmattanLand`), so the drawn road stops a couple of metres past the verge
    instead. Out there, where the physics never lets the car go, the grader's
    windrow rises and drops to a lip, and a skirt goes down from the lip *to
    wherever the ground actually is*: a hand's breadth on the plain, and on the
    scarp — where one switchback's edge stands over the cutting of the one
    below — a battered retaining wall of laterite blocks, which is what holds
    up a road cut into a face.

    Seventeen across, outside in: foot, lip, berm crest, verge, then the road's
    own nine, then the same four the other way.
  */
  const offsets = new Float32Array(DRAWN)
  const heights = new Float32Array(DRAWN)
  const skirt = [0, 0]

  for (let chunk = 0; chunk < chunkCount; chunk++) {
    const mesh = meshes[chunk]
    const first = Math.floor((chunk * CHUNK) / RING)
    const last = Math.min(rings - 1, Math.floor(((chunk + 1) * CHUNK) / RING))
    spans.push({ from: first * RING, to: last * RING })

    for (let ring = first; ring <= last; ring++) {
      const s = ring * RING
      roadAt(track, s, road)
      basisAt(road, basis)

      const verge = harmattanVerge(road, s)
      const lip = verge.grade(verge.edge)
      for (let k = 0; k < 9; k++) {
        offsets[4 + k] = ROAD_ACROSS[k] * road.width
        heights[4 + k] = ROAD_CROWN[k]
      }
      for (const side of [-1, 1]) {
        const out = side < 0 ? 0 : DRAWN - 1
        const mirror = (k: number) => (side < 0 ? k : DRAWN - 1 - k)
        offsets[mirror(1)] = side * verge.edge
        heights[mirror(1)] = lip
        offsets[mirror(2)] = side * (verge.wall + 1)
        heights[mirror(2)] = verge.grade(verge.wall + 1) + verge.berm
        offsets[mirror(3)] = side * (verge.wall + 0.3)
        heights[mirror(3)] = verge.grade(verge.wall + 0.3)
        // Down to the ground, measured just outside the lip and just inside it.
        roadPoint(road, side * verge.edge, lip, point, basis)
        const top = point.y
        roadPoint(road, side * (verge.edge + 0.8), 0, point, basis)
        let ground = land.heightAt(point.x, point.z)
        roadPoint(road, side * (verge.edge - 1.5), 0, point, basis)
        ground = Math.min(ground, land.heightAt(point.x, point.z))
        const drop = Math.max(HARMATTAN_SKIRT, top - ground + 0.4)
        // Battered: a retaining wall leans back into what it holds.
        offsets[out] = side * (verge.edge + Math.max(0, drop - HARMATTAN_SKIRT) * 0.22)
        heights[out] = lip - drop
        skirt[side < 0 ? 0 : 1] = drop
      }
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

      for (let k = 0; k < DRAWN; k++) {
        roadPoint(road, offsets[k], heights[k], point, basis)
        const surface = k >= 4 && k <= 12
        const edge = k === 4 || k === 12
        const loose = k === 3 || k === 13
        const shoulder = k === 2 || k === 14
        let color = GROUND
        let rough = 0.95
        let wet = 0
        if (edge) {
          tint.copy(VERGE).multiplyScalar(0.82 + hash3(ring, k, 6) * 0.22)
          color = tint
          rough = 0.7
          wet = road.wet * 0.6
        } else if (loose) {
          // The verge: loose dust over the laterite, and the drift lies on it too.
          tint.copy(VERGE).lerp(SAND, road.sand * 0.35).multiplyScalar(0.88 + hash3(ring, k, 7) * 0.2)
          color = tint
          rough = 0.9
          wet = road.wet * 0.5
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
          /*
            The lip and the foot of the skirt: the ground's own colour, so the
            road meets the land without a seam — or laterite blocks, where the
            skirt has become a wall holding a switchback up.
          */
          land.colourAt(point.x, point.z, tint)
          const high = skirt[k < DRAWN / 2 ? 0 : 1]
          const wall = smooth01(1.6, 2.6, high)
          tint.lerp(RETAINING, wall * 0.85)
          if (k === 0 || k === DRAWN - 1) tint.multiplyScalar(0.9 - wall * 0.1)
          color = tint
          // Coursed, where it is a wall: rough enough for the rock shader's beds.
          rough = 0.92 - wall * 0.2
        }
        mesh.vertex(point, color, wet, rough)
      }

      if (ring > first) {
        const previous = base - DRAWN
        for (let k = 0; k < DRAWN - 1; k++) {
          // The two skirts go down to the ground; everything between them is drivable.
          if (k === 0 || k === DRAWN - 2) mesh.quad(previous + k, previous + k + 1, base + k + 1, base + k)
          else mesh.deck(previous + k, previous + k + 1, base + k + 1, base + k)
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
  /*
    Stood on the ground, not at the road's height: everything past the drawn
    edge is on the land now, and a tree on the scarp is on the slope.

    The random numbers are drawn in exactly the order they always were, so
    every farm, mound and palm dealt after these lands where it always did.
  */
  const standing = (s: number, n: number) => {
    const { at, frame } = frameAt(s)
    roadPoint(at, n, 0, point, frame)
    point.y = land.heightAt(point.x, point.z)
    return point
  }
  for (let s = 30; s < HARMATTAN.cathedrals.from; s += 52 + rng() * 60) {
    const { at } = frameAt(s)
    const side = rng() < 0.5 ? -1 : 1
    // Clear of the berm: a trunk two and a half metres across wants room.
    const n = side * (at.width + vergeWidth(at.room) + 7 + rng() * 16)
    const seed = rng() * 900
    const foot = standing(s, n)
    baobab(meshes[chunkFor(s)], foot.x, foot.y, foot.z, 0.8 + hash3(seed, 1, 3) * 0.7, seed)
  }
  {
    const s = HARMATTAN.baobabBend + 18
    const { at } = frameAt(s)
    const foot = standing(s, at.width + vergeWidth(at.room) + 6.5)
    // The one the corner is named for, and the biggest on the road.
    baobab(meshes[chunkFor(s)], foot.x, foot.y, foot.z, 1.55, 42)
  }
  // A few more thinning out along the scarp, because the plain is still there.
  for (let s = HARMATTAN.scarp.from; s < track.length - 40; s += 90 + rng() * 80) {
    const { at } = frameAt(s)
    const n = -(at.width + vergeWidth(at.room) + 9 + rng() * 12)
    const seed = rng() * 900
    const foot = standing(s, n)
    if (land.slopeAt(foot.x, foot.z) > 0.7) continue
    baobab(meshes[chunkFor(s)], foot.x, foot.y, foot.z, 0.8 + hash3(seed, 1, 3) * 0.5, seed)
  }

  /*
    The mounds, thick enough on the ground that the road is a corridor. This is
    the one place where something hard is close, so they crowd the verge and
    stop dead at the edge of it.
  */
  const RUIN_AT = (HARMATTAN.cathedrals.from + HARMATTAN.cathedrals.to) * 0.5
  for (let s = HARMATTAN.cathedrals.from - 20; s < HARMATTAN.cathedrals.to + 30; s += 4 + rng() * 7) {
    const { at, frame } = frameAt(s)
    const side = rng() < 0.5 ? -1 : 1
    /*
      A clearing around the ruin, on its side only.

      The mounds are dense enough here to swallow anything a metre and a half
      high, and the ruin is the one thing on this stretch that is *supposed* to
      be found. Left in the crowd it was invisible, which made the whole beat
      — somebody tried to live here, and look what happened — a detail nobody
      would ever see. Thirteen metres of quiet is what makes it readable.
    */
    if (side < 0 && Math.abs(s - RUIN_AT) < 13) continue
    const spread = rng() * rng() * 7
    const seed = rng() * 900
    const high = 3.2 + hash3(seed, 7, 1) * 2.4
    /*
      Out by its own foot as well as the verge. The old taper's foot was a
      metre and a bit wide and stood on the verge's edge, so half of it was on
      ground the car can drive over; a cathedral is only a wall if you cannot
      drive through the bottom of it.
    */
    const out = at.width + vergeWidth(at.room) + 0.3 + high * 0.3 + spread
    roadPoint(at, side * out, 0, point, frame)
    const foot = { x: point.x, z: point.z, y: Math.max(land.heightAt(point.x, point.z), at.y - 0.1) }
    termiteMound(meshes[chunkFor(s)], foot.x, foot.y, foot.z, high, seed)
  }

  /*
    The wadi banks: cut earth, close, and high enough to take the wind away.
    Drawn as a run of leaning slabs rather than one long wall, because a river
    bank is cut by water and water does not cut straight lines.
  */
  /*
    The wadi banks.

    **Swept, and that is the second correction.** The first version dealt the
    height and the lean of every slab independently and came out as scattered
    cardboard; the second regularised the heights so the bank rose and fell in
    one slow wave, which was right about erosion and did not fix the look. The
    reason is in `sweepFace`: a taper is narrower at the top, so no amount of
    overlap at the foot closes the gaps at the crown, and a picket line of
    slabs is what you get however carefully the slabs are chosen.

    A bank cut by water is one surface. The wave is kept — it was never the
    problem — and the surface is now continuous under it.
  */
  for (const side of [-1, 1]) {
    sweepFace(
      meshes, chunkFor, frameAt,
      HARMATTAN.riverBed.from - 30, HARMATTAN.riverBed.to + 40, 2.6,
      (s, at) => {
        // One slow wave plus a faster one: erosion, rather than noise.
        const cut = 3.4 + Math.sin(s * 0.055) * 1.5 + Math.sin(s * 0.19) * 0.7
        /*
          The foot of the bank wanders, and that is what makes it earth.

          Swept at a constant offset it came out as a smooth ridge — a dune,
          not a cut. Water does not undercut evenly: it takes bites, so the
          bank steps in and out along its length. Two slow waves out of phase
          with the height's two are enough; the eye only needs the edge to stop
          being a curve somebody drew.
        */
        const bite = Math.sin(s * 0.13 + side) * 0.75 + Math.sin(s * 0.34) * 0.35
        return {
          n: side * (at.width + vergeWidth(at.room) + 0.35 + Math.max(0, bite)),
          foot: -1.6,
          high: cut + 1.6 + Math.sin(s * 0.41 + side) * 0.25,
          thick: side * 1.9,
          lean: side * 0.55,
          color: tint.copy(GROUND).multiplyScalar(0.72 + hash3(Math.round(s), side, 3) * 0.2).clone(),
        }
      },
    )
  }

  /*
    The town: two storeys of earth either side of the street, and the gate.

    The gate itself is drawn as the wall closing right in and then opening
    again, which is what a gate in a curtain wall actually is. There is no arch
    over the road: an arch you drive under at ninety would be a guess about the
    car's height, and this game has never once put a thing above the road that
    could be hit.
  */
  /*
    ===========================================================================
    THE RAMPART, and only at the gates.

    **It used to run the whole length of the town and that was the mistake.**
    Rendered, a curtain wall on both sides of a narrow street is a slot canyon:
    eight metres of blank earth either side, no sky, nothing to look at, and —
    because it was built as a taper every two metres — daylight between every
    slab, so it read as a row of hoodoos rather than as anything anybody made.
    Driving it told you nobody lived there, which is the exact opposite of what
    a city is for.

    So the wall is now what a wall actually is: a *fortification*, at the two
    gates, where it belongs. Between them the street is lined with the fronts
    of houses — see below — because that is what you see from inside a walled
    town. You are not meant to be able to see the wall from the middle of the
    city; that is the point of being inside it.
    ===========================================================================
  */
  for (const [from, to] of [
    [HARMATTAN.gateAt - 26, HARMATTAN.town.from + 2],
    [HARMATTAN.town.to - 2, HARMATTAN.gateOut + 8],
  ]) {
    for (const side of [-1, 1]) {
      sweepFace(
        meshes, chunkFor, frameAt, from, to, 2.2,
        (s, at) => ({
          n: side * (at.width + vergeWidth(at.room) + 0.55),
          foot: -0.4,
          // Tallest at the gate itself and shouldering down into the town.
          high: 6.2 + Math.max(0, 1 - Math.abs(s - (s < HARMATTAN.town.from ? HARMATTAN.gateAt : HARMATTAN.gateOut)) / 18) * 2.4,
          thick: side * 1.5,
          lean: side * 0.42,
          color: tint.copy(WALL).multiplyScalar(0.86 + hash3(Math.round(s), side, 1) * 0.2).clone(),
        }),
      )
      // Buttresses and beams on the mass, which is what stops six metres of
      // continuous earth reading as a cliff. The mass is the sweep above.
      for (let s = from + 3; s < to; s += 5.5) {
        const { at, frame } = frameAt(s)
        dressWall(meshes[chunkFor(s)], at, frame,
          side * (at.width + vergeWidth(at.room) + 0.55), 6.4, s * 3 + side)
      }
    }
  }

  /*
    ===========================================================================
    THE STREET — the fronts of houses, shoulder to shoulder.

    Two storeys mostly, one sometimes, and every so often a gap you could walk
    down. The gaps do most of the work: a solid run of anything is a wall
    however it is decorated, and it is the alleys that say there is a town
    behind the frontage rather than a stage flat.

    Heights are dealt within a narrow band on purpose. A roofline that is
    broken but level reads as a street; one that swings wildly reads as rubble.
    ===========================================================================
  */
  /*
    Where the mosque stands, and the ground the street leaves clear for it.

    One constant, read by both street loops and by the mosque itself, because
    three numbers that have to agree are three numbers that will not.
  */
  const MOSQUE_AT = HARMATTAN.town.from + 30
  const mosquePlot = (s: number) => Math.abs(s - MOSQUE_AT) < 11

  for (let s = HARMATTAN.town.from; s < HARMATTAN.town.to; s += 4.4) {
    const { at, frame } = frameAt(s)
    const mesh = meshes[chunkFor(s)]
    for (const side of [-1, 1]) {
      // An alley, now and then. Never both sides at once — a street that opens
      // on both sides at the same metre stops being a street.
      if (hash3(Math.round(s), side, 9) > 0.86) continue
      if (side < 0 && mosquePlot(s)) continue
      const storeys = hash3(Math.round(s), side, 3) > 0.42 ? 2 : 1
      addHouse(
        mesh, at, frame,
        side * (at.width + vergeWidth(at.room) + 1.5), 0,
        2.1, 1.4, storeys, Math.round(s * 5 + side),
      )
    }
  }

  /*
    And a second rank behind the first, taller and set back, so the town has
    depth over the frontage instead of being one building thick.
  */
  for (let s = HARMATTAN.town.from + 2; s < HARMATTAN.town.to; s += 9.5) {
    const { at, frame } = frameAt(s)
    const mesh = meshes[chunkFor(s)]
    for (const side of [-1, 1]) {
      if (hash3(Math.round(s), side, 11) > 0.62) continue
      if (side < 0 && mosquePlot(s)) continue
      addHouse(
        mesh, at, frame,
        side * (at.width + vergeWidth(at.room) + 5.4), 2, 2.4, 1.8, 2,
        Math.round(s * 7 + side * 3),
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

  /*
    ===========================================================================
    THE FARMS — the red mile, and the only stretch anybody chose to live on.

    Millet ground at the edge of the desert. The grain goes in drums up off the
    floor, the compound hides behind a stalk screen, and the whole arrangement
    is turned away from the wind. Thinning as the road runs on, so that the
    plain is emptier by the time the termite country starts and nobody has to
    be told the farms have stopped.
    ===========================================================================
  */
  for (let s = 70; s < HARMATTAN.cathedrals.from - 60; s += 19 + rng() * 26) {
    const { at, frame } = frameAt(s)
    const mesh = meshes[chunkFor(s)]
    const side = rng() < 0.5 ? -1 : 1
    // Well back. The screen is the nearest thing and it is still eleven metres
    // off the centreline, which is four clear of anywhere the car can be.
    const back = at.width + vergeWidth(at.room) + 4.5 + rng() * 8
    const seed = Math.round(s * 7.7 + side * 3)

    addScreen(mesh, at, frame, side * back, -7 + rng() * 5, 4 + rng() * 3.5, seed)
    if (rng() > 0.5) addScreen(mesh, at, frame, side * back, 6 + rng() * 6, 3 + rng() * 3, seed + 5)

    const bins = 2 + Math.floor(rng() * 4)
    for (let k = 0; k < bins; k++) {
      addGranary(
        mesh, at, frame, side * (back + 2.4 + rng() * 6), -6 + rng() * 14,
        0.8 + rng() * 0.55, seed + k * 17,
      )
    }
    if (rng() > 0.42) {
      addHouse(
        mesh, at, frame, side * (back + 3.5 + rng() * 5), 2 + rng() * 8,
        1.9 + rng() * 1.3, 1.7 + rng() * 0.9, 1, seed + 91,
      )
    }
    // The far side of the road, further out and thinner, so the plain still
    // reads as a plain and the road is not an avenue of farms.
    if (rng() > 0.55) {
      const far = at.width + vergeWidth(at.room) + 11 + rng() * 12
      addGranary(mesh, at, frame, -side * far, rng() * 16 - 8, 0.85 + rng() * 0.4, seed + 201)
      if (rng() > 0.55) {
        addGranary(mesh, at, frame, -side * (far + 2.5), rng() * 16 - 8, 0.8 + rng() * 0.4, seed + 202)
      }
    }
  }

  /*
    Field boundaries along the verge, in the two farmed stretches.

    **This one is for the driving rather than for the landscape.** Everything
    else here is placed twelve to twenty metres out, where it is scenery you
    look at; a fence four metres off the shoulder is scenery you *pass*, and it
    is the only thing on the red mile that gives the speed anything to be
    measured against. An empty plain at a hundred and forty reads exactly like
    an empty plain at sixty.

    Short runs with real gaps between them, on one side at a time. A continuous
    fence down both sides would be a corridor, and this road is not one.
  */
  for (const [from, to] of [
    [90, HARMATTAN.cathedrals.from - 70],
    [HARMATTAN.home.from + 10, track.length - 30],
  ]) {
    for (let s = from; s < to; s += 34 + rng() * 46) {
      const side = rng() < 0.5 ? -1 : 1
      const run = 12 + rng() * 22
      for (let d = 0; d < run; d += 5.2) {
        const here = s + d
        if (here >= to) break
        const { at, frame } = frameAt(here)
        addScreen(
          meshes[chunkFor(here)], at, frame,
          side * (at.width + vergeWidth(at.room) + 1.6 + rng() * 0.6), 0, 2.5,
          Math.round(here * 13 + side),
        )
      }
    }
  }

  /*
    ===========================================================================
    THE RUIN — one abandoned compound in the termite country, and the reason
    there are no others.

    The mounds crowd this whole stretch and nobody farms it. Saying that with
    emptiness alone leaves it as a fact about the scenery budget; saying it
    with a wall somebody built, a granary with its cap gone, and a mound coming
    up *through* the floor makes it a thing that happened. It is placed rather
    than dealt, because there is exactly one of them and it wants to be found
    at the same metre every time.
    ===========================================================================
  */
  {
    const s = RUIN_AT
    const { at, frame } = frameAt(s)
    const mesh = meshes[chunkFor(s)]
    const back = at.width + vergeWidth(at.room) + 3.4
    const shift = (d: number) => ({
      ...at, x: at.x + frame.fx * d, y: at.y + frame.fy * d, z: at.z + frame.fz * d,
    })
    /*
      Bigger than a ruin needs to be, because it is competing with mounds four
      metres tall and it only gets one pass at eighty miles an hour.
    */
    tint.copy(WALL).multiplyScalar(0.72)
    // Two standing walls of a compound — no parapet, no horns, no roof, and
    // different heights, because a wall falls down unevenly.
    addBox(mesh, shift(-4), frame, -(back + 1.5), 0, 3.4, 0.34, 2.9, tint, 0.95)
    addBox(mesh, shift(3.2), frame, -(back + 4.6), 0, 0.34, 3.2, 2.2, tint, 0.95)
    addBox(mesh, shift(6.4), frame, -(back + 2.2), 0, 1.5, 0.32, 1.2, tint, 0.95)
    // A granary with the thatch long gone: the drum on its own, and broken.
    tint.copy(RENDER).multiplyScalar(0.7)
    addRound(mesh, shift(0.5), frame, -(back + 3.2), 0, 1.5, 0.78, 0.7, 6, tint, 0.96)
    // And the mounds that took it, standing in what used to be the yard.
    for (const [along, out, seed] of [[-0.5, back + 1.2, 610], [4.5, back + 5.4, 611]] as const) {
      roadPoint(shift(along), -out, 0, point, frame)
      const ground = Math.max(land.heightAt(point.x, point.z), at.y - 0.1)
      termiteMound(mesh, point.x, ground, point.z, 3.2 + hash3(seed, 7, 1) * 2.4, seed)
    }
  }

  /*
    ===========================================================================
    THE WADI — palms, wells, and the only water on the road.

    A doum palm forks, which is why it reads as a tree, and it grows where the
    water table is close — so a stand of them is the landscape saying the dry
    river is coming before the banks do. They stand *beyond* the cut, so what
    you get from inside it is crowns over the bank tops, which is what being
    down in a wadi actually looks like.

    The wells and the washing are at the two ends, where the banks fade out and
    somebody could get down to the bed.
    ===========================================================================
  */
  for (let s = HARMATTAN.river.from - 30; s < HARMATTAN.river.to; s += 8 + rng() * 13) {
    const { at, frame } = frameAt(s)
    const mesh = meshes[chunkFor(s)]
    // Thickest in the bed itself, thinning out at either end.
    const inBed = s > HARMATTAN.riverBed.from - 40 && s < HARMATTAN.riverBed.to + 40
    if (!inBed && rng() > 0.45) continue
    const side = rng() < 0.5 ? -1 : 1
    const n = side * (at.width + vergeWidth(at.room) + 3.5 + rng() * 9)
    const ds = rng() * 8 - 4
    roadPoint(at, n, 0, point, frame)
    point.x += frame.fx * ds
    point.z += frame.fz * ds
    // On the ground behind the bank, so the crown stands over the bank top.
    doumPalm(mesh, point.x, land.heightAt(point.x, point.z), point.z, Math.round(s * 3 + side))
  }
  for (const s of [HARMATTAN.riverBed.from - 34, HARMATTAN.riverBed.to + 30]) {
    const { at, frame } = frameAt(s)
    const mesh = meshes[chunkFor(s)]
    const side = s < HARMATTAN.riverBed.to ? -1 : 1
    const back = at.width + vergeWidth(at.room) + 3.2
    addWell(mesh, at, frame, side * back, 0, Math.round(s))
    addRack(mesh, at, frame, side * (back + 2.6), 6, Math.round(s) + 4)
    addHouse(mesh, at, frame, side * (back + 4), -9, 2.2, 1.8, 1, Math.round(s) + 8)
    addGranary(mesh, at, frame, side * (back + 2), -14, 0.9, Math.round(s) + 12)
  }

  /*
    ===========================================================================
    THE CITY — the gate, the street behind the wall, and the tower.

    The wall above is the street edge and stays exactly as it was. What was
    missing is everything it was supposed to be hiding: a wall with nothing
    behind it is a corridor, and driving through one told you nobody lived
    there. So the roofline now stands over it — two storeys, parapets, and the
    horned corners that make a Hausa town unmistakable from a distance.

    **The bastions are the arrival.** A gate on this continent is two towers;
    the wall thickens, stands up and watches the road, and passing between two
    masses is the moment a stretch-with-walls becomes a town. There is still
    nothing over the road, and there never will be.
    ===========================================================================
  */
  for (const gate of [HARMATTAN.gateAt, HARMATTAN.gateOut]) {
    const { at, frame } = frameAt(gate)
    const mesh = meshes[chunkFor(gate)]
    for (const side of [-1, 1]) {
      addBastion(
        mesh, at, frame, side * (at.width + vergeWidth(at.room) + 2.1), 0,
        8.4 + hash3(gate, side, 1) * 1.4, gate + side,
      )
    }
  }

  /*
    THE MOSQUE — placed, not dealt, and standing in a square of its own.

    The first attempt put the tower behind the street frontage and it was
    invisible: two ranks of houses in front of it, and by the time there was a
    gap to see through, it was past. A landmark you cannot see is furniture.

    So the houses stand back from it — `mosquePlot` below is what the two
    street loops check — and the tower stands in the gap, which is also how a
    Friday mosque actually sits in a town like this: off a small open square,
    because a thousand people have to arrive at it at once.

    **Thirty metres inside the gate**, and that number is set by the dust
    rather than by taste. The fog closes at a hundred and twenty metres, so
    anything further in simply is not there on the approach; at thirty it
    comes up over the rampart as you reach the towers, which is the moment it
    is for. Fifteen metres tall — nearly twice the gate — because a landmark
    that is merely the tallest thing is not read as a landmark.
  */
  {
    const s = MOSQUE_AT
    const { at, frame } = frameAt(s)
    const mesh = meshes[chunkFor(s)]
    const n = -(at.width + vergeWidth(at.room) + 5.2)
    addMinaret(mesh, at, frame, n, 0, 15, 404)
    /*
      And the prayer hall beside it, low and long.

      A minaret on its own reads as a chimney. What makes it a mosque is the
      mass at its foot — a broad flat-roofed hall, horned like everything else
      here, with the tower coming out of one end of it.
    */
    addHouse(mesh, at, frame, n - 2.6, 9.5, 5.5, 2.6, 1, 771)
    addHouse(mesh, at, frame, n - 2.2, -8.5, 4.2, 2.4, 1, 772)
  }

  /*
    ===========================================================================
    THE DYERS' QUARTER — the indigo, standing up at last.

    The pits were already here and they are the reason the quarter is: this
    work is done outside the wall because it stinks, and the cloth is dried and
    beaten beside the pits it came out of. So the frames go exactly where the
    road already put the dye, and the one cool colour in three kilometres
    finally arrives somewhere in quantity instead of being sprinkled thinly.
    ===========================================================================
  */
  /*
    In yards, not scattered.

    Dealt one frame at a time they came out sprinkled evenly over the plain,
    which reads as *litter* — nobody works alone in the middle of a field. Dye
    is a trade and a trade has a yard: four or five frames together, a shed
    beside them, and then a gap of open ground before the next family's.
  */
  for (let s = HARMATTAN.pits.from + 12; s < HARMATTAN.pits.to - 12; s += 22 + rng() * 20) {
    const { at, frame } = frameAt(s)
    const mesh = meshes[chunkFor(s)]
    const side = rng() < 0.5 ? -1 : 1
    const back = at.width + vergeWidth(at.room) + 2.6

    const frames = 4 + Math.floor(rng() * 4)
    for (let k = 0; k < frames; k++) {
      addRack(
        mesh, at, frame,
        side * (back + rng() * 8), (k - frames * 0.5) * 3.4 + rng() * 2,
        Math.round(s * 9 + side * 3 + k * 17),
      )
    }
    addHouse(mesh, at, frame, side * (back + 8 + rng() * 4), rng() * 8 - 4, 2.4, 1.7, 1,
      Math.round(s * 9 + 31))
    // A screen on the road side of the yard, which is what makes it a yard.
    addScreen(mesh, at, frame, side * (back - 0.6), rng() * 4 - 2, 4 + rng() * 3,
      Math.round(s * 9 + 44))
  }

  /*
    ===========================================================================
    THE SCARP — a rock face on the hairpins, and grain kept in the cliff.

    The stretch is named for an escarpment and did not have one. It does now,
    but only where it earns its place: a face on the *inside* of each hairpin,
    which is the wall you are turning against and the one place a driver is
    looking at something other than the road.

    Grain is stored against a cliff because a cliff is dry and out of reach,
    and a row of small capped stores tucked under an overhang is one of the
    great images of this continent. They are drawn small and high on the face,
    so they read as *lodged in it* rather than as huts standing near a rock.
    ===========================================================================
  */
  for (const hairpin of HARMATTAN.hairpins) {
    const { at: apex } = frameAt(hairpin)
    // The inside of the corner is the side the road turns toward.
    const inside = apex.curv === 0 ? -1 : -Math.sign(apex.curv)

    /*
      One face, swept, for the same reason the wadi banks are — see
      `sweepFace`. A bluff made of separate leaning slabs reads as a fence.
    */
    sweepFace(
      meshes, chunkFor, frameAt,
      Math.max(0, hairpin - 40), Math.min(track.length - 1, hairpin + 40), 2.4,
      (s, at) => {
        const d = s - hairpin
        // Rising toward the apex and falling away either side, so it is a
        // bluff the corner is cut into rather than a wall somebody stood up.
        const swell = Math.cos((d / 40) * Math.PI * 0.5)
        /*
          It goes to nothing at both ends rather than stopping at a metre and a
          half, because a face that ends at a height ends as a *corner* — a
          clean vertical edge standing in open ground with the plain visible
          past it, which is the one thing that says "this was placed here".
        */
        return {
          n: inside * (at.width + vergeWidth(at.room) + 0.6 + Math.max(0, Math.sin(s * 0.16) * 1.1)),
          foot: -1.4,
          high: swell * (6.6 + Math.sin(s * 0.21) * 0.8 + Math.sin(s * 0.58) * 0.45),
          thick: inside * 2.4,
          lean: inside * 0.7,
          color: tint
            .copy(STONE).lerp(GROUND, 0.35)
            .multiplyScalar(0.76 + hash3(Math.round(s), inside, 5) * 0.24)
            .clone(),
        }
      },
    )

    // The stores, on the face itself, above the road.
    for (let k = 0; k < 5; k++) {
      const s = hairpin - 20 + k * 9 + hash3(hairpin, k, 2) * 4
      if (s < 0 || s >= track.length) continue
      const { at, frame } = frameAt(s)
      const mesh = meshes[chunkFor(s)]
      const lift = 2.6 + hash3(hairpin, k, 3) * 2.4
      const n = inside * (at.width + vergeWidth(at.room) + 1.9)
      tint.copy(RENDER).multiplyScalar(0.8 + hash3(hairpin, k, 4) * 0.24)
      addBox(mesh, at, frame, n, lift, 0.62, 0.55, 1.25, tint, 0.94)
      tint.copy(THATCH).multiplyScalar(0.84 + hash3(hairpin, k, 6) * 0.24)
      addRound(mesh, at, frame, n, lift + 1.25, 0.8, 0.72, 0.03, 6, tint, 0.98)
    }
  }

  /*
    ===========================================================================
    HOME — the last village, and the only place the road is lived on both
    sides at once.

    Denser than the farms and closer in, because you are arriving somewhere
    rather than passing something. It is the last thing on the road before the
    fire, and it is the answer to the granaries at the very start: you came out
    of farmland, you crossed everything in between, and here is farmland again
    with the lights on.
    ===========================================================================
  */
  for (let s = HARMATTAN.home.from + 10; s < track.length - 24; s += 11 + rng() * 12) {
    const { at, frame } = frameAt(s)
    const mesh = meshes[chunkFor(s)]
    for (const side of [-1, 1]) {
      if (rng() > 0.86) continue
      const back = at.width + vergeWidth(at.room) + 3.6 + rng() * 5
      const seed = Math.round(s * 11 + side * 7)
      addScreen(mesh, at, frame, side * back, -5 + rng() * 4, 3.5 + rng() * 3, seed)
      const bins = 1 + Math.floor(rng() * 3)
      for (let k = 0; k < bins; k++) {
        addGranary(mesh, at, frame, side * (back + 2 + rng() * 5), -5 + rng() * 12,
          0.85 + rng() * 0.5, seed + k * 19)
      }
      if (rng() > 0.5) {
        addHouse(mesh, at, frame, side * (back + 3 + rng() * 4), 3 + rng() * 6,
          2 + rng() * 1.2, 1.8 + rng() * 0.7, 1, seed + 55)
      }
    }
  }

  /* Ironstone, from the track's boulders, so the physics and the eye agree. */
  for (const stone of track.boulders) {
    const { at, frame } = frameAt(stone.s)
    /*
      A lump, not a brick, at exactly the place and width the physics strikes
      you with it. On the drawn verge it sits on the verge; past the edge, where
      the ground has taken over, it sits on the ground — on the scarp the old
      boxes hung in the air over the drop.
    */
    const verge = harmattanVerge(at, stone.s)
    roadPoint(at, stone.n, verge.grade(stone.n), point, frame)
    if (Math.abs(stone.n) > verge.edge) point.y = land.heightAt(point.x, point.z)
    const across = Math.hypot(frame.rx, frame.rz) || 1
    ironstone(meshes[chunkFor(stone.s)], point.x, point.y, point.z, stone.size, frame.rx / across, frame.rz / across, stone.seed)
  }

  return meshes.map((mesh, index) => {
    const geometry = mesh.build()
    if (!geometry.boundingSphere) geometry.boundingSphere = new Sphere()
    return { ...spans[index], geometry, tread: mesh.tread }
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

  float dome(float az, float centre, float spread, float height) {
    float d = abs(mod(az - centre + 3.14159, 6.28318) - 3.14159) / spread;
    return d < 1.0 ? height * pow(1.0 - d * d, 0.55) : 0.0;
  }

  void main() {
    vec3 dir = normalize(vDirection);

    /*
      Dust at the ground line, paler overhead. The horizon is exactly the colour
      the fog shows as through the tone curve (#ccbb9d), so the plain dissolves
      into the sky with no line — the haze has no horizon, and neither does this.

      It was ochre (#c88f5a) and the fog a different ochre. Harmattan air is pale
      before it is orange: the dust scatters the blue away and what is left is
      the colour of the dust, lit.
    */
    vec3 horizon = vec3(0.800, 0.733, 0.616);
    vec3 zenith  = vec3(0.878, 0.835, 0.749);
    vec3 sky = mix(horizon, zenith, pow(clamp(dir.y, 0.0, 1.0), 0.6));

    /*
      The inselbergs. Northern Nigeria's plains are stood with granite domes —
      Dala Hill inside Kano, Kufena, the Zuma rock — and in harmattan they are
      the one thing past the dust you can still just make out: a rounder, cooler
      shape standing in the glare with no base to it. Drawn into the sky rather
      than built, because they are kilometres off and the only thing left of
      them at that distance is the silhouette, and it must never move against
      the plain as you drive.
    */
    float az = atan(dir.x, dir.z);
    float hills = max(max(dome(az, 0.55, 0.16, 0.052), dome(az, 0.78, 0.09, 0.03)),
                  max(max(dome(az, 2.35, 0.22, 0.04), dome(az, -1.9, 0.13, 0.062)),
                      max(dome(az, -2.6, 0.08, 0.028), dome(az, -0.35, 0.11, 0.022))));
    float ghost = step(dir.y, hills) * smoothstep(-0.02, 0.004, dir.y);
    sky = mix(sky, horizon * vec3(0.88, 0.87, 0.9), ghost * 0.3);

    // The sun: low, ahead, and flat — a pale disc you can look at. \`uSun\`
    // fades it where the scarp or the town wall would be between you and it.
    vec3 toSun = normalize(vec3(0.34, 0.20, -0.92));
    float near = dot(dir, toSun);
    float disc = smoothstep(0.9975, 0.9990, near);
    float wash = smoothstep(0.86, 1.0, near) * 0.22;
    sky += vec3(0.16, 0.14, 0.10) * wash * uSun;
    sky = mix(sky, vec3(1.0, 0.975, 0.92), disc * 0.9 * uSun);

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
    gl_FragColor = vec4(0.88, 0.8, 0.66, round * vFade * 0.5);
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
export function HarmattanWorld({ track, rock }: { track: Track; rock: ShaderMaterial }) {
  const skyRef = useRef<Mesh>(null)
  const dustRef = useRef<Points>(null)
  /*
    The ground, drawn with the road's own material, so the sun, the haze and the
    town's shade fall on the plain exactly as they fall on the road across it.
  */
  const land = useMemo(() => landFor(track), [track])
  const tileRefs = useRef<Mesh[]>([])

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
    /*
      Only the ground there is to see. Past the haze a tile is the fog's colour
      and nothing else, so it is not drawn at all.
    */
    const far = rock.uniforms.uFogFar.value as number
    for (let i = 0; i < land.tiles.length; i++) {
      const mesh = tileRefs.current[i]
      if (!mesh) continue
      const tile = land.tiles[i]
      mesh.visible = camera.position.distanceTo(tile.centre) - tile.radius < far * 1.05
    }
  })
  useEffect(() => () => land.tiles.forEach((tile) => tile.geometry.dispose()), [land])

  return (
    <group>
      <mesh ref={skyRef} material={sky} position={[middle.x, middle.y, middle.z]} renderOrder={-10}>
        <sphereGeometry args={[middle.size * 0.5, 24, 16]} />
      </mesh>
      {land.tiles.map((tile, i) => (
        <mesh
          key={`ground-${i}`}
          ref={(node) => {
            if (node) tileRefs.current[i] = node
          }}
          geometry={tile.geometry}
          material={rock}
        />
      ))}
      <points ref={dustRef} geometry={grains} material={dust} frustumCulled={false} />
      <Sahellife track={track} rock={rock} />
      <HarmattanSound track={track} />
    </group>
  )
}
