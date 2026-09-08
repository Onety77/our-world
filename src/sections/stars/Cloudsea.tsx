/**
 * The Cloudsea — the space in between, which the Stars had never drawn.
 *
 * ---------------------------------------------------------------------------
 * **A sea of moonlit cloud with nothing under your feet, and the conversation
 * still hanging in the air around you.**
 *
 * The plain says the place's sentence by splitting the horizon: your night
 * above, her dawn on the far edge. This says the middle of it. The weather the
 * two of you are on opposite sides of, seen from above — one surface running
 * all the way to both horizons, lit by a moon rather than by a sun either of
 * you can claim.
 *
 * It is the only vantage in this world where being far apart *looks* like
 * something instead of being said, and it is the reason to have a second sky at
 * all: not a different palette on the same idea, a different place to be in
 * while you talk.
 * ---------------------------------------------------------------------------
 *
 * **Everything here reads `at`**, the crossing from `theme.ts`. At nought it is
 * not drawn at all — no cloud, no moon, no cost — and at one the plain is gone.
 * In between both are on screen, which is what makes the pull feel like
 * travelling rather than like a setting being changed.
 *
 * Three pieces, three draw calls: the cloud floor, the moon and its glow, and
 * the vapour that drifts through the light. The cloud is one plane with noise
 * in its fragment shader — no geometry, no texture, no simulation.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Group,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
} from 'three'
import { makeRng, range, seedFrom } from '@/systems/rng'
import { sky } from './theme'

/* -------------------------------------------------------------------------- */
/* the sea                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The cloud floor.
 *
 * One very large plane lying flat below the eye, with its shape entirely in the
 * fragment shader. Value noise summed over four octaves is the whole of it: the
 * lowest octave is the swell of the weather system, the highest is the curd on
 * top of the nearest banks, and the sum drifts slowly in one direction so the
 * sea is moving without anything having to be simulated.
 *
 * Lit from one side by the moon, which is what turns a grey field into a
 * landscape: the shading is the *slope* of the noise, so the tops catch and the
 * troughs go blue, and the result reads as depth from a surface that is
 * geometrically flat.
 */
const SEA_VERT = /* glsl */ `
  varying vec2 vAcross;
  varying float vAway;

  void main() {
    /*
      Metres across the sea — and it is **xz**, not xy.

      The plane is baked flat by rotating its geometry, so by the time a vertex
      gets here its own y is very nearly zero for every point on it. Sampling
      the noise on xy therefore varied it along one axis only, and the sea came
      out as long straight bands running to the horizon — a corduroy floor, not
      weather. The give-away was that it looked *ruled*, which noise never does.
    */
    vAcross = position.xz;
    vec4 eye = modelViewMatrix * vec4(position, 1.0);
    vAway = -eye.z;
    gl_Position = projectionMatrix * eye;
  }
`

