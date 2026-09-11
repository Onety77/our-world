/**
 * What moves in the air over the Nightfall.
 *
 * ---------------------------------------------------------------------------
 * `Nightlife` is what grows and shines; this is what *moves*, and every piece
 * of it is animated on the GPU from the race clock, so a thousand things in
 * the air cost the CPU nothing a frame:
 *
 *   **swallows** over the Meadow while there is light — dark darts flying
 *   loops low over the grass, wings beating, the last thing hunting before
 *   the night;
 *
 *   **bats** at both mouths of the Hollow and up in the room's dome, on
 *   paths that jink rather than curve;
 *
 *   **mist** lying on the Wellspring, drifting downstream, thickest at the
 *   fords;
 *
 *   **smoke** off the hearth, rising and spreading into the dome;
 *
 *   **motes** round each lantern of the walk, in that lantern's own colour
 *   (`sections/lanterns/Air` does this in the garden);
 *
 *   **leaves** coming down through the wood along the walk, turning as they
 *   fall, and landing where the litter is.
 *
 * All of it reads the road's light block, so the swallows are silhouettes
 * against the dusk and the motes glow in the dark exactly as the road's own
 * lamps do. Nothing here is solid and nothing is over the road lower than a
 * lantern; the physics never hears of any of it.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  NormalBlending,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three'
import { basisAt, roadPoint } from './geometry'
import { random } from './model'
import { NIGHTFALL, emptyRoad, roadAt, vergeWidth, type Track } from './track'
import { RIVER_HALF, type Land } from './nightfallLand'
import { roomAt } from './Nightfall'

const flatBasis = () => ({ fx: 0, fy: 0, fz: 1, rx: -1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 })

/* ---- the shaders ------------------------------------------------------------ */

/**
 * A flyer: a small quad carried round a loop about its own centre, turned to
 * point where it is going, its wings beating. `iLoop` is the loop's radii;
 * `iFly` is phase, speed, wingbeat and jink — a swallow banks round a smooth
 * loop, a bat has jink on top and changes its mind.
 */
const FLYER_VERT = /* glsl */ `
  attribute vec3 iCentre;
  attribute vec3 iLoop;
  attribute vec4 iFly;
  attribute float iSize;
  uniform float uClock;
  varying float vDepth;
  varying float vShade;
  vec3 along(float t) {
    float a = t * iFly.y + iFly.x;
    vec3 p = iCentre + vec3(iLoop.x * sin(a), iLoop.y * sin(a * 2.0 + iFly.x) * 0.5, iLoop.z * cos(a * 1.31 + 0.7));
    // Jink: quick changes of line, for a bat.
    p += iFly.w * vec3(sin(a * 7.3 + 1.0), sin(a * 9.1) * 0.5, cos(a * 6.7 + 2.0)) * 0.6;
    return p;
  }
  void main() {
    vec3 here = along(uClock);
    vec3 next = along(uClock + 0.04);
    vec3 forward = normalize(next - here + vec3(0.0001));
    vec3 wing = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
    // The wings beat: the span shrinks and lifts on the upstroke.
    float beat = sin(uClock * iFly.z + iFly.x * 3.0);
    float span = 0.65 + 0.35 * abs(beat);
    // A chevron, not a card: the wingtips swept back behind the head.
    float back = position.y * 0.6 - abs(position.x) * 0.9;
    vec3 p = here + wing * position.x * iSize * span + forward * back * iSize + vec3(0.0, position.x * position.x * iSize * beat * 0.5, 0.0);
    vShade = 0.5 + 0.5 * beat;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

/** Dark against the sky: a silhouette takes a little of the ambient and nothing else. */
const FLYER_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uAmbient;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uBody;
  varying float vDepth;
  varying float vShade;
  void main() {
    vec3 colour = uBody * uAmbient * (0.6 + vShade * 0.4);
    colour = mix(colour, uFogColor, smoothstep(uFogNear, uFogFar, vDepth));
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * A soft point: mist, smoke, a mote. `iSoft` is size, phase, rise and drift;
 * a rising one is born at its point, climbs, swells and fades; a lying one
 * drifts a little and breathes.
 */
const SOFT_VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute vec4 iSoft;
  attribute vec3 iTint;
  uniform float uClock;
  uniform float uPeriod;
  varying float vFade;
  varying vec3 vTint;
  varying float vDepth;
  varying vec3 vWorld;
  void main() {
    float rising = step(0.01, iSoft.z);
    float life = fract(iSoft.y + uClock / uPeriod);
    vec3 p = iAt;
    p.y += iSoft.z * life;
    p.x += sin(uClock * 0.23 + iSoft.y * 40.0) * iSoft.w * (0.4 + life * rising);
    p.z += cos(uClock * 0.19 + iSoft.y * 33.0) * iSoft.w * (0.4 + life * rising);
    float swell = mix(1.0, 1.0 + life * 2.6, rising);
    vFade = mix(0.7 + 0.3 * sin(uClock * 0.5 + iSoft.y * 50.0), (1.0 - life) * smoothstep(0.0, 0.12, life), rising);
    vTint = iTint;
    vWorld = p;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    gl_PointSize = iSoft.x * swell * (300.0 / max(2.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`

