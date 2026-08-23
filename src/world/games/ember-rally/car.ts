/**
 * The car, built out of numbers.
 *
 * There is no model file and no loader. Everything below is lofted from a
 * table of cross-sections, which is worth the trouble for two reasons: it
 * ships as about ten kilobytes of source rather than a megabyte of mesh, and
 * — much more to the point — it can be *described* rather than modelled, so
 * the next person who wants the bonnet lower changes a number in a list that
 * says what it is.
 *
 * The material language is the garden's, not a racing game's: dark oiled wood
 * for the body, hammered brass for everything structural, worn leather for the
 * straps, and ember glass for the lamps. No decals, no sponsor, no paint. It
 * should look like something somebody in this world made in a shed, and like
 * it belongs beside the Hollow's fire when it is standing still.
 *
 * ---------------------------------------------------------------------------
 * **Every lamp on it is wired to something the car is doing.**
 *
 * Nothing here is a texture of a light. `aFinish.w` says what kind of lamp a
 * surface is, and the shader in `materials.ts` lights it from the state of the
 * machine:
 *
 *   0  not a lamp
 *   1  a brake lamp        — on with the pedal, brighter the harder you press
 *   2  a brake disc        — glows with how much heat that *corner* has in it,
 *                            so the inside front glows first into a hairpin
 *   3  an exhaust tip      — lights on the ember, and pops on the overrun
 *
 * That is the whole gauge cluster. You read the car off the car.
 * ---------------------------------------------------------------------------
 *
 * Four things do most of the convincing and none of them are the shape:
 *
 *   the lamps      six of them — two in the nose and a pod of four over it —
 *                  and they are the light source the whole tunnel is rendered
 *                  from. See `materials.ts`
 *   the tail       three ember lenses in a row, wired to `uGlow`. That is the
 *                  boost meter. There is no other one anywhere
 *   the wheels     separate geometry, so the fronts steer, all four spin and
 *                  lock independently, and each takes its own suspension
 *                  travel and its own camber
 *   the springs    exposed coilovers at each corner, which is what makes the
 *                  travel *legible*. A body that leans over wheels bolted
 *                  rigidly to it reads as a bug; a body that leans while four
 *                  springs visibly compress reads as weight
 */

import { BufferAttribute, BufferGeometry, Color, Vector3 } from 'three'
import { AXLE_FRONT, AXLE_HALF_TRACK, AXLE_REAR, WHEEL_RADIUS } from './physics'

export { AXLE_FRONT, AXLE_HALF_TRACK, AXLE_REAR, WHEEL_RADIUS }

// --- the shed ---------------------------------------------------------------

const WOOD = new Color('#5c3d24')
const WOOD_LIT = new Color('#7d5533')
const BRASS = new Color('#cfa955')
const BRASS_DARK = new Color('#9a7a35')
const LEATHER = new Color('#6d4c36')
const GLASS = new Color('#0f141d')
const RUBBER = new Color('#191716')
const RUBBER_LIT = new Color('#26231f')
const IRON = new Color('#3a3a3c')
const LAMP_GLASS = new Color('#ffdaa4')
const EMBER_GLASS = new Color('#ff6a24')
const BRAKE_GLASS = new Color('#ff3b18')
const DISC = new Color('#4a4443')

interface Finish {
  gloss: number
  /** Glows with the ember meter. */
  ember?: number
  /** Glows regardless. */
  steady?: number
  /** 1 brake lamp, 2 brake disc, 3 exhaust tip. See the note at the top. */
  lamp?: number
}

const OILED: Finish = { gloss: 0.16 }
const POLISHED: Finish = { gloss: 0.7 }
const DULL: Finish = { gloss: 0.55 }
const WORN: Finish = { gloss: 0.2 }
const GLAZED: Finish = { gloss: 0.95 }
const MATTE: Finish = { gloss: 0.05 }
/**
 * A lit lens.
 *
 * Not 1. A lens at full strength comes out of the tone mapper as flat white
 * with a hard edge, and six of those on the front of a car is not a car with
 * lamps on it — it is six white discs with some brass behind them. At this
 * value the glass keeps its own warm colour and still reads as *on*, which is
 * what a real lamp does to a camera at anything but point blank.
 */
const LAMP: Finish = { gloss: 0.9, steady: 0.58 }
const BRAKE_LAMP: Finish = { gloss: 0.8, lamp: 1 }
const BRAKE_DISC: Finish = { gloss: 0.45, lamp: 2 }
const PIPE: Finish = { gloss: 0.7, lamp: 3 }
/**
 * The three lenses in the tail, left to right.
 *
 * `ember` is which one of them this is, one-based — not how brightly it glows.
 * The shader lights lens n over the nth third of the meter, so the boost you
 * are carrying is three lamps filling up rather than one lamp getting
 * brighter, and one measure of ember is one lamp. That is the whole gauge:
 * there is no other one anywhere in the game.
 */
