/**
 * The Drowned Mile — what the Moonbreak looks like once it goes under.
 *
 * ---------------------------------------------------------------------------
 * The causeway spends a kilometre of its middle *below* the water it has been
 * crossing, and this file owns everything that is only true down there: the
 * glass, the surface seen from underneath, what swims past it, and the drift
 * of things falling through the dark.
 *
 * Kept apart from `Moonbreak` for one reason that matters. Everything in that
 * file is built once into the road's own chunks — stone, trees, reeds — and
 * never thinks again. Everything in this one **moves**, and moving things are
 * the ones that have to be counted: a shark, two shoals and a few hundred
 * grains of falling silt is a budget, and a budget wants a wall around it. The
 * whole of the Drowned Mile is four extra draw calls.
 *
 * It is also the cheapest kilometre on either road, which is not an accident.
 * Water takes the fog from 62–235 metres down to 15–95, and the far end of a
 * straight you can no longer see is a far end nobody has to draw. The one
 * place on the Moonbreak with fish in it draws less than the one place with
 * trees.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type RootState } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three'
import { basisAt, roadPoint } from './geometry'
import { MOONBREAK, WATER_Y, roadAt, vergeWidth, type Track } from './track'
import { deep } from './depth'

/**
 * The same fog the rest of the game uses, for the three things here that draw
 * themselves. See the note in `depth`.
 */
const FOGGED = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  vec3 intoTheWater(vec3 colour, vec3 world, float lit) {
    float away = distance(cameraPosition, world);
    float fog = smoothstep(uFogNear, uFogFar, away);
    // Additive things fade *out* rather than fading to the fog colour: a glow
    // that turns into fog-coloured glow at distance is a glow that never goes
    // away, and the far end of the tube ends up brighter than the near end.
    return mix(colour, uFogColor * lit, fog) * (1.0 - fog * lit);
  }