const SOFT_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uAmbient;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uAlpha;
  uniform float uGlow;
  uniform vec4 uLamps[10];
  uniform vec3 uLampColors[10];
  varying float vFade;
  varying vec3 vTint;
  varying float vDepth;
  varying vec3 vWorld;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float soft = 1.0 - smoothstep(0.2, 1.0, r);
    // Lit by the place and by whatever lamp or fire is near — smoke over a
    // hearth is lit from underneath, mist by the lamp at the ford — or its own light.
    vec3 lit = uAmbient * 2.2 + 0.03;
    for (int i = 0; i < 10; i++) {
      if (uLamps[i].w < 0.01) continue;
      float fall = max(0.0, 1.0 - length(uLamps[i].xyz - vWorld) / uLamps[i].w);
      lit += uLampColors[i] * fall * fall * 0.9;
    }
    vec3 colour = mix(vTint * lit, vTint, uGlow);
    float far = 1.0 - smoothstep(uFogNear, uFogFar, vDepth);
    gl_FragColor = vec4(colour, soft * vFade * uAlpha * far);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * A leaf falling: born high in the wood at its point, down at its own pace,
 * swaying and turning, and gone into the litter — then born again. Lit as
 * the wood's own leaves are.
 */
const LEAF_VERT = /* glsl */ `
  attribute vec3 iAt;
  /** x: phase, y: spin, z: size, w: fall in metres. */
  attribute vec4 iLeaf;
  attribute vec3 iTint;
  uniform float uClock;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vDepth;
  varying float vGlow;
  void main() {
    float life = fract(iLeaf.x + uClock * 0.045);
    vec3 p = iAt;
    p.y -= life * iLeaf.w;
    // Side to side as it falls, the way a leaf does, and drifting one way.
    p.x += sin(life * 14.0 + iLeaf.x * 20.0) * 0.5 + life * 1.2;
    p.z += cos(life * 11.0 + iLeaf.x * 15.0) * 0.4;
    // Turning about two axes.
    float a = uClock * iLeaf.y + iLeaf.x * 10.0;
    float b = uClock * iLeaf.y * 0.6 + iLeaf.x * 7.0;
    vec3 local = vec3(position.x, 0.0, position.y) * iLeaf.z;
    vec3 n = vec3(0.0, 1.0, 0.0);
    float ca = cos(a), sa = sin(a), cb = cos(b), sb = sin(b);
    local = vec3(local.x, local.y * ca - local.z * sa, local.y * sa + local.z * ca);
    n = vec3(n.x, n.y * ca - n.z * sa, n.y * sa + n.z * ca);
    local = vec3(local.x * cb - local.y * sb, local.x * sb + local.y * cb, local.z);
    n = vec3(n.x * cb - n.y * sb, n.x * sb + n.y * cb, n.z);
    // Landed: lie flat on the ground for the last of its life.
    float down = smoothstep(0.9, 1.0, life);
    local = mix(local, vec3(position.x, 0.0, position.y) * iLeaf.z, down);
    n = mix(n, vec3(0.0, 1.0, 0.0), down);
    vec3 world = p + local;
    vColor = iTint;
    vNormal = normalize(n);
    vWorld = world;
    vGlow = 0.0;
    vDepth = -(viewMatrix * vec4(world, 1.0)).z;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`

