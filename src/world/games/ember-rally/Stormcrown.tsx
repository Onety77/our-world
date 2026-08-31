/**
 * The Stormcrown — a high road through weather.
 *
 * The road geometry is baked into short cullable chunks. The only things that
 * move are one field of rain and three small shaders for sky, cloud and falling
 * water, so the longest rally course does not become the most expensive frame.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  Points,
  ShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
} from 'three'
import { basisAt, roadPoint, type RoadBasis, type TunnelChunk } from './geometry'
import { random } from './model'
import {
  CLOUD_TOP,
  GALE_TOWARD,
  STORMCROWN,
  emptyRoad,
  roadAt,
  vergeWidth,
  type Track,
} from './track'
import { storm } from './weather'
import { StormcrownSound } from './StormcrownSound'

const RING = 2
const CHUNK = 60
const PROFILE = 13

const ROAD = new Color('#3b4143')
const ROAD_WORN = new Color('#53595a')
const ROAD_HIGH = new Color('#4c5158')
const ROAD_FALL = new Color('#303a3d')
const EDGE = new Color('#aab0ae')
const SHOULDER = new Color('#283331')
const CLIFF = new Color('#161d20')
const PEAK = new Color('#2b3538')
/** What the tops go above the cloud line. Not white: starlight on old snow. */
const SNOW = new Color('#8e9aa6')
const CEDAR = new Color('#132b27')
const CEDAR_PALE = new Color('#25413a')
const BARK = new Color('#332d2a')
const ROD = new Color('#84999e')

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

  triangle(a: number, b: number, c: number) {
    this.index.push(a, b, c)
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
        mesh.vertex(point, color, 0.34, rough)
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

function addCedarTier(
  mesh: CourseMesh,
  road: ReturnType<typeof emptyRoad>,
  basis: RoadBasis,
  n: number,
  y: number,
  radius: number,
  high: number,
  color: Color,
) {
  const sides = 6
  const base = mesh.count
  for (let k = 0; k < sides; k++) {
    const angle = (k / sides) * Math.PI * 2
    roadPoint(road, n + Math.cos(angle) * radius, y + Math.sin(angle) * radius * 0.1, point, basis)
    point.x += basis.fx * Math.sin(angle) * radius
    point.y += basis.fy * Math.sin(angle) * radius
    point.z += basis.fz * Math.sin(angle) * radius
    mesh.vertex(point, color, 0.42, 1)
  }
  roadPoint(road, n, y + high, point, basis)
  mesh.vertex(point, color, 0.35, 1)
  for (let k = 0; k < sides; k++) mesh.triangle(base + k, base + ((k + 1) % sides), base + sides)
}

function addCedar(mesh: CourseMesh, track: Track, s: number, side: number, seed: number) {
  const road = roadAt(track, s)
  const basis = basisAt(road, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
  const n = side * (road.width + vergeWidth(road.room) + 2.2 + hash3(seed, 2, 4) * 5.2)
  const height = 8 + hash3(seed, 5, 7) * 8
  addBox(mesh, road, basis, n, -0.3, 0.22, 0.22, height * 0.54, BARK, 1)
  for (let tier = 0; tier < 4; tier++) {
    const t = tier / 4
    addCedarTier(
      mesh,
      road,
      basis,
      n,
      height * (0.18 + t * 0.16),
      height * (0.22 - t * 0.028),
      height * (0.48 - t * 0.055),
      (seed + tier) % 3 === 0 ? CEDAR_PALE : CEDAR,
    )
  }
}

/**
 * The mountains, which are the only thing on this road you cannot drive to.
 *
 * ---------------------------------------------------------------------------
 * **A cone is not a mountain. It is a triangle, and at any distance it reads as
 * exactly that: one flat shape, one flat colour, pasted on the sky.**
 *
 * These were seven-sided cones with a single apex, and at the summit — the one
 * place on this road where you can see anything at all — the nearest of them
 * was a black triangle sitting in a starfield. Three things fix it, and they
 * are all about refusing to be one shape:
 *
 *   a ridge, not a peak   three summits of different heights on one massif,
 *                         the tallest off-centre. A real mountain seen from
 *                         one side is a *line* with high points in it
 *   an uneven skirt       eleven sides at varying radius, so no two facets
 *                         catch the light alike and the silhouette has
 *                         shoulders in it
 *   snow above the cloud  the upper slopes go pale, and — the part that
 *                         matters — the line where they do is the same height
 *                         the cloud tops out at. So from up in the clear the
 *                         peaks are the only other things above the weather,
 *                         and they are lit like you are
 *
 * That last one is why they are worth having at all: without it, a mountain in
 * the dark is a hole in the sky. With it, it is the thing that tells you how
 * high you have come.
 * ---------------------------------------------------------------------------
 */
function addPeak(mesh: CourseMesh, track: Track, s: number, side: number, seed: number) {
  const road = roadAt(track, s)
  const basis = basisAt(road, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
  const SIDES = 11
  const FOOT = -12

  // Well beyond the edge-stone rhythm: at forty metres these fill the frame.
  const radius = 38 + hash3(seed, 3, 8) * 40
  const n = side * (road.width + 135 + hash3(seed, 8, 2) * 120)
  const high = 62 + hash3(seed, 9, 4) * 58

  /*
    How pale the rock is at a given height.

    Zero below the cloud tops and climbing to nearly white above them. The
    comparison is against the *world's* cloud height rather than against this
    mountain's own summit, so a low hill stays dark and a tall one is capped —
    which is the difference between snow and a gradient.
  */
  const paleAt = (y: number) => {
    const above = (road.y + y - CLOUD_TOP) / 26
    return Math.max(0, Math.min(1, above))
  }

  const put = (offN: number, offF: number, y: number, jitter: number) => {
    roadPoint(road, n + offN, y, point, basis)
    point.x += basis.fx * offF
    point.z += basis.fz * offF
    tint
      .copy(PEAK)
      .lerp(SNOW, paleAt(y) * 0.86)
      .multiplyScalar(0.76 + jitter * 0.3)
    mesh.vertex(point, tint, 0.35, 1)
    return mesh.count - 1
  }

  // The skirt: eleven points, none of them at the same distance out.
  const skirt: number[] = []
  for (let k = 0; k < SIDES; k++) {
    const angle = (k / SIDES) * Math.PI * 2
    const r = radius * (0.72 + hash3(seed, k, 5) * 0.62)
    skirt.push(put(Math.cos(angle) * r, Math.sin(angle) * r, FOOT, hash3(seed, k, 1)))
  }

  /*
    Three summits along one line, and the line is not square to the road.

    Set across the massif on a bearing of its own so the ridge is seen at an
    angle from the car rather than end-on or broadside — end-on is a cone
    again, and broadside is a wall.
  */
  const bearing = hash3(seed, 2, 7) * Math.PI
  const spread = radius * 0.52
  const tops: number[] = []
  for (let i = 0; i < 3; i++) {
    const along = (i - 1) * spread
    // Tallest off-centre, and the other two well below it.
    const drop = i === 1 ? 0 : 0.24 + hash3(seed, i, 11) * 0.26
    const y = high * (1 - drop)
    tops.push(
      put(
        Math.cos(bearing) * along + (hash3(seed, i, 3) - 0.5) * 9,
        Math.sin(bearing) * along,
        y,
        hash3(seed, i, 9),
      ),
    )
  }

  // Skirt to whichever summit is nearest round the ring, so the slopes fall
  // away toward the shoulders rather than all meeting at one point.
  for (let k = 0; k < SIDES; k++) {
    const next = (k + 1) % SIDES
    const share = Math.floor((k / SIDES) * 3 + 0.5) % 3
    mesh.triangle(skirt[k], skirt[next], tops[share])
  }
  // And the ridge itself, closing the gaps between the three.
  mesh.triangle(tops[0], tops[1], skirt[Math.floor(SIDES * 0.15)])
  mesh.triangle(tops[1], tops[2], skirt[Math.floor(SIDES * 0.65)])
}

/** The mountain road in the same cullable format as the other two courses. */
export function buildStormcrown(track: Track): TunnelChunk[] {
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
      const grounded = s < STORMCROWN.cloudShelf.from || s > STORMCROWN.stormfall.to
      const wall = road.width + vergeWidth(road.room) + (grounded ? 8 : 0)
      const offsets = [
        -wall, -wall, -road.width, -road.width * 0.92, -road.width * 0.62,
        -road.width * 0.31, 0,
        road.width * 0.31, road.width * 0.62, road.width * 0.92, road.width,
        wall, wall,
      ]
      const drop = grounded ? -0.52 : -3.8
      const heights = [drop, 0.06, 0.025, 0.04, 0.052, 0.062, 0.068, 0.062, 0.052, 0.04, 0.025, 0.06, drop]
      const base = mesh.count

      for (let k = 0; k < PROFILE; k++) {
        roadPoint(road, offsets[k], heights[k], point, basis)
        const roadSurface = k >= 2 && k <= 10
        const roadEdge = k === 2 || k === 10
        const shoulder = k === 1 || k === 11
        let color = CLIFF
        let wet = road.wet * 0.55
        let rough = 0.95
        if (roadEdge) {
          tint.copy(EDGE).multiplyScalar(0.74 + hash3(ring, k, 6) * 0.2)
          color = tint
          wet = road.wet
          rough = 0.2
        } else if (roadSurface) {
          const away = Math.abs(offsets[k] - road.line)
          const worn = 1 - Math.min(1, Math.max(0, (away - 0.3) / 1.25))
          const district = s >= STORMCROWN.stormfall.from ? ROAD_FALL : s >= STORMCROWN.cloudShelf.from ? ROAD_HIGH : ROAD
          tint.copy(district).lerp(ROAD_WORN, worn * 0.42)
          tint.multiplyScalar((ring % 6 === 0 ? 0.78 : 1) * (0.91 + hash3(ring, k, 2) * 0.13))
          color = tint
          wet = road.wet
          rough = 0.08
        } else if (shoulder) {
          color = SHOULDER
          wet = road.wet * 0.75
        }
        mesh.vertex(point, color, wet, rough)
      }

      if (ring > first) {
        const previous = base - PROFILE
        for (let k = 0; k < PROFILE - 1; k++) mesh.quad(previous + k, previous + k + 1, base + k + 1, base + k)
      }
    }
  }

  const chunkFor = (s: number) => Math.max(0, Math.min(chunkCount - 1, Math.floor(s / CHUNK)))
  const rng = random(track.seed ^ 0x2d7619)

  // The close forest falls away as the road reaches cloud, then returns low.
  let treeSeed = 1
  for (let s = 28; s < track.finishAt - 30; s += 24 + rng() * 24) {
    const forest = s < STORMCROWN.cloudShelf.from - 60 || s > STORMCROWN.stormfall.to - 40
    if (!forest) continue
    const side = rng() < 0.5 ? -1 : 1
    addCedar(meshes[chunkFor(s)], track, s, side, treeSeed++)
    if (s < STORMCROWN.rainwood.to && rng() > 0.46) {
      const other = Math.min(track.finishAt - 40, s + 8 + rng() * 13)
      addCedar(meshes[chunkFor(other)], track, other, -side, treeSeed++)
    }
  }

  // Low, irregular edge stones: visible consequence without a modern rail.
  for (let s = STORMCROWN.cloudShelf.from; s < STORMCROWN.stormfall.to; s += 17) {
    const at = roadAt(track, s)
    const frame = basisAt(at, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
    for (const side of [-1, 1]) {
      if (hash3(s, side, 9) < 0.2) continue
      addBox(
        meshes[chunkFor(s)], at, frame,
        side * (at.width + vergeWidth(at.room) - 0.2),
        0.02, 0.28 + hash3(s, side, 2) * 0.28, 0.2,
        0.42 + hash3(s, side, 3) * 0.52, EDGE,
      )
    }
  }

  // Distant silhouettes repeat slowly enough to establish scale, not clutter.
  let peakSeed = 400
  for (let s = STORMCROWN.cloudShelf.from + 70; s < STORMCROWN.lastRun.from; s += 235) {
    const side = peakSeed % 2 === 0 ? -1 : 1
    addPeak(meshes[chunkFor(s)], track, s, side, peakSeed++)
  }

  // Slender old rods are both lightning landmarks and metre-reading at speed.
  for (const s of STORMCROWN.lightningRods) {
    if (s >= track.length) continue
    const at = roadAt(track, s)
    const frame = basisAt(at, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
    const side = Math.floor(s / 100) % 2 === 0 ? -1 : 1
    addBox(meshes[chunkFor(s)], at, frame, side * (at.width + 2.2), 0, 0.16, 0.12, 5.5, ROD, 0.35)
    addBox(meshes[chunkFor(s)], at, frame, side * (at.width + 2.2), 5.5, 0.28, 0.28, 0.22, EDGE, 0.2)
  }

  for (const stone of track.gate) {
    const at = roadAt(track, stone.s)
    const frame = basisAt(at, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
    addBox(meshes[chunkFor(stone.s)], at, frame, stone.n, 0, 0.52, 0.4, 3.2, EDGE)
  }

  return meshes.map((mesh, index) => {
    const geometry = mesh.build()
    if (!geometry.boundingSphere) geometry.boundingSphere = new Sphere()
    return { ...spans[index], geometry }
  })
}

const SKY_VERT = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/*
  Three skies, and which one you are looking at is decided by how far you have
  climbed.

  -----------------------------------------------------------------------------
  It was one sky before: a grey wash with a perfectly even flash on a sine. That
  is defensible for a road at one height and this road climbs ninety metres
  through weather, so it threw away the only thing it had that the other two
  roads cannot have.

    below   heavy overcast, moving. No stars — there is a mile of water above
            you and you should not be able to see through it
    inside  no sky at all. The cloud *is* the sky, and it is bright: what takes
            the world away up here is whiteness, not darkness
    above   clear, black, and full of stars. Everything the first two bands
            were withholding

  The stars fade in only in the third band, which is what makes coming out of
  the top of the cloud land — you have not seen one for two kilometres.
  -----------------------------------------------------------------------------
*/
const SKY_FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vDirection;
  uniform float uTime;
  uniform float uInCloud;
  uniform float uAbove;
  uniform float uFlash;
  float hash(vec3 p) { return fract(sin(dot(floor(p), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }

  /*
    The same hash, interpolated — and the difference is not subtle.

    ------------------------------------------------------------------------
    The hash floors what it is given, so it is constant over each unit cell of its
    input. Sampled at fourteen times a unit direction that is about thirty cells
    across the whole sky, each one a flat block of grey with a hard edge: the
    overcast rendered as a **checkerboard**, which is what it had been doing all
    along and what nobody had seen because nobody had looked at this road with
    the sky in frame.

    Smoothing between the eight corners of the cell costs eight hashes instead
    of one and turns exactly the same field into cloud. The frequency goes up
    with it, because the reason it was so low was presumably an attempt to keep
    the blocks from reading as noise — which they did anyway, as blocks.
    ------------------------------------------------------------------------
  */
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(
        mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y),
      mix(
        mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y),
      f.z);
  }

  void main() {
    vec3 d = normalize(vDirection);
    float h = d.y * 0.5 + 0.5;

    // --- under the storm: overcast, and it is moving ---
    float roll = noise(d * 7.0 + vec3(uTime * 0.02, 0.0, 0.0)) * 0.62
               + noise(d * 17.0 + vec3(uTime * 0.05, 0.0, 0.0)) * 0.38;
    roll = smoothstep(0.3, 0.78, roll + (1.0 - h) * 0.26);
    vec3 low = mix(vec3(0.14, 0.17, 0.19), vec3(0.03, 0.05, 0.06), smoothstep(0.15, 0.85, h));
    low = mix(low, vec3(0.22, 0.25, 0.27), roll * 0.5);

    // --- above it: clear, and the stars are the reward ---
    vec3 high = mix(vec3(0.05, 0.07, 0.13), vec3(0.005, 0.008, 0.02), smoothstep(0.1, 0.8, h));
    float star = step(0.9986, hash(d * 520.0)) * smoothstep(0.24, 0.6, h);
    high += vec3(0.8, 0.86, 1.0) * star * 0.9;

    // --- inside it: no sky, only cloud, and it is bright ---
    float grain = noise(d * 22.0 + vec3(uTime * 0.05, uTime * 0.02, 0.0));
    vec3 inside = vec3(0.70, 0.75, 0.77) + (grain - 0.5) * 0.11;

    vec3 colour = mix(low, high, uAbove);
    colour = mix(colour, inside, uInCloud);

    /*
      The stroke. Overhead when you are under the storm; from *below* the
      horizon when you are above it, because up there the weather is
      underneath you and that is the whole picture the climb is for.
    */
    float overhead = smoothstep(0.35, 1.0, h);
    float underneath = smoothstep(0.45, 0.0, h);
    float where = mix(overhead, underneath, uAbove);
    colour += vec3(0.62, 0.74, 0.82) * uFlash * where * (0.35 + uInCloud * 1.1);

    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const CLOUD_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const CLOUD_FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vWorld;
  uniform float uTime;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
      mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  void main() {
    vec2 p = vWorld.xz * 0.018 + vec2(uTime * 0.009, -uTime * 0.004);
    float cloud = noise(p) * 0.5 + noise(p * 2.03 + 9.2) * 0.32 + noise(p * 4.1) * 0.18;
    float edge = smoothstep(0.38, 0.72, cloud);
    float distanceFade = 1.0 - smoothstep(120.0, 1200.0, distance(cameraPosition.xz, vWorld.xz));
    // A cloud sea is a horizon once you have climbed above it, not a ceiling
    // over Rainwood. This also eases it away while the road passes through.
    float above = smoothstep(3.0, 18.0, cameraPosition.y - vWorld.y);
    vec3 colour = mix(vec3(0.18, 0.22, 0.23), vec3(0.47, 0.52, 0.53), edge);
    gl_FragColor = vec4(colour, edge * (0.17 + distanceFade * 0.16) * above);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const RAIN_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uRain;
  /** Where the weather is going, in world x/z, times how hard it is blowing. */
  uniform vec2 uWind;
  varying float vRain;
  /** Which way "down" is for a drop, on the screen. */
  varying vec2 vSlant;
  void main() {
    vec3 p = position;
    p.y = mod(p.y - uTime * 31.0 + 22.0, 44.0) - 22.0;
    /*
      Rain falls along the wind, and this is the whole of the gale being
      visible.

      A drop's real velocity is thirty-one metres a second downward plus
      whatever the wind is doing sideways, so the direction it *streaks* in is
      that sum — put through the view matrix, which turns it into the direction
      the streak should lie on the screen. Not an authored angle: it is the
      same storm.wind that is shoving the car, so the rain leans over at the moment
      the steering goes light and stands up again the moment you are back among
      the cedars.

      A w of nought, because this is a direction and not a place.
    */
    vec4 fall = viewMatrix * vec4(uWind.x, -31.0, uWind.y, 0.0);
    vSlant = normalize(fall.xy + vec2(0.0, -0.0001));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    /*
      Thinning rain takes drops *away* rather than making every drop fainter.

      Fading the whole field to 20% opacity is fog, not weather — the drops all
      stay exactly where they were and simply go grey. Killing them off by a
      stable per-drop threshold means the ones that remain are as sharp as they
      ever were and there are visibly fewer of them, which is what easing rain
      actually looks like. The x of a drop is fixed for its whole life, so a
      given drop always dies at the same rain level rather than flickering.
    */
    float keep = fract(sin(position.x * 91.7 + position.z * 47.3) * 43758.5453);
    vRain = uRain;
    // Driven rain is longer rain. Half again in the worst of it, which is
    // enough to read as hard weather without turning into hail.
    float driven = 1.0 + length(uWind) * 0.026;
    gl_PointSize = keep > uRain ? 0.0 : clamp(145.0 * driven / max(1.0, -mv.z), 1.0, 7.0);
    gl_Position = projectionMatrix * mv;
  }
`

const RAIN_FRAG = /* glsl */ `
  precision mediump float;
  varying float vRain;
  varying vec2 vSlant;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    // Turn the streak to lie along the way the drop is actually going. The
    // sprite is square and axis-aligned; the rain is not.
    p = vec2(dot(p, vec2(vSlant.y, -vSlant.x)), dot(p, vSlant));
    float line = 1.0 - smoothstep(0.06, 0.18, abs(p.x));
    float ends = smoothstep(0.5, 0.28, abs(p.y));
    // A little softer as it eases off, on top of there being fewer of them.
    float body = 0.30 + vRain * 0.16;
    gl_FragColor = vec4(0.66, 0.78, 0.82, line * ends * body);
  }
`

const FALL_FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  float hash(vec2 p) { return fract(sin(dot(floor(p), vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float stream = hash(vec2(floor(vUv.x * 38.0), floor((vUv.y + uTime * 0.55) * 28.0)));
    float threads = smoothstep(0.56, 0.9, stream) * smoothstep(0.02, 0.14, vUv.x) * smoothstep(0.98, 0.84, vUv.x);
    float fade = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.72, vUv.y);
    gl_FragColor = vec4(0.52, 0.72, 0.76, (0.12 + threads * 0.44) * fade);
  }
`

const FALL_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** Sky, cloud ocean, near-camera rain and the three Stormfall ribbons. */
export function StormcrownWorld({ track }: { track: Track }) {
  const rainRef = useRef<Points>(null)
  const cloudRef = useRef<Mesh>(null)
  const skyRef = useRef<Mesh>(null)
  const bounds = useMemo(() => {
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 0; i < track.x.length; i += 20) {
      minX = Math.min(minX, track.x[i])
      maxX = Math.max(maxX, track.x[i])
      minY = Math.min(minY, track.y[i])
      maxY = Math.max(maxY, track.y[i])
      minZ = Math.min(minZ, track.z[i])
      maxZ = Math.max(maxZ, track.z[i])
    }
    return {
      x: (minX + maxX) * 0.5,
      z: (minZ + maxZ) * 0.5,
      y: minY + (maxY - minY) * 0.43,
      // Where the cloud's own surface lies. See CLOUD_TOP.
      floorY: minY + CLOUD_TOP,
      size: Math.max(maxX - minX, maxZ - minZ) + 2600,
    }
  }, [track])

  const sky = useMemo(() => new ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: BackSide,
    uniforms: {
      uTime: { value: 0 },
      uInCloud: { value: 0 },
      uAbove: { value: 0 },
      uFlash: { value: 0 },
    },
  }), [])
  const cloud = useMemo(() => new ShaderMaterial({
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uInCloud: { value: 0 },
      uAbove: { value: 0 },
      uFlash: { value: 0 },
    },
  }), [])
  const rain = useMemo(() => new ShaderMaterial({
    vertexShader: RAIN_VERT,
    fragmentShader: RAIN_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uRain: { value: 0 }, uWind: { value: new Vector2() } },
  }), [])
  const fall = useMemo(() => new ShaderMaterial({
    vertexShader: FALL_VERT,
    fragmentShader: FALL_FRAG,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
  }), [])
  const rainGeometry = useMemo(() => {
    /*
      Enough drops, close enough, to actually be rain.

      ---------------------------------------------------------------------
      This was five hundred and forty of them spread through a box a hundred
      and twenty metres wide, sixty deep and a hundred and sixty long — about
      one drop in every two thousand cubic metres. Rendered, that is a handful
      of specks somewhere near the horizon, and the road whose entire subject
      is a storm had rain you could not see.

      It went unnoticed because nothing measures it and because it is not
      *wrong* anywhere: every drop is in the right place, doing the right
      thing. There are just nowhere near enough of them, and they are nowhere
      near you.

      Two and a half thousand in a box a third the size is roughly thirty times
      the density and puts most of them inside twenty metres, where the point
      sprite is at full size. Twenty-five hundred points costs nothing — the
      grass in the garden proper is twenty thousand blades — and it is the
      difference between weather and a rumour of weather.

      It also matters for the gale: the drops slant with the wind (see
      `uWind`), which is the one visible cause the sideways force on the car
      has. A slant on a speck nobody can see is not a cause of anything.
      ---------------------------------------------------------------------
    */
    const DROPS = 2500
    const rng = random(track.seed ^ 0x5f27a1)
    const positions = new Float32Array(DROPS * 3)
    for (let i = 0; i < DROPS; i++) {
      positions[i * 3] = (rng() * 2 - 1) * 30
      positions[i * 3 + 1] = (rng() * 2 - 1) * 22
      positions[i * 3 + 2] = (rng() * 2 - 1) * 38
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    return geometry
  }, [track.seed])
  const falls = useMemo(() => STORMCROWN.waterfalls.map((s, index) => {
    const road = roadAt(track, s)
    const basis = basisAt(road, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
    const side = index % 2 === 0 ? -1 : 1
    const at = roadPoint(road, side * (road.width + 10 + index * 2), 11, new Vector3(), basis)
    return { at: at.toArray() as [number, number, number], rotation: road.heading - Math.PI / 2, width: 11 + index * 4 }
  }), [track])

  useEffect(() => () => {
    sky.dispose()
    cloud.dispose()
    rain.dispose()
    fall.dispose()
    rainGeometry.dispose()
  }, [sky, cloud, rain, fall, rainGeometry])

  useFrame(({ camera }, delta) => {
    const step = Math.min(0.05, delta)
    sky.uniforms.uTime.value += step
    cloud.uniforms.uTime.value += step
    rain.uniforms.uTime.value += step
    fall.uniforms.uTime.value += step
    rainRef.current?.position.copy(camera.position)
    skyRef.current?.position.copy(camera.position)

    /*
      And the weather, which the race works out from the height of the road —
      see `storm`. Copied rather than computed here so the sky, the cloud floor,
      the rain and the shared light block can never be describing different
      afternoons.
    */
    for (const material of [sky, cloud, rain]) {
      const u = material.uniforms
      if (!u.uInCloud) continue
      u.uInCloud.value = storm.inCloud
      u.uAbove.value = storm.above
      u.uFlash.value = storm.flash
    }
    /*
      The rain takes only the one number, and it took none at all before this.

      Its uniforms were `{ uTime }`, so the loop above skipped it on the
      `uInCloud` guard and every drop on the mountain fell at the same rate
      from the forest floor to clear air. It is separate from the loop rather
      than joining it because the drops genuinely do not want the flash: a lit
      raindrop is a white speck, and a field of them is snow.
    */
    rain.uniforms.uRain.value = storm.rain
    /*
      Eighteen metres a second at the top of a gust, which against thirty-one of
      falling is a streak leaning about thirty degrees off vertical — hard
      enough to be unmistakable from inside a car, nowhere near the horizontal
      rain that would read as a bug in the shader.
    */
    rain.uniforms.uWind.value.set(GALE_TOWARD.x * storm.wind * 18, GALE_TOWARD.z * storm.wind * 18)

    /*
      The cloud floor sits at the top of the cloud rather than in the middle of
      the map.

      Which is the difference between a grey plane somewhere near the road and a
      thing you climb *out of*: above the top you are looking down at its
      surface, below it you are underneath a ceiling, and inside it you cannot
      see it at all because it is everywhere. It only had one job and it was
      being parked at a fixed fraction of the road's height, so it was a lid the
      whole way up.
    */
    cloudRef.current?.position.setY(bounds.floorY)
    if (cloudRef.current) cloudRef.current.visible = storm.inCloud < 0.92
  })

  return (
    <>
      <StormcrownSound track={track} />
      {/*
        Sixteen hundred metres, and it travels with you.

        It was fifty-two hundred, centred on the middle of the track — which is
        more than twice the camera's own far plane, so the entire dome was
        clipped away and every one of these four and a half kilometres was
        looking at the flat background colour. The sky shader had never once
        been on screen. A dome has to be inside the far plane, and on a road
        this long the only way to guarantee that is to carry it.
      */}
      <mesh ref={skyRef} frustumCulled={false} material={sky}>
        <sphereGeometry args={[1600, 28, 16]} />
      </mesh>
      <mesh
        position={[bounds.x, bounds.y, bounds.z]}
        ref={cloudRef}
        rotation={[-Math.PI / 2, 0, 0]}
        frustumCulled={false}
        material={cloud}
      >
        <planeGeometry args={[bounds.size, bounds.size, 1, 1]} />
      </mesh>
      {falls.map((waterfall, index) => (
        <mesh
          key={STORMCROWN.waterfalls[index]}
          position={waterfall.at}
          rotation={[0, waterfall.rotation, 0]}
          material={fall}
          renderOrder={1}
        >
          <planeGeometry args={[waterfall.width, 31 + index * 5, 1, 1]} />
        </mesh>
      ))}
      <points ref={rainRef} geometry={rainGeometry} material={rain} frustumCulled={false} renderOrder={4} />
    </>
  )
}
