/**
 * How a tree is grown.
 *
 * One generator, used by the wood around the garden and by the great tree that
 * stands for the Tree of Thoughts, so a landmark is the same species as the
 * treeline behind it rather than a different idea of what a tree is.
 *
 * ---------------------------------------------------------------------------
 * Two earlier attempts at this were wrong, and it is worth saying how.
 *
 * The first was a cylinder with two or three balls balanced on it. Every tree
 * had the same silhouette, so a hundred of them read as a hundred copies of
 * one sprite — mushrooms.
 *
 * The second — this one's immediate predecessor — added a leaning bole and a
 * ring of limbs with leaf clusters hung off the ends, and it still read as
 * broccoli. The reason is worth writing down, because it is not obvious and it
 * cost two rounds: **the crown was one level deep.** Limbs all left the trunk
 * at roughly one height, all ran to roughly one length, and every cluster
 * therefore ended up at roughly one radius from the middle. Twenty blobs
 * sitting on a sphere of the same radius *are* a sphere. More blobs made it
 * worse, not better.
 *
 * What actually makes a tree read as a tree:
 *
 *  1. **Recursion with apical dominance.** A limb does not simply end — it
 *     splits into a *main* continuation that carries on nearly straight and a
 *     shorter *lateral* that leaves at a real angle. That asymmetry is what
 *     botany calls apical dominance and it is the single strongest structural
 *     cue. Symmetric forking gives you a diagram of a tree; this gives a tree.
 *  2. **Leaves only at the last tips.** Foliage hangs off the *tertiary* ends,
 *     so it inherits the branching's own clustering — the crown comes out as
 *     several distinct masses, one per major limb, instead of a shell.
 *  3. **Gaps.** You must be able to see sky through a crown. A convex outer
 *     surface with no holes in it is the ball-of-leaves look, whatever it is
 *     made of.
 *  4. **Taper by area.** Da Vinci's rule: the cross-section of a limb equals
 *     the sum of its children's. Radii that shrink by roughly 1/√2 per split
 *     are why a real tree looks structurally sound and a hand-tuned one does
 *     not.
 *
 * Everything comes back as `FormInstance[]` for `buildInstanced`, so a whole
 * wood is still two draw calls.
 * ---------------------------------------------------------------------------
 */

import { BufferGeometry, Float32BufferAttribute } from 'three'
import { pick, range, type Rng } from '@/systems/rng'
import type { FormInstance } from './forms'

/**
 * Muted throughout — the art direction bans saturated greens, so these run
 * through moss, sage, olive and a dry ochre rather than anything leafy.
 */
const CANOPY = [
  '#49543a',
  '#3f4a33',
  '#55603f',
  '#3a4430',
  '#5c6042',
  '#666a45',
  '#6e6c4a',
  '#717148',
] as const

/**
 * Much lighter than they look written down, and they have been lightened
 * twice. The form shader multiplies by a shade term (about 0.73 down the side
 * of a vertical trunk) and then again by the ambient light level, so a brown
 * picked to look right in a colour picker lands near black on screen — and a
 * black trunk under a green crown is a lollipop however well the crown is
 * built.
 */
const BARK = ['#6a5c4e', '#756453', '#5f5347', '#7a6553', '#635749'] as const

/** The three ways a tree here can be shaped. */
export type Species = 'broad' | 'tall' | 'open'

