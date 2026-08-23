/**
 * The Stars — where the two of you will talk.
 *
 * The idea the whole place is built on: seven timezones apart, when it is
 * night here it is morning there. So the horizon is split. Behind you the sky
 * is deep and full of stars — your night. Ahead of it, low on the far edge, a
 * band of dawn that is *hers*, and it moves on her clock, not yours.
 *
 * Two lights hang over the plain, one warm, one cool. They drift toward each
 * other and never quite meet, which is the honest shape of the thing.
 *
 * No messaging yet — this is the room, built first, on purpose. The chat goes
 * in here later and will have somewhere to live that already feels like
 * somewhere.
 */

import { useEffect, useMemo, useRef } from 'react'
import { Conversation } from './Conversation'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BackSide,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
} from 'three'
import { useData, useWorldSlice } from '@/data/provider'
import { LIGHT_COLORS } from '@/systems/palette'
import { localHourIn } from '@/systems/time'
import { useSceneEnv } from '@/world/SceneEnv'

// ---------------------------------------------------------------------------
// The dome: your night on one side, her morning on the other
// ---------------------------------------------------------------------------

const DOME_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const DOME_FRAG = /* glsl */ `
  precision mediump float;

  uniform vec3 uNightHigh;
  uniform vec3 uNightLow;
  uniform vec3 uDawn;
  uniform float uDawnStrength;
  uniform float uTime;

  varying vec3 vDir;

  /** Stable hash for the star field. */
  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  }

  void main() {
    float up = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uNightLow, uNightHigh, pow(up, 0.8));

    // Her dawn: a band low on one side of the horizon. Its strength is her
    // hour, so this glow is literally the sun coming up where she is.
    float side = clamp(-vDir.z * 0.5 + 0.5, 0.0, 1.0);
    float band = pow(clamp(1.0 - abs(vDir.y) * 3.2, 0.0, 1.0), 2.0);
    col = mix(col, uDawn, band * pow(side, 2.5) * uDawnStrength);

    // stars, thicker away from her dawn
    vec3 cell = floor(vDir * 190.0);
    float star = hash(cell);
    if (star > 0.9975) {
      float twinkle = 0.65 + 0.35 * sin(uTime * 1.6 + star * 400.0);
      float dim = 1.0 - band * pow(side, 2.0) * uDawnStrength * 0.9;
      col += vec3(0.9, 0.94, 1.0) * (star - 0.9975) * 380.0 * twinkle * dim;
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function Dome({ herHour }: { herHour: number }) {
  const geometry = useMemo(() => new SphereGeometry(320, 32, 20), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: DOME_VERT,
        fragmentShader: DOME_FRAG,
        side: BackSide,
        depthWrite: false,
        uniforms: {
          uNightHigh: { value: new Color('#070b18') },
          uNightLow: { value: new Color('#141d31') },
          uDawn: { value: new Color('#e8a05e') },
          uDawnStrength: { value: 0 },
          uTime: { value: 0 },
        },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  // Her dawn is strongest around her sunrise and gone by her afternoon.
  const strength = useMemo(() => {
    const h = herHour
    // a soft hump centred on 6am, tailing off by ~11
    const from = Math.max(0, 1 - Math.abs(h - 6.5) / 5)
    return Math.pow(from, 1.6)
  }, [herHour])

  useEffect(() => {
    material.uniforms.uDawnStrength.value = strength
  }, [material, strength])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
  })

  return <mesh geometry={geometry} material={material} renderOrder={-1} />
}

// ---------------------------------------------------------------------------
// The two lights
// ---------------------------------------------------------------------------

const GLOW_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up    = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    vec3 local = right * position.x + up * position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
  }
`

const GLOW_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uPulse;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float core = pow(1.0 - smoothstep(0.0, 0.22, d), 2.0);
    float halo = pow(1.0 - smoothstep(0.0, 1.0, d), 2.6);
    float a = (core + halo * 0.5) * uPulse;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function TwoLights() {
  const warm = useRef<{ position: { set(x: number, y: number, z: number): void } } | null>(null)
  const cool = useRef<{ position: { set(x: number, y: number, z: number): void } } | null>(null)

  const geometry = useMemo(() => new PlaneGeometry(3.2, 3.2), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const make = (hex: string) =>
    new ShaderMaterial({
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uColor: { value: new Color(hex) }, uPulse: { value: 0.8 } },
    })

  const warmMat = useMemo(() => make(LIGHT_COLORS.warm), [])
  const coolMat = useMemo(() => make(LIGHT_COLORS.cool), [])
  useEffect(() => () => {
    warmMat.dispose()
    coolMat.dispose()
  }, [warmMat, coolMat])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    // They circle slowly and lean toward each other at the near point of the
    // orbit, then drift apart. Never touching is the point.
    const a = t.current * 0.12
    const gap = 3.2 + Math.sin(t.current * 0.19) * 1.5
    warm.current?.position.set(-gap + Math.sin(a) * 0.5, 3.4 + Math.sin(a * 1.3) * 0.35, -2)
    cool.current?.position.set(gap + Math.sin(a + 2) * 0.5, 3.7 + Math.sin(a * 1.1 + 1) * 0.35, -2)
    warmMat.uniforms.uPulse.value = 0.72 + Math.sin(t.current * 0.9) * 0.14
    coolMat.uniforms.uPulse.value = 0.72 + Math.sin(t.current * 0.8 + 2) * 0.14
  })

  return (
    <>
      <mesh ref={warm as never} geometry={geometry} material={warmMat} renderOrder={4} />
      <mesh ref={cool as never} geometry={geometry} material={coolMat} renderOrder={4} />
    </>
  )
}