/** The same light every leaf on the road gets — see `Nightlife`'s LIT_FRAG. */
const LEAF_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uAmbient;
  uniform float uDaylight;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec4 uLamps[10];
  uniform vec3 uLampColors[10];
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vDepth;
  void main() {
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    float up = n.y * 0.5 + 0.5;
    vec3 colour = vColor * uAmbient * (0.35 + 0.65 * up);
    float facing = max(0.0, dot(n, uSunDir));
    vec3 day = vColor * (uSunColor * (0.3 + 0.7 * facing) + uSkyColor * (0.34 + 0.3 * up));
    colour = mix(colour, colour * 0.25 + day, uDaylight);
    for (int i = 0; i < 10; i++) {
      if (uLamps[i].w < 0.01) continue;
      vec3 toward = uLamps[i].xyz - vWorld;
      float dist = length(toward);
      float fall = max(0.0, 1.0 - dist / uLamps[i].w);
      fall *= fall;
      float lambert = max(dot(n, toward / max(dist, 0.001)), 0.0);
      colour += vColor * uLampColors[i] * fall * (0.3 + lambert * 0.7);
    }
    colour = mix(colour, uFogColor, smoothstep(uFogNear, uFogFar, vDepth));
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/* ---- the geometry ----------------------------------------------------------- */

function quad(): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  geometry.boundingSphere = new Sphere(new Vector3(), 1e5)
  return geometry
}

function flyers(centres: number[], loops: number[], fly: number[], sizes: number[]): InstancedBufferGeometry {
  const geometry = quad()
  geometry.setAttribute('iCentre', new InstancedBufferAttribute(new Float32Array(centres), 3))
  geometry.setAttribute('iLoop', new InstancedBufferAttribute(new Float32Array(loops), 3))
  geometry.setAttribute('iFly', new InstancedBufferAttribute(new Float32Array(fly), 4))
  geometry.setAttribute('iSize', new InstancedBufferAttribute(new Float32Array(sizes), 1))
  geometry.instanceCount = sizes.length
  return geometry
}

function softs(at: number[], soft: number[], tint: number[]): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(3), 3))
  geometry.setAttribute('iAt', new InstancedBufferAttribute(new Float32Array(at), 3))
  geometry.setAttribute('iSoft', new InstancedBufferAttribute(new Float32Array(soft), 4))
  geometry.setAttribute('iTint', new InstancedBufferAttribute(new Float32Array(tint), 3))
  geometry.instanceCount = soft.length / 4
  geometry.boundingSphere = new Sphere(new Vector3(), 1e5)
  return geometry
}

function leaves(at: number[], leaf: number[], tint: number[]): InstancedBufferGeometry {
  const geometry = quad()
  geometry.setAttribute('iAt', new InstancedBufferAttribute(new Float32Array(at), 3))
  geometry.setAttribute('iLeaf', new InstancedBufferAttribute(new Float32Array(leaf), 4))
  geometry.setAttribute('iTint', new InstancedBufferAttribute(new Float32Array(tint), 3))
  geometry.instanceCount = leaf.length / 4
  return geometry
}

/* ---- the component ---------------------------------------------------------- */