const TAIL = (which: number): Finish => ({ gloss: 0.8, ember: which, steady: 0.05 })

class Body {
  readonly position: number[] = []
  readonly color: number[] = []
  readonly finish: number[] = []
  readonly index: number[] = []

  get count(): number {
    return this.position.length / 3
  }

  vertex(x: number, y: number, z: number, color: Color, finish: Finish) {
    this.position.push(x, y, z)
    this.color.push(color.r, color.g, color.b)
    this.finish.push(finish.gloss, finish.ember ?? 0, finish.steady ?? 0, finish.lamp ?? 0)
  }

  quad(a: number, b: number, c: number, d: number) {
    this.index.push(a, b, c, a, c, d)
  }

  build(): BufferGeometry {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(this.position), 3))
    geo.setAttribute('aColor', new BufferAttribute(new Float32Array(this.color), 3))
    geo.setAttribute('aFinish', new BufferAttribute(new Float32Array(this.finish), 4))
    geo.setIndex(this.index)
    geo.computeVertexNormals()
    geo.computeBoundingSphere()
    return geo
  }
}

// --- lofting ----------------------------------------------------------------

/** One station along the car: how wide, and where its floor and roof are. */
interface Station {
  z: number
  half: number
  low: number
  high: number
  /** Rounder toward 2, boxier toward 8. */
  corner?: number
}

const AROUND = 14

/**
 * A rounded-rectangle ring.
 *
 * A superellipse rather than a rectangle with fillets: one exponent gives
 * everything from a tyre-like slab to a soft loaf, and the sections can then
 * be blended into each other without any of them having to agree about where
 * their corners are.
 */
function ring(station: Station, out: Vector3[]) {
  const midY = (station.low + station.high) / 2
  const halfY = (station.high - station.low) / 2
  const e = 2 / (station.corner ?? 4)
  for (let k = 0; k < AROUND; k++) {
    const a = (k / AROUND) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    out[k].set(
      Math.sign(c) * Math.pow(Math.abs(c), e) * station.half,
      midY + Math.sign(s) * Math.pow(Math.abs(s), e) * halfY,
      station.z,
    )
  }
}

/**
 * Sweep a list of stations into a closed shell.
 *
 * `tint` is asked for each vertex rather than each station, because the useful
 * variation on a wooden body runs *around* it as well as along: the sills sit
 * in shadow, the shoulders catch the light, and glass is simply what the top
 * of the cabin is made of.
 */
function loft(
  body: Body,
  stations: Station[],
  tint: (station: Station, point: Vector3, k: number) => [Color, Finish],
  capFront = true,
  capBack = true,
) {
  const points: Vector3[] = Array.from({ length: AROUND }, () => new Vector3())
  const first = body.count

  for (const station of stations) {
    ring(station, points)
    for (let k = 0; k < AROUND; k++) {
      const [color, finish] = tint(station, points[k], k)
      body.vertex(points[k].x, points[k].y, points[k].z, color, finish)
    }
  }

  for (let i = 0; i < stations.length - 1; i++) {
    const a = first + i * AROUND
    const b = a + AROUND
    for (let k = 0; k < AROUND; k++) {
      const k2 = (k + 1) % AROUND
      body.quad(a + k, a + k2, b + k2, b + k)
    }
  }

  // Caps, as a fan into a middle vertex, so the ends are closed rather than
  // open tubes you can see the inside of when the camera swings round.
  const cap = (station: Station, base: number, flip: boolean) => {
    const middle = body.count
    const [color, finish] = tint(station, new Vector3(0, (station.low + station.high) / 2, station.z), -1)
    body.vertex(0, (station.low + station.high) / 2, station.z, color, finish)
    for (let k = 0; k < AROUND; k++) {
      const k2 = (k + 1) % AROUND
      if (flip) body.index.push(middle, base + k2, base + k)
      else body.index.push(middle, base + k, base + k2)
    }
  }
  if (capBack) cap(stations[0], first, false)
  if (capFront) cap(stations[stations.length - 1], first + (stations.length - 1) * AROUND, true)
}