export interface TreeOptions {
  /** Where the foot of the tree sits, in world space. */
  at: [number, number, number]
  height: number
  species: Species
  rng: Rng
  /** Multiplies every radius. The landmark tree is the wood's tree, grown heavier. */
  girth?: number
  /** 0 turns the leaf mass off entirely, for a bare winter shape. */
  leafiness?: number
  /**
   * One more level of branching, and more foliage on each tip.
   *
   * A tree in the wood is read at fifty metres and wants the cheapest
   * silhouette that holds up; the Tree of Thoughts is read at twenty-three and
   * is the oldest thing in the garden.
   */
  density?: number
  /**
   * How many cards the crown is made of, as a fraction — and the level of
   * detail that actually matters.
   *
   * The leaves are the tree. A wood of a hundred and fifty was drawing seven
   * hundred cards *each* — a hundred and six thousand quads, sixty per cent of
   * everything in the garden — for trees standing seventy metres off with the
   * fog already half way through them. At that range one leaf is three pixels
   * across, so the crown is not being read leaf by leaf; it is a mass with a
   * silhouette, and a third as many cards makes exactly the same mass.
   *
   * The cards grow to compensate — by one over the square root, so the leaf
   * *area* comes out where it was and the crown does not go thin. That is the
   * whole trick, and it is why this is a detail setting rather than simply
   * fewer leaves: fewer leaves is a balder tree, and this is not.
   *
   * 1 is every leaf. Leave it alone for anything you stand under.
   */
  leafDetail?: number
}

export interface TreeParts {
  wood: FormInstance[]
  leaves: FormInstance[]
  /**
   * Points on the underside of the outer limbs, in the order they were grown.
   *
   * What a letter hangs from. Deterministic for a given seed, which is what
   * makes it safe to key a stored thought to one by index.
   */
  hangs: [number, number, number][]
}

/**
 * One leaf.
 *
 * **Not a ball.** Leaf clusters were squashed icosahedra, and however hard
 * they were squashed and tumbled they read as clumps of green cotton wool
 * stuck to the branches — the single thing left that still made this tree look
 * made rather than grown.
 *
 * Real foliage in games is *cards*: flat planes, several per spray, angled
 * apart. Without a texture to cut leaf shapes out of one, the plane has to be
 * the leaf — so this is a small pointed lens, five vertices and four
 * triangles, with its spine lifted out of plane.
 *
 * That fold is the important part. A perfectly flat card has one normal and
 * therefore one shade, and a spray of them comes out as flat chips of colour;
 * lifting the spine gives each leaf two faces at different angles, so it
 * catches the light down one side and turns away on the other exactly as a
 * leaf does.
 */
export function leafGeometry(): BufferGeometry {
  const w = 0.5
  const fold = 0.16

  const v = [
    [0, 0, 0], // stalk
    [-w, 0.42, 0], // left shoulder
    [w, 0.42, 0], // right shoulder
    [0, 0.5, fold], // the spine, lifted
    [0, 1, 0], // tip
  ]
  const faces = [
    [0, 1, 3],
    [0, 3, 2],
    [1, 4, 3],
    [3, 4, 2],
  ]

  const position: number[] = []
  for (const [a, b, c] of faces) {
    position.push(...v[a], ...v[b], ...v[c])
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(position, 3))
  // Per-face normals, so the fold actually reads as a fold rather than being
  // smoothed away into the same flat card it is trying not to be.
  geo.computeVertexNormals()
  return geo
}

const SHAPE: Record<
  Species,
  {
    /** Fraction of total height that is clear bole before the first split. */
    clear: [number, number]
    /** How many times a limb may split before it ends in leaves. */
    depth: number
    /** Daughter length as a fraction of its parent — main, then lateral. */
    main: [number, number]
    lateral: [number, number]
    /** How far off its parent each daughter leaves, in radians. */
    mainAngle: [number, number]
    lateralAngle: [number, number]
    /** Chance a split throws a second lateral instead of one. */
    forked: number
    /** Multiplies the size of a leaf cluster. */
    leaf: number
  }