export function Nightair({ track, rock, land, paneTints }: { track: Track; rock: ShaderMaterial; land: Land; paneTints: readonly string[] }) {
  const room = useMemo(() => roomAt(track), [track])

  const built = useMemo(() => {
    const rng = random(track.seed ^ 0x4a11e)
    const road = emptyRoad()
    const basis = flatBasis()
    const point = new Vector3()
    const M = NIGHTFALL
    const side = (s: number, n: number, y: number) => {
      roadAt(track, s, road)
      basisAt(road, basis)
      roadPoint(road, n, 0, point, basis)
      return [point.x, land.heightAt(point.x, point.z) + y, point.z] as const
    }

    // Swallows: over the meadow, low, in loops beside the road and over it.
    const swallow = { centres: [] as number[], loops: [] as number[], fly: [] as number[], sizes: [] as number[] }
    for (let i = 0; i < 44; i++) {
      const s = 30 + rng() * (M.meadow.to - 60)
      const [x, y, z] = side(s, (rng() - 0.5) * 60, 4 + rng() * 7)
      swallow.centres.push(x, y, z)
      swallow.loops.push(8 + rng() * 14, 2 + rng() * 3, 8 + rng() * 14)
      swallow.fly.push(rng() * 6.28, 0.5 + rng() * 0.5, 14 + rng() * 8, 0)
      swallow.sizes.push(0.32 + rng() * 0.12)
    }
    // Bats: at both mouths, and up in the dome.
    const bat = { centres: [] as number[], loops: [] as number[], fly: [] as number[], sizes: [] as number[] }
    for (let i = 0; i < 26; i++) {
      let x: number, y: number, z: number
      if (i < 18) {
        const mouth = i % 2 === 0 ? M.hollow.from + 8 : M.hollow.to - 8
        ;[x, y, z] = side(mouth + (rng() - 0.5) * 30, (rng() - 0.5) * 20, 3.5 + rng() * 5)
      } else {
        x = room.x + (rng() - 0.5) * 30
        y = room.y + 6 + rng() * 9
        z = room.z + (rng() - 0.5) * 30
      }
      bat.centres.push(x, y, z)
      bat.loops.push(4 + rng() * 8, 1.5 + rng() * 2, 4 + rng() * 8)
      bat.fly.push(rng() * 6.28, 0.9 + rng() * 0.6, 22 + rng() * 10, 1)
      bat.sizes.push(0.22 + rng() * 0.1)
    }
    // Mist on the water: lying, thickest at the fords.
    const mist = { at: [] as number[], soft: [] as number[], tint: [] as number[] }
    for (let i = 0; i < land.river.length; i += 2) {
      const r = land.river[i]
      const nearFord = M.fords.some((f) => Math.abs(r.s - f) < 40) ? 1.6 : 1
      const puffs = Math.round((1 + rng()) * nearFord)
      for (let k = 0; k < puffs; k++) {
        mist.at.push(r.x + (rng() - 0.5) * RIVER_HALF * 2.4, r.y + 0.3 + rng() * 0.9, r.z + (rng() - 0.5) * RIVER_HALF * 2.4)
        mist.soft.push(5 + rng() * 6, rng(), 0, 1.5 + rng() * 2)
        mist.tint.push(0.62, 0.64, 0.7)
      }
    }
    // Smoke off the hearth, up into the dome.
    const smoke = { at: [] as number[], soft: [] as number[], tint: [] as number[] }
    for (let i = 0; i < 34; i++) {
      smoke.at.push(room.hearth.x + (rng() - 0.5) * 1.2, room.hearth.y + 1.6, room.hearth.z + (rng() - 0.5) * 1.2)
      smoke.soft.push(1.4 + rng() * 1.2, rng(), 9 + rng() * 5, 1.2 + rng() * 1.5)
      smoke.tint.push(0.42, 0.38, 0.34)
    }
    // Motes round each lantern of the walk, in its own colour.
    const mote = { at: [] as number[], soft: [] as number[], tint: [] as number[] }
    const posts = track.lanterns.filter((l) => l.s > M.walk.from && l.s < M.walk.to)
    const colour = new Color()
    posts.forEach((l, i) => {
      roadAt(track, l.s, road)
      basisAt(road, basis)
      roadPoint(road, l.n, l.y, point, basis)
      colour.set(paneTints[i] ?? '#c9a874')
      for (let k = 0; k < 7; k++) {
        mote.at.push(point.x + (rng() - 0.5) * 2.2, point.y + (rng() - 0.6) * 2.0, point.z + (rng() - 0.5) * 2.2)
        mote.soft.push(0.09 + rng() * 0.08, rng(), 0, 0.5 + rng() * 0.6)
        mote.tint.push(colour.r, colour.g, colour.b)
      }
    })
    // Leaves coming down through the wood.
    const leaf = { at: [] as number[], leaf: [] as number[], tint: [] as number[] }
    const leafColours = ['#8a6a3a', '#a07c3e', '#6f5a30', '#b08a48', '#7a6a3c'].map((c) => new Color(c))
    for (let s = M.walk.from - 30; s < track.length - 40; s += 3.2) {
      if (rng() > 0.8) continue
      roadAt(track, s, road)
      const wall = road.width + vergeWidth(road.room)
      const n = (rng() < 0.5 ? -1 : 1) * (wall * 0.4 + rng() * 12)
      const [x, y, z] = side(s, n, 6 + rng() * 5)
      leaf.at.push(x, y, z)
      leaf.leaf.push(rng(), 1.5 + rng() * 3, 0.16 + rng() * 0.1, y - land.heightAt(x, z) - 0.05)
      const c = leafColours[Math.floor(rng() * leafColours.length)]
      leaf.tint.push(c.r, c.g, c.b)
    }
    return {
      swallows: flyers(swallow.centres, swallow.loops, swallow.fly, swallow.sizes),
      bats: flyers(bat.centres, bat.loops, bat.fly, bat.sizes),
      mist: softs(mist.at, mist.soft, mist.tint),
      smoke: softs(smoke.at, smoke.soft, smoke.tint),
      motes: softs(mote.at, mote.soft, mote.tint),
      leaves: leaves(leaf.at, leaf.leaf, leaf.tint),
    }
  }, [track, land, room, paneTints])

  const clock = useMemo(() => ({ value: 0 }), [])
  const materials = useMemo(() => {
    const u = rock.uniforms
    const light = {
      uAmbient: u.uAmbient, uDaylight: u.uDaylight, uSunDir: u.uSunDir, uSunColor: u.uSunColor, uSkyColor: u.uSkyColor,
      uFogColor: u.uFogColor, uFogNear: u.uFogNear, uFogFar: u.uFogFar, uLamps: u.uLamps, uLampColors: u.uLampColors,
    }
    const flyer = (body: string) => new ShaderMaterial({ vertexShader: FLYER_VERT, fragmentShader: FLYER_FRAG, side: 2, uniforms: { ...light, uClock: clock, uBody: { value: new Color(body) } } })
    const soft = (period: number, alpha: number, glow: number, additive: boolean) => new ShaderMaterial({
      vertexShader: SOFT_VERT, fragmentShader: SOFT_FRAG, transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending,
      uniforms: { ...light, uClock: clock, uPeriod: { value: period }, uAlpha: { value: alpha }, uGlow: { value: glow } },
    })
    return {
      swallow: flyer('#2a2a2e'),
      bat: flyer('#1c1a1e'),
      mist: soft(40, 0.2, 0, false),
      smoke: soft(11, 0.26, 0, false),
      mote: soft(30, 0.9, 1, true),
      leaf: new ShaderMaterial({ vertexShader: LEAF_VERT, fragmentShader: LEAF_FRAG, side: 2, uniforms: { ...light, uClock: clock } }),
    }
  }, [rock, clock])

  useEffect(() => () => {
    Object.values(materials).forEach((m) => m.dispose())
    Object.values(built).forEach((g) => g.dispose())
  }, [materials, built])

  useFrame((_, delta) => {
    clock.value += Math.min(0.05, delta)
  })

  return (
    <>
      <mesh geometry={built.swallows} material={materials.swallow} frustumCulled={false} />
      <mesh geometry={built.bats} material={materials.bat} frustumCulled={false} />
      <points geometry={built.mist} material={materials.mist} frustumCulled={false} renderOrder={2} />
      <points geometry={built.smoke} material={materials.smoke} frustumCulled={false} renderOrder={2} />
      <points geometry={built.motes} material={materials.mote} frustumCulled={false} renderOrder={3} />
      <mesh geometry={built.leaves} material={materials.leaf} frustumCulled={false} />
    </>
  )
}