/** A box, for straps, bars, spoilers and grille slats. */
function slab(
  body: Body,
  centre: [number, number, number],
  size: [number, number, number],
  color: Color,
  finish: Finish,
  tiltX = 0,
) {
  const [cx, cy, cz] = centre
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2]
  const base = body.count
  const cos = Math.cos(tiltX)
  const sin = Math.sin(tiltX)
  const corners: [number, number, number][] = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
    [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
  ]
  for (const [x, y, z] of corners) {
    body.vertex(cx + x, cy + y * cos - z * sin, cz + y * sin + z * cos, color, finish)
  }
  const faces: [number, number, number, number][] = [
    [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
    [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3],
  ]
  for (const [a, b, c, d] of faces) body.quad(base + a, base + b, base + c, base + d)
}

/** A drum: hubs, lamp bezels, exhausts. Axis along X unless told otherwise. */
function drum(
  body: Body,
  centre: [number, number, number],
  radius: number,
  halfWidth: number,
  color: Color,
  finish: Finish,
  sides = 12,
  axis: 'x' | 'y' | 'z' = 'x',
  /** Inner radius, for a ring rather than a solid disc. */
  hole = 0,
) {
  const base = body.count
  const at = (a: number, r: number, w: number): [number, number, number] => {
    if (axis === 'x') return [centre[0] + w, centre[1] + Math.sin(a) * r, centre[2] + Math.cos(a) * r]
    if (axis === 'y') return [centre[0] + Math.cos(a) * r, centre[1] + w, centre[2] + Math.sin(a) * r]
    return [centre[0] + Math.cos(a) * r, centre[1] + Math.sin(a) * r, centre[2] + w]
  }

  for (let side = 0; side < 2; side++) {
    const w = side === 0 ? -halfWidth : halfWidth
    for (let k = 0; k < sides; k++) {
      const p = at((k / sides) * Math.PI * 2, radius, w)
      body.vertex(p[0], p[1], p[2], color, finish)
    }
  }
  /*
    The wall, wound outward.

    This used to be `quad(k, k2, sides+k2, sides+k)`, which winds the other way
    — so with front-face culling on, **every cylinder on the car was drawing
    only its two end caps and no barrel at all.** It went unnoticed for a long
    time because what you mostly see of a lamp is its lens, and a lens is a
    cap; but every hub, every bezel and both exhausts were hollow rings with
    nothing between them, and the wheels were the worse for it.
  */
  for (let k = 0; k < sides; k++) {
    const k2 = (k + 1) % sides
    body.quad(base + k, base + sides + k, base + sides + k2, base + k2)
  }
  /*
    The two end faces, with their own copies of the rim.

    Sharing the rim with the cylinder wall is the obvious saving and it is
    wrong: `computeVertexNormals` averages every face meeting at a vertex, so a
    flat cap and a wall at ninety degrees to it come out as one smooth curve
    and every hub, lamp bezel and exhaust on the car looks like a party hat.
  */
  for (let side = 0; side < 2; side++) {
    const w = side === 0 ? -halfWidth : halfWidth
    const rim = body.count
    for (let k = 0; k < sides; k++) {
      const p = at((k / sides) * Math.PI * 2, radius, w)
      body.vertex(p[0], p[1], p[2], color, finish)
    }
    if (hole > 0) {
      // An annulus, so a wheel rim can be a rim rather than a plate.
      const inner = body.count
      for (let k = 0; k < sides; k++) {
        const p = at((k / sides) * Math.PI * 2, hole, w)
        body.vertex(p[0], p[1], p[2], color, finish)
      }
      for (let k = 0; k < sides; k++) {
        const k2 = (k + 1) % sides
        if (side === 0) {
          body.index.push(inner + k, rim + k, rim + k2)
          body.index.push(inner + k, rim + k2, inner + k2)
        } else {
          body.index.push(inner + k, rim + k2, rim + k)
          body.index.push(inner + k, inner + k2, rim + k2)
        }
      }
    } else {
      const middle = body.count
      body.vertex(
        centre[0] + (axis === 'x' ? w : 0),
        centre[1] + (axis === 'y' ? w : 0),
        centre[2] + (axis === 'z' ? w : 0),
        color,
        finish,
      )
      for (let k = 0; k < sides; k++) {
        const k2 = (k + 1) % sides
        if (side === 0) body.index.push(middle, rim + k, rim + k2)
        else body.index.push(middle, rim + k2, rim + k)
      }
    }
  }
}

/**
 * A coil spring, swept as a square wire along a helix.
 *
 * Worth the sixty segments. A spring drawn as a plain cylinder is a bollard;
 * what says "this is suspension" is the *pitch* of the coils, and the same
 * geometry compressed by the renderer visibly closes up.
 */