// ---------------------------------------------------------------------------
// The plain: a dark floor with a scatter of faint ground-lights
// ---------------------------------------------------------------------------

const GROUND_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform vec3 uDawn;
  uniform float uDawnStrength;
  varying vec2 vUv;
  varying float vDist;

  void main() {
    // fades out into the dark rather than ending at an edge
    float fade = 1.0 - smoothstep(40.0, 150.0, vDist);
    vec3 col = uColor;
    // the far edge catches her dawn, the way a horizon does
    col = mix(col, uDawn, smoothstep(60.0, 150.0, vDist) * uDawnStrength * 0.5);
    gl_FragColor = vec4(col * fade, fade);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const GROUND_VERT = /* glsl */ `
  varying vec2 vUv;
  varying float vDist;
  void main() {
    vUv = uv;
    vDist = length(position.xy);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

function Plain({ strength }: { strength: number }) {
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(400, 400, 1, 1)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: GROUND_VERT,
        fragmentShader: GROUND_FRAG,
        transparent: true,
        uniforms: {
          uColor: { value: new Color('#0d1120') },
          uDawn: { value: new Color('#7a4a34') },
          uDawnStrength: { value: 0 },
        },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    material.uniforms.uDawnStrength.value = strength
  }, [material, strength])

  return <mesh geometry={geometry} material={material} position={[0, -0.4, 0]} />
}

// ---------------------------------------------------------------------------
// Motes, so the air between you is not empty
// ---------------------------------------------------------------------------

const MOTES = 90

function Motes() {
  const geometry = useMemo(() => {
    const base = new PlaneGeometry(0.09, 0.09)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', base.attributes.position)
    geo.setAttribute('uv', base.attributes.uv)
    if (base.index) geo.setIndex(base.index)
    const seed = new Float32Array(MOTES * 3)
    for (let i = 0; i < MOTES; i++) {
      seed[i * 3] = ((i * 2654435761) % 1000) / 1000
      seed[i * 3 + 1] = ((i * 40503) % 1000) / 1000
      seed[i * 3 + 2] = ((i * 22695477) % 1000) / 1000
    }
    geo.setAttribute('iSeed', new InstancedBufferAttribute(seed, 3))
    geo.instanceCount = MOTES
    base.dispose()
    return geo
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute vec3 iSeed;
          uniform float uTime;
          varying float vFade;
          void main() {
            float drift = uTime * (0.05 + iSeed.z * 0.06);
            vec3 at = vec3(
              (iSeed.x - 0.5) * 34.0 + sin(drift + iSeed.y * 6.28) * 1.6,
              0.6 + iSeed.y * 7.0 + sin(drift * 0.7) * 0.5,
              (iSeed.z - 0.5) * 22.0 - 4.0
            );
            vFade = 0.3 + 0.7 * (0.5 + 0.5 * sin(uTime * 0.6 + iSeed.x * 12.0));
            vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
            vec3 up    = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
            vec3 local = right * position.x + up * position.y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(local + at, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          precision mediump float;
          varying float vFade;
          void main() {
            gl_FragColor = vec4(vec3(0.75, 0.8, 0.95), vFade * 0.28);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />
}

// ---------------------------------------------------------------------------

export default function Stars() {
  const me = useData().me
  const profiles = useWorldSlice((s) => s.profiles)
  const { hour } = useSceneEnv()

  // *Her* hour, not yours — the dawn on the far horizon is hers.
  const herHour = useMemo(() => {
    const them = me === 'warm' ? profiles.cool : profiles.warm
    return localHourIn(them.timeZone)
  }, [me, profiles])
  void hour

  const strength = Math.pow(Math.max(0, 1 - Math.abs(herHour - 6.5) / 5), 1.6)

  return (
    <>
      <Dome herHour={herHour} />
      <Plain strength={strength} />
      <Motes />
      <TwoLights />
      {/* every message the two of you have ever sent, as a light */}
      <Conversation />
    </>
  )
}
