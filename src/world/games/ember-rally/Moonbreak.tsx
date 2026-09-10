/**
 * The Moonbreak — an open road over the drowned high garden.
 *
 * This file owns only what is different from the Rootway: the causeway, its
 * arches and orchard, and the sky and water around them. Cars, tyres, ghosts,
 * controls, cameras, particles and race timing remain in `Race.tsx` and do not
 * know which road they are on.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  LinearFilter,
  RedFormat,
  ShaderMaterial,
  Mesh,
  Sphere,
  Vector3,
  Vector4,
} from 'three'
import { random } from './model'
import { basisAt, roadPoint, type RoadBasis, type TunnelChunk } from './geometry'
import {
  MOONBREAK,
  SWAY_ROLL,
  WATER_Y,
  emptyRoad,
  roadAt,
  vergeWidth,
  type Track,
} from './track'
import { Deepwater } from './Deepwater'
import { deep } from './depth'
import { MoonbreakSound } from './MoonbreakSound'
import { Moonshore } from './Moonshore'
import { Moonlife } from './Moonlife'
import { MOON, MOON_DIR, NIGHT, NOISE } from './moonlight'
import {
  DECK as VIADUCT_DECK,
  addKerbPost,
  addOrchardTree,
  addRuinedArch,
  addSeaStone,
  addSunkenColumn,
  addTerrace,
  addViaduct,
  faceToward,
  viaductSpans,
  wallEdge,
} from './moonGarden'



const RING = 2
const CHUNK = 50
const PROFILE = 13
const ROAD = new Color('#777973')
const ROAD_WORN = new Color('#4f5452')
const ROAD_MIRROR = new Color('#788687')
const ROAD_REED = new Color('#626e68')
const ROAD_HIGH = new Color('#858187')
const MOSS = new Color('#40564a')
const REED = new Color('#637263')
const REED_PALE = new Color('#899078')
const BANK = new Color('#273d3b')
const BANK_LOW = new Color('#172b2f')
const PALE_STONE = new Color('#a8aaa0')
const MIRROR_STONE = new Color('#798c91')
const BARK = new Color('#4d403d')
const BARK_PALE = new Color('#766861')
/*
  The Swaying Span is made of wood, and needs its own three tones.

  A plank deck read at speed is almost entirely about the *gaps*: the boards
  themselves barely differ from one another, and what the eye follows is the
  dark line between them going past. So the important colour here is the
  darkest one — what is under the deck, which is nothing.
*/
/*
  Built out of the drowned orchard, not out of a timber yard.

  The first pass invented its own warm pine and the span came out looking new,
  which is the one thing nothing on this road is: everything here has been in
  the water a long time. These are BARK and BARK_PALE, the trees' own two
  tones, nudged apart — so the deck, the trunks either side of the orchard and
  the rope on the rail are all visibly the same wood at different ages.
*/
const DECK = new Color('#584a45')
const DECK_WORN = new Color('#766861')
/** Between the boards: the drop, and the water a long way down it. */
const DECK_GAP = new Color('#070b0e')
/** Down in the Drowned Mile, where the only green left is the kind that likes it. */
const KELP = new Color('#3c6b52')
const KELP_DARK = new Color('#26493f')

function hash3(a: number, b: number, c: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return value - Math.floor(value)
}

/**
 * What a batch of vertices needs to know to swing with the deck under it.
 *
 * The centre of the road and its two cross axes, so that a vertex given only
 * as a world point can be asked where it *is* on the bridge — see
 * `CourseMesh.onSwayingRoad`.
 */
interface Swaying {
  cx: number; cy: number; cz: number
  rx: number; ry: number; rz: number
  ux: number; uy: number; uz: number
  sway: number
  s: number
}

class CourseMesh {
  readonly position: number[] = []
  readonly color: number[] = []
  readonly surface: number[] = []
  /** Where this vertex goes when the deck rolls one radian. Zero on solid ground. */
  readonly swing: number[] = []
  /** x: how much this piece of road moves. y: how far along the road it is. */
  readonly phase: number[] = []
  readonly index: number[] = []

  private swaying: Swaying | null = null

  get count() {
    return this.position.length / 3
  }

  /*
    =========================================================================
    Everything added from here until `onSolidGround` belongs to a bridge that
    is rolling, and should roll with it.

    **Why a mode rather than an argument.** Vertices arrive here from six
    different places — the ring loop, boxes, tubes, arches, trees, reeds — and
    all of them already know the road, so threading "and how much does this
    move" through every one of their signatures would touch every caller to
    serve one section of one course.

    Instead the vertex is asked where it is. A world point `p` on a road whose
    centre is `c` sits `n = (p−c)·right` across and `h = (p−c)·up` above, and
    rolling by θ about the road's own length moves it by `sinθ · (n·up − h·right)`
    to first order — which for eleven degrees is exact to about two per cent
    and costs one multiply-add in the shader. So the whole of a vertex's
    relationship to the swing is that one vector, worked out once at build time
    and never again.

    The consequence worth stating: a cable ten metres above the deck swings
    ten times as far sideways as the deck does, and the hangers between them
    stay attached, without any of that being written down anywhere. It falls
    out of `h`.
    =========================================================================
  */
  onSwayingRoad(road: ReturnType<typeof emptyRoad>, basis: RoadBasis, s: number) {
    this.swaying =
      road.sway <= 0.002
        ? null
        : {
            cx: road.x, cy: road.y, cz: road.z,
            rx: basis.rx, ry: basis.ry, rz: basis.rz,
            ux: basis.ux, uy: basis.uy, uz: basis.uz,
            sway: road.sway,
            s,
          }
  }

  onSolidGround() {
    this.swaying = null
  }

  vertex(point: Vector3, color: Color, wet = 0, rough = 0.5) {
    this.position.push(point.x, point.y, point.z)
    this.color.push(color.r, color.g, color.b)
    this.surface.push(wet, rough)
    const w = this.swaying
    if (!w) {
      this.swing.push(0, 0, 0)
      this.phase.push(0, 0)
      return
    }
    const dx = point.x - w.cx
    const dy = point.y - w.cy
    const dz = point.z - w.cz
    const n = dx * w.rx + dy * w.ry + dz * w.rz
    const h = dx * w.ux + dy * w.uy + dz * w.uz
    this.swing.push(n * w.ux - h * w.rx, n * w.uy - h * w.ry, n * w.uz - h * w.rz)
    this.phase.push(w.sway, w.s)
  }

  quad(a: number, b: number, c: number, d: number) {
    this.index.push(a, b, c, a, c, d)
  }

  build() {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.position), 3))
    geometry.setAttribute('aColor', new BufferAttribute(new Float32Array(this.color), 3))
    geometry.setAttribute('aSurface', new BufferAttribute(new Float32Array(this.surface), 2))
    geometry.setAttribute('aSwing', new BufferAttribute(new Float32Array(this.swing), 3))
    geometry.setAttribute('aSwayPhase', new BufferAttribute(new Float32Array(this.phase), 2))
    geometry.setIndex(this.index)
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
    /*
      The bounding sphere is measured from where the vertices are written down,
      and on the span that is not where they are drawn — the cable tops move
      two metres either way. A chunk culled on its resting bounds pops out of
      existence at the moment it leans furthest, which is exactly when you are
      looking at it. Cheaper to be generous than to recompute a sphere every
      frame for a bridge.
    */
    let farthest = 0
    for (let i = 0; i < this.phase.length; i += 2) {
      if (this.phase[i] <= 0) continue
      const j = (i / 2) * 3
      const reach = Math.hypot(this.swing[j], this.swing[j + 1], this.swing[j + 2])
      farthest = Math.max(farthest, reach * this.phase[i])
    }
    if (farthest > 0 && geometry.boundingSphere) geometry.boundingSphere.radius += farthest * SWAY_ROLL
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
  rough = 0.7,
) {
  const base = mesh.count
  for (const ds of [-along, along]) {
    for (const dy of [0, high]) {
      for (const dn of [-across, across]) {
        roadPoint(road, n + dn, y + dy, point, basis)
        point.x += basis.fx * ds
        point.y += basis.fy * ds
        point.z += basis.fz * ds
        mesh.vertex(point, color, 0.18, rough)
      }
    }
  }
  // indices: ds,dy,dn => 000 001 010 011 100 101 110 111
  mesh.quad(base, base + 4, base + 5, base + 1)
  mesh.quad(base + 2, base + 3, base + 7, base + 6)
  mesh.quad(base, base + 2, base + 6, base + 4)
  mesh.quad(base + 1, base + 5, base + 7, base + 3)
  mesh.quad(base + 4, base + 6, base + 7, base + 5)
  mesh.quad(base, base + 1, base + 3, base + 2)
}

function addTube(mesh: CourseMesh, path: Vector3[], radius: number, color: Color) {
  const sides = 6
  const base = mesh.count
  const forward = new Vector3()
  const right = new Vector3()
  const up = new Vector3()
  const reference = new Vector3(0, 1, 0)

  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)]
    const b = path[Math.min(path.length - 1, i + 1)]
    forward.subVectors(b, a).normalize()
    reference.set(Math.abs(forward.y) > 0.94 ? 1 : 0, Math.abs(forward.y) > 0.94 ? 0 : 1, 0)
    right.crossVectors(forward, reference).normalize()
    up.crossVectors(right, forward).normalize()
    const taper = 0.82 + Math.sin((i / (path.length - 1)) * Math.PI) * 0.18
    for (let k = 0; k < sides; k++) {
      const angle = (k / sides) * Math.PI * 2
      point
        .copy(path[i])
        .addScaledVector(right, Math.cos(angle) * radius * taper)
        .addScaledVector(up, Math.sin(angle) * radius * taper)
      mesh.vertex(point, color, 0.2, 0.62)
    }
  }
  for (let i = 0; i < path.length - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const next = (k + 1) % sides
      mesh.quad(
        base + i * sides + k,
        base + i * sides + next,
        base + (i + 1) * sides + next,
        base + (i + 1) * sides + k,
      )
    }
  }
}