function coil(
  body: Body,
  centre: [number, number, number],
  radius: number,
  height: number,
  turns: number,
  wire: number,
  color: Color,
  finish: Finish,
) {
  const steps = Math.round(turns * 11)
  const base = body.count
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = t * turns * Math.PI * 2
    const cx = centre[0] + Math.cos(a) * radius
    const cy = centre[1] + t * height
    const cz = centre[2] + Math.sin(a) * radius
    // The wire's own square section, oriented outward from the helix axis.
    const ox = Math.cos(a) * wire
    const oz = Math.sin(a) * wire
    body.vertex(cx - ox, cy - wire, cz - oz, color, finish)
    body.vertex(cx + ox, cy - wire, cz + oz, color, finish)
    body.vertex(cx + ox, cy + wire, cz + oz, color, finish)
    body.vertex(cx - ox, cy + wire, cz - oz, color, finish)
  }
  for (let i = 0; i < steps; i++) {
    const a = base + i * 4
    const b = base + (i + 1) * 4
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4
      body.quad(a + k, a + k2, b + k2, b + k)
    }
  }
}

// --- the machine ------------------------------------------------------------

/**
 * The shell: tub, cabin, arches, lamps, straps, exhausts, spoiler.
 *
 * Its origin is on the road between the wheels with the nose toward +Z, so the
 * Stage can put it on the track with one rotation about Y and nothing else.
 */
