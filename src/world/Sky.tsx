/**
 * Sky, stars, sun and moon.
 *
 * One of each, doing what they actually do: the sun crosses from the eastern
 * horizon at six to the west at eighteen, the moon rides the opposite half of
 * the same circle. Whichever is below the horizon isn't drawn.
 *
 * There used to be two little orbs up here instead, one per person, showing
 * each of your local times. They were redundant the moment both clocks and the
 * distance between you moved into the corner of the screen — and having the sky
 * be a readout rather than a sky cost more than it gave.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  NormalBlending,
  Points,
  ShaderMaterial,
  SphereGeometry,
} from 'three'
import type { SkyPalette } from '@/systems/palette'
import { daylightAt } from '@/systems/time'

const SKY_RADIUS = 420

// --------------------------------------------------------------------------
// Dome
// --------------------------------------------------------------------------

const DOME_VERT = /* glsl */ `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const DOME_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform float uRadius;
  varying vec3 vLocal;

  void main() {
    float h = clamp(vLocal.y / uRadius, -0.25, 1.0);
    // bias the gradient down so the warm band sits near the horizon where it
    // belongs, rather than washing halfway up the sky
    float t = pow(clamp(h, 0.0, 1.0), 0.42);
    vec3 col = mix(uBottom, uTop, t);

    // A slow gradient across a whole screen in 8-bit lands on visible contour
    // bands. A sub-LSB of noise breaks them up and costs nothing.
    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    col += (dither - 0.5) / 255.0;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function Dome({ palette }: { palette: SkyPalette }) {
  const geometry = useMemo(() => new SphereGeometry(SKY_RADIUS, 32, 24), [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: DOME_VERT,
        fragmentShader: DOME_FRAG,
        side: BackSide,
        depthWrite: false,
        uniforms: {
          uTop: { value: new Color('#6f96be') },
          uBottom: { value: new Color('#c8d2c4') },
          uRadius: { value: SKY_RADIUS },
        },
      }),
    [],
  )

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    material.uniforms.uTop.value.set(palette.skyTop)
    material.uniforms.uBottom.value.set(palette.skyBottom)
  }, [material, palette])

  return <mesh geometry={geometry} material={material} renderOrder={-10} />
}

// --------------------------------------------------------------------------
// Stars
// --------------------------------------------------------------------------

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vTwinkle;
  void main() {
    vTwinkle = 0.7 + 0.3 * sin(uTime * 0.6 + aPhase);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio;
  }
`

const STAR_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uOpacity;
  varying float vTwinkle;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.06, d);
    gl_FragColor = vec4(vec3(0.86, 0.90, 1.0), a * uOpacity * vTwinkle);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function Stars({ daylight, pixelRatio }: { daylight: number; pixelRatio: number }) {
  const points = useRef<Points>(null)

  const geometry = useMemo(() => {
    const COUNT = 900
    const pos = new Float32Array(COUNT * 3)
    const size = new Float32Array(COUNT)
    const phase = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      const u = Math.random() * 2 - 1
      const theta = Math.random() * Math.PI * 2
      const r = Math.sqrt(1 - u * u)
      const y = Math.abs(u) * 0.96 + 0.04
      pos[i * 3] = Math.cos(theta) * r * SKY_RADIUS * 0.92
      pos[i * 3 + 1] = y * SKY_RADIUS * 0.92
      pos[i * 3 + 2] = Math.sin(theta) * r * SKY_RADIUS * 0.92
      size[i] = 1.1 + Math.random() * 2.6
      phase[i] = Math.random() * Math.PI * 2
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
    geo.setAttribute('aSize', new Float32BufferAttribute(size, 1))
    geo.setAttribute('aPhase', new Float32BufferAttribute(phase, 1))
    return geo
  }, [])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0 },
          uPixelRatio: { value: pixelRatio },
        },
      }),
    [pixelRatio],
  )

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useFrame((_, delta) => {
    material.uniforms.uTime.value += delta
    const target = Math.pow(1 - daylight, 1.6)
    const current = material.uniforms.uOpacity.value as number
    material.uniforms.uOpacity.value =
      current + (target - current) * Math.min(1, delta * 2)
  })

  return <points ref={points} geometry={geometry} material={material} renderOrder={-9} />
}

// --------------------------------------------------------------------------
// Sun and moon
// --------------------------------------------------------------------------

/**
 * Where a body sits at this hour. Six is due east on the horizon, twelve is
 * overhead, eighteen is due west. Below zero means it has set.
 */