function addArch(mesh: CourseMesh, track: Track, s: number) {
  const road = roadAt(track, s)
  const basis = basisAt(road, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
  const span = road.width + 1.55
  const path = Array.from({ length: 13 }, (_, index) => {
    const t = index / 12
    const angle = Math.PI * (1 - t)
    const n = Math.cos(angle) * span
    const y = 0.16 + Math.sin(angle) * (span * 0.72 + 2.4)
    return roadPoint(road, n, y, new Vector3(), basis)
  })
  addTube(mesh, path, 0.19, PALE_STONE)

  // A second broken rib half a metre behind it gives the gate depth while
  // leaving enough missing glass for the sky to remain the important surface.
  const second = path.map((p, index) =>
    index > 4 && index < 8
      ? p.clone().addScaledVector(new Vector3(basis.fx, basis.fy, basis.fz), -0.7)
      : p.clone().addScaledVector(new Vector3(basis.fx, basis.fy, basis.fz), -0.45),
  )
  addTube(mesh, second, 0.08, BARK_PALE)
}

/** Small drowned reed colonies: motionless geometry shaped as if wind bent it. */
function addReeds(mesh: CourseMesh, track: Track, s: number, side: number, seed: number) {
  const road = roadAt(track, s)
  const basis = basisAt(road, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
  const outside = road.width + vergeWidth(road.room) + 0.45
  const forward = new Vector3(basis.fx, basis.fy, basis.fz)
  for (let stem = 0; stem < 5; stem++) {
    const jitter = (hash3(seed, stem, 2) - 0.5) * 1.4
    const n = side * (outside + hash3(seed, stem, 4) * 1.15) + jitter
    const high = 0.85 + hash3(seed, stem, 8) * 1.25
    const root = roadPoint(road, n, -0.16, new Vector3(), basis)
      .addScaledVector(forward, (stem - 2) * 0.42)
    const middle = roadPoint(road, n - side * 0.08, high * 0.54, new Vector3(), basis)
      .addScaledVector(forward, (stem - 2) * 0.42 + 0.08)
    const tip = roadPoint(road, n - side * (0.2 + high * 0.08), high, new Vector3(), basis)
      .addScaledVector(forward, (stem - 2) * 0.42 + 0.22)
    addTube(mesh, [root, middle, tip], 0.026, stem % 3 === 0 ? REED_PALE : REED)
  }
}


/**
 * The deck of the Swaying Span: boards across, on two beams, over nothing.
 *
 * ===========================================================================
 * **A bridge should not have a road on it.** Everything else about this span
 * was built first — the pylons, the catenaries, the hangers, the rope along
 * each edge — and all of it was standing over the same worn paving as the
 * causeway, which made it decoration rather than construction.
 *
 * Boards laid crosswise are the whole answer, and they do three things at once
 * that a painted surface cannot:
 *
 *   **They say bridge instantly**, because nothing else is built that way.
 *
 *   **They give the section its own rhythm.** The Moonbreak already makes
 *   speed legible with edge stones going past at the side; this puts the same
 *   metronome directly under the car, and much faster. Crossing the span
 *   *sounds* different to the eye.
 *
 *   **They put the drop where you can see it.** The dark between two boards is
 *   real geometry, not a line drawn on a surface, and it is the colour of the
 *   water a long way underneath.
 *
 * **Laid on a solid deck rather than over open air**, which is the one
 * concession. Genuine gaps would be genuine holes, and a hundred and thirty
 * thousand holes seen at forty metres a second through a renderer with
 * antialiasing switched off is a shimmering mess at any distance past thirty
 * metres. The plate underneath is painted the colour of the dark, the boards
 * stand six centimetres proud of it, and what you get is the reading of a
 * plank deck without the strobing.
 *
 * All of it goes through onSwayingRoad, so the boards roll with the bridge
 * and the hangers stay attached to them.
 * ===========================================================================
 */
function addSpanDeck(
  meshes: CourseMesh[],
  track: Track,
  chunkFor: (s: number) => number,
) {
  const { from, to } = MOONBREAK.span
  /** Board pitch. Close enough to blur into a rhythm at speed, not a texture. */
  const PITCH = 0.62
  const road = emptyRoad()
  const basis: RoadBasis = { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 }

  let board = 0
  for (let s = from; s < to; s += PITCH) {
    roadAt(track, s, road)
    basisAt(road, basis)
    const mesh = meshes[chunkFor(s)]
    mesh.onSwayingRoad(road, basis, s)
    /*
      Weathered unevenly, and the same board is the same shade every time the
      course is built — hash3 of its index, not a random per run. A deck that
      re-dapples itself between two runs of the same road is a deck you notice.
    */
    const grain = hash3(board, 3, 11)
    tint.copy(DECK).lerp(DECK_WORN, grain * 0.85)
    // One board in nine is a replacement, and paler for it.
    if (board % 9 === 4) tint.lerp(DECK_WORN, 0.6)
    tint.multiplyScalar(0.9 + hash3(board, 7, 2) * 0.16)
    addBox(
      mesh,
      road,
      basis,
      0,
      0.05,
      // Half a metre of board, twelve centimetres of dark between. Any tighter
      // and the slots close up at distance and it goes back to being a surface.
      PITCH * 0.40,
      road.width + vergeWidth(road.room) * 0.5,
      0.06,
      tint.clone(),
      /*
        Smooth, and the number matters more than it looks.

        The mineral veins in the shared rock shader are gated on roughness —
        `vein *= smoothstep(0.28, 0.72, rough)` — which is why the road surface
        (0.08) has none and the banks either side (0.9) are full of them. The
        boards went in at 0.7 and came out with quartz seams running across the
        grain, which is a thing wood does not do.
      */
      0.16,
    )
    board++
    mesh.onSolidGround()
  }

  /*
    And the two beams the boards are lying on, running the length of it just
    inside each edge. Without them the boards float: a plank deck is boards on
    stringers, and the stringers are the half of it you only notice when they
    are missing.
  */
  for (let s = from; s < to; s += 4) {
    roadAt(track, s, road)
    basisAt(road, basis)
    const mesh = meshes[chunkFor(s)]
    mesh.onSwayingRoad(road, basis, s)
    for (const side of [-1, 1]) {
      addBox(
        mesh,
        road,
        basis,
        side * (road.width - 0.5),
        -0.24,
        2.05,
        0.22,
        0.3,
        BARK,
        0.2,
      )
    }
    mesh.onSolidGround()
  }
}

/**
 * The Swaying Span's rigging: two pylons a bay, a cable between them, and the
 * hangers that hold the deck up off it.
 *
 * ===========================================================================
 * **This is here so the force has a reason.** The deck rolls and gravity takes
 * the car down the slope — see `swayRollAt` — and a road that shoves you
 * sideways with nothing visible causing it does not read as a bridge, it reads
 * as a bug in the handling. What makes it legible is the *superstructure*: a
 * cable ten metres up swings ten times as far as the deck it is holding, so
 * the towers are what you actually see moving, and the deck under you is only
 * confirming it.
 *
 * All of it is registered with `onSwayingRoad`, so none of it needs to know
 * that: each vertex swings by how high above the deck it is, which the mesh
 * works out from where the vertex is. The hangers stay attached to both ends
 * for the same reason.
 *
 * Deliberately sparse — four bays over two hundred and seventy metres, thin
 * stone rather than steel. The Moonbreak's whole look is a garden that drowned
 * a long time ago, and the one thing that must stay visible past all of this
 * is the water.
 * ===========================================================================
 */
function addSpanRig(
  meshes: CourseMesh[],
  track: Track,
  chunkFor: (s: number) => number,
) {
  const { from, to } = MOONBREAK.span
  const BAYS = 4
  const bay = (to - from) / BAYS
  /** Hangers this far apart, which also sets how finely the cable is drawn. */
  const STEP_ALONG = bay / 10
  const TOWER = 9.6
  const SAG = 2.3

  const road = emptyRoad()
  const basis: RoadBasis = { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 }
  /** Just outside the deck, so the rigging never eats road you can drive on. */
  const edge = (r: typeof road) => r.width + vergeWidth(r.room) + 0.34

  /** Where the cable hangs at this point of a bay: a slack parabola. */
  const cableY = (t: number) => TOWER - (TOWER - SAG) * 4 * t * (1 - t)

  const at = (s: number, n: number, y: number) => {
    roadAt(track, s, road)
    basisAt(road, basis)
    return roadPoint(road, n, y, new Vector3(), basis)
  }

  // --- the pylons ----------------------------------------------------------
  for (let i = 0; i <= BAYS; i++) {
    const s = from + i * bay
    roadAt(track, s, road)
    basisAt(road, basis)
    const mesh = meshes[chunkFor(s)]
    mesh.onSwayingRoad(road, basis, s)
    for (const side of [-1, 1]) {
      const n = side * edge(road)
      /*
        Leaning very slightly inward over the road, which is what a tower
        carrying a load in the middle of its span actually does, and which also
        stops five pairs of verticals reading as a fence.
      */
      addTube(
        mesh,
        [
          roadPoint(road, n, -0.7, new Vector3(), basis),
          roadPoint(road, n - side * 0.12, TOWER * 0.5, new Vector3(), basis),
          roadPoint(road, n - side * 0.34, TOWER, new Vector3(), basis),
        ],
        0.3,
        PALE_STONE,
      )
    }
    mesh.onSolidGround()
  }

  // --- the two cables, and the hangers off them ----------------------------
  for (let i = 0; i < BAYS; i++) {
    const start = from + i * bay
    for (let step = 0; step * STEP_ALONG < bay - 0.01; step++) {
      const s0 = start + step * STEP_ALONG
      const s1 = s0 + STEP_ALONG
      const t0 = (step * STEP_ALONG) / bay
      const t1 = ((step + 1) * STEP_ALONG) / bay
      roadAt(track, s0, road)
      basisAt(road, basis)
      const mesh = meshes[chunkFor(s0)]
      mesh.onSwayingRoad(road, basis, s0)
      const lean0 = 0.34 * (1 - 4 * t0 * (1 - t0))
      const lean1 = 0.34 * (1 - 4 * t1 * (1 - t1))
      for (const side of [-1, 1]) {
        const n0 = side * (edge(road) - lean0)
        const n1 = side * (edge(road) - lean1)
        // One short length of cable, drawn in its own road frame so that a
        // seventy metre bay follows the bridge round its bends.
        addTube(mesh, [at(s0, n0, cableY(t0)), at(s1, n1, cableY(t1))], 0.075, PALE_STONE)
        // And the hanger down to the deck. Not at the towers, where there is
        // no cable to hang from and a hanger would be a post against a post.
        if (step > 0) {
          addTube(
            mesh,
            [at(s0, n0, cableY(t0)), at(s0, side * edge(road), 0.34)],
            0.032,
            BARK_PALE,
          )
        }
      }
      mesh.onSolidGround()
    }
  }

  /*
    A rope along each edge at knee height, which is the only thing on this
    bridge you actually steer by. It swings with everything else, and because
    it sits almost on the deck it swings by almost exactly as much as the deck
    does — so it stays where the road really ends rather than promising room
    that is not there.
  */
  for (let s = from; s < to; s += 3) {
    roadAt(track, s, road)
    basisAt(road, basis)
    const mesh = meshes[chunkFor(s)]
    mesh.onSwayingRoad(road, basis, s)
    for (const side of [-1, 1]) {
      const n = side * edge(road)
      addTube(mesh, [at(s, n, 0.46), at(Math.min(to, s + 3), n, 0.46)], 0.038, BARK_PALE)
    }
    mesh.onSolidGround()
  }
}

/*
  =============================================================================
  THE SEA WALLS — Tidecut and the Moonhook
  =============================================================================

  **Both hard corners are below the sea.** Not by design: the drop off the
  Swaying Span takes Tidecut about two and a half metres under the water, and
  the Fall carries the road into the Moonhook the same distance down, before
  each climbs back out. Nothing held the sea back, so the water plane lay
  across the road a metre above the bonnet, the camera went through it, and
  the light turned green for a few seconds on exactly the two corners that most
  need you to see them.

  The road is not changing, so the world has to make sense of it — and there
  is a very old answer to a road that runs below the water beside it: **a
  cutting between sea walls.** Dressed stone either side, a hand's breadth
  higher than the sea, laid in level courses while the road falls away beneath
  them, so the deepest part of the corner has the tallest wall. It is also the
  first time the name "Tidecut" has been true.

  It is honest to the car as well. The physics has always stopped the car at
  `wallAt`, which everywhere else on the causeway is an edge with nothing past
  it. Here it is finally a wall.

  The water gets out of the way in `MoonbreakWorld` — see `buildCutMask`.
  =============================================================================
*/

/** The top of a sea wall, in world metres: just above the water it holds. */
const SEA_WALL_TOP = WATER_Y + 0.42
/** One course of stone. Level in the world, however the road falls under it. */
const COURSE = 0.52
/** Where the stone face stands, just past the edge the car is stopped at. */
const WALL_FACE = 0.15
/** How far the wall runs back over the sea, face to back. */
const WALL_DEPTH = 1.3
const WALL_STONES = [new Color('#6f736c'), new Color('#80837a'), new Color('#63685f')]
const WALL_MORTAR = new Color('#1b2023')
const WALL_CAP = new Color('#8b8d83')
const WALL_WEED = new Color('#17231f')

export interface SeaCut {
  from: number
  to: number
}

/**
 * Where the road runs below the sea outside the Drowned Mile.
 *
 * Measured off the road rather than written down, for the reason `MOONBREAK`
 * is: a length changed anywhere upstream moves these, and a wall that stays
 * where a corner used to be is worse than no wall.
 */
export function seaCuts(track: Track): SeaCut[] {
  const cuts: SeaCut[] = []
  const road = emptyRoad()
  let from = -1
  for (let s = 0; s <= track.length; s += 2) {
    const drowned = s > MOONBREAK.deep.from - 20 && s < MOONBREAK.deep.to + 20
    const low = !drowned && roadAt(track, s, road).y < WATER_Y + 0.45
    if (low && from < 0) from = s
    if (!low && from >= 0) {
      cuts.push({ from, to: s })
      from = -1
    }
  }
  if (from >= 0) cuts.push({ from, to: track.length })
  return cuts
}

function addSeaWall(
  meshes: CourseMesh[],
  track: Track,
  chunkFor: (s: number) => number,
  cut: SeaCut,
) {
  const road = emptyRoad()
  const basis: RoadBasis = { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 }
  const from = cut.from - 18
  const to = cut.to + 18
  const top = SEA_WALL_TOP
  const toward = new Vector3()
  const up = new Vector3(0, 1, 0)

  /** A point `out` metres past the car's edge on `side`, at a height given in the world. */
  const at = (s: number, side: number, out: number, y: number) => {
    roadAt(track, s, road)
    basisAt(road, basis)
    roadPoint(road, side * (wallEdge(road) + out), 0, point, basis)
    return new Vector3(point.x, y, point.z)
  }
  /** How high the ground is at the foot of the wall. */
  const groundAt = (s: number, side: number) => {
    roadAt(track, s, road)
    basisAt(road, basis)
    return roadPoint(road, side * (wallEdge(road) + WALL_FACE), 0, point, basis).y
  }
  /** Across the road toward its middle, from the wall on `side`. */
  const inward = (s: number, side: number) => {
    roadAt(track, s, road)
    basisAt(road, basis)
    return toward.set(-side * basis.rx, 0, -side * basis.rz).clone()
  }

  for (const side of [-1, 1]) {
    /*
      The dark behind the stones, the back of the wall down into the sea, and a
      wet gutter along its foot. Everything the blocks below are laid against.
    */
    for (let s = from; s < to; s += RING) {
      const s1 = Math.min(to, s + RING)
      const g0 = groundAt(s, side)
      const g1 = groundAt(s1, side)
      if (top < g0 - 0.2 && top < g1 - 0.2) continue
      const mesh = meshes[chunkFor(s)]
      const face = inward(s, side)
      const back = face.clone().multiplyScalar(-1)
      faceToward(
        mesh,
        [
          at(s, side, WALL_FACE + 0.05, g0 - 0.3),
          at(s1, side, WALL_FACE + 0.05, g1 - 0.3),
          at(s1, side, WALL_FACE + 0.05, top),
          at(s, side, WALL_FACE + 0.05, top),
        ],
        face,
        WALL_MORTAR,
        0.3,
        0.2,
      )
      faceToward(
        mesh,
        [
          at(s, side, 0, g0 + 0.09),
          at(s1, side, 0, g1 + 0.09),
          at(s1, side, WALL_FACE + 0.06, g1 + 0.09),
          at(s, side, WALL_FACE + 0.06, g0 + 0.09),
        ],
        up,
        tint.copy(WALL_WEED).multiplyScalar(1.5),
        0.95,
        0.2,
      )
      faceToward(
        mesh,
        [
          at(s, side, WALL_FACE + WALL_DEPTH, WATER_Y + 0.26),
          at(s1, side, WALL_FACE + WALL_DEPTH, WATER_Y + 0.26),
          at(s1, side, WALL_FACE + WALL_DEPTH, top - 0.16),
          at(s, side, WALL_FACE + WALL_DEPTH, top - 0.16),
        ],
        back,
        tint.copy(WALL_STONES[2]).multiplyScalar(0.72),
        0.4,
        0.2,
      )
      // Below the tideline it is weed, and it leans out a little into the sea.
      faceToward(
        mesh,
        [
          at(s, side, WALL_FACE + WALL_DEPTH + 0.3, WATER_Y - 1.8),
          at(s1, side, WALL_FACE + WALL_DEPTH + 0.3, WATER_Y - 1.8),
          at(s1, side, WALL_FACE + WALL_DEPTH, WATER_Y + 0.26),
          at(s, side, WALL_FACE + WALL_DEPTH, WATER_Y + 0.26),
        ],
        back,
        WALL_WEED,
        0.8,
        0.2,
      )
    }

    /*
      The stones, in courses that are level in the world.

      The wall's top is a fixed height — it is holding back a sea, which is
      flat — so the courses are counted down from it rather than up from a
      road that is falling away. Where the road drops under a course the stone
      simply goes on down into the ground, which is how a real wall on a slope
      is built and why its lowest course is always a wedge.
    */
    for (let course = 0; course * COURSE < top - WATER_Y + 4; course++) {
      const high = top - course * COURSE
      const low = high - COURSE
      let s = from - hash3(course, side, 1) * 1.4
      let index = 0
      while (s < to) {
        const length = 1.05 + hash3(course, index, side + 3) * 0.8
        const sA = Math.max(from, s)
        const sB = Math.min(to, s + length)
        s += length
        index++
        if (sB - sA < 0.3) continue
        const gA = groundAt(sA, side) - 0.25
        const gB = groundAt(sB, side) - 0.25
        if (high <= gA && high <= gB) continue
        const joint = 0.035
        const bottomA = Math.min(high - joint * 3, Math.max(low + joint, gA))
        const bottomB = Math.min(high - joint * 3, Math.max(low + joint, gB))
        const pick = Math.floor(hash3(course * 7 + index, side, 11) * WALL_STONES.length)
        tint.copy(WALL_STONES[pick]).multiplyScalar(0.84 + hash3(index, course, side * 5) * 0.26)
        // The lowest stones stay wet where the spill runs down to the road.
        const wetFoot = Math.max(0, 1 - (low - Math.min(gA, gB)) / 1.2)
        tint.lerp(WALL_WEED, wetFoot * 0.35)
        const mid = (sA + sB) / 2
        faceToward(
          meshes[chunkFor(mid)],
          [
            at(sA + joint, side, WALL_FACE, bottomA),
            at(sB - joint, side, WALL_FACE, bottomB),
            at(sB - joint, side, WALL_FACE, high - joint),
            at(sA + joint, side, WALL_FACE, high - joint),
          ],
          inward(mid, side),
          tint,
          0.2 + wetFoot * 0.45,
          0.22,
        )
      }
    }

    // And the capstones, each its own slab, with a lip the headlamps can find.
    let s = from
    let stone = 0
    while (s < to) {
      const length = 0.85 + hash3(stone, side, 21) * 0.45
      const sA = s
      const sB = Math.min(to, s + length)
      s += length
      stone++
      if (groundAt(sA, side) > top + 0.35 && groundAt(sB, side) > top + 0.35) continue
      const y = top + (hash3(stone, side, 23) - 0.5) * 0.05
      const joint = 0.03
      const mid = (sA + sB) / 2
      const mesh = meshes[chunkFor(mid)]
      const colour = tint
        .copy(WALL_CAP)
        .lerp(MOSS, hash3(stone, side, 29) * 0.55)
        .multiplyScalar(0.85 + hash3(stone, 2, side) * 0.2)
        .clone()
      const face = inward(mid, side)
      faceToward(
        mesh,
        [
          at(sA + joint, side, WALL_FACE - 0.06, y),
          at(sB - joint, side, WALL_FACE - 0.06, y),
          at(sB - joint, side, WALL_FACE + WALL_DEPTH + 0.06, y),
          at(sA + joint, side, WALL_FACE + WALL_DEPTH + 0.06, y),
        ],
        up,
        colour,
        0.25,
        0.22,
      )
      faceToward(
        mesh,
        [
          at(sA + joint, side, WALL_FACE - 0.06, y - 0.2),
          at(sB - joint, side, WALL_FACE - 0.06, y - 0.2),
          at(sB - joint, side, WALL_FACE - 0.06, y),
          at(sA + joint, side, WALL_FACE - 0.06, y),
        ],
        face,
        colour.clone().multiplyScalar(0.8),
        0.25,
        0.22,
      )
      faceToward(
        mesh,
        [
          at(sA + joint, side, WALL_FACE + WALL_DEPTH + 0.06, y - 0.2),
          at(sB - joint, side, WALL_FACE + WALL_DEPTH + 0.06, y - 0.2),
          at(sB - joint, side, WALL_FACE + WALL_DEPTH + 0.06, y),
          at(sA + joint, side, WALL_FACE + WALL_DEPTH + 0.06, y),
        ],
        face.clone().multiplyScalar(-1),
        colour.clone().multiplyScalar(0.7),
        0.25,
        0.22,
      )
    }
  }
}

/** The causeway in the same chunk format the race already knows how to cull. */
export function buildMoonbreak(track: Track): TunnelChunk[] {
  const rings = Math.floor(track.length / RING) + 1
  const chunkCount = Math.ceil(track.length / CHUNK)
  const meshes = Array.from({ length: chunkCount }, () => new CourseMesh())
  const spans: { from: number; to: number }[] = []
  const viaducts = viaductSpans(track)
  const onViaduct = (s: number) => viaducts.some((span) => s >= span.from && s <= span.to)
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
      // The deck of the Swaying Span is a moving thing; everywhere else this
      // does nothing at all, because everywhere else `sway` is zero.
      mesh.onSwayingRoad(road, basis, s)
      const wall = road.width + vergeWidth(road.room)
      const offsets = [
        -wall, -wall, -road.width, -road.width * 0.92, -road.width * 0.62,
        -road.width * 0.31, 0,
        road.width * 0.31, road.width * 0.62, road.width * 0.92, road.width,
        wall, wall,
      ]
      /*
        The flank, and how far down it goes.

        =====================================================================
        **A metre and a bit was right when this road was flat.** The causeway
        ran a metre above the water for its whole length, so a skirt that
        dropped just below the surface was all anybody could see and all it
        needed.

        Then the Sky Stair went in — thirty metres of climb, which is the one
        thing a cave cannot do and therefore the reason this road exists after
        the Rootway — and a fixed skirt turned it into a strip of tarmac
        hanging in the air with the sea a long way underneath and nothing in
        between. Nothing was wrong with the *road*; what was missing was the
        thing holding it up, and it was missing because holding it up used to
        be free.

        So the flank simply reaches the water wherever the water is: a low kerb
        along the drowned garden, and a thirty-metre stone pier under the
        crest, out of one line. Down in the Drowned Mile, where the road is
        already eighteen metres *under* the surface, the `min` keeps the old
        kerb rather than growing a wall upward through the sea.
        =====================================================================
      */
      /*
        Except where it is high enough to stand on arches. A thirty-metre
        wall down to the sea was right about holding the road up and wrong
        about everything else — it read as a dam — so up the Sky Stair the
        flank stops at the depth of the deck and `addViaduct` puts piers and
        vaults under it.
      */
      const flank = onViaduct(s) ? -VIADUCT_DECK : Math.min(-1.15, WATER_Y - road.y - 0.8)
      const heights = [
        flank, 0.08, 0.035, 0.045, 0.055, 0.064, 0.07,
        0.064, 0.055, 0.045, 0.035, 0.08, flank,
      ]
      const base = mesh.count

      for (let k = 0; k < PROFILE; k++) {
        roadPoint(road, offsets[k], heights[k], point, basis)
        const roadSurface = k >= 2 && k <= 10
        const roadEdge = k === 2 || k === 10
        const bankTop = k === 1 || k === 11
        /*
          On the span there is no road, because it is not a road.

          =================================================================
          The rigging went up first — pylons, cables, hangers, a rope along
          each edge — and left the thing they were holding up as the same
          worn paving as the causeway either side of it. Which is a bridge in
          name only: you could see the suspension out of the side windows and
          the surface under the car had not changed at all, so what it read as
          was a road with some decoration standing beside it.

          So the deck is boards now. What is drawn *here* is only what is
          underneath them — dark, unlit, the drop — and the boards themselves
          are laid on top in addSpanDeck. The two together are what makes it
          a deck rather than a texture: the gap between two planks is real
          geometry with real dark in it, and at speed the boards going past
          are the whole feel of the section.
          =================================================================
        */
        const onTheSpan = s > MOONBREAK.span.from - 2 && s < MOONBREAK.span.to + 2
        let color = BANK_LOW
        let wet = road.wet * 0.48
        let rough = 0.9
        if (onTheSpan && (roadSurface || roadEdge)) {
          color = DECK_GAP
          wet = road.wet * 0.3
          rough = 0.85
        } else if (roadEdge) {
          tint.copy(PALE_STONE).multiplyScalar(0.78 + hash3(ring, k, 4) * 0.18)
          color = tint
          wet = road.wet * 0.72
          rough = 0.24
        } else if (roadSurface) {
          const away = Math.abs(offsets[k] - road.line)
          const worn = 1 - Math.min(1, Math.max(0, (away - 0.35) / 1.2))
          const district =
            s >= MOONBREAK.mirror.from && s < MOONBREAK.mirror.to
              ? ROAD_MIRROR
              : s >= MOONBREAK.reeds.from && s < MOONBREAK.reeds.to
                ? ROAD_REED
                : s >= MOONBREAK.stair.from && s < MOONBREAK.veryHard.exit
                  ? ROAD_HIGH
                  : ROAD
          tint.copy(district).lerp(ROAD_WORN, worn * 0.46)
          // One darker transverse joint every ten metres. It is part of the
          // old paving, but at speed it becomes an honest visual metronome.
          const joint = ring % 5 === 0 ? 0.72 : 1
          tint.multiplyScalar((0.92 + hash3(ring, k, 17) * 0.13) * joint)
          color = tint
          wet = road.wet
          rough = 0.08
        } else if (bankTop) {
          tint.copy(MOSS).multiplyScalar(0.82 + hash3(ring, k, 8) * 0.25)
          color = tint
        } else if (k === 0 || k === 10) {
          color = BANK
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

  // The rings are laid; nothing added from here belongs to a moving road
  // unless it says so.
  for (const mesh of meshes) mesh.onSolidGround()

  const chunkFor = (s: number) => Math.max(0, Math.min(chunkCount - 1, Math.floor(s / CHUNK)))

  addSpanRig(meshes, track, chunkFor)
  addSpanDeck(meshes, track, chunkFor)

  const cuts = seaCuts(track)
  for (const cut of cuts) addSeaWall(meshes, track, chunkFor, cut)
  /** Inside a sea cutting, where nothing that stands on the causeway's verge belongs. */
  const inCut = (s: number, pad: number) => cuts.some((cut) => s > cut.from - pad && s < cut.to + pad)
  for (const span of viaducts) addViaduct(meshes, track, chunkFor, span)
  const lastArch = MOONBREAK.arches[MOONBREAK.arches.length - 1]
  addTerrace(meshes, track, chunkFor, 0, 96)
  addTerrace(meshes, track, chunkFor, lastArch + 6, track.length - 8)
  const onTerrace = (s: number) => s < 102 || s > lastArch

  // Low pale stones mark the drop without turning the high road into a modern
  // guardrail. Their rhythm is what makes acceleration visible in open space.
  for (let s = 26; s < track.finishAt - 24; s += 15) {
    /*
      Not on the span. These are the causeway's kerb stones, and a bridge made
      of rope and boards has no business having cut stone bolted along it — the
      rope rail in addSpanRig is what marks that edge.
    */
    if (s > MOONBREAK.span.from - 6 && s < MOONBREAK.span.to + 6) continue
    // Nor in the cuttings, where the sea wall is the edge.
    if (inCut(s, 20)) continue
    for (const side of [-1, 1]) {
      addKerbPost(meshes[chunkFor(s)], track, s, side, Math.floor(s / 15) % 3 === 0)
    }
  }

  MOONBREAK.arches.forEach((s, index) => {
    if (s >= track.length) return
    // On the span the gate stays the light hoop it always was: stone piers
    // there would stand in the middle of the rigging.
    if (s > MOONBREAK.span.from && s < MOONBREAK.span.to) {
      addArch(meshes[chunkFor(s)], track, s)
      return
    }
    // The gate you leave by and the one you come home under are whole.
    const ends = index === 0 || index === MOONBREAK.arches.length - 1
    addRuinedArch(meshes[chunkFor(s)], track, s, !ends && hash3(s, 5, 5) < 0.6)
  })

  /*
    The two mouths, which are the heaviest arch on the road.

    Going under has to be an *event*, and an event needs a threshold — the
    moment the sky is cut off is the moment the whole thing lands, and a tube
    that simply begins in open water gives you nothing to cross. So each mouth
    is one arch of doubled stone at exactly the waterline — it used to be three
    thin ribs half a metre apart, doing the same job less well — which from a
    car at forty metres a second is one heavy collar going over the roof, and
    then the light changes.
  */
  for (const s of [MOONBREAK.deep.under.in, MOONBREAK.deep.under.out]) {
    addRuinedArch(meshes[chunkFor(s)], track, s, false, 1.9)
  }
  addRuinedArch(meshes[chunkFor(track.finishAt)], track, track.finishAt, false, 1.2)
  addRuinedArch(meshes[chunkFor(track.length - 24)], track, track.length - 24, false)

  const rng = random(track.seed ^ 0x431f27)
  let treeSeed = 1
  for (let s = 38; s < track.finishAt - 42; s += 31 + rng() * 31) {
    const orchard = s > MOONBREAK.orchard.from && s < MOONBREAK.orchard.to
    const highRoad = s > MOONBREAK.stair.from && s < MOONBREAK.veryHard.exit
    /*
      Nothing with leaves on it grows in the Drowned Mile.

      A drowned orchard is a tree standing in water with its crown in the air,
      which is the whole idea of the causeway above — and nineteen metres down
      it would be a tree standing on the sea floor with its crown in the dark,
      which is a different and much sillier idea. Down there the verge gets
      kelp instead, and the tall stones that used to mark the Mirror Flats.
    */
    if (s > MOONBREAK.deep.from - 30 && s < MOONBREAK.deep.to + 30) continue
    /*
      And nothing grows on the Swaying Span either, for a plainer reason: it is
      a deck hung off cables over open water, so there is no ground within nine
      metres of it for a root to be in. Trees came through here on the first
      build and stood in mid-air beside the handrail, which is the kind of
      thing that only shows up when somebody looks at it.
    */
    if (s > MOONBREAK.span.from - 22 && s < MOONBREAK.span.to + 22) continue
    /*
      Nor anywhere the road has climbed away from the water.

      A tree is planted at the height of the road beside it, which was fine
      while the road lay a metre above the sea for its whole length. Up the Sky
      Stair the road is twenty-eight metres up and the verge is the top of a
      pier, so the same code hangs an orchard in the open air over the water —
      which is what it did, and which only showed up by looking at it.
    */
    if (roadAt(track, s).y - WATER_Y > 6) continue
    // And not below the sea behind a wall, where the ground they stood on is.
    if (inCut(s, 26)) continue
    // The terraces have their columns instead.
    if (onTerrace(s)) continue
    if (highRoad && rng() < 0.52) continue
    // In flower in the orchard; mostly leaf everywhere else.
    const blossom = orchard ? 0.72 : 0.12
    addOrchardTree(meshes[chunkFor(s)], track, s, rng() < 0.5 ? -1 : 1, treeSeed++, blossom)
    if (orchard || rng() > 0.78) {
      const other = Math.min(track.finishAt - 35, s + 9 + rng() * 13)
      const otherSide = rng() < 0.5 ? -1 : 1
      if (!inCut(other, 26)) addOrchardTree(meshes[chunkFor(other)], track, other, otherSide, treeSeed++, blossom)
    }
  }

  /*
    The survey stones, which are now on the sea floor.

    They were the Mirror Flats' one piece of scenery: tall pale markers that
    pass like slow clock hands in peripheral vision and make speed legible on a
    road with nothing close to it. That job did not go away when the flats went
    under — it got harder, because water takes the far distance away and leaves
    even less to measure against — so they are still here, standing *outside*
    the glass where they read as something the causeway was built past rather
    than as furniture on the road.

    Taller and further out than they were above water. Close to the tube they
    fought the ribs for the same rhythm; at four and a half metres clear they
    loom instead, which is what a thing seen through glass in bad light should
    do. Both sides now rather than alternating: a drowned avenue.
  */
  let mirrorSide = -1
  for (let s = MOONBREAK.deep.from + 120; s < MOONBREAK.deep.to - 110; s += 44) {
    const at = roadAt(track, s)
    mirrorSide *= -1
    for (const side of [-1, 1]) {
      if (side === mirrorSide && hash3(s, 9, 2) < 0.42) continue
      addSunkenColumn(
        meshes[chunkFor(s)],
        track,
        s,
        side * (at.width + vergeWidth(at.room) + 4.5 + hash3(s, side + 2, 3) * 2.6),
        4.2 + hash3(s, 4, 7) * 4.6,
        MIRROR_STONE,
      )
    }
  }

  /*
    And kelp, which is the only thing down here that is alive and still.

    Tapered blades leaning off the true, in clumps, close enough to the glass
    that they pass fast. They do not move — everything in these chunks is baked
    once and never touched again, which is what lets a kilometre of causeway be
    six draw calls — and it turns out not to matter at all, because the shoals
    and the silt in `Deepwater` are doing the moving and the eye is happy to
    lend that motion to anything nearby.
  */
  for (let s = MOONBREAK.deep.from + 90; s < MOONBREAK.deep.to - 80; s += 13) {
    const at = roadAt(track, s)
    // Not at the mouths, where the road is barely under and kelp would stand up out of the sea.
    if (at.y > WATER_Y - 5) continue
    const frame = basisAt(at, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
    const side = hash3(s, 3, 11) < 0.5 ? -1 : 1
    const out = at.width + vergeWidth(at.room) + 2.9
    for (let blade = 0; blade < 2; blade++) {
      const seed = s * 7 + blade
      const n = side * (out + hash3(seed, blade, 5) * 3.4)
      const high = 2.2 + hash3(seed, 2, blade) * 3.4
      /*
        Bent one way and then the other, rather than leaning straight over.
        A stalk that leans is a stick; a stalk with an S in it is something
        that has spent a long time being pushed about by water, and it is the
        only cue available for a current in a place where nothing moves.
      */
      const lean = (hash3(seed, 6, 1) - 0.5) * 2.6
      const stalk = Array.from({ length: 6 }, (_, index) => {
        const t = index / 5
        const sway = lean * t * t + Math.sin(t * 3.1 + seed) * 0.55 * t
        return roadPoint(at, n + sway, -0.35 + high * t, new Vector3(), frame)
      })
      addTube(meshes[chunkFor(s)], stalk, 0.16 + hash3(seed, 1, 1) * 0.1, blade % 2 ? KELP : KELP_DARK)
    }
  }

  let reedSeed = 1000
  for (let s = MOONBREAK.reeds.from + 12; s < MOONBREAK.reeds.to - 12; s += 11) {
    if (s > MOONBREAK.deep.from && s < MOONBREAK.deep.to) continue
    addReeds(meshes[chunkFor(s)], track, s, (reedSeed++ % 2) * 2 - 1, reedSeed)
  }

  for (const stone of track.gate) {
    const at = roadAt(track, stone.s)
    const frame = basisAt(at, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
    addBox(meshes[chunkFor(stone.s)], at, frame, stone.n, 0.02, 0.55, 0.42, 3.25, PALE_STONE)
  }

  // The stones the physics strikes you with, drawn where they are. See `addSeaStone`.
  for (const stone of track.boulders) {
    if (inCut(stone.s, 6)) continue
    // Under the water they would stand inside the glass.
    if (stone.s > MOONBREAK.deep.from - 10 && stone.s < MOONBREAK.deep.to + 10) continue
    addSeaStone(meshes[chunkFor(stone.s)], track, stone)
  }

  return meshes.map((mesh, index) => {
    const geometry = mesh.build()
    if (!geometry.boundingSphere) geometry.boundingSphere = new Sphere()
    return { ...spans[index], geometry }
  })
}

const MOON_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vNormal = normal;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

/*
  The moon was a flat white disc, which reads as a hole in the sky or a sticker
  on it. Two things make it a body: it darkens toward its rim, and it has seas
  on it — broad soft dark country and a fine grit over everything. Always seen
  from the same side, because it is carried at a fixed offset from the camera,
  so the seas never wander.
*/
const MOON_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vWorld;
  uniform float uDeep;
  ${NOISE}
  void main() {
    vec3 n = normalize(vNormal);
    float mu = max(dot(n, normalize(cameraPosition - vWorld)), 0.0);
    float limb = 0.6 + 0.4 * pow(mu, 0.5);
    float seas = smoothstep(0.45, 0.68, noise3(n * 2.1 + 4.0) * 0.65 + noise3(n * 4.8 + 1.3) * 0.35);
    float grit = noise3(n * 21.0) * 0.6 + noise3(n * 55.0) * 0.4;
    vec3 colour = vec3(1.15, 1.22, 1.32) * limb * (1.0 - seas * 0.32) * (0.95 + grit * 0.07);
    gl_FragColor = vec4(colour * (1.0 - uDeep), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const SPILL_VERT = /* glsl */ `
  attribute float aSeed;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vSeed;
  void main() {
    vUv = uv;
    vSeed = aSeed;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

/*
  The sea coming over the top of a wall: a thin moving sheet across the
  capstones and down the face, in threads that each fall at their own pace,
  with froth at the foot. uv.y runs from the back of the capstone (negative)
  over the lip (zero) to the road (one).
*/
const SPILL_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vSeed;
  uniform float uTime;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  float hash11(float x) { return fract(sin(x * 91.7 + 3.1) * 43758.5453); }
  void main() {
    /*
      Soft threads, not hashed blocks. The first version cut the sheet into
      eleven hard lanes of hashed streaks and at any distance past a few metres
      it read as television static stuck to the wall. Each thread here fades to
      nothing at both of its edges, so lanes never meet at a seam.
    */
    float across = vUv.x * 7.0;
    float lane = floor(across);
    float within = fract(across);
    float thread = smoothstep(0.0, 0.5, within) * (1.0 - smoothstep(0.5, 1.0, within));
    float pace = 0.9 + hash11(lane + vSeed * 7.0) * 0.6;
    float flow = fract(vUv.y * 0.9 - uTime * pace + hash11(lane * 3.1 + vSeed));
    float pulse = 0.55 + 0.45 * smoothstep(0.0, 0.6, flow) * (1.0 - smoothstep(0.6, 1.0, flow));
    float sides = smoothstep(0.0, 0.25, vUv.x) * (1.0 - smoothstep(0.75, 1.0, vUv.x));
    float lip = smoothstep(-0.4, -0.2, vUv.y);
    float froth = smoothstep(0.8, 1.0, vUv.y);
    float alpha = sides * lip * (thread * pulse * 0.32 + froth * 0.22);
    vec3 colour = vec3(0.07, 0.09, 0.12) + vec3(0.16, 0.19, 0.24) * (thread * pulse + froth);
    float fog = smoothstep(uFogNear, uFogFar, distance(cameraPosition, vWorld));
    gl_FragColor = vec4(mix(colour, uFogColor, fog), alpha * (1.0 - fog * 0.7));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * Where the sea is not, as a picture the water can look up.
 *
 * ---------------------------------------------------------------------------
 * The water is one plane, and inside the two sea cuttings it needs a hole in it
 * the shape of the road. A hole in the geometry means cutting a four-kilometre
 * plane around two hairpins; a sum over road segments in the shader means a
 * loop per pixel on the largest surface in the frame. So each cutting is drawn
 * once into half of a small one-channel picture — the road's own width,
 * stamped every half metre — and the water asks it a single question.
 *
 * The edge is placed inside the top of the wall, where the water would be
 * hidden by stone anyway, so the half-metre resolution never shows.
 * ---------------------------------------------------------------------------
 */
function buildCutMask(track: Track, cuts: SeaCut[]) {
  const SIZE = 256
  const data = new Uint8Array(SIZE * 2 * SIZE)
  const regions = [new Vector4(0, 0, 0, 0), new Vector4(0, 0, 0, 0)]
  const road = emptyRoad()
  cuts.slice(0, 2).forEach((cut, index) => {
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (let s = cut.from; s <= cut.to; s += 1) {
      roadAt(track, s, road)
      minX = Math.min(minX, road.x)
      maxX = Math.max(maxX, road.x)
      minZ = Math.min(minZ, road.z)
      maxZ = Math.max(maxZ, road.z)
    }
    const size = Math.max(maxX - minX, maxZ - minZ) + 32
    const x0 = (minX + maxX) / 2 - size / 2
    const z0 = (minZ + maxZ) / 2 - size / 2
    regions[index].set(x0, z0, 1 / size, 0)
    const texel = size / SIZE
    for (let s = cut.from; s <= cut.to; s += 0.5) {
      roadAt(track, s, road)
      if (road.y > WATER_Y + 0.3) continue
      const reach = wallEdge(road) + WALL_FACE + 0.75
      const cx = (road.x - x0) / texel
      const cz = (road.z - z0) / texel
      const radius = (reach + 0.5) / texel
      const i0 = Math.max(2, Math.floor(cx - radius))
      const i1 = Math.min(SIZE - 3, Math.ceil(cx + radius))
      const j0 = Math.max(2, Math.floor(cz - radius))
      const j1 = Math.min(SIZE - 3, Math.ceil(cz + radius))
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cz) * texel
          const cover = Math.round(Math.max(0, Math.min(1, (reach - d) / 0.5 + 0.5)) * 255)
          const k = j * SIZE * 2 + index * SIZE + i
          if (cover > data[k]) data[k] = cover
        }
      }
    }
  })
  const texture = new DataTexture(data, SIZE * 2, SIZE, RedFormat)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.needsUpdate = true
  return { texture, regions }
}

/** Where the sea comes over the walls: a sheet over the capstones and one down the face. */
function buildSpills(track: Track, cuts: SeaCut[]): BufferGeometry {
  const position: number[] = []
  const uv: number[] = []
  const seed: number[] = []
  const index: number[] = []
  const road = emptyRoad()
  const basis: RoadBasis = { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 }
  const at = (s: number, side: number, out: number, y: number) => {
    roadAt(track, s, road)
    basisAt(road, basis)
    roadPoint(road, side * (wallEdge(road) + out), 0, point, basis)
    return [point.x, y, point.z]
  }
  const groundAt = (s: number, side: number) => {
    roadAt(track, s, road)
    basisAt(road, basis)
    return roadPoint(road, side * (wallEdge(road) + WALL_FACE), 0, point, basis).y
  }
  const sheet = (corners: number[][], uvs: number[][], id: number) => {
    const base = position.length / 3
    corners.forEach((corner, i) => {
      position.push(corner[0], corner[1], corner[2])
      uv.push(uvs[i][0], uvs[i][1])
      seed.push(id)
    })
    index.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  let id = 0
  cuts.forEach((cut, c) => {
    for (const side of [-1, 1]) {
      for (let s = cut.from + 10; s < cut.to - 10; s += 17) {
        if (hash3(s, side, c + 41) < 0.45) continue
        const ground = groundAt(s, side)
        // Only where there is a real drop to spill down; a trickle over a kerb is nothing.
        if (SEA_WALL_TOP - ground < 1.1) continue
        const reach = 0.6 + hash3(s, side, 43) * 0.8
        const lip = SEA_WALL_TOP + 0.05
        id++
        sheet(
          [
            at(s - reach, side, WALL_FACE + WALL_DEPTH, lip - 0.01),
            at(s + reach, side, WALL_FACE + WALL_DEPTH, lip - 0.01),
            at(s + reach, side, WALL_FACE - 0.08, lip),
            at(s - reach, side, WALL_FACE - 0.08, lip),
          ],
          [[0, -0.4], [1, -0.4], [1, 0], [0, 0]],
          id,
        )
        sheet(
          [
            at(s - reach, side, WALL_FACE - 0.08, lip),
            at(s + reach, side, WALL_FACE - 0.08, lip),
            at(s + reach * 1.08, side, WALL_FACE - 0.14, ground - 0.1),
            at(s - reach * 1.08, side, WALL_FACE - 0.14, ground - 0.1),
          ],
          [[0, 0], [1, 0], [1, 1], [0, 1]],
          id,
        )
      }
    }
  })

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  geometry.setAttribute('aSeed', new BufferAttribute(new Float32Array(seed), 1))
  geometry.setIndex(index)
  if (position.length) geometry.computeBoundingSphere()
  else geometry.boundingSphere = new Sphere()
  return geometry
}

const SKY_VERT = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SKY_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDirection;
  uniform float uDeep;
  uniform float uTime;
  uniform vec3 uFogColor;
  ${NIGHT}
  ${NOISE}

  /*
    One star per cell at most, never near the edge of its cell, so no star is
    ever cut in half by the cell beside it. Brightness is cubed: most are faint
    and a few are not, which is the difference between a sky and glitter.
  */
  float starField(vec3 d, float scale, float density, float size) {
    vec3 p = d * scale;
    vec3 cell = floor(p);
    float pick = hash13(cell);
    if (pick < 1.0 - density) return 0.0;
    vec3 at = cell + 0.3 + 0.4 * vec3(hash13(cell + 17.1), hash13(cell + 31.7), hash13(cell + 47.3));
    float off = length(p - at);
    float bright = pow(hash13(cell + 5.9), 3.0);
    float twinkle = 0.72 + 0.28 * sin(uTime * (1.1 + pick * 2.7) + pick * 91.0);
    return exp(-off * off / (size * size)) * (0.2 + bright * 1.8) * twinkle;
  }

  /*
    Now and then, a shooting star. Off the clock, so it costs a few sums when
    there is not one and a line test when there is.
  */
  float meteor(vec3 d) {
    float period = 11.0;
    float k = floor(uTime / period);
    float t = uTime - k * period;
    if (t > 0.9 || hash13(vec3(k, 1.0, 7.0)) < 0.5) return 0.0;
    float bearing = hash13(vec3(k, 2.0, 3.0)) * 6.2832;
    float rise = 0.35 + hash13(vec3(k, 5.0, 1.0)) * 0.45;
    vec3 start = vec3(cos(bearing) * cos(rise), sin(rise), sin(bearing) * cos(rise));
    vec3 across = normalize(cross(start, vec3(0.0, 1.0, 0.0)));
    vec3 heading = across * (hash13(vec3(k, 9.0, 2.0)) < 0.5 ? -1.0 : 1.0) - vec3(0.0, 0.5, 0.0);
    heading = normalize(heading - start * dot(heading, start));
    float headAt = t * 0.5;
    vec3 a0 = normalize(start + heading * max(0.0, headAt - 0.14));
    vec3 a1 = normalize(start + heading * headAt);
    vec3 seg = a1 - a0;
    float along = clamp(dot(d - a0, seg) / max(dot(seg, seg), 0.000001), 0.0, 1.0);
    float off = length(d - (a0 + seg * along));
    return (1.0 - smoothstep(0.0005, 0.0022, off)) * along * along * sin(3.14159 * t / 0.9);
  }

  void main() {
    vec3 d = normalize(vDirection);
    vec3 colour = nightSky(d);
    float toMoon = max(dot(d, uMoonDir), 0.0);

    // Thin high cloud, drifting, lit on the side toward the moon.
    vec2 q = d.xz / (d.y + 0.12);
    q = vec2(q.x * 0.5 + q.y * 0.22, q.y * 1.3) + vec2(uTime * 0.006, uTime * 0.0025);
    float wisp = noise3(vec3(q * 1.2, 0.5)) * 0.6 + noise3(vec3(q * 3.4, 2.0)) * 0.3 + noise3(vec3(q * 8.5, 4.0)) * 0.1;
    float veil = smoothstep(0.55, 0.82, wisp) * smoothstep(0.03, 0.16, d.y) * (1.0 - smoothstep(0.5, 0.92, d.y));

    // Where stars can be seen: not in the murk on the horizon, not in the moon's glare, not through cloud.
    float clear = smoothstep(0.02, 0.3, d.y) * (1.0 - pow(toMoon, 12.0)) * (1.0 - veil);

    // The galaxy: a soft band on a great circle, with dark lanes of dust through it.
    vec3 axis = normalize(vec3(0.42, 0.62, -0.66));
    float across = dot(d, axis);
    float band = exp(-across * across / 0.02);
    float dust = noise3(d * 5.0 + 11.0) * 0.55 + noise3(d * 12.0) * 0.3 + noise3(d * 26.0) * 0.15;
    float lanes = smoothstep(0.5, 0.72, noise3(d * 8.0 + vec3(3.0, 7.0, 1.0)) * 0.7 + noise3(d * 19.0) * 0.3);
    float milky = band * smoothstep(0.3, 0.8, dust) * (1.0 - lanes * 0.8);
    colour += vec3(0.020, 0.023, 0.032) * milky * clear;

    float stars = starField(d, 62.0, 0.014, 0.12) + starField(d, 150.0, 0.045 + band * 0.12, 0.11) * 0.55;
    colour += vec3(0.78, 0.84, 1.0) * stars * clear;
    colour += vec3(0.9, 0.95, 1.1) * meteor(d) * 1.6 * (1.0 - veil);

    vec3 lit = mix(vec3(0.014, 0.019, 0.032), vec3(0.15, 0.165, 0.2), pow(toMoon, 5.0));
    colour = mix(colour, lit, veil * 0.78);
    /*
      Under the water there is no sky, and what is behind everything instead is
      the fog — the exact same colour, not a colour chosen to look like it.

      -------------------------------------------------------------------------
      This was a hand-picked dark teal for about ten minutes and it drew a hard
      horizontal seam right across the middle of the Drowned Mile, at the line
      where the underside of the surface stopped and the dome behind it began.
      Everything in the scene fades to uFogColor at distance; the dome does
      not fade to anything, because it *is* the distance. So the only value it
      can possibly be is that one. Anything else is a join, and a join in the
      middle of the horizon is the first thing the eye finds.

      The stars go with it, and they go first: one star seen through twenty
      metres of water undoes the whole thing on its own.
      -------------------------------------------------------------------------
    */
    colour = mix(colour, uFogColor, uDeep);
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const WATER_VERT = /* glsl */ `
  uniform vec4 uCutA;
  uniform vec4 uCutB;
  varying vec3 vWorld;
  varying vec2 vCutA;
  varying vec2 vCutB;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    // Where this is in each cutting's picture. Linear in the world, so it is
    // exact however large the triangle it is interpolated across.
    vCutA = (world.xz - uCutA.xy) * uCutA.z;
    vCutB = (world.xz - uCutB.xy) * uCutB.z;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

/*
  The same plane, from both sides, and they are not the same picture.

  From above it is what it always was: dark, with a moon-glint riding the
  ripples. From underneath it is the **ceiling of the world** — the only bright
  thing left, the place all the light is coming from, and the one direction
  that still has a sky behind it. Getting that right is most of what makes the
  Drowned Mile feel like being under something rather than inside something.

  Three things change when you go under. It gets much brighter, because you are
  now looking at a lit surface rather than at a dark one. It gains a hard
  bright disc where the moon is, smeared by the ripple, which is the single cue
  that says "that is the sky, and it is up there, and it is far away". And it
  goes almost totally reflective near the horizon — real water is a mirror from
  below past about forty-nine degrees, and that band of silvered nothing at the
  edges is what stops the surface reading as a flat blue lid.

  `uDeep` rather than a test on the camera's height, because the two mouths of
  the tube sit exactly *at* the waterline: keying off the camera would flip the
  whole surface between two very different pictures on the frame the car's nose
  crossed it, several times, while diving.
*/
const WATER_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vWorld;
  varying vec2 vCutA;
  varying vec2 vCutB;
  uniform float uTime;
  uniform float uDeep;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform sampler2D uCuts;
  ${NIGHT}

  float inside(vec2 at) {
    return step(0.0, at.x) * step(at.x, 1.0) * step(0.0, at.y) * step(at.y, 1.0);
  }

  // The slope of one travelling wave, in metres per metre.
  vec2 swell(vec2 p, vec2 heading, float k, float amp, float pace) {
    return heading * (amp * k * cos(dot(p, heading) * k - uTime * pace));
  }

  void main() {
    /*
      No sea inside the sea walls. The cuttings at Tidecut and the Moonhook are
      drawn into a small picture once, and the water is not drawn where the
      picture says the road is. See buildCutMask.
    */
    float held = inside(vCutA) * texture2D(uCuts, vec2(vCutA.x * 0.5, vCutA.y)).r
               + inside(vCutB) * texture2D(uCuts, vec2(0.5 + vCutB.x * 0.5, vCutB.y)).r;
    if (held > 0.5) discard;

    float a = sin(vWorld.x * 0.055 + uTime * 0.42);
    float b = sin(vWorld.z * 0.071 - uTime * 0.31);
    float c = sin((vWorld.x + vWorld.z) * 0.025 + uTime * 0.18);
    float ripple = a * 0.35 + b * 0.28 + c * 0.37;

    // --- from above ---
    /*
      A sea at night is a mirror with a little depth in it, not a colour.

      It was a teal that tone-mapped brighter than the sky over it, so the
      causeway looked like it crossed a lit swimming pool. What water does at
      night is reflect: the sky's own gradient, more strongly the flatter you
      look across it, so the far sea meets the horizon without a line — and
      one road of broken light laid across the waves toward the moon, which is
      the single thing everybody knows a moonlit sea by. The swell is five
      travelling waves stated in metres, the short ones faded out with range
      before they can alias into noise.
    */
    vec3 look = cameraPosition - vWorld;
    float range = length(look);
    vec3 eye = look / range;
    vec2 p = vWorld.xz;
    float closeUp = 1.0 - smoothstep(40.0, 190.0, range);
    float middle = 1.0 - smoothstep(140.0, 700.0, range);
    vec2 slope = swell(p, vec2(0.83, 0.56), 0.165, 0.22, 0.8)
               + swell(p, vec2(-0.35, 0.94), 0.37, 0.09, 1.1)
               + swell(p, vec2(0.97, -0.24), 0.86, 0.05, 1.7) * middle
               + (swell(p, vec2(0.44, 0.90), 2.03, 0.022, 2.6)
               + swell(p, vec2(-0.90, 0.44), 4.8, 0.008, 3.9)) * closeUp;
    vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
    float facing = max(dot(n, eye), 0.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
    vec3 bounce = reflect(-eye, n);
    bounce.y = abs(bounce.y);
    float moonward = max(dot(bounce, uMoonDir), 0.0);
    float glitter = pow(moonward, 900.0) * 30.0 + pow(moonward, 60.0) * 0.28;
    vec3 over = mix(vec3(0.0065, 0.0094, 0.0129), nightSky(bounce), fresnel);
    over += vec3(0.82, 0.88, 1.0) * glitter * (0.25 + 0.75 * fresnel);
    /*
      Opaque at distance, not transparent.

      This had it exactly backwards and it showed: the surface faded out with
      range, so the far half of the lake was a window and the drowned avenue
      nineteen metres below it came through as one dark fogged lump on the
      horizon — which read as an island, and gave away the whole surprise of
      the dive before you reached the mouth.

      Water does the opposite. Looked at from nearly edge-on it stops being a
      window and becomes a mirror, which is why you can see your feet in a pond
      and not the far bank. So the alpha *climbs* toward one with distance, and
      what is under the water stays under it until you are over it.
    */
    float overFade = 1.0 - smoothstep(30.0, 260.0, distance(cameraPosition, vWorld));
    float overAlpha = 1.0 - overFade * 0.34;

    /*
      --- from below ---

      The first version of this was a flat pale sheet and it was the single
      worst thing in the Drowned Mile: it filled the top half of the frame
      with one colour, which read as a painted lid rather than as a very large
      amount of water with a sky somewhere on the other side of it.

      Three things fix that, and all three are about *structure*.

      It is dark. Much darker than instinct says a lit ceiling should be —
      almost the colour of the fog — because what makes a surface read as
      bright is not its own value, it is having something dark beside it.

      It has a grain that runs the right way. The ripple is squeezed hard
      through a power curve so it is mostly dark with narrow bright veins in
      it, which is what light coming through moving water actually looks like
      from underneath, and it is what gives the ceiling a *direction*.

      And it goes away with distance. It is the one surface in the scene big
      enough to reach the fog on its own, so the far half of it dissolves into
      exactly the green everything else dissolves into, and the near half is
      the only part with any light in it. That is what puts a roof over the
      car instead of a wall in front of it.
    */
    vec3 toEye = cameraPosition - vWorld;
    float away = length(toEye);
    float flat_ = clamp(abs(normalize(toEye).y), 0.0, 1.0);
    // Past the critical angle the surface silvers over and stops being a window.
    float mirror = 1.0 - smoothstep(0.05, 0.42, flat_);
    // The moon, seen up through moving water.
    /*
      Where the moon is, seen from under the water: bent by the surface to
      about forty degrees up, so it hangs a little ahead of you in its own
      direction. It used to be pinned to a point in the world a kilometre from
      the Drowned Mile, which is why nobody ever saw it.
    */
    float depthBelow = max(1.0, ${WATER_Y.toFixed(2)} - cameraPosition.y);
    vec2 moonSpot = cameraPosition.xz + normalize(uMoonDir.xz) * depthBelow * 1.07;
    float toMoon = distance(vWorld.xz, moonSpot);
    float moon = smoothstep(22.0, 3.0, toMoon) * (0.55 + ripple * 0.45);
    // Narrow bright veins on a dark field, rather than an even glow.
    float veins = pow(max(0.0, ripple * 0.5 + 0.5), 3.4);
    float fine = pow(1.0 - smoothstep(0.0, 0.12, abs(sin(vWorld.x * 0.19 - vWorld.z * 0.13 + uTime * 0.5))), 2.0);

    vec3 under = vec3(0.014, 0.055, 0.066);
    under += vec3(0.10, 0.30, 0.33) * veins * 0.55;
    under += vec3(0.34, 0.62, 0.66) * fine * 0.30;
    under += vec3(0.80, 0.92, 0.95) * moon * moon * 0.85;
    // Silvered at grazing angles: the horizon of the water is a mirror, and a
    // mirror down here has almost nothing to reflect.
    under = mix(under, vec3(0.020, 0.062, 0.074), mirror * 0.8);

    // Into the murk, with the same numbers as everything else.
    float underFog = smoothstep(uFogNear, uFogFar, away);
    under = mix(under, uFogColor, underFog);
    float underAlpha = 1.0;

    vec3 colour = mix(over, under, uDeep);
    gl_FragColor = vec4(colour, mix(overAlpha, underAlpha, uDeep));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** Sky, moon and the water all the causeway pieces rise out of — or go under. */
export function MoonbreakWorld({ track }: { track: Track }) {
  const skyRef = useRef<Mesh>(null)
  const moonRef = useRef<Mesh>(null)
  const waterRef = useRef<Mesh>(null)
  const cuts = useMemo(() => seaCuts(track), [track])
  const mask = useMemo(() => buildCutMask(track, cuts), [track, cuts])
  const spills = useMemo(() => buildSpills(track, cuts), [track, cuts])
  const sky = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: BackSide,
        // The background, and only the background: drawn first, and never in
        // front of the mountains, which stand further off than the dome is.
        depthWrite: false,
        uniforms: {
          uDeep: { value: 0 },
          uTime: { value: 0 },
          uFogColor: { value: new Color('#04161c') },
          uMoonDir: { value: MOON_DIR },
        },
      }),
    [],
  )
  const moon = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: MOON_VERT,
        fragmentShader: MOON_FRAG,
        depthWrite: false,
        uniforms: { uDeep: { value: 0 } },
      }),
    [],
  )
  const water = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: WATER_VERT,
        fragmentShader: WATER_FRAG,
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uDeep: { value: 0 },
          uMoonDir: { value: MOON_DIR },
          uFogColor: { value: new Color('#04161c') },
          uFogNear: { value: 12 },
          uFogFar: { value: 78 },
          uCuts: { value: mask.texture },
          uCutA: { value: mask.regions[0] },
          uCutB: { value: mask.regions[1] },
        },
      }),
    [mask],
  )
  const spill = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: SPILL_VERT,
        fragmentShader: SPILL_FRAG,
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uFogColor: { value: new Color('#2a3244') },
          uFogNear: { value: 62 },
          uFogFar: { value: 235 },
        },
      }),
    [],
  )

  useEffect(() => () => {
    sky.dispose()
    moon.dispose()
    water.dispose()
    spill.dispose()
  }, [sky, moon, water, spill])
  useEffect(() => () => {
    mask.texture.dispose()
    spills.dispose()
  }, [mask, spills])

  useFrame(({ camera }, delta) => {
    const step = Math.min(0.05, delta)
    // See the notes on the meshes below: the sky, the moon and the sea are all
    // held at a fixed offset from the camera so none of them can ever cross
    // the far plane.
    skyRef.current?.position.copy(camera.position)
    moonRef.current?.position.copy(camera.position).add(MOON)
    waterRef.current?.position.set(camera.position.x, WATER_Y, camera.position.z)
    water.uniforms.uTime.value += step
    water.uniforms.uDeep.value = deep.at
    water.uniforms.uFogColor.value.copy(deep.fog)
    water.uniforms.uFogNear.value = deep.near
    water.uniforms.uFogFar.value = deep.far
    sky.uniforms.uTime.value += step
    sky.uniforms.uDeep.value = deep.at
    sky.uniforms.uFogColor.value.copy(deep.fog)
    moon.uniforms.uDeep.value = deep.at
    spill.uniforms.uTime.value += step
    spill.uniforms.uFogColor.value.copy(deep.fog)
    spill.uniforms.uFogNear.value = deep.near
    spill.uniforms.uFogFar.value = deep.far
  })

  return (
    <>
      <MoonbreakSound track={track} />
      {/*
        Sixteen hundred metres, and it travels with you.

        =====================================================================
        **This was the pale shape in the Drowned Mile.** The dome was a
        twenty-four hundred metre sphere standing at the world origin, and the
        camera's far plane is also twenty-four hundred — so the moment the car
        was any distance from the origin at all, the far side of the sphere was
        further away than the camera can see and was clipped away mid-triangle.

        What is left of a clipped sphere is a cap with a hard polygonal edge,
        because the dome is twenty-eight segments around: a pale slab hanging
        across the road, its outline following the tessellation, moving and
        shrinking as the car's distance to the sphere changed, and gone when
        the whole thing finally fell outside. It read as a rectangle of light
        with nothing casting it.

        It is worst in the Drowned Mile for a reason that has nothing to do
        with the Drowned Mile: down there the fog is almost black, so the one
        surface in the frame that does *not* fade with distance is the only
        bright thing in it, and its edge is the only edge.

        A dome has to be inside the far plane from wherever the camera actually
        is, and on a road nearly four kilometres long the only way to guarantee
        that is to carry it — which is what the Stormcrown's sky already does,
        for exactly this reason and after exactly this bug.
        =====================================================================
      */}
      <mesh ref={skyRef} frustumCulled={false} material={sky} renderOrder={-10}>
        <sphereGeometry args={[1600, 28, 16]} />
      </mesh>
      {/*
        The sea goes with you too. Its waves are keyed to the world, not to the
        mesh, so carrying it moves nothing you can see — and it means the edge
        of it is always two kilometres off in every direction, rather than
        somewhere just past the far end of the road.
      */}
      <mesh
        ref={waterRef}
        position={[0, WATER_Y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        frustumCulled={false}
        material={water}
      >
        <planeGeometry args={[4200, 4200]} />
      </mesh>
      <mesh geometry={spills} material={spill} renderOrder={2} />
      {/*
        And the moon goes with it, for the same reason and one more.

        At eleven hundred metres from the origin it was inside the far plane at
        the start line and outside it by the far end of the road, so it winked
        out somewhere down the causeway. Carried, it is always eleven hundred
        metres away in a fixed direction — which is also what a moon *is*: a
        thing that does not move when you do.
      */}
      <mesh ref={moonRef} frustumCulled={false} material={moon} renderOrder={-9}>
        <sphereGeometry args={[54, 32, 24]} />
      </mesh>
      <Moonshore track={track} />
      <Moonlife track={track} />
      <Deepwater track={track} />
    </>
  )
}