export function buildCarShell(): BufferGeometry {
  const body = new Body()

  /*
    --- the tub ------------------------------------------------------------

    Low, with a haunch over each axle and a waist between them. The haunches
    are the whole silhouette: a car of constant width is a loaf, and in a
    tunnel lit from the front what you actually read is where the body swells
    out over the wheels.
  */
  const tub: Station[] = [
    { z: -1.76, half: 0.66, low: 0.24, high: 0.66, corner: 3.2 },
    { z: -1.46, half: 0.79, low: 0.19, high: 0.74, corner: 4 },
    { z: -1.02, half: 0.88, low: 0.17, high: 0.76, corner: 4.8 },
    { z: -0.34, half: 0.8, low: 0.16, high: 0.74, corner: 4.4 },
    { z: 0.42, half: 0.79, low: 0.16, high: 0.72, corner: 4.2 },
    { z: 1.04, half: 0.86, low: 0.18, high: 0.68, corner: 4.6 },
    { z: 1.5, half: 0.78, low: 0.22, high: 0.63, corner: 4 },
    { z: 1.76, half: 0.56, low: 0.28, high: 0.57, corner: 3 },
  ]
  loft(body, tub, (_station, point) => {
    // Planks, running the length of the car, the way boards on a hand-built
    // body would actually be laid.
    const plank = Math.sin(point.z * 9.4 + point.x * 1.7) * 0.5 + 0.5
    const shade = new Color().copy(WOOD).lerp(WOOD_LIT, plank * 0.5)
    // the sills sit in their own shadow
    if (point.y < 0.3) shade.multiplyScalar(0.58)
    return [shade, OILED]
  })

  // --- the cabin -----------------------------------------------------------
  const cabin: Station[] = [
    { z: -1.02, half: 0.52, low: 0.66, high: 0.74, corner: 3 },
    { z: -0.8, half: 0.63, low: 0.7, high: 1.0, corner: 3.6 },
    { z: -0.26, half: 0.66, low: 0.72, high: 1.1, corner: 4 },
    { z: 0.24, half: 0.64, low: 0.72, high: 1.08, corner: 4 },
    { z: 0.58, half: 0.58, low: 0.7, high: 0.92, corner: 3.4 },
    { z: 0.8, half: 0.46, low: 0.68, high: 0.78, corner: 3 },
  ]
  loft(body, cabin, (_station, point) => {
    // Glass is simply what the top of the cabin is made of. A separate loft
    // for the greenhouse would need its own seam, and this reads identically
    // at any size a car is ever on screen.
    if (point.y > 0.84) return [GLASS, GLAZED]
    const plank = Math.sin(point.z * 8.1 + 1.3) * 0.5 + 0.5
    return [new Color().copy(WOOD).lerp(WOOD_LIT, plank * 0.4), OILED]
  })

  /*
    Somebody is driving it.

    A helmet and a pair of shoulders, dark, low in the seat. It is four boxes
    and you only ever catch it as a lantern goes past — which is exactly the
    point. An empty cockpit at forty metres a second reads as a machine on
    rails, and this is a garden where two people leave each other things. The
    car should have a person in it.
  */
  drum(body, [0, 0.96, -0.42], 0.155, 0.13, IRON, DULL, 10, 'z')
  slab(body, [0, 0.99, -0.28], [0.28, 0.16, 0.05], GLASS, GLAZED, -0.3)
  slab(body, [0, 0.79, -0.6], [0.46, 0.3, 0.24], LEATHER, WORN, 0.16)
  // A roll hoop behind the head, because there is no roof worth the name.
  for (const side of [-1, 1]) {
    slab(body, [side * 0.3, 0.92, -0.72], [0.05, 0.42, 0.05], BRASS_DARK, DULL, 0.12)
  }
  slab(body, [0, 1.12, -0.68], [0.65, 0.05, 0.05], BRASS_DARK, DULL)

  /*
    --- brass over the joints ----------------------------------------------

    Every piece of brass on this car is where two materials meet, or where
    something is held on. None of it is a stripe. That is the difference
    between a machine somebody built in a shed and a toy with a livery.
  */
  // The beltline, running the whole length where the tub and the cabin meet.
  for (const side of [-1, 1]) {
    slab(body, [side * 0.855, 0.7, -0.2], [0.042, 0.05, 2.4], BRASS_DARK, DULL)
  }
  // The windscreen: two raked pillars and a header rail.
  for (const side of [-1, 1]) {
    slab(body, [side * 0.44, 0.92, 0.47], [0.045, 0.42, 0.05], BRASS_DARK, DULL, -1.02)
  }
  slab(body, [0, 1.09, 0.235], [1.18, 0.05, 0.06], BRASS, POLISHED)
  // A rib over the roof, front to back, where the panels are joined.
  slab(body, [0, 1.11, -0.1], [0.06, 0.045, 0.72], BRASS_DARK, DULL)

  /*
    Mirrors, on stalks off the screen pillars.

    Small, and worth more than their size. A car seen from behind is a shape,
    and shapes read by their outline — two things standing off the shoulders
    break the silhouette at exactly the widest point and give the eye something
    to measure the body against. They also catch a lantern a beat before the
    rest of the car does, which is the sort of thing you notice without ever
    noticing it.

    The glass faces backwards rather than outwards, because that is where the
    camera is and a mirror showing you its own back is a plastic lump.
  */
  for (const side of [-1, 1]) {
    slab(body, [side * 0.58, 0.95, 0.43], [0.16, 0.024, 0.024], BRASS_DARK, DULL)
    slab(body, [side * 0.68, 0.98, 0.41], [0.085, 0.1, 0.05], BRASS, POLISHED, 0.1)
    slab(body, [side * 0.68, 0.98, 0.383], [0.07, 0.082, 0.01], GLASS, GLAZED, 0.1)
  }

  // Bonnet straps, leather, with a buckle each.
  for (const z of [1.0, 1.34]) {
    slab(body, [0, 0.665, z], [1.44, 0.03, 0.095], LEATHER, WORN)
    slab(body, [0.4, 0.685, z], [0.1, 0.045, 0.12], BRASS, POLISHED)
  }
  // Louvres let the heat out of the bonnet, and catch a lantern beautifully.
  for (let i = 0; i < 4; i++) {
    slab(body, [-0.34, 0.685, 1.12 + i * 0.075], [0.34, 0.02, 0.05], BRASS_DARK, DULL, 0.5)
    slab(body, [0.34, 0.685, 1.12 + i * 0.075], [0.34, 0.02, 0.05], BRASS_DARK, DULL, 0.5)
  }

  // --- the nose ------------------------------------------------------------
  /*
    A grille of brass slats. A dark face with two lamps on it reads as a mask;
    a grille reads as a car.

    Thin and close together, and that is the second attempt. Five bars a
    centimetre thick with five centimetres of air between them is not a grille,
    it is a ladder bolted to the front of the car — at any distance the eye
    reads the *gaps*. Eight thin ones read as one dark surface with a texture,
    which is what a grille actually looks like.
  */
  for (let i = 0; i < 8; i++) {
    slab(body, [0, 0.35 + i * 0.028, 1.78], [0.78, 0.015, 0.045], BRASS_DARK, DULL)
  }
  slab(body, [0, 0.3, 1.77], [0.92, 0.045, 0.085], BRASS_DARK, DULL)
  // A tow ring, because everything down here has been dragged out of somewhere.
  drum(body, [0.58, 0.3, 1.79], 0.07, 0.018, BRASS_DARK, DULL, 10, 'z', 0.045)

  /*
    The lamps, and the pod over them.

    Not decoration: `materials.ts` renders the whole tunnel out of cones whose
    origins are exactly here, so where they sit on the car is a lighting
    decision before it is a styling one.

    The pair in the nose is set wide and low — a wide pair throws two pools
    that cross about eight metres out, which is what gives the road its shape
    at speed, and a low pair rakes the stone instead of flattening it. The four
    over the bonnet are the opposite: high, close together, and aimed long, so
    they show you the corner *after* the one you are in. Every rally car ever
    built for a night stage has both, for exactly these two reasons.
  */
  for (const side of [-1, 1]) {
    // A reflector bowl behind each lens, so the lamp has a depth to it — and
    // no wider than the bezel in front of it, or it reads as a cheek.
    drum(body, [side * 0.47, 0.56, 1.56], 0.155, 0.05, BRASS_DARK, DULL, 14, 'z')
    drum(body, [side * 0.47, 0.56, 1.62], 0.158, 0.075, BRASS, POLISHED, 14, 'z')
    drum(body, [side * 0.47, 0.56, 1.71], 0.122, 0.026, LAMP_GLASS, LAMP, 14, 'z')
  }

  // The pod: a brass bar across the nose with four lamps standing on it.
  slab(body, [0, 0.74, 1.46], [0.98, 0.045, 0.065], BRASS_DARK, DULL)
  for (const side of [-0.375, -0.125, 0.125, 0.375]) {
    slab(body, [side, 0.7, 1.46], [0.042, 0.12, 0.042], BRASS_DARK, DULL)
    drum(body, [side, 0.82, 1.47], 0.1, 0.055, BRASS, POLISHED, 12, 'z')
    drum(body, [side, 0.82, 1.54], 0.076, 0.02, LAMP_GLASS, LAMP, 12, 'z')
  }

  // --- the tail ------------------------------------------------------------
  // Three ember lenses. This is the boost meter, and there is no other one.
  for (let i = 0; i < 3; i++) {
    drum(body, [(i - 1) * 0.3, 0.55, -1.77], 0.095, 0.02, BRASS_DARK, DULL, 10, 'z')
    drum(body, [(i - 1) * 0.3, 0.55, -1.79], 0.07, 0.03, EMBER_GLASS, TAIL(i + 1), 10, 'z')
  }
  /*
    And two brake lamps, which are a different thing and have to look it.

    Set outboard and below the meter, red rather than ember, and lit by the
    pedal instead of by the meter. Putting braking on the same lamps as the
    boost would mean the one gauge in the game said two things at once — and
    from directly behind, which is where you spend the whole race, you would
    never know which.
  */
  // Inboard of the haunches: the tub is only sixty centimetres across at the
  // tail, so a lamp set at two-thirds of a metre hangs in the air beside it.
  for (const side of [-0.5, 0.5]) {
    drum(body, [side, 0.4, -1.75], 0.072, 0.02, BRASS_DARK, DULL, 10, 'z')
    drum(body, [side, 0.4, -1.77], 0.052, 0.03, BRAKE_GLASS, BRAKE_LAMP, 10, 'z')
  }
  // A small wooden blade on two brass stalks. Low, and no wider than the body.
  slab(body, [0, 0.87, -1.5], [0.94, 0.045, 0.2], WOOD_LIT, OILED, -0.22)
  for (const side of [-0.38, 0.38]) {
    slab(body, [side, 0.78, -1.48], [0.04, 0.17, 0.045], BRASS_DARK, DULL)
  }
  /*
    Two exhausts, out of the back, low.

    The *tip* is dark iron, not ember glass. It used to be glass in the ember
    colour, which meant that with the engine merely idling the car had two more
    orange lamps in its tail — five glowing circles across the back, of which
    three were the boost meter and two were plumbing. The gauge only works if
    nothing else down there glows unless it is doing something.
  */
  for (const side of [-0.3, 0.3]) {
    drum(body, [side, 0.26, -1.8], 0.06, 0.05, BRASS_DARK, DULL, 10, 'z')
    drum(body, [side, 0.26, -1.85], 0.046, 0.02, IRON, PIPE, 10, 'z')
  }

  /*
    --- the arches ---------------------------------------------------------

    Flared lips over the top of each wheel, not hoops around it. They are the
    widest thing on the car, and in a tunnel lit from the front they are what
    tells you how much room you have on either side.

    Swept as a closed four-sided section rather than as a ribbon. A ribbon has
    to be visible from both sides, and two opposite faces sharing a vertex
    average to a normal of *zero* in `computeVertexNormals` — which renders as
    an arch-shaped hole.
  */
  for (const z of [AXLE_FRONT, AXLE_REAR]) {
    for (const side of [-1, 1]) {
      const base = body.count
      const steps = 8
      const from = 0.16 * Math.PI
      const to = 0.84 * Math.PI
      const inner = side * 0.72
      const outer = side * 0.94
      for (let i = 0; i <= steps; i++) {
        const a = from + ((to - from) * i) / steps
        const y = 0.2 + Math.sin(a) * 0.5
        const dz = z - Math.cos(a) * 0.6
        // outward along the arch, so the lip has thickness in the direction it
        // needs it rather than simply being taller
        const ny = Math.sin(a) * 0.035
        const nz = -Math.cos(a) * 0.035
        body.vertex(inner, y + ny, dz + nz, WOOD, OILED)
        body.vertex(outer, y + ny * 0.6, dz + nz * 0.6, BRASS_DARK, DULL)
        body.vertex(outer, y - ny * 0.6, dz - nz * 0.6, BRASS_DARK, DULL)
        body.vertex(inner, y - ny, dz - nz, WOOD, OILED)
      }
      for (let i = 0; i < steps; i++) {
        const a = base + i * 4
        const b = base + (i + 1) * 4
        for (let k = 0; k < 4; k++) {
          const k2 = (k + 1) % 4
          body.quad(a + k, a + k2, b + k2, b + k)
        }
      }
    }
  }

  // Mud flaps behind the rear arches. Small: at a third of a metre square they
  // were two black boards hung off the back, wider than the wheels they were
  // meant to be shielding.
  /*
    Hung from the back of the arch, not floating under the tail.

    The arch sweeps down to about forty-five centimetres at its rear end, so a
    flap whose top edge is at twenty hangs in clear air with a hand's width of
    nothing above it — which is what it did, and from behind the car it read as
    two black tiles lying on the road.
  */
  for (const side of [-1, 1]) {
    slab(body, [side * 0.8, 0.27, AXLE_REAR - 0.51], [0.24, 0.36, 0.02], RUBBER_LIT, WORN, 0.1)
  }

  /*
    A running board between the arches, which is what the flares bolt to.

    Tucked up against the sill rather than standing off it. Out at the full
    width of the flares it hung in clear air a hand's breadth from the body and
    read as a brass rod somebody had left lying alongside the car.
  */
  for (const side of [-1, 1]) {
    slab(body, [side * 0.755, 0.275, 0], [0.095, 0.05, 1.42], BRASS_DARK, DULL)
  }

  return body.build()
}

