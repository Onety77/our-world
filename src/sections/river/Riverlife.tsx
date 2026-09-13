/**
 * What lives on the Wellspring.
 *
 * ---------------------------------------------------------------------------
 * The water moved and nothing else did, and a river with nothing on it reads
 * as a texture however well the swell is drawn. Four things, all animated on
 * the GPU from one clock and all reading the same palette the water does:
 *
 *   **leaves** riding the current — the one thing that shows *how fast* the
 *   river runs, which is the whole meaning of the place: they go by at a walk
 *   when the pot is empty and at a run when it is full;
 *
 *   **rings** where a fish has risen, now and then, spreading and gone;
 *
 *   **dragonflies** by day, darting low over the water, and **fireflies** at
 *   dusk among the reeds — the same points, handed from one to the other as
 *   the light goes;
 *
 *   **mist** lying on the water when the sun is low.
 *
 * The leaves and the rings follow the channel's own centreline, worked out in
 * the shader from the same two sines the ribbon is drawn from — see
 * `ribbonGeometry` — so a leaf never drifts up a bank.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef } from 'react'
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
import { ambientLightLevel } from '@/world/forms'
import { useSceneEnv } from '@/world/SceneEnv'
import { makeRng, range, seedFrom } from '@/systems/rng'
import { CHANNEL, CHANNEL_Z, surfaceAt } from './layout'

/** The channel's centre and half-width at `t`, as the ribbon draws them. */
const CHANNEL_GLSL = /* glsl */ `
  uniform float uMeander;
  uniform vec2 uHalf;
  uniform float uLength;
  uniform float uWidth;
  float channelX(float t) {
    return sin(t * 4.1 + 0.6) * uMeander + sin(t * 9.3 + 2.2) * uMeander * 0.32;
  }
  float channelHalf(float t) {
    return (uHalf.x + (uHalf.y - uHalf.x) * (sin(t * 5.7 + 1.1) * 0.5 + 0.5)) * uWidth;
  }
`