`

/** How far apart the glass is stitched, in metres along the road. */
const STITCH = 4
/** How many points across the arc, from one verge over the top to the other. */
const ARC = 13
/**
 * How long a cullable length of glass is, in metres.
 *
 * Eighty. Short enough that the frustum is throwing away most of the tube at
 * any moment, long enough that a kilometre is a dozen draw calls rather than a
 * hundred — the two costs this is between, and both of them bite on a phone.
 */
const GLASS_CHUNK = 80

/**
 * How far the glass springs out past the verge, and how high it stands.
 *
 * ---------------------------------------------------------------------------
 * The tube has to do two contradictory things: be obviously *there*, so that
 * being underwater reads as being inside something rather than as the road
 * having turned green — and be almost entirely absent, so what you are looking
 * at is the water and the road. Both were got wrong first: at 1.4 metres of
 * clearance it was a pipe and the car felt posted through it, and at 6 it was
 * a dome you could not tell you were under.
 *
 * Two and a bit metres past the verge, standing a little over the height of
 * the lamps. Which puts the glass close enough that the ribs strobe past at
 * speed, and far enough that the road never looks narrower than it is.
 * ---------------------------------------------------------------------------
 */
const GLASS_OUT = 2.25
const GLASS_UP = 1.18

function tubeSpan(track: Track): { from: number; to: number } {
  return {
    from: Math.max(2, MOONBREAK.deep.under.in - 16),
    to: Math.min(track.length - 2, MOONBREAK.deep.under.out + 16),
  }
}

/**
 * The glass, in lengths that can be culled.
 *
 * ---------------------------------------------------------------------------
 * A half-tube swept down the road: `ARC` points from the left verge, over the
 * top and down to the right, stitched every `STITCH` metres. Two attributes
 * ride along with it — how far around the arc a vertex sits, and how far along
 * the tube — because both are wanted by the shader and neither can be
 * recovered from a position once the road has bent.
 *
 * **Cut into lengths, and this is the important part.** It was one nine-hundred
 * metre mesh with culling switched off, which is defensible for the road (it is
 * opaque, and depth throws away what it cannot see) and indefensible for this.
 * The glass is additive and does not write depth, so *every* ring in front of
 * the camera is blended over every other one: looking down the tube meant
 * something like two hundred full-screen layers of transparent shading, every
 * frame, most of them fogged to nothing and all of them paid for. A desktop
 * shrugs. A phone does not, and a phone that takes too long inside one frame
 * does not slow down — the driver decides it has hung and takes the context
 * away, which arrives up in the interface as the level quitting to the menu.
 *
 * In eighty-metre lengths the frustum throws away everything behind and beside
 * you before a fragment is shaded, and the `discard` in the shader throws away
 * the far half of what is left. Same picture, a fraction of the fill.
 * ---------------------------------------------------------------------------
 */
function buildGlass(track: Track): BufferGeometry[] {
  const { from, to } = tubeSpan(track)
  const lengths: BufferGeometry[] = []
  for (let cut = from; cut < to; cut += GLASS_CHUNK) {
    lengths.push(oneLength(track, cut, Math.min(to, cut + GLASS_CHUNK)))
  }
  return lengths
}

function oneLength(track: Track, from: number, to: number): BufferGeometry {
  const rings = Math.max(2, Math.round((to - from) / STITCH))
  const position: number[] = []
  const around: number[] = []
  const along: number[] = []
  const index: number[] = []
  const point = new Vector3()

  for (let r = 0; r <= rings; r++) {
    const s = from + ((to - from) * r) / rings
    const road = roadAt(track, s)
    const basis = basisAt(road, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
    const half = road.width + vergeWidth(road.room) + GLASS_OUT
    for (let a = 0; a < ARC; a++) {
      const t = a / (ARC - 1)
      const angle = Math.PI * t
      // An ellipse rather than a circle: a semicircle over a six-metre road is
      // three metres of headroom nobody looks at and a very tall thing to draw.
      const n = -Math.cos(angle) * half
      const y = -0.12 + Math.sin(angle) * (half * 0.52 + GLASS_UP)
      roadPoint(road, n, y, point, basis)
      position.push(point.x, point.y, point.z)
      around.push(t)
      /*
        Wrapped, not the raw distance down the road.

        This used to carry `s` itself, which reaches two thousand — and it is a
        mediump varying, which on a real mobile GPU has about three decimal
        digits. At the far end of the tube the smallest step it can represent
        is bigger than one metre, so every pattern built on it here (the ribs,
        the seams, the caustics, the grime) degenerates into blocks. On the
        desktop and in the software renderer, where mediump is quietly highp,
        it looked perfect. Wrapping every 64 metres keeps it small and costs
        nothing: everything downstream is periodic anyway, and 64 is a whole
        number of the 8-metre rib spacing so the seam never shows.
      */
      along.push(s % 64)
    }
  }

  for (let r = 0; r < rings; r++) {
    for (let a = 0; a < ARC - 1; a++) {
      const base = r * ARC + a
      const next = base + ARC
      index.push(base, next, next + 1, base, next + 1, base + 1)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setAttribute('aAround', new BufferAttribute(new Float32Array(around), 1))
  geometry.setAttribute('aAlong', new BufferAttribute(new Float32Array(along), 1))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  if (!geometry.boundingSphere) geometry.boundingSphere = new Sphere()
  return geometry
}

const GLASS_VERT = /* glsl */ `
  precision mediump float;
  attribute float aAround;
  attribute float aAlong;
  varying float vAround;
  varying float vAlong;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vAround = aAround;
    vAlong = aAlong;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

