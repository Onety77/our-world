/**
 * Her morning — the other half of the sentence this place is named for.
 *
 * ---------------------------------------------------------------------------
 * **The night sky has a band of her dawn on the far horizon. This is standing
 * in it.**
 *
 * Everything inverts, and it has to be everything or it is a recolour: the
 * whole dome, not a strip of it; warm instead of cold; a sun instead of stars;
 * mist on the ground instead of a dark plain; and the conversation written in
 * *dark ink on a pale sky* instead of light on black — which is the change that
 * makes it read as a different hour of a different day.
 *
 * The first attempt at a second sky changed the lower third and left the sky
 * alone, so seventy per cent of the screen never moved. Nothing in this file
 * draws below the horizon for that reason: the dome, the sun, the haze and the
 * light are the theme, and the ground is one quiet thing at the bottom of it.
 * ---------------------------------------------------------------------------
 *
 * Everything reads `at` from `theme.ts`. At nought none of it is drawn — no
 * dome, no sun, no cost. At one the night is gone.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
} from 'three'
import { makeRng, range, seedFrom } from '@/systems/rng'
import { sky } from './theme'

/* -------------------------------------------------------------------------- */
/* the sky                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The whole dome, and it is drawn over the night one rather than beside it.
 *
 * Transparent, with its alpha driven by the crossing, so the two skies dissolve
 * through each other instead of one sliding out from under the other. At the
 * halfway point you are genuinely between them — a violet sky with the last of
 * the stars still in it and the sun already touching the ridge, which is the
 * one frame that sells the whole gesture.
 */