/**
 * One corner's spring and damper, drawn from the body down to the hub.
 *
 * Its origin is the *top* mount, on the body, with the spring hanging down
 * toward the wheel — so the renderer scales it on Y by how far that corner has
 * travelled and the coils close up under load. See `Race.tsx`.
 */
export function buildCoilover(): BufferGeometry {
  const body = new Body()
  // The damper body, then the rod, then the spring around both.
  drum(body, [0, -0.13, 0], 0.032, 0.13, IRON, DULL, 8, 'y')
  drum(body, [0, -0.3, 0], 0.016, 0.06, BRASS, POLISHED, 8, 'y')
  // The two platforms the spring sits between.
  drum(body, [0, -0.02, 0], 0.075, 0.012, BRASS_DARK, DULL, 10, 'y')
  drum(body, [0, -0.34, 0], 0.07, 0.012, BRASS_DARK, DULL, 10, 'y')
  coil(body, [0, -0.33, 0], 0.058, 0.3, 5, 0.013, BRASS, POLISHED)
  return body.build()
}

/**
 * One wheel, at the origin, axle along X.
 *
 * Built once and drawn four times with four different transforms, so the front
 * pair can be steered and all four can be spun — the cheapest thing there is
 * that makes a car look like it has weight.
 *
 * The disc and caliper inside it are not detail for its own sake. `aFinish.w`
 * marks the disc as a brake disc, and the shader glows it from *that corner's*
 * heat — so into a hard braking zone the fronts come up before the rears, and
 * the inside front comes up before the outside. It is the only place in the
 * game where you can see load transfer happening.
 */