/*
  Glass is the hardest thing here to get right, and the reason is that a sheet
  of clean glass between you and the thing you want to look at is *nothing*.
  Drawn honestly it disappears, and then the Drowned Mile is a green road with
  no tube on it at all.

  So what is drawn is not the glass, it is the four things that make you
  believe in glass: the grazing angle at the edges where a curved pane goes
  bright and opaque, the seams where the panes meet, the dirt that collects on
  something that has been under water for a long time, and one moving band of
  light where the surface above is throwing caustics down onto it.

  Additive, and never writing depth. It is a thing light passes through, and a
  transparent surface that writes depth is a surface that quietly deletes every
  fish behind it.
*/
const GLASS_FRAG = /* glsl */ `
  precision mediump float;
  varying float vAround;
  varying float vAlong;
  varying vec3 vWorld;
  varying vec3 vNormal;
  uniform float uTime;
  uniform float uDeep;
  uniform vec3 uTint;
  ${FOGGED}

  void main() {
    vec3 eye = normalize(cameraPosition - vWorld);
    // Grazing angle. Straight ahead the pane is invisible; at the sides it is
    // almost a mirror, which is exactly how a curved window behaves.
    float facing = abs(dot(normalize(vNormal), eye));
    float graze = pow(1.0 - facing, 2.6);

    // The seams between panes, along and around.
    float ribs = smoothstep(0.86, 1.0, abs(sin(vAlong * 0.7854)));
    float mullion = smoothstep(0.90, 1.0, abs(cos(vAround * 12.566)));
    float frame = max(ribs * 0.55, mullion * 0.35);

    // Caustics: the surface, thrown down the inside of the tube.
    float c1 = sin(vAlong * 0.21 + uTime * 0.9 + vAround * 5.1);
    float c2 = sin(vAlong * 0.13 - uTime * 0.62 + vAround * 8.3);
    float caustic = pow(max(0.0, c1 * 0.5 + c2 * 0.5) * 0.5 + 0.5, 6.0);
    // Strongest overhead, because that is where the surface is.
    caustic *= smoothstep(0.16, 0.5, vAround) * smoothstep(0.84, 0.5, vAround);

    // A long time under water.
    float grime = smoothstep(0.55, 1.0, abs(sin(vAlong * 0.037 + vAround * 2.3)));

    /*
      Quiet. Much quieter than the first version, which drew the tube at full
      strength and produced a ribbed white pipe you could not see the water
      through — the exact opposite of the point of building it out of glass.
      What is wanted is a surface you notice at the edges of the frame and
      forget in the middle of it.
    */
    vec3 colour = uTint * (graze * 0.30 + frame * 0.22);
    colour += vec3(0.62, 0.94, 0.98) * caustic * 0.14;
    colour *= 1.0 - grime * 0.4;

    // Gone entirely when the road is not under the water: the same geometry
    // stands above the surface at both mouths, and glass in open air here
    // would be a pipe over the causeway.
    float alpha = (graze * 0.34 + frame * 0.3 + caustic * 0.18) * uDeep;
    /*
      The far half of the tube adds nothing, and this is where it stops costing
      anything. Additive blending has no early-out of its own — a fragment that
      contributes zero is still shaded, still blended, still written — so with
      a hundred rings between the camera and the vanishing point, the fragments
      that make no difference to the picture were most of the work in it.
    */
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(intoTheWater(colour * uDeep, vWorld, 1.0), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * What swims past.
 *
 * ---------------------------------------------------------------------------
 * One instanced geometry for every living thing in the Drowned Mile — two
 * shoals and the shark — because the alternative is thirty meshes and this
 * runs on a phone. Each instance carries where it belongs in the shoal and how
 * big it is, and the *swimming* happens in the vertex shader: the body flexes
 * along its own length, which is the single cue that separates a fish from a
 * floating wedge, and it costs one sine.
 *
 * They are placed relative to the road rather than in world space, so a shoal
 * stays beside the tube through the sweeps instead of being left behind by the
 * first corner. The path they follow is the road's own — sampled once, held as
 * a ribbon of points — which is also what the shark hunts along.
 * ---------------------------------------------------------------------------
 */
const FISH_VERT = /* glsl */ `
  precision mediump float;
  attribute vec3 aSeat;
  attribute vec2 aSize;
  attribute float aPhase;
  varying float vShade;
  varying float vAlongBody;
  varying vec3 vWorld;
  uniform float uTime;
  uniform vec3 uOrigin;
  uniform vec3 uForward;
  uniform vec3 uRight;
  uniform float uSpread;

  void main() {
    // Where this one is hovering, in the road's own frame.
    float wander = sin(uTime * 0.6 + aPhase * 6.28) * 0.9;
    float rise = cos(uTime * 0.45 + aPhase * 4.1) * 0.7;
    vec3 seat = uOrigin
      + uRight * (aSeat.x * uSpread + wander)
      + vec3(0.0, aSeat.y + rise, 0.0)
      + uForward * aSeat.z;

    // The body, flexing. position.z runs nose to tail.
    float t = position.z * 0.5 + 0.5;
    vAlongBody = t;
    float beat = sin(uTime * 5.2 + aPhase * 6.28 - t * 3.4) * t * t * 0.42;

    vec3 local = vec3(position.x * aSize.x + beat * aSize.y, position.y * aSize.x, position.z * aSize.y);
    vec3 world = seat + uRight * local.x + vec3(0.0, local.y, 0.0) + uForward * local.z;

    vShade = 0.55 + position.y * 0.9;
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`

const FISH_FRAG = /* glsl */ `
  precision mediump float;
  varying float vShade;
  varying float vAlongBody;
  varying vec3 vWorld;
  uniform vec3 uColour;
  uniform float uDeep;
  // The numbers, not ${FOGGED} itself: a fish fades *into* the water rather
  // than out of it, so it wants the fog's range and not its blending rule.
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  void main() {
    // Pale along the belly, and the tail a shade darker than the head.
    vec3 colour = uColour * (vShade * (1.0 - vAlongBody * 0.35));
    /*
      Fish fade *into* the water rather than out of it — they are lit surfaces,
      not glows — so a distant one becomes a shape the colour of the murk and
      then stops being a shape. Which is the whole reason for having them: what
      is frightening about water is the range at which things resolve.
    */
    float away = distance(cameraPosition, vWorld);
    float fog = smoothstep(uFogNear, uFogFar, away);
    gl_FragColor = vec4(mix(colour, uFogColor, fog) * uDeep, (1.0 - fog * 0.85) * uDeep);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** A blunt six-sided body, nose at +z, that the vertex shader bends. */
function fishBody(): BufferGeometry {
  const position: number[] = []
  const index: number[] = []
  const rings = 6
  const sides = 5
  for (let r = 0; r <= rings; r++) {
    const t = r / rings
    const z = t * 2 - 1
    // Fat a third of the way back, tapering to nothing at the tail.
    const girth = Math.sin(Math.pow(1 - t, 0.62) * Math.PI) * 0.5 + 0.02
    for (let a = 0; a < sides; a++) {
      const angle = (a / sides) * Math.PI * 2
      position.push(Math.cos(angle) * girth, Math.sin(angle) * girth * 0.72, z)
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let a = 0; a < sides; a++) {
      const n = (a + 1) % sides
      const base = r * sides
      const next = base + sides
      index.push(base + a, next + a, next + n, base + a, next + n, base + n)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setIndex(index)
  return geometry
}

function shoalOf(
  count: number,
  seed: number,
  { small = 0.16, large = 0.3, low = 1.2, high = 6.7, long: lengthwise = 2.4, wide = 14 } = {},
): InstancedBufferGeometry {
  const base = fishBody()
  const geometry = new InstancedBufferGeometry()
  geometry.index = base.index
  geometry.setAttribute('position', base.getAttribute('position'))

  const seat = new Float32Array(count * 3)
  const size = new Float32Array(count * 2)
  const phase = new Float32Array(count)
  let n = seed
  const rnd = () => {
    n = (n * 1664525 + 1013904223) >>> 0
    return n / 4294967296
  }
  for (let i = 0; i < count; i++) {
    seat[i * 3] = rnd() * 2 - 1
    seat[i * 3 + 1] = low + rnd() * (high - low)
    seat[i * 3 + 2] = (rnd() * 2 - 1) * wide
    const scale = small + rnd() * (large - small)
    size[i * 2] = scale
    size[i * 2 + 1] = scale * lengthwise
    phase[i] = rnd()
  }
  geometry.setAttribute('aSeat', new InstancedBufferAttribute(seat, 3))
  geometry.setAttribute('aSize', new InstancedBufferAttribute(size, 2))
  geometry.setAttribute('aPhase', new InstancedBufferAttribute(phase, 1))
  geometry.instanceCount = count
  geometry.boundingSphere = new Sphere(new Vector3(), 400)
  return geometry
}

/**
 * Silt, falling.
 *
 * The one cue that costs almost nothing and does more than any of the others:
 * a few hundred specks drifting *down* past the glass. Still water with
 * nothing in it reads as fog. Water with things falling through it reads as
 * deep, because falling is what tells you which way is up and that there is a
 * great deal of it above you.
 *
 * Held in a box that follows the camera and wraps, so a hundred and eighty
 * grains cover a kilometre of road.
 */
const SNOW_VERT = /* glsl */ `
  precision mediump float;
  attribute vec3 aSeed;
  varying float vFade;
  uniform float uTime;
  uniform vec3 uAt;
  uniform float uBox;
  void main() {
    vec3 p = aSeed * uBox;
    // Down, slowly, wrapping through the box.
    p.y = mod(p.y - uTime * 0.55, uBox) - uBox * 0.5;
    p.x += sin(uTime * 0.3 + aSeed.z * 9.0) * 0.5;
    vec3 world = uAt + vec3(mod(p.x + uBox * 0.5, uBox) - uBox * 0.5, p.y, mod(p.z + uBox * 0.5, uBox) - uBox * 0.5);
    vec4 view = viewMatrix * vec4(world, 1.0);
    vFade = 1.0 - smoothstep(6.0, uBox * 0.5, length(view.xyz));
    gl_Position = projectionMatrix * view;
    gl_PointSize = (2.0 + aSeed.x * 2.0) * (12.0 / max(3.0, -view.z));
  }
`

const SNOW_FRAG = /* glsl */ `
  precision mediump float;
  varying float vFade;
  uniform float uDeep;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float soft = 1.0 - smoothstep(0.16, 0.5, d);
    gl_FragColor = vec4(vec3(0.66, 0.86, 0.88) * soft * vFade * uDeep * 0.4, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function snowCloud(count: number): BufferGeometry {
  const seed = new Float32Array(count * 3)
  let n = 20260825
  const rnd = () => {
    n = (n * 1664525 + 1013904223) >>> 0
    return n / 4294967296
  }
  for (let i = 0; i < count * 3; i++) seed[i] = rnd()
  const geometry = new BufferGeometry()
  geometry.setAttribute('aSeed', new BufferAttribute(seed, 3))
  /*
    And a `position`, which the shader never reads and the renderer needs.

    Points are drawn by counting the position attribute — no position, no
    count, nothing drawn, and *no error either*: the whole cloud was silently
    absent and looked exactly like a cloud that was working but subtle. The
    same three numbers serve, since the vertex shader rebuilds the point from
    `aSeed` anyway.
  */
  geometry.setAttribute('position', new BufferAttribute(seed.slice(), 3))
  geometry.boundingSphere = new Sphere(new Vector3(), 1e5)
  return geometry
}

/**
 * The Drowned Mile's moving half.
 *
 * `at` is where the camera is, handed in once a frame by the race so nothing
 * here has to search for it, and `s` is how far down the road the car has got
 * — which is what the shark paces and what keeps the shoals beside the tube
 * rather than behind it.
 */
export function Deepwater({ track }: { track: Track }) {
  const glass = useMemo(() => buildGlass(track), [track])
  /*
    Fewer and bigger than the first attempt, which used sixty small ones and
    produced a cloud of pale flecks — debris, not fish. What makes something
    read as alive at this distance is having a *silhouette*, and a silhouette
    needs to be several pixels long; thirty of those beat sixty specks, and
    cost less.
  */
  const shoalA = useMemo(() => shoalOf(22, 0x51f3, { small: 0.26, large: 0.42 }), [])
  const shoalB = useMemo(() => shoalOf(16, 0x9d21, { small: 0.3, large: 0.5, low: 3, high: 9 }), [])
  /*
    One instance, and it is eight metres of it.

    A shark is not a big fish, it is a different *kind* of shape — long, slow
    beat, almost no taper at the front. The body geometry is shared with the
    shoals because at this distance and through glass the silhouette is all
    there is, and what separates them is the numbers: three times the length
    for its girth, and a beat the vertex shader runs at a quarter of the rate.
  */
  const shark = useMemo(() => shoalOf(1, 0x2b7, { small: 1.05, large: 1.05, low: 0, high: 0, long: 3.6, wide: 0 }), [])
  const snow = useMemo(() => snowCloud(190), [])

  const glassMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: GLASS_VERT,
        fragmentShader: GLASS_FRAG,
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uDeep: { value: 0 },
          uTint: { value: new Vector3(0.42, 0.78, 0.84) },
          uFogColor: { value: new Color('#07242c') },
          uFogNear: { value: 15 },
          uFogFar: { value: 95 },
        },
      }),
    [],
  )

  const swimmer = (colour: [number, number, number], spread: number) =>
    new ShaderMaterial({
      vertexShader: FISH_VERT,
      fragmentShader: FISH_FRAG,
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: 0 },
        uColour: { value: new Vector3(...colour) },
        uOrigin: { value: new Vector3() },
        uForward: { value: new Vector3(0, 0, 1) },
        uRight: { value: new Vector3(1, 0, 0) },
        uSpread: { value: spread },
        uFogColor: { value: new Color('#07242c') },
        uFogNear: { value: 15 },
        uFogFar: { value: 95 },
      },
    })

  /*
    Dim, and only just the colour of anything.

    They were brighter than the road, which is exactly backwards: the car has
    headlights and the fish do not, so under water the fish should be *darker*
    than everything the lamps reach. What you should be able to see is that
    something is there and roughly how big — never what colour it is.
  */
  const materialA = useMemo(() => swimmer([0.15, 0.3, 0.29], 5.5), [])
  const materialB = useMemo(() => swimmer([0.19, 0.25, 0.31], 7), [])
  const materialShark = useMemo(() => swimmer([0.1, 0.14, 0.16], 0), [])
  const snowMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: SNOW_VERT,
        fragmentShader: SNOW_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uDeep: { value: 0 }, uAt: { value: new Vector3() }, uBox: { value: 44 } },
      }),
    [],
  )

  useEffect(
    () => () => {
      glass.forEach((length) => length.dispose())
      shoalA.dispose()
      shoalB.dispose()
      shark.dispose()
      snow.dispose()
      glassMaterial.dispose()
      materialA.dispose()
      materialB.dispose()
      materialShark.dispose()
      snowMaterial.dispose()
    },
    [glass, shoalA, shoalB, shark, snow, glassMaterial, materialA, materialB, materialShark, snowMaterial],
  )

  /**
   * Whether the driver has met these four programs yet.
   *
   * ---------------------------------------------------------------------------
   * **A shader is compiled the first frame the thing that uses it is drawn, and
   * that must never be the frame you enter the tunnel.**
   *
   * The glass, the two shoals and the shark are not drawn above the water —
   * which is right, and is most of what makes the Drowned Mile cheap — but it
   * also meant their programs had never been near the driver until `deep.at`
   * first crossed two per cent. That is a real GPU compiling and linking four
   * programs inside a single frame, at forty metres a second, at exactly the
   * moment the road tips under. On a desktop it is a stutter. On hardware with
   * a watchdog it can be long enough to be taken for a hang, and the context is
   * taken away — which does not present as a graphics fault at all: the canvas
   * comes back empty and the game is sitting on the course list again, as
   * though the level had quit.
   *
   * So they are compiled deliberately, on the first frame, while the start
   * lights are still counting down and nothing is moving. `renderer.compile`
   * rather than drawing them once, because the glass is frustum-culled now and
   * a culled mesh never reaches the driver however visible it is — the earlier
   * version of this warmed everything *except* the one thing that needed it.
   *
   * Once, and never again: the flag is on the component, so it survives the
   * attempt counter and costs nothing on a re-race.
   * ---------------------------------------------------------------------------
   */
  const warmed = useRef(false)

  const clock = useRef(0)
  const shoalMeshA = useRef<Mesh>(null)
  const shoalMeshB = useRef<Mesh>(null)
  const sharkMesh = useRef<Mesh>(null)
  const glassMeshes = useRef<Mesh[]>([])

  /*
    Where each swimmer sits is worked out from the road, once a frame.

    The alternative — bake them into world space when the track is built —
    looks right for about four seconds and then the road turns and the shoal is
    hanging over open water two hundred metres away. Sampling the road every
    frame costs three lookups and means a shoal keeps station beside the glass
    through the sweeps, which is where it is worth having.
  */
  const origin = useMemo(() => new Vector3(), [])
  const forward = useMemo(() => new Vector3(), [])
  const right = useMemo(() => new Vector3(), [])

  /**
   * Whether this has thrown, in which case it stops rather than keeps throwing.
   *
   * ---------------------------------------------------------------------------
   * The only `try` in the racer, and it is here for one reason: **everything in
   * this file is scenery, and no amount of scenery is worth the race.**
   *
   * A frame callback that throws does not fail politely. It takes the animation
   * loop with it, the world stops, and what the player sees is the level
   * quitting — not "the fish are missing". That is a wildly disproportionate
   * consequence for a shoal, and the components either side of this one (the
   * car, the road, the clock) are things whose failure genuinely should stop
   * everything, which is exactly why they are not wrapped and this is.
   *
   * It latches. A fault that happens once a frame is a fault that fills the
   * console sixty times a second and hides whatever came before it, so the
   * first one is reported and the Drowned Mile's moving half quietly retires
   * for the rest of the run. The tube, the light and the water are not in here
   * — they are declarative, they cannot throw, and they are what actually makes
   * the place. What is lost is the swimming.
   * ---------------------------------------------------------------------------
   */
  const gaveUp = useRef(false)

  useFrame((state, rawDelta) => {
    if (gaveUp.current) return
    try {
      swim(state, rawDelta)
    } catch (error) {
      gaveUp.current = true
      for (const mesh of [...glassMeshes.current, shoalMeshA.current, shoalMeshB.current, sharkMesh.current]) {
        if (mesh) mesh.visible = false
      }
      console.error('The Drowned Mile stopped moving, and the road carried on:', error)
    }
  })

  function swim(state: RootState, rawDelta: number) {
    const delta = Math.min(0.05, rawDelta)
    clock.current += delta
    const t = clock.current
    const at = deep.at

    const wear = (material: ShaderMaterial) => {
      const u = material.uniforms
      if (!u.uFogColor) return
      u.uFogColor.value.copy(deep.fog)
      u.uFogNear.value = deep.near
      u.uFogFar.value = deep.far
    }
    wear(glassMaterial)
    wear(materialA)
    wear(materialB)
    wear(materialShark)

    glassMaterial.uniforms.uTime.value = t
    glassMaterial.uniforms.uDeep.value = at
    snowMaterial.uniforms.uTime.value = t
    snowMaterial.uniforms.uDeep.value = at
    snowMaterial.uniforms.uAt.value.copy(state.camera.position)

    if (!warmed.current) {
      warmed.current = true
      // See `warmed`. Everything in the scene, which is more than is needed and
      // is the point — it happens once, before the flag drops.
      state.gl.compile(state.scene, state.camera)
    }

    // Nothing below here matters when the road is above the water, and the
    // whole of it is skipped rather than drawn at zero opacity.
    const showing = at > 0.02
    /*
      The tube is nine hundred metres of geometry that is invisible above the
      water, and "invisible" was doing that the expensive way — drawn in full,
      every triangle, multiplied by an opacity of zero. Above the surface it is
      not drawn at all now, which is most of the Moonbreak.
    */
    for (const length of glassMeshes.current) if (length) length.visible = showing
    if (shoalMeshA.current) shoalMeshA.current.visible = showing
    if (shoalMeshB.current) shoalMeshB.current.visible = showing
    if (sharkMesh.current) sharkMesh.current.visible = showing
    if (!showing) return

    const place = (
      material: ShaderMaterial,
      s: number,
      n: number,
      y: number,
    ) => {
      const road = roadAt(track, Math.max(2, Math.min(track.length - 2, s)))
      const basis = basisAt(road, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
      roadPoint(road, n, y, origin, basis)
      forward.set(basis.fx, basis.fy, basis.fz).normalize()
      right.set(basis.rx, basis.ry, basis.rz).normalize()
      material.uniforms.uTime.value = t
      material.uniforms.uDeep.value = at
      material.uniforms.uOrigin.value.copy(origin)
      material.uniforms.uForward.value.copy(forward)
      material.uniforms.uRight.value.copy(right)
    }

    /*
      The shoals hold a station beside the tube and slide slowly along it, so
      that at racing speed you overtake them — which is what makes them read as
      alive rather than as scenery bolted to the camera.
    */
    const here = deep.s
    place(materialA, here + 46 - ((t * 3) % 90), -9.5, 3.4)
    place(materialB, here + 62 - ((t * 2.2) % 120), 11, 6.2)

    /*
      And one large thing, crossing.

      It swims a long slow diagonal over the tube rather than beside it —
      overhead is where a shark is frightening, because you have to look up
      through the glass to find it and looking up is the one thing the road
      does not want you doing. It passes about every twenty seconds; often
      enough to be a feature of the place, rarely enough that the second time
      is still a surprise.
    */
    const cycle = (t % 21) / 21
    place(materialShark, here + 120 - cycle * 210, Math.cos(cycle * 6.283) * 26, 11.5 + Math.sin(cycle * 3.14) * 3.5)
    materialShark.uniforms.uSpread.value = 0
  }

  return (
    <>
      {/*
        Culled, unlike everything else here. See `buildGlass`: this is the one
        thing in the Drowned Mile big enough and transparent enough that being
        drawn when it cannot be seen is expensive rather than merely wasteful.
      */}
      {glass.map((length, i) => (
        <mesh
          key={i}
          ref={(node) => {
            if (node) glassMeshes.current[i] = node
          }}
          geometry={length}
          material={glassMaterial}
          renderOrder={2}
        />
      ))}
      <mesh ref={shoalMeshA} geometry={shoalA} material={materialA} frustumCulled={false} />
      <mesh ref={shoalMeshB} geometry={shoalB} material={materialB} frustumCulled={false} />
      <mesh ref={sharkMesh} geometry={shark} material={materialShark} frustumCulled={false} />
      <points geometry={snow} material={snowMaterial} frustumCulled={false} renderOrder={3} />
    </>
  )
}

export { WATER_Y }