function bodyPosition(hour: number): { pos: [number, number, number]; elevation: number } {
  const angle = ((hour - 6) / 24) * Math.PI * 2
  const elevation = Math.sin(angle)
  return {
    pos: [
      Math.cos(angle) * SKY_RADIUS * 0.9,
      elevation * SKY_RADIUS * 0.78,
      -SKY_RADIUS * 0.34,
    ],
    elevation,
  }
}

const DISC_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up    = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    vec3 offset = right * position.x + up * position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(offset, 1.0);
  }
`

const SUN_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uCore;
  uniform vec3 uGlow;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    // small hard-ish disc with a very wide corona — that ratio is what makes
    // it read as the sun rather than as a pale ball
    float disc = 1.0 - smoothstep(0.13, 0.17, d);
    float corona = pow(1.0 - smoothstep(0.0, 1.0, d), 3.2);
    vec3 col = mix(uGlow, uCore, disc);
    float a = clamp(disc + corona * 0.55, 0.0, 1.0) * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const MOON_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uCore;
  uniform vec3 uGlow;
  uniform float uOpacity;
  uniform float uPhase;   // -1..1, how far the shadow has crossed the face
  varying vec2 vUv;

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float d = length(p);

    float disc = 1.0 - smoothstep(0.16, 0.185, d);
    float halo = pow(1.0 - smoothstep(0.0, 1.0, d), 4.0);

    // a couple of soft darker patches, so the face isn't a blank sticker
    float maria = 0.0;
    maria += smoothstep(0.055, 0.0, length(p - vec2(-0.045, 0.03)));
    maria += smoothstep(0.040, 0.0, length(p - vec2(0.035, -0.045)));
    maria += smoothstep(0.030, 0.0, length(p - vec2(0.02, 0.06)));

    // terminator: a second circle sliding across cuts the lit face
    float shadow = smoothstep(0.0, 0.06, length(p - vec2(uPhase * 0.19, 0.0)) - 0.16);

    vec3 face = uCore * (1.0 - maria * 0.22);
    float lit = disc * (1.0 - shadow * 0.82);

    vec3 col = mix(uGlow, face, lit);
    float a = clamp(lit + halo * 0.32, 0.0, 1.0) * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function CelestialBody({
  hour,
  size,
  frag,
  core,
  glow,
  phase,
}: {
  hour: number
  size: number
  frag: string
  core: string
  glow: string
  phase?: number
}) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: DISC_VERT,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: NormalBlending,
        uniforms: {
          uCore: { value: new Color(core) },
          uGlow: { value: new Color(glow) },
          uOpacity: { value: 1 },
          uPhase: { value: phase ?? 0 },
        },
      }),
    [frag, core, glow, phase],
  )

  useEffect(() => () => material.dispose(), [material])

  const { pos, elevation } = bodyPosition(hour)

  useEffect(() => {
    material.uniforms.uCore.value.set(core)
    material.uniforms.uGlow.value.set(glow)
    if (phase !== undefined) material.uniforms.uPhase.value = phase
    // fade out as it touches the horizon rather than blinking off
    material.uniforms.uOpacity.value = Math.max(0, Math.min(1, (elevation + 0.06) / 0.14))
  }, [material, core, glow, phase, elevation])

  if (elevation < -0.06) return null

  return (
    <mesh position={pos} material={material} renderOrder={-8} frustumCulled={false}>
      <planeGeometry args={[size, size]} />
    </mesh>
  )
}

// --------------------------------------------------------------------------

export interface SkyProps {
  palette: SkyPalette
  pixelRatio: number
}

export function Sky({ palette, pixelRatio }: SkyProps) {
  const daylight = daylightAt(palette.hour)

  // Warmer and redder near the horizon, the way it goes at sunset. The palette
  // is already doing this to the sky, and a sun that stayed white through a red
  // dusk would sit oddly on top of it.
  const high = daylight > 0.55
  const sunCore = high ? '#fffdf4' : '#ffd7a2'
  const sunGlow = high ? '#ffe9b8' : '#ff9d5e'

  return (
    <>
      <Dome palette={palette} />
      <Stars daylight={daylight} pixelRatio={pixelRatio} />
      <CelestialBody
        hour={palette.hour}
        size={SKY_RADIUS * 0.30}
        frag={SUN_FRAG}
        core={sunCore}
        glow={sunGlow}
      />
      <CelestialBody
        hour={(palette.hour + 12) % 24}
        size={SKY_RADIUS * 0.24}
        frag={MOON_FRAG}
        core="#e9eef7"
        glow="#b9c7de"
        phase={-0.35}
      />
    </>
  )
}