> = {
  /*
    Spreading and heavy — the tree you would sit under.

    **Weak apical dominance**, and that is the whole difference. A tree that
    keeps a strong leader grows tall and narrow; one that lets its laterals run
    nearly as far as its main grows *outward*, which is what a spreading crown
    is. Written the other way round — laterals well short of the main, as they
    are for 'tall' below — this came out as a bare pole with a tuft on top, a
    palm rather than an oak. It also starts branching low, because the point of
    the shape is that the crown begins not far above your head.
  */
  broad: {
    clear: [0.15, 0.22],
    depth: 4,
    main: [0.6, 0.7],
    lateral: [0.66, 0.8],
    mainAngle: [0.14, 0.34],
    lateralAngle: [0.72, 1.15],
    forked: 0.62,
    leaf: 1.15,
  },
  // narrow and high — the ones that make a treeline ragged
  tall: {
    clear: [0.4, 0.52],
    depth: 4,
    main: [0.76, 0.86],
    lateral: [0.45, 0.58],
    mainAngle: [0.05, 0.16],
    lateralAngle: [0.42, 0.7],
    forked: 0.25,
    leaf: 0.82,
  },
  // sparse, so the branches themselves are part of the silhouette
  open: {
    clear: [0.32, 0.44],
    depth: 3,
    main: [0.66, 0.76],
    lateral: [0.58, 0.72],
    mainAngle: [0.16, 0.36],
    lateralAngle: [0.62, 1.0],
    forked: 0.6,
    leaf: 0.92,
  },
}

type Vec = [number, number, number]

function norm([x, y, z]: Vec): Vec {
  const l = Math.hypot(x, y, z) || 1
  return [x / l, y / l, z / l]
}

/**
 * Turn a direction away from itself by `angle`, about a bearing `spin`.
 *
 * Builds a frame whose "up" is the current direction, so the turn is relative
 * to where the limb is already pointing rather than to the world. A limb that
 * tilted relative to the world would straighten itself out as it climbed,
 * which is exactly the pole this generator exists to avoid.
 */
function turn(dir: Vec, angle: number, spin: number): Vec {
  const [dx, dy, dz] = dir
  // any vector not parallel to dir will do for the first cross product
  const ref: Vec = Math.abs(dy) > 0.95 ? [1, 0, 0] : [0, 1, 0]
  const sx = ref[1] * dz - ref[2] * dy
  const sy = ref[2] * dx - ref[0] * dz
  const sz = ref[0] * dy - ref[1] * dx
  const [ux, uy, uz] = norm([sx, sy, sz])
  const vx = dy * uz - dz * uy
  const vy = dz * ux - dx * uz
  const vz = dx * uy - dy * ux

  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const cs = Math.cos(spin)
  const sn = Math.sin(spin)

  return norm([
    dx * c + (ux * cs + vx * sn) * s,
    dy * c + (uy * cs + vy * sn) * s,
    dz * c + (uz * cs + vz * sn) * s,
  ])
}

/**
 * The lean and spin that make the form shader point a unit cylinder along `dir`.
 *
 * Must match the GLSL in forms.ts exactly, which applies lean about X, then
 * about Z, then spins about Y. Solving that for a given direction gives a tilt
 * from vertical and a bearing, and nothing else — which is why `lean.y` is
 * always zero here.
 */
function orient(dir: Vec): { lean: [number, number]; rot: number } {
  const [dx, dy, dz] = dir
  const tilt = Math.acos(Math.max(-1, Math.min(1, dy)))
  const bearing = Math.atan2(-dx, dz)
  return { lean: [tilt, 0], rot: bearing }
}