/*
  Every fragment stage here is highp, and that is not a preference: a uniform
  read by both stages at two precisions makes the program fail to *link*,
  silently — the water's own file carries the same scar. `uLight` is read in
  the air's vertex stage to choose between a dragonfly and a firefly.
*/
const FOG_GLSL = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uLight;
`

/** A leaf on the water: carried downstream, turning slowly, bobbing on the swell. */
const LEAF_VERT = /* glsl */ `
  attribute vec3 iSeed;
  attribute vec3 iTint;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uSurface;
  uniform float uOriginZ;
  ${CHANNEL_GLSL}
  varying vec3 vTint;
  varying float vDepth;
  varying float vShade;
  void main() {
    // Where it is down the channel: born at the head, carried to the end, born again.
    float t = fract(iSeed.x + uTime * uSpeed / uLength);
    float x = channelX(t) + iSeed.y * channelHalf(t) * 0.8;
    float z = (t - 0.5) * uLength + uOriginZ;
    float y = uSurface + 0.05 + sin(t * uLength * 1.0 - uTime * (1.5 + uSpeed) + iSeed.y * 3.1) * 0.05;
    float spin = uTime * 0.6 * (0.5 + iSeed.z) + iSeed.x * 20.0;
    float c = cos(spin), s = sin(spin);
    vec2 turned = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * (0.12 + iSeed.z * 0.1);
    vec3 world = vec3(x + turned.x, y, z + turned.y);
    vTint = iTint;
    vShade = 0.8 + 0.2 * sin(spin * 2.0);
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const LEAF_FRAG = /* glsl */ `
  precision highp float;
  ${FOG_GLSL}
  varying vec3 vTint;
  varying float vDepth;
  varying float vShade;
  void main() {
    vec3 col = vTint * uLight * vShade;
    col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vDepth));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** A ring on the surface where something rose: expanding, thinning, gone. */
const RING_VERT = /* glsl */ `
  attribute vec3 iSeed;
  uniform float uTime;
  uniform float uSurface;
  uniform float uOriginZ;
  ${CHANNEL_GLSL}
  varying vec2 vUv;
  varying float vLife;
  varying float vDepth;
  void main() {
    vUv = position.xy;
    float period = 9.0 + iSeed.z * 14.0;
    float life = fract(uTime / period + iSeed.x);
    // Up for the first quarter of its wait, then nothing until the next.
    vLife = life * 4.0;
    float t = 0.08 + iSeed.x * 0.85;
    float x = channelX(t) + (iSeed.y * 2.0 - 1.0) * channelHalf(t) * 0.7;
    float z = (t - 0.5) * uLength + uOriginZ;
    float radius = 0.3 + min(1.0, vLife) * 1.6;
    vec3 world = vec3(x + position.x * radius, uSurface + 0.03, z + position.y * radius);
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const RING_FRAG = /* glsl */ `
  precision highp float;
  ${FOG_GLSL}
  varying vec2 vUv;
  varying float vLife;
  varying float vDepth;
  void main() {
    if (vLife > 1.0) discard;
    float r = length(vUv) * 2.0;
    // Two rings, the second following the first, as a rise leaves.
    float ring = (1.0 - smoothstep(0.0, 0.08, abs(r - 1.0))) + 0.5 * (1.0 - smoothstep(0.0, 0.08, abs(r - 0.62)));
    float fade = (1.0 - vLife) * smoothstep(0.0, 0.1, vLife);
    float far = 1.0 - smoothstep(uFogNear, uFogFar, vDepth);
    gl_FragColor = vec4(vec3(0.9, 0.95, 1.0) * (0.25 + uLight * 0.5), ring * fade * far * 0.55);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * A point in the air over the water: a dragonfly by day (a dart on a quick,
 * angular path low over the surface), a firefly by night (a slow drift among
 * the reeds, breathing). The same instance is one or the other by the light.
 */
const AIR_VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute vec3 iSeed;
  uniform float uTime;
  uniform float uLight;
  varying float vGlow;
  varying float vDepth;
  varying float vKind;
  void main() {
    float day = smoothstep(0.35, 0.6, uLight);
    vKind = day;
    // Dragonfly: fast, angular, hovering and darting. Firefly: slow and round.
    float a = uTime * (0.8 + iSeed.x) + iSeed.y * 6.28;
    vec3 dart = vec3(sin(a * 1.7) * 3.0 + sin(a * 5.3) * 0.8, 0.6 + abs(sin(a * 2.9)) * 1.2, cos(a * 1.3) * 3.0 + cos(a * 6.1) * 0.6);
    vec3 drift = vec3(sin(a * 0.4) * 2.0, 0.4 + sin(a * 0.7 + iSeed.z) * 0.8 + 0.8, cos(a * 0.5) * 2.0);
    vec3 p = iAt + mix(drift, dart, day);
    vGlow = mix(0.55 + 0.45 * sin(uTime * 2.3 + iSeed.z * 40.0), 1.0, day);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    gl_PointSize = mix(0.13, 0.1, day) * (260.0 / max(2.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`

const AIR_FRAG = /* glsl */ `
  precision highp float;
  ${FOG_GLSL}
  varying float vGlow;
  varying float vDepth;
  varying float vKind;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    // A firefly is a soft glow; a dragonfly a hard little body with a glint.
    float soft = 1.0 - smoothstep(0.2, 1.0, r);
    float hard = 1.0 - smoothstep(0.3, 0.55, r);
    vec3 fire = vec3(0.85, 0.95, 0.5) * soft * vGlow * (1.0 - uLight);
    vec3 body = vec3(0.16, 0.2, 0.22) * uLight * hard + vec3(0.8, 0.9, 1.0) * uLight * (1.0 - smoothstep(0.0, 0.18, r)) * 0.6;
    vec3 col = mix(fire, body, vKind);
    float alpha = mix(soft * vGlow * (1.0 - uLight), hard, vKind);
    float far = 1.0 - smoothstep(uFogNear, uFogFar, vDepth);
    gl_FragColor = vec4(col, alpha * far);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** Mist on the water when the sun is low: soft, slow, and gone by day. */
const MIST_VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute vec3 iSeed;
  uniform float uTime;
  varying float vFade;
  varying float vDepth;
  void main() {
    vec3 p = iAt + vec3(sin(uTime * 0.11 + iSeed.x * 40.0) * 2.0, 0.0, uTime * 0.25 + sin(uTime * 0.09 + iSeed.y * 30.0));
    // Wrapped along the channel so it drifts downstream for ever.
    p.z = iAt.z + mod(p.z - iAt.z + 60.0, 120.0) - 60.0;
    vFade = 0.6 + 0.4 * sin(uTime * 0.3 + iSeed.z * 50.0);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    gl_PointSize = (5.0 + iSeed.z * 6.0) * (300.0 / max(2.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`

const MIST_FRAG = /* glsl */ `
  precision highp float;
  ${FOG_GLSL}
  uniform float uMist;
  varying float vFade;
  varying float vDepth;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float soft = 1.0 - smoothstep(0.15, 1.0, r);
    vec3 col = mix(vec3(0.75, 0.78, 0.8) * (0.2 + uLight * 0.8), uFogColor, 0.5);
    float far = 1.0 - smoothstep(uFogNear, uFogFar, vDepth);
    gl_FragColor = vec4(col, soft * vFade * uMist * 0.16 * far);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function quad(): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  geometry.boundingSphere = new Sphere(new Vector3(0, 0, CHANNEL_Z), 400)
  return geometry
}

function points(): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(3), 3))
  geometry.boundingSphere = new Sphere(new Vector3(0, 0, CHANNEL_Z), 400)
  return geometry
}

export function Riverlife({ fullness }: { fullness: number }) {
  const { palette } = useSceneEnv()

  const built = useMemo(() => {
    const rng = makeRng(seedFrom('river:life'))
    // Leaves.
    const leaves = quad()
    const leafSeed: number[] = []
    const leafTint: number[] = []
    const browns = ['#8a6a3a', '#a07c3e', '#6f5a30', '#b08a48', '#7a6a3c', '#9a6c3a'].map((c) => new Color(c))
    for (let i = 0; i < 70; i++) {
      leafSeed.push(rng(), range(rng, -1, 1), rng())
      const c = browns[Math.floor(rng() * browns.length)]
      leafTint.push(c.r, c.g, c.b)
    }
    leaves.setAttribute('iSeed', new InstancedBufferAttribute(new Float32Array(leafSeed), 3))
    leaves.setAttribute('iTint', new InstancedBufferAttribute(new Float32Array(leafTint), 3))
    leaves.instanceCount = 70
    // Rings.
    const rings = quad()
    const ringSeed: number[] = []
    for (let i = 0; i < 14; i++) ringSeed.push(rng(), rng(), rng())
    rings.setAttribute('iSeed', new InstancedBufferAttribute(new Float32Array(ringSeed), 3))
    rings.instanceCount = 14
    // Dragonflies / fireflies, by the banks.
    const air = points()
    const airAt: number[] = []
    const airSeed: number[] = []
    const level = surfaceAt(fullness)
    for (let i = 0; i < 36; i++) {
      const t = 0.1 + rng() * 0.8
      const centre = Math.sin(t * 4.1 + 0.6) * (CHANNEL.meander ?? 1) + Math.sin(t * 9.3 + 2.2) * (CHANNEL.meander ?? 1) * 0.32
      const half = CHANNEL.width[0] + (CHANNEL.width[1] - CHANNEL.width[0]) * (Math.sin(t * 5.7 + 1.1) * 0.5 + 0.5)
      const side = rng() < 0.5 ? -1 : 1
      airAt.push(centre + side * half * range(rng, 0.3, 1.3), level + 0.3, (t - 0.5) * CHANNEL.length + CHANNEL_Z)
      airSeed.push(rng(), rng(), rng())
    }
    air.setAttribute('iAt', new InstancedBufferAttribute(new Float32Array(airAt), 3))
    air.setAttribute('iSeed', new InstancedBufferAttribute(new Float32Array(airSeed), 3))
    air.instanceCount = 36
    // Mist.
    const mist = points()
    const mistAt: number[] = []
    const mistSeed: number[] = []
    for (let i = 0; i < 90; i++) {
      const t = rng()
      const centre = Math.sin(t * 4.1 + 0.6) * (CHANNEL.meander ?? 1) + Math.sin(t * 9.3 + 2.2) * (CHANNEL.meander ?? 1) * 0.32
      mistAt.push(centre + range(rng, -9, 9), level + 0.5 + rng() * 1.2, (t - 0.5) * CHANNEL.length + CHANNEL_Z)
      mistSeed.push(rng(), rng(), rng())
    }
    mist.setAttribute('iAt', new InstancedBufferAttribute(new Float32Array(mistAt), 3))
    mist.setAttribute('iSeed', new InstancedBufferAttribute(new Float32Array(mistSeed), 3))
    mist.instanceCount = 90
    return { leaves, rings, air, mist }
  }, [fullness])

  const materials = useMemo(() => {
    const fog = () => ({
      uFogColor: { value: new Color() },
      uFogNear: { value: 16 },
      uFogFar: { value: 150 },
      uLight: { value: 1 },
    })
    const channel = () => ({
      uMeander: { value: CHANNEL.meander ?? 1 },
      uHalf: { value: [CHANNEL.width[0], CHANNEL.width[1]] },
      uLength: { value: CHANNEL.length },
      uWidth: { value: 1 },
      uSurface: { value: 0 },
      uOriginZ: { value: CHANNEL_Z },
      uTime: { value: 0 },
    })
    return {
      leaf: new ShaderMaterial({ vertexShader: LEAF_VERT, fragmentShader: LEAF_FRAG, side: 2, uniforms: { ...fog(), ...channel(), uSpeed: { value: 1 } } }),
      ring: new ShaderMaterial({ vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false, blending: NormalBlending, uniforms: { ...fog(), ...channel() } }),
      air: new ShaderMaterial({ vertexShader: AIR_VERT, fragmentShader: AIR_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending, uniforms: { ...fog(), uTime: { value: 0 } } }),
      mist: new ShaderMaterial({ vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, transparent: true, depthWrite: false, blending: NormalBlending, uniforms: { ...fog(), uTime: { value: 0 }, uMist: { value: 0 } } }),
    }
  }, [])

  useEffect(() => () => {
    Object.values(materials).forEach((m) => m.dispose())
  }, [materials])
  useEffect(() => () => {
    Object.values(built).forEach((g) => g.dispose())
  }, [built])

  useEffect(() => {
    const light = ambientLightLevel(palette)
    for (const m of Object.values(materials)) {
      const u = m.uniforms
      ;(u.uFogColor.value as Color).set(palette.fogColor)
      u.uFogNear.value = palette.fogNear
      u.uFogFar.value = palette.fogFar
      u.uLight.value = light
    }
    // Mist when the sun is low but not gone: dawn and dusk, and a little at night.
    materials.mist.uniforms.uMist.value = Math.max(0, 1 - Math.abs(light - 0.3) * 2.6) * 0.8 + (1 - light) * 0.15
  }, [materials, palette])

  const shown = useRef(fullness)
  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    shown.current += (fullness - shown.current) * (1 - Math.exp(-1.4 * delta))
    const surface = surfaceAt(shown.current)
    const width = 0.16 + shown.current * 0.84
    for (const m of [materials.leaf, materials.ring]) {
      m.uniforms.uTime.value = t.current
      m.uniforms.uSurface.value = surface
      m.uniforms.uWidth.value = width
    }
    // A leaf goes a little slower than the crests it rides.
    materials.leaf.uniforms.uSpeed.value = 0.7 + shown.current * 2.4
    materials.air.uniforms.uTime.value = t.current
    materials.mist.uniforms.uTime.value = t.current
  })

  return (
    <>
      <mesh geometry={built.leaves} material={materials.leaf} frustumCulled={false} />
      <mesh geometry={built.rings} material={materials.ring} frustumCulled={false} renderOrder={2} />
      <points geometry={built.air} material={materials.air} frustumCulled={false} renderOrder={3} />
      <points geometry={built.mist} material={materials.mist} frustumCulled={false} renderOrder={2} />
    </>
  )
}