const DOME_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const DOME_FRAG = /* glsl */ `
  precision mediump float;

  uniform float uAt;
  uniform float uTime;
  uniform vec3 uHigh;
  uniform vec3 uMid;
  uniform vec3 uLow;
  uniform vec3 uSunGlow;
  uniform vec3 uSunAt;

  varying vec3 vDir;

  void main() {
    vec3 dir = normalize(vDir);
    float up = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

    /*
      Three stops, and the horizon is the brightest.

      A dawn is not a gradient from dark to light — it is a *fire on one edge*
      of a sky that is still holding its night at the top. Two stops give a
      wash; three give the band of gold that says the sun has not risen yet but
      is about to, which is the whole of what this hour looks like.
    */
    vec3 col = mix(uLow, uMid, smoothstep(0.42, 0.60, up));
    col = mix(col, uHigh, smoothstep(0.58, 0.94, up));

    /*
      And the sun's own glow in the air around it, which is most of a sunrise.

      Not a disc — the disc is its own mesh. This is the enormous soft bloom
      that a low sun puts into a whole quarter of the sky, and without it the
      sun reads as a sticker rather than as the thing lighting everything.
    */
    float near = max(0.0, dot(dir, normalize(uSunAt)));
    col += uSunGlow * pow(near, 3.2) * 0.85;
    col += uSunGlow * pow(near, 26.0) * 0.9;

    /*
      A slow lift over the whole dome, so the morning is *arriving* rather than
      posed. About a minute and a half a cycle: too slow to watch, impossible to
      miss if you sit here through a conversation.
    */
    col *= 1.0 + sin(uTime * 0.07) * 0.035;

    gl_FragColor = vec4(col, uAt);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * Where the sun sits, low and a little to one side. Shared by dome and disc.
 *
 * Nearer the middle than looks right on a laptop, and that is deliberate: a
 * phone's field of view is about half as wide, so a sun placed comfortably
 * off-centre on a desk is *off the screen* on the surface this is mostly read
 * on — which loses the one thing the whole sky is arranged around. Slightly
 * central on a wide screen is a much smaller loss than absent on a narrow one.
 */
const SUN_AT: [number, number, number] = [0.19, 0.085, -0.98]

function Dome() {
  const geometry = useMemo(() => new SphereGeometry(300, 32, 22), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: DOME_VERT,
        fragmentShader: DOME_FRAG,
        side: BackSide,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uAt: { value: 0 },
          uTime: { value: 0 },
          // Night still holding at the top, rose through the middle, and the
          // horizon almost white where the sun is about to be.
          uHigh: { value: new Color('#3b4a86') },
          uMid: { value: new Color('#c98da6') },
          uLow: { value: new Color('#f7c98d') },
          uSunGlow: { value: new Color('#ffb060') },
          uSunAt: { value: new Color(SUN_AT[0], SUN_AT[1], SUN_AT[2]) },
        },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
    material.uniforms.uAt.value = sky.at
  })

  // Before everything, but after the night dome — it is painted over it.
  return <mesh geometry={geometry} material={material} renderOrder={-2} frustumCulled={false} />
}

/* -------------------------------------------------------------------------- */
/* the sun                                                                     */
/* -------------------------------------------------------------------------- */

const SUN_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uAt;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    float d = length(vUv - 0.5) * 2.0;

    /*
      A rising sun has no edge worth drawing.

      Low in the haze it is a bright smear that gets sharper as it climbs, so
      the disc is soft and the corona around it does most of the work. A hard
      circle here reads as a hole punched in the sky — the same mistake the
      moon made in the sky this replaced.
    */
    float disc = 1.0 - smoothstep(0.12, 0.34, d);
    float corona = pow(1.0 - smoothstep(0.0, 1.0, d), 2.0);

    // Breathing very slightly, the way a low sun does through moving air.
    float live = 0.94 + sin(uTime * 0.5) * 0.06;

    float a = clamp(disc * 0.95 + corona * 0.55, 0.0, 1.0) * uAt * live;
    if (a <= 0.003) discard;
    vec3 col = mix(vec3(1.0, 0.72, 0.36), vec3(1.0, 0.97, 0.9), disc);
    gl_FragColor = vec4(col * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function Sun() {
  const geometry = useMemo(() => new PlaneGeometry(1, 1), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: SUN_FRAG,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        uniforms: { uAt: { value: 0 }, uTime: { value: 0 } },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  const t = useRef(0)
  const held = useRef<{ position: { set(x: number, y: number, z: number): void } } | null>(null)
  useFrame((_, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
    material.uniforms.uAt.value = sky.at
    /*
      And it *rises* as the sky crosses.

      Coming up over the ridge as you pull is what turns a change of palette
      into a sunrise — the one moment of motion the eye reads as time passing
      rather than as a setting being changed.
    */
    held.current?.position.set(SUN_AT[0] * 220, -14 + sky.at * 30, SUN_AT[2] * 220)
  })

  return (
    <mesh
      ref={held as never}
      geometry={geometry}
      material={material}
      scale={[62, 62, 1]}
      renderOrder={-1}
      frustumCulled={false}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* the ground, and what lies on it                                             */
/* -------------------------------------------------------------------------- */

const HAZE_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uAt;
  uniform float uTime;
  uniform vec3 uNear;
  uniform vec3 uFar;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    /*
      Mist lying in the low ground, drifting sideways.

      Two octaves is enough: this is seen almost edge-on, so anything finer is
      under a pixel. Banded vertically so it thins upward and has a top rather
      than an edge — mist that ends in a line is a fog *card*, which is what
      this has to avoid being.
    */
    vec2 p = vec2(vUv.x * 5.0 + uTime * 0.012, vUv.y * 2.2);
    float m = noise(p) * 0.62 + noise(p * 2.3 + 4.0) * 0.38;

    float lie = 1.0 - smoothstep(0.0, 0.85, vUv.y);
    float body = smoothstep(0.32, 0.86, m) * lie;

    vec3 col = mix(uFar, uNear, vUv.y);
    float a = body * uAt * 0.8;
    if (a <= 0.004) discard;
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** The mist she is standing in, sitting on the ridge line. */
function Haze() {
  const geometry = useMemo(() => new PlaneGeometry(340, 34), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: HAZE_FRAG,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        uniforms: {
          uAt: { value: 0 },
          uTime: { value: 0 },
          uNear: { value: new Color('#f6d9c0') },
          uFar: { value: new Color('#e7b48f') },
        },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
    material.uniforms.uAt.value = sky.at
  })

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[0, 2.2, -60]}
      renderOrder={1}
      frustumCulled={false}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* the land                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Ridges, going away into the haze.
 *
 * ---------------------------------------------------------------------------
 * **A sky on its own is a gradient, and a gradient is not a place.**
 *
 * The first morning was exactly that — a beautiful wash with a sun in it and
 * nothing to stand on, which reads as a colour picker rather than as somewhere
 * you are. The night sky it replaces has three ridges receding into the dark,
 * and they are most of why it has depth; this is the same idea with the light
 * coming the other way.
 *
 * Which is the whole difference in one shape: at night a ridge is a *darker*
 * cut-out against a lit horizon. At dawn the air between you and it is full of
 * light, so the far one is the *palest* thing on screen and the near one is the
 * darkest. Getting that backwards is the classic way a sunrise comes out
 * looking like a sunset with the colours swapped.
 * ---------------------------------------------------------------------------
 */
function ridgeOf(seed: number, depth: number, height: number): BufferGeometry {
  const points = 72
  const positions: number[] = []
  const top = (index: number) => {
    const x = -170 + (340 * index) / (points - 1)
    const broad = Math.sin(index * 0.27 + seed) * 0.55 + Math.sin(index * 0.77 + seed * 2.1) * 0.22
    const peak = Math.max(0, Math.sin(index * 0.104 + seed * 4.3)) * 0.82
    return [x, -0.1 + (broad + peak) * height, depth] as const
  }
  for (let i = 0; i < points - 1; i++) {
    const a = top(i)
    const b = top(i + 1)
    positions.push(...a, ...b, b[0], -22, depth, ...a, b[0], -22, depth, a[0], -22, depth)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeBoundingSphere()
  return geometry
}

const LAND_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uAt;
  uniform vec3 uColor;
  uniform float uSolid;
  void main() {
    float a = uAt * uSolid;
    if (a <= 0.004) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function Land() {
  /*
    Far to near, pale to dark. The furthest is nearly the colour of the sky it
    stands against, which is what distance does at this hour.
  */
  const layers = useMemo(
    () => [
/*
        Low, and none of them dark.

        The first set put a plum-coloured ridge across the bottom forty per cent
        of the screen — and the conversation is *dark ink* in this sky, so the
        last three messages went black on near-black. A theme that makes its own
        text unreadable is not finished, whatever it looks like with the words
        turned off.

        So the horizon sits low and the whole range stays in the light half.
        They are lit from in front here, not silhouetted: the sun is on this
        side of them, which is exactly what a sunrise over a valley looks like
        and is why nothing needs to go dark to read as land.
      */
      { geometry: ridgeOf(2.1, -118, 2.7), color: '#f0c9b4', solid: 0.5 },
      { geometry: ridgeOf(5.4, -92, 2.2), color: '#e2ab98', solid: 0.6 },
      { geometry: ridgeOf(9.2, -70, 1.7), color: '#cf9186', solid: 0.7 },
      { geometry: ridgeOf(13.7, -52, 1.2), color: '#b9787c', solid: 0.8 },
    ],
    [],
  )
  useEffect(
    () => () => { for (const layer of layers) layer.geometry.dispose() },
    [layers],
  )

  const materials = useMemo(
    () =>
      layers.map(
        (layer) =>
          new ShaderMaterial({
            vertexShader: `
              void main() {
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `,
            fragmentShader: LAND_FRAG,
            transparent: true,
            depthWrite: false,
            side: DoubleSide,
            uniforms: {
              uAt: { value: 0 },
              uColor: { value: new Color(layer.color) },
              uSolid: { value: layer.solid },
            },
          }),
      ),
    [layers],
  )
  useEffect(() => () => { for (const material of materials) material.dispose() }, [materials])

  useFrame(() => {
    for (const material of materials) material.uniforms.uAt.value = sky.at
  })

  return (
    <>
      {layers.map((layer, index) => (
        <mesh
          key={index}
          geometry={layer.geometry}
          material={materials[index]}
          renderOrder={index}
        />
      ))}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* what is in the air                                                          */
/* -------------------------------------------------------------------------- */

const POLLEN_VERT = /* glsl */ `
  attribute vec3 iSeed;
  attribute float iSize;
  uniform float uTime;
  varying vec2 vUv;
  varying float vFade;

  void main() {
    vUv = uv;
    /*
      Drifting up and across, slowly, on a seamless loop — the fractional part
      is what lets a mote leave the top and arrive at the bottom in the same
      breath without anything popping.
    */
    float rise = fract(iSeed.y + uTime * 0.022);
    float sway = sin(uTime * 0.4 + iSeed.x * 33.0) * 1.4;

    vec3 at = vec3(
      (iSeed.x * 2.0 - 1.0) * 42.0 + sway,
      -3.0 + rise * 17.0,
      -8.0 - iSeed.z * 46.0
    );
    vFade = smoothstep(0.0, 0.18, rise) * (1.0 - smoothstep(0.7, 1.0, rise));

    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    vec3 world = at + (right * position.x + up * position.y) * iSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`

const POLLEN_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uAt;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float dot = 1.0 - smoothstep(0.15, 1.0, d);
    float a = dot * dot * vFade * uAt * 0.5;
    if (a <= 0.003) discard;
    // Warm and near-white: this is chaff and pollen in low sun, not a spark.
    gl_FragColor = vec4(vec3(1.0, 0.88, 0.7) * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * Chaff in the low sun.
 *
 * The night has cold sparkles in it; this has warm ones lit from the side,
 * which is what standing in a field at six in the morning actually looks like.
 * Same trick as everything else that floats in this world — position is a
 * function of time and a seed, so it costs one draw call and nothing on the
 * processor.
 */
function Pollen({ count = 90 }: { count?: number }) {
  const geometry = useMemo(() => {
    const quad = new PlaneGeometry(1, 1)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', quad.attributes.position)
    geo.setAttribute('uv', quad.attributes.uv)
    if (quad.index) geo.setIndex(quad.index)
    const rng = makeRng(seedFrom('stars:pollen'))
    const seed = new Float32Array(count * 3)
    const size = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      seed[i * 3] = rng()
      seed[i * 3 + 1] = rng()
      seed[i * 3 + 2] = rng()
      size[i] = range(rng, 0.05, 0.17)
    }
    geo.setAttribute('iSeed', new InstancedBufferAttribute(seed, 3))
    geo.setAttribute('iSize', new InstancedBufferAttribute(size, 1))
    geo.instanceCount = count
    quad.dispose()
    return geo
  }, [count])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: POLLEN_VERT,
        fragmentShader: POLLEN_FRAG,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        uniforms: { uTime: { value: 0 }, uAt: { value: 0 } },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
    material.uniforms.uAt.value = sky.at
  })

  return <mesh geometry={geometry} material={material} renderOrder={3} frustumCulled={false} />
}

/* -------------------------------------------------------------------------- */

export function Morning() {
  return (
    <>
      <Dome />
      <Sun />
      <Land />
      <Haze />
      <Pollen />
    </>
  )
}