export function buildWheel(): BufferGeometry {
  const body = new Body()
  const SIDES = 18

  /*
    The tyre.

    A lathe with a real shoulder, and a tread that alternates *both* radius and
    width every other segment. Alternating radius alone gives a cog; adding the
    width step gives blocks with grooves between them, which at the size a
    wheel is ever on screen is the difference between a tyre and a black
    doughnut. The shoulder blocks are what you actually see, because a
    cornering car shows you the outside of its tyre and not the tread.
  */
  const profile: [number, number][] = [
    [-0.128, 0.215], [-0.142, 0.262], [-0.138, 0.315],
    [-0.118, 0.338], [0.118, 0.338], [0.138, 0.315],
    [0.142, 0.262], [0.128, 0.215],
  ]
  const base = body.count
  for (let k = 0; k < SIDES; k++) {
    const a = (k / SIDES) * Math.PI * 2
    const block = k % 2 === 0
    const tread = block ? 1 : 0.952
    for (const [x, r] of profile) {
      const shoulder = r > 0.3
      const rr = shoulder ? r * tread : r
      // The blocks are also narrower than the grooves between them.
      const xx = shoulder && !block ? x * 0.94 : x
      body.vertex(xx, Math.sin(a) * rr, Math.cos(a) * rr, block ? RUBBER_LIT : RUBBER, MATTE)
    }
  }
  for (let k = 0; k < SIDES; k++) {
    const k2 = (k + 1) % SIDES
    for (let i = 0; i < profile.length - 1; i++) {
      body.quad(
        base + k * profile.length + i,
        base + k2 * profile.length + i,
        base + k2 * profile.length + i + 1,
        base + k * profile.length + i + 1,
      )
    }
  }

  /*
    --- the rim, and how much of the wheel it is allowed to be --------------

    A wheel is mostly *tyre*. The first version had a polished brass rim out to
    two-thirds of the radius with brass spokes and a brass hub inside it, and
    at any distance the whole thing read as a **brass coin with a dark line
    round it** — four of them, and they pulled the eye away from the car every
    time it went past a lantern.

    So: the rim is dark iron with only a brass lip, it stops well short, and
    the bright metal is now a small hub and six thin spokes. What is left is a
    tyre with a wheel in it, which is what a wheel looks like.
  */
  for (const side of [-1, 1]) {
    drum(body, [side * 0.1, 0, 0], 0.182, 0.018, IRON, DULL, SIDES, 'x', 0.075)
    // A polished lip, and only a lip. This is the part that catches a lantern.
    drum(body, [side * 0.114, 0, 0], 0.19, 0.012, BRASS, DULL, SIDES, 'x', 0.168)
  }
  drum(body, [0, 0, 0], 0.068, 0.096, BRASS, POLISHED, 12, 'x')

  // Six spokes. Separate bars rather than three through the middle: bars
  // overlap at the hub and read as one brass wedge from any angle but dead
  // side-on.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    slab(
      body,
      [0, Math.cos(a) * 0.128, Math.sin(a) * 0.128],
      [0.07, 0.019, 0.16],
      BRASS_DARK,
      DULL,
      a,
    )
  }
  // Five studs, because a wheel with no fixings is a plate.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3
    slab(body, [0.05, Math.cos(a) * 0.044, Math.sin(a) * 0.044], [0.026, 0.018, 0.018], BRASS, POLISHED, a)
  }

  /*
    The disc and the caliper, inboard of the rim.

    Drawn *behind* the spokes so you see it through them, which is where a
    brake actually is, and it is the one part of the car that changes colour
    from something you did rather than something you pressed.
  */
  drum(body, [-0.014, 0, 0], 0.148, 0.012, DISC, BRAKE_DISC, SIDES, 'x', 0.07)
  slab(body, [-0.034, 0.14, 0.02], [0.055, 0.1, 0.08], IRON, DULL)

  return body.build()
}

