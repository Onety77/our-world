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
  Points,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three'
import { basisAt, roadPoint, type RoadBasis, type TunnelChunk } from './geometry'
import { random } from './model'
import { STORMCROWN, emptyRoad, roadAt, vergeWidth, type Track } from './track'

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

function addPeak(mesh: CourseMesh, track: Track, s: number, side: number, seed: number) {
  const road = roadAt(track, s)
  const basis = basisAt(road, { fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })
  const sides = 7
  // Well beyond the edge-stone rhythm. At forty metres these filled half the
  // frame as black triangles; at this distance fog makes them a horizon.
  const radius = 34 + hash3(seed, 3, 8) * 34
  const n = side * (road.width + 135 + hash3(seed, 8, 2) * 120)
  const high = 55 + hash3(seed, 9, 4) * 52
  const base = mesh.count
  for (let k = 0; k < sides; k++) {
    const angle = (k / sides) * Math.PI * 2
    roadPoint(road, n + Math.cos(angle) * radius, -12, point, basis)
    point.x += basis.fx * Math.sin(angle) * radius
    point.z += basis.fz * Math.sin(angle) * radius
    tint.copy(PEAK).multiplyScalar(0.78 + hash3(seed, k, 1) * 0.25)
    mesh.vertex(point, tint, 0.5, 1)
  }
  roadPoint(road, n + (hash3(seed, 1, 1) - 0.5) * 8, high, point, basis)
  mesh.vertex(point, PEAK, 0.4, 1)
  for (let k = 0; k < sides; k++) mesh.triangle(base + k, base + ((k + 1) % sides), base + sides)
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

const SKY_FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vDirection;
  uniform float uTime;
  float hash(vec3 p) { return fract(sin(dot(floor(p), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDirection);
    float h = d.y * 0.5 + 0.5;
    float cloud = hash(d * 18.0 + vec3(uTime * 0.008, 0.0, 0.0));
    cloud = smoothstep(0.3, 0.78, cloud + (1.0 - h) * 0.24);
    vec3 zenith = vec3(0.025, 0.045, 0.060);
    vec3 horizon = vec3(0.18, 0.22, 0.24);
    vec3 colour = mix(horizon, zenith, smoothstep(0.18, 0.84, h));
    colour = mix(colour, vec3(0.27, 0.30, 0.31), cloud * 0.45);
    float pulse = pow(max(0.0, sin(uTime * 0.34)), 96.0);
    float fork = smoothstep(0.82, 1.0, hash(d * 92.0 + vec3(floor(uTime * 0.054))));
    colour += vec3(0.58, 0.72, 0.78) * pulse * (0.15 + fork * 0.85);
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
  void main() {
    vec3 p = position;
    p.y = mod(p.y - uTime * 31.0 + 26.0, 52.0) - 26.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp(145.0 / max(1.0, -mv.z), 1.0, 4.5);
    gl_Position = projectionMatrix * mv;
  }
`

const RAIN_FRAG = /* glsl */ `
  precision mediump float;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float line = 1.0 - smoothstep(0.06, 0.18, abs(p.x));
    float ends = smoothstep(0.5, 0.28, abs(p.y));
    gl_FragColor = vec4(0.66, 0.78, 0.82, line * ends * 0.46);
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
      size: Math.max(maxX - minX, maxZ - minZ) + 2600,
    }
  }, [track])

  const sky = useMemo(() => new ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: BackSide,
    uniforms: { uTime: { value: 0 } },
  }), [])
  const cloud = useMemo(() => new ShaderMaterial({
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
  }), [])
  const rain = useMemo(() => new ShaderMaterial({
    vertexShader: RAIN_VERT,
    fragmentShader: RAIN_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
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
    const rng = random(track.seed ^ 0x5f27a1)
    const positions = new Float32Array(540 * 3)
    for (let i = 0; i < 540; i++) {
      positions[i * 3] = (rng() * 2 - 1) * 62
      positions[i * 3 + 1] = (rng() * 2 - 1) * 26
      positions[i * 3 + 2] = (rng() * 2 - 1) * 82
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
  })

  return (
    <>
      <mesh position={[bounds.x, bounds.y, bounds.z]} frustumCulled={false} material={sky}>
        <sphereGeometry args={[5200, 28, 16]} />
      </mesh>
      <mesh
        position={[bounds.x, bounds.y, bounds.z]}
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