const SEA_FRAG = /* glsl */ `
  precision mediump float;

  uniform float uTime;
  uniform float uAt;
  uniform vec3 uLit;
  uniform vec3 uShade;
  uniform vec3 uFar;
  uniform vec2 uMoon;

  varying vec2 vAcross;
  varying float vAway;

  /* Cheap value noise. One hash, four taps, smooth between them. */
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  /*
    Four octaves, each half the size and half the weight of the one before.

    Four rather than six: the fifth is under a pixel at any distance this is
    ever seen from, so it costs two more taps to add shimmer nobody can resolve
    — which is the same Nyquist argument the river had to learn the hard way.
  */
  float clouds(vec2 p) {
    float sum = 0.0;
    float weight = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += noise(p) * weight;
      p = p * 2.03 + vec2(7.3, 3.1);
      weight *= 0.5;
    }
    return sum;
  }

  void main() {
    // The whole sea drifts, slowly, one way. Weather has a direction.
    vec2 p = vAcross * 0.029 + vec2(uTime * 0.006, uTime * 0.0022);

    float h = clouds(p);

    /*
      The shading is the slope, not the height.

      Two more taps a short step either side give the gradient, and lighting
      *that* is what makes a flat plane read as a sea of banks and valleys.
      Height alone gives a stain; slope gives a surface.
    */
    float step = 0.06;
    float dx = clouds(p + vec2(step, 0.0)) - h;
    float dy = clouds(p + vec2(0.0, step)) - h;
    float lit = clamp(0.5 + (dx * uMoon.x + dy * uMoon.y) * 5.5, 0.0, 1.0);

    /*
      The tops are what the moon reaches; the deep folds keep their own blue.

      Clamped, and it matters: the two terms used to sum past one, which pinned
      most of the surface to the lit colour and turned a sea of cloud into a
      field of snow. What makes this read as cloud is the *range* between the
      folds and the crests, so the two contributions have to fit inside it
      rather than saturate it.
    */
    float tops = smoothstep(0.40, 0.82, h);
    float bright = clamp(lit * 0.52 + tops * 0.42, 0.0, 1.0);
    vec3 col = mix(uShade, uLit, bright);

    /*
      Into the distance it becomes the sky.

      A cloud sea has no horizon of its own — it fades into the air above it —
      so this goes to the dome's own colour rather than to a fog grey, and the
      join is invisible instead of being a line you can find.
    */
    float far = smoothstep(40.0, 300.0, vAway);
    col = mix(col, uFar, far);

    /*
      And it thins out underfoot rather than stopping at an edge.

      The plane has to end somewhere; ending it in the middle of the frame with
      a straight line would be the one thing that says "this is a plane". Nearest
      the eye it goes transparent, which reads as standing in the top of the
      cloud rather than on a floor laid over it.
    */
    float near = smoothstep(3.0, 26.0, vAway);
    /*
      And it dissolves at the far edge instead of ending.

      The plane has to stop somewhere, and mixing its colour to the sky was not
      enough on its own: past the mix it became a flat slab of that colour laid
      over the dome, which drew a hard line right across the horizon. Taking the
      *alpha* down as well hands the last of it back to the sky, so there is no
      edge to find.
    */
    float gone = 1.0 - smoothstep(170.0, 420.0, vAway);
    float a = near * gone * uAt;
    if (a <= 0.004) discard;

    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function Sea() {
  const geometry = useMemo(() => {
    /*
      Flat and enormous, and only sixteen segments across.

      Nothing about the shape lives in the vertices — it is all in the fragment
      shader — so the only reason for any subdivision at all is that a
      two-triangle plane this large interpolates its varyings badly at the
      corners. Sixteen is plenty and costs nothing.
    */
    const plane = new PlaneGeometry(900, 900, 16, 16)
    plane.rotateX(-Math.PI / 2)
    return plane
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: SEA_VERT,
        fragmentShader: SEA_FRAG,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uAt: { value: 0 },
          // Moonlit white, faintly cold; the folds keep a deep blue.
          uLit: { value: new Color('#aebbd2') },
          uShade: { value: new Color('#171f36') },
          uFar: { value: new Color('#141b30') },
          // Which way the moon is, flattened — see the slope lighting above.
          uMoon: { value: new Vector2(0.72, -0.69) },
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
      position={[0, -6.5, 0]}
      renderOrder={0}
      frustumCulled={false}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* the moon                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One moon, low over the sea.
 *
 * The plain has no single light source — it has two, yours and hers, drifting
 * and never meeting, which is the point of it. Up here there is one, and that
 * is deliberately the difference: above the weather there is no *your* side and
 * *her* side, only the same light on the same cloud. It is the one thing in the
 * garden that is not split in two.
 */
const MOON_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uAt;
  varying vec2 vUv;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    // The disc, and the air around it. The halo is most of what sells a moon;
    // a bare disc reads as a hole cut in the sky.
    /*
      A soft edge and a wide halo.

      A hard-edged disc reads as a hole cut in the sky rather than as something
      shining through air — the give-away is that it has no effect on anything
      around it. The halo is most of the moon; the disc is only its middle.
    */
    float disc = 1.0 - smoothstep(0.24, 0.31, d);
    float halo = pow(1.0 - smoothstep(0.0, 1.0, d), 1.7);
    float a = clamp(disc * 0.85 + halo * 0.62, 0.0, 1.0) * uAt;
    if (a <= 0.003) discard;
    vec3 col = mix(vec3(0.62, 0.70, 0.86), vec3(1.0, 0.99, 0.95), disc);
    gl_FragColor = vec4(col * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function Moon() {
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
        fragmentShader: MOON_FRAG,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        uniforms: { uAt: { value: 0 } },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame(() => {
    material.uniforms.uAt.value = sky.at
  })

  // Low and off to one side, so the sea is lit across rather than from behind
  // the camera — which is what gives the banks their long shadows.
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[52, 6, -120]}
      scale={[34, 34, 1]}
      renderOrder={1}
      frustumCulled={false}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* what drifts through it                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Vapour, torn off the tops and passing the eye.
 *
 * The one thing that says you are *in* the weather rather than looking at a
 * picture of it. Slow, large, very faint — anything crisp up here reads as
 * snow, and anything fast reads as speed.
 */
const VAPOUR_VERT = /* glsl */ `
  attribute vec3 iSeed;
  attribute float iSize;
  uniform float uTime;
  varying vec2 vUv;
  varying float vFade;

  void main() {
    vUv = uv;
    /*
      Across the eye on a loop, with the fractional part making it seamless: a
      wisp leaving one side reappears at the other in the same breath, and
      because they all started at different places nothing about that shows.
    */
    float run = fract(iSeed.x + uTime * 0.012);
    vec3 at = vec3(
      (run * 2.0 - 1.0) * 90.0,
      -2.5 + iSeed.y * 7.0,
      -14.0 - iSeed.z * 70.0
    );
    // Fading in and out at the ends of the run, so nothing ever pops.
    vFade = smoothstep(0.0, 0.16, run) * (1.0 - smoothstep(0.8, 1.0, run));

    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    // Wide and flat: a wisp is not a puff.
    vec3 world = at + (right * position.x * 3.4 + up * position.y) * iSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`

const VAPOUR_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uAt;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    vec2 p = vUv - 0.5;
    float d = length(vec2(p.x * 0.55, p.y)) * 2.0;
    float soft = pow(1.0 - smoothstep(0.0, 1.0, d), 2.0);
    float a = soft * vFade * uAt * 0.09;
    if (a <= 0.002) discard;
    gl_FragColor = vec4(vec3(0.76, 0.82, 0.94) * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function Vapour({ count = 26 }: { count?: number }) {
  const geometry = useMemo(() => {
    const quad = new PlaneGeometry(1, 1)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', quad.attributes.position)
    geo.setAttribute('uv', quad.attributes.uv)
    if (quad.index) geo.setIndex(quad.index)

    const rng = makeRng(seedFrom('stars:vapour'))
    const seed = new Float32Array(count * 3)
    const size = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      seed[i * 3] = rng()
      seed[i * 3 + 1] = rng()
      seed[i * 3 + 2] = rng()
      size[i] = range(rng, 3.4, 11)
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
        vertexShader: VAPOUR_VERT,
        fragmentShader: VAPOUR_FRAG,
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

  return <mesh geometry={geometry} material={material} renderOrder={2} frustumCulled={false} />
}

/* -------------------------------------------------------------------------- */

export function Cloudsea() {
  /*
    Lifted as the crossing runs.

    The camera never moves — `SlideCamera` owns it, here as everywhere — so the
    rising is the sea coming up to meet you rather than you climbing. Same
    trick, and the same reason, as the lane sliding past a fixed eye.
  */
  const group = useRef<Group>(null)

  useFrame(() => {
    const g = group.current
    if (!g) return
    // Up from below as it arrives, so it has somewhere to have come from.
    g.position.y = (1 - sky.at) * -9
  })

  return (
    <group ref={group}>
      <Sea />
      <Moon />
      <Vapour />
    </group>
  )
}