export const WHEEL_POSITIONS: [number, number, number][] = [
  [-AXLE_HALF_TRACK, WHEEL_RADIUS, AXLE_FRONT],
  [AXLE_HALF_TRACK, WHEEL_RADIUS, AXLE_FRONT],
  [-AXLE_HALF_TRACK, WHEEL_RADIUS, AXLE_REAR],
  [AXLE_HALF_TRACK, WHEEL_RADIUS, AXLE_REAR],
]

/**
 * Where each coilover's top mount sits on the body.
 *
 * Inside the arch, under its lip, which is where a strut actually lives. The
 * first attempt put them at shoulder height just inboard of the flares — so
 * four brass springs stood *proud of the bodywork* on top of the wings, and
 * from the front the car had a pair of exhaust stacks growing out of each
 * wing. Suspension you can see is good; suspension you can see because it is
 * on the outside of the car is a modelling mistake.
 */
export const SPRING_MOUNT_Y = 0.69
export const SPRING_POSITIONS: [number, number, number][] = [
  [-AXLE_HALF_TRACK + 0.08, SPRING_MOUNT_Y, AXLE_FRONT],
  [AXLE_HALF_TRACK - 0.08, SPRING_MOUNT_Y, AXLE_FRONT],
  [-AXLE_HALF_TRACK + 0.08, SPRING_MOUNT_Y, AXLE_REAR],
  [AXLE_HALF_TRACK - 0.08, SPRING_MOUNT_Y, AXLE_REAR],
]

/** A vector kept here so callers do not allocate one per frame. */
export const CAR_SCRATCH = new Vector3()