export function growTree({
  at,
  height,
  species,
  rng,
  girth = 1,
  leafiness = 1,
  density = 1,
  leafDetail = 1,
}: TreeOptions): TreeParts {
  const shape = SHAPE[species]
  const wood: FormInstance[] = []
  const leaves: FormInstance[] = []
  const hangs: [number, number, number][] = []

  const [ox, oy, oz] = at
  // One phase for the whole tree, so its parts move together in the wind
  // instead of each limb keeping its own time.
  const phase = rng() * Math.PI * 2
  const bark = pick(rng, BARK)

  const maxDepth = shape.depth + (density > 1.6 ? 1 : 0)

  /**
   * Lays one limb down as two slightly bent segments.
   *
   * Returns both where it ended and which way it was pointing when it got
   * there — the bend means those are two different things, and a child grown
   * off the original direction would visibly hinge backwards at the joint.
   */
  function segment(
    from: Vec,
    dir: Vec,
    length: number,
    radius: number,
  ): { tip: Vec; heading: Vec } {
    const half = length / 2
    // A limb that bends partway along reads as grown; a straight one reads as
    // a stick, and no amount of branching on top of sticks fixes that.
    const bent = turn(dir, range(rng, 0.04, 0.15), rng() * Math.PI * 2)

    let cursor = from
    for (const [d, r] of [
      [dir, radius] as const,
      [bent, radius * 0.86] as const,
    ]) {
      const { lean, rot } = orient(d)
      wood.push({
        offset: [ox + cursor[0], oy + cursor[1], oz + cursor[2]],
        scale: [r, half, r],
        rot,
        lean,
        anchorY: cursor[1],
        phase,
        color: bark,
      })
      cursor = [
        cursor[0] + d[0] * half,
        cursor[1] + d[1] * half,
        cursor[2] + d[2] * half,
      ]
    }
    return { tip: cursor, heading: bent }
  }

  /**
   * A spray of leaves off the end of a limb.
   *
   * Each leaf points its own way, out of a wide cone around wherever the limb
   * was heading. Fanning them like this rather than scattering them in a ball
   * is what makes a spray read as attached to its branch: the leaves all come
   * *from* somewhere.
   */
  function foliage(tip: Vec, heading: Vec, length: number) {
    if (leafiness <= 0) return

    /*
      How big a leaf is, and how many.

      Sized off the limb carrying it — a heavy branch wears heavy foliage — but
      with a floor tied to the tree rather than to the branch. Without the
      floor the deepest limbs, which are the ones that carry most of the crown,
      got leaves a few centimetres across, and the outside of the tree went
      bald while the maths said it was covered.
    */
    const size =
      Math.max(height * 0.021, length * range(rng, 0.42, 0.62)) *
      shape.leaf *
      leafiness *
      // Fewer cards, each bigger by one over the root, so the crown keeps its
      // area and its silhouette. See `leafDetail`.
      (1 / Math.sqrt(leafDetail))
    const many = Math.max(
      4,
      Math.round(range(rng, 12, 20) * Math.min(density, 1.7) * leafDetail),
    )

    for (let i = 0; i < many; i++) {
      // Golden angle round the limb, so successive leaves never stack into a
      // plane, and a wide cone so the spray opens out rather than spiking.
      const out = turn(heading, range(rng, 0.3, 1.35), i * 2.399 + rng() * 0.6)
      // Spread along a length that never collapses with the branch, for the
      // same reason the size has a floor: a spray bunched into a point is a
      // blob again, whatever it is made of.
      const along = range(rng, -0.15, 0.8) * Math.max(length, height * 0.055)
      const { lean, rot } = orient(out)

      leaves.push({
        offset: [
          ox + tip[0] + out[0] * along,
          oy + tip[1] + out[1] * along,
          oz + tip[2] + out[2] * along,
        ],
        scale: [size * range(rng, 0.75, 1.25), size * range(rng, 0.85, 1.35), size],
        rot,
        lean,
        anchorY: tip[1] + out[1] * along,
        phase,
        color: pick(rng, CANOPY),
      })
    }

    /*
      Somewhere a letter could hang from.

      Under the tip and a little out from it — where a paper on a thread would
      actually sit, in clear air below the leaves rather than inside them.
      Recorded in growth order, which is deterministic for a seed, so a thought
      can be keyed to one by index.
    */
    hangs.push([
      ox + tip[0] + heading[0] * 0.25,
      /*
        Well clear of the spray, not inside it.

        The spray itself now reaches about eight tenths of a limb-length in
        every direction, downward included, so a drop measured against the limb
        alone still left the paper among the leaves. This clears the bottom of
        the foliage and then some — a letter you have to look *for* in a tree
        is a letter nobody reads.
      */
      oy + tip[1] - Math.max(length, height * 0.055) * range(rng, 1.15, 1.6) - 0.5,
      oz + tip[2] + heading[2] * 0.25,
    ])
  }

  function grow(from: Vec, dir: Vec, length: number, radius: number, depth: number) {
    const { tip, heading } = segment(from, dir, length, radius)

    if (depth >= maxDepth || length < height * 0.045) {
      foliage(tip, heading, length)
      return
    }

    /*
      Foliage on the inner branches too, not only at the very ends.

      Leaves only at the last tips left the middle of the crown bare — you
      could see straight through to the sky between the limbs, and a tree with
      a hollow middle reads as one that has been stripped. A lighter spray one
      level in fills it without closing the gaps that make it a crown rather
      than a ball.
    */
    if (depth >= maxDepth - 1 && leafiness > 0) {
      foliage(tip, heading, length * 0.62)
      // ...but no letter hangs from an inner branch: they are hard to see and
      // harder to reach for.
      hangs.pop()
    }

    // Where round the trunk this split faces. Golden angle so successive
    // splits never stack into a plane, plus jitter so it never looks counted.
    const spin = depth * 2.399 + rng() * Math.PI * 2

    /*
      Apical dominance: the main carries on nearly straight and long, the
      lateral leaves at a real angle and is markedly shorter. Radii shrink by
      about 1/root-2 between them, so the two children's cross-sections add up
      to the parent's — da Vinci's rule, and the reason this looks like it
      could hold its own weight.
    */
    grow(
      tip,
      turn(heading, range(rng, shape.mainAngle[0], shape.mainAngle[1]), spin + Math.PI),
      length * range(rng, shape.main[0], shape.main[1]),
      radius * 0.78,
      depth + 1,
    )

    const laterals = rng() < shape.forked ? 2 : 1
    for (let i = 0; i < laterals; i++) {
      grow(
        tip,
        turn(
          heading,
          range(rng, shape.lateralAngle[0], shape.lateralAngle[1]),
          spin + (i * Math.PI * 2) / laterals + range(rng, -0.4, 0.4),
        ),
        length * range(rng, shape.lateral[0], shape.lateral[1]),
        radius * (laterals === 2 ? 0.56 : 0.64),
        depth + 1,
      )
    }
  }

  // --- the bole -------------------------------------------------------------
  const clear = height * range(rng, shape.clear[0], shape.clear[1])
  const radius = height * 0.032 * girth * range(rng, 0.88, 1.15)
  const lean = turn([0, 1, 0], range(rng, 0.01, 0.07), rng() * Math.PI * 2)

  /*
    How long the first limb above the bole should be, so the finished tree is
    `height` tall.

    This is not `height - clear`, and getting that wrong made a fifteen-metre
    tree come out at thirty-three. Each split's *main* child carries on at
    about three-quarters of its parent and very close to vertical, so the trunk
    keeps climbing after the first limb ends: the total is the whole geometric
    chain, not just its first term. Summing the series and dividing by it is
    the only way `height` means anything to a caller.
  */
  const ratio = (shape.main[0] + shape.main[1]) / 2
  let chain = 0
  let term = 1
  for (let i = 0; i <= maxDepth; i++) {
    chain += term
    term *= ratio
  }

  const bole = segment([0, 0, 0], lean, clear, radius)
  grow(bole.tip, bole.heading, (height - clear) / chain, radius * 0.86, 0)

  return { wood, leaves, hangs }
}

/** Picks a species with a bias, so a wood is mostly one thing and not a sampler. */
export function speciesFor(rng: Rng): Species {
  const r = rng()
  if (r < 0.55) return 'broad'
  if (r < 0.85) return 'tall'
  return 'open'
}
