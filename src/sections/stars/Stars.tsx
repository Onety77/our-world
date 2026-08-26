/**
 * The Stars — where the two of you will talk.
 *
 * The idea the whole place is built on: seven timezones apart, when it is
 * night here it is morning there. So the horizon is split. The sky above is
 * deep and full of stars; low on the far edge, a band of dawn belonging to
 * whoever the sky does not.
 *
 * **Which one that is flipped once, and this section did not have to change.**
 * The world runs on her clock now by default — you get her day and she gets
 * yours, see `systems/whoseHour` — so the sky is hers and the far dawn is
 * yours. This place only ever asks for *the other one*, which is what made the
 * swap invisible to it and keeps the sentence it exists to say true either
 * way: when it is night here it is morning there.
 *
 * Two lights hang over the plain, one warm, one cool. They drift toward each
 * other and never quite meet, which is the honest shape of the thing.
 *
 * The conversation lives here now — see `Conversation` for the lights and
 * `ui/Talking` for the words. The room was built first, on purpose, so that
 * when the talking arrived it had somewhere to be that already felt like
 * somewhere.
 */

import { useEffect, useMemo, useRef } from 'react'
import { Conversation } from './Conversation'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  MeshBasicMaterial,
} from 'three'
import { useData, useWorldSlice } from '@/data/provider'
import { LIGHT_COLORS } from '@/systems/palette'
import { otherHour, useWhoseHour } from '@/systems/whoseHour'
import { useSceneEnv } from '@/world/SceneEnv'
import { VoiceComets } from './VoiceComets'

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

  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uAirglow;
  uniform vec3 uDawnLow;
  uniform vec3 uDawnMid;
  uniform vec3 uDawnHigh;
  uniform float uDawnStrength;
  uniform float uTime;

  varying vec3 vDir;

  /**
   * A hash with no sin in it.
   *
   * The old one was sin-based, which is fine for a few hundred star lookups
   * and much too heavy once it is being called two dozen times a pixel for
   * noise. This is three multiplies and two fracts and is indistinguishable
   * at this scale.
   */
  float hash1(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 27.13;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  /** Value noise, smoothed. */
  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(
        mix(hash1(i + vec3(0.0, 0.0, 0.0)), hash1(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash1(i + vec3(0.0, 1.0, 0.0)), hash1(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(hash1(i + vec3(0.0, 0.0, 1.0)), hash1(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash1(i + vec3(0.0, 1.0, 1.0)), hash1(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
  }

  /**
   * Three octaves, and three is the budget.
   *
   * This is a background: one pass, no overdraw, nothing behind it. But it is
   * still every pixel of the screen on a phone, so each octave is eight hashes
   * that get paid for a third of a million times. Three gives cloud, clump and
   * grain, which is all the structure the eye reads at this size; a fourth is
   * detail nobody can see at eight more hashes a pixel.
   */
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * vnoise(p);
      p *= 2.07;
      a *= 0.5;
    }
    return v;
  }

  /**
   * One lattice of stars.
   *
   * ---------------------------------------------------------------------------
   * **Every star has to fit inside its own cell, and that is the whole design.**
   *
   * A pixel only ever tests the cell it falls in — sampling the twenty-seven
   * neighbours would be nine times the hashing for a background. So anything
   * drawn wider than the distance from the star's point to its cell wall gets
   * *clipped at that wall*, and a clipped soft disc is a square. That is what
   * the first version of this did: it put the point anywhere in the cell and
   * gave it a halo nearly a whole cell across, and the sky came out as a field
   * of little grey rectangles, which is the exact bug the original had, brought
   * back by a different route.
   *
   * So the point is kept to the middle half of its cell and the total radius
   * never exceeds a quarter of one. Which means a star can only be as big as
   * its lattice is coarse — and *that* is why this is called twice rather than
   * once with a power law. A fine lattice gives hundreds of small ones, a
   * coarse lattice gives a handful with room to actually glow, and together
   * they are a sky. One lattice can have many stars or big stars, never both.
   * ---------------------------------------------------------------------------
   */
  vec3 starField(vec3 dir, float density, float cut, float widest, float power, float time) {
    vec3 grid = dir * density;
    vec3 cell = floor(grid);
    float star = hash1(cell + 4.0);
    if (star <= cut) return vec3(0.0);

    // The middle half of the cell, so nothing ever reaches a wall.
    vec3 at = 0.25 + 0.5 * vec3(
      hash1(cell + 11.3), hash1(cell + 23.7), hash1(cell + 37.1)
    );
    float d = length(grid - cell - at);

    /*
      A power law, because the real distribution is one.

      Straight off the hash, a third of them come out big and the sky reads as
      gravel. Raised to a power the bright ones are rare and the faint ones are
      everywhere, which is what makes a handful of them feel like stars rather
      than like the same dot repeated.
    */
    float bright = pow((star - cut) / (1.0 - cut), 2.2);
    float size = widest * (0.34 + bright * 0.66);
    float point = 1.0 - smoothstep(0.0, size, d);
    // Somewhere for the bright ones to fall off to, still inside the cell.
    float halo = (1.0 - smoothstep(0.0, widest, d)) * bright;

    /*
      Slower and shallower than it was.

      Twinkle at nearly forty per cent, six times a second, is a field of
      fizzing pixels — it read as noise rather than as air. Real scintillation
      is a slow unsteadiness, and most of them are not doing it at any moment.
    */
    float twinkle = 0.86 + 0.14 * sin(time * 0.8 + star * 400.0);

    vec3 tint = mix(vec3(0.70, 0.80, 1.0), vec3(1.0, 0.84, 0.62), hash1(cell + 51.9));
    float glow = point * point * 0.8 + point * 0.35 + halo * 0.55;
    return tint * glow * power * (0.3 + bright * 1.5) * twinkle;
  }

  void main() {
    float up = vDir.y;

    /*
      The sky itself, in three stops rather than two.

      Zenith, a middle, and a horizon that is *lighter* — which is the thing
      the old two-stop gradient could not say. A real night sky is never
      darkest at the bottom: there is air in the way, and the air glows. That
      one fact is most of the difference between a sky and a black rectangle,
      and it is what gives the place a horizon to stand under.
    */
    vec3 col = mix(uHorizon, uZenith, smoothstep(-0.06, 0.72, up));

    // Airglow: a faint band hugging the horizon the whole way round, not only
    // where her morning is. Sodium and oxygen, and it is never quite absent.
    float low = pow(clamp(1.0 - abs(up) * 4.5, 0.0, 1.0), 2.0);
    col += uAirglow * low * 0.5;

    /*
      Very large, very faint variation, so "dark" is not one flat value.

      Two octaves of the same noise at a huge scale. It is barely above the
      quantisation of the display and that is the point — an evenly coloured
      sky reads as painted no matter how good the stars on it are.
    */
    col *= 0.93 + vnoise(vDir * 1.7) * 0.14;

    /*
      The Milky Way, with structure in it.

      The old one was a single soft cosine band — a smudge, and from a metre
      away indistinguishable from a smear on the screen. What makes the real
      thing worth looking at is that it is *lumpy*: bright clouds, a dark dust
      lane splitting it lengthways, and a core that is far brighter than the
      arms. All three are here, and all three come out of the same noise.
    */
    vec3 axis = normalize(vec3(0.42, 0.55, -0.72));
    float across = dot(vDir, axis);
    float band = pow(clamp(1.0 - abs(across) * 3.4, 0.0, 1.0), 2.2);

    /*
      Contrast, or it is fog.

      Straight fbm is a smooth grey field, and multiplied into a band it reads
      as haze on the lens rather than as a galaxy — which is exactly how the
      first cut of this came out. Pushing the cloud through a smoothstep throws
      away the middle of the range and leaves clouds with edges, which is what
      the real thing has.
    */
    float cloud = smoothstep(0.32, 0.78, fbm(vDir * 3.2));
    float grain = fbm(vDir * 8.5);
    float milk = band * (0.14 + cloud * 1.15) * (0.55 + grain * 0.7);

    // The dust lane: a narrower dark stripe straight down the middle of it,
    // broken up so it is a lane and not a line.
    float lane = pow(clamp(1.0 - abs(across) * 11.0, 0.0, 1.0), 1.4);
    milk = max(0.0, milk - lane * (0.35 + cloud * 0.7) * 0.85);

    // And the core, off toward one end, much brighter and slightly warmer.
    float along = dot(vDir, normalize(vec3(-0.66, 0.12, -0.74)));
    float core = pow(clamp(along, 0.0, 1.0), 3.0);
    milk *= 0.55 + core * 1.9;

    // Washed out where her morning is, like everything else down there.
    /*
      Her morning is a strip on one horizon, not a wash over the forward half.

      Two things were wrong and both were the same mistake — being generous
      with a range. Cubed, "side" still covers most of the hemisphere ahead;
      and a fall-off that only counted height *above* the horizon left
      everything below it flooded. At full strength that painted the bottom
      half of the frame solid orange, which is exactly the sunset-colour-in-
      the-middle this rebuild was supposed to fix.

      Sixth power narrows it to a region you could point at. And the height
      falls off in *both* directions now: eleven degrees up into the night, and
      almost immediately down, because below the horizon is ground.
    */
    float side = clamp(-vDir.z * 0.5 + 0.5, 0.0, 1.0);
    float above = 1.0 - smoothstep(0.0, 0.20, max(0.0, up));
    float below = 1.0 - smoothstep(0.0, 0.05, max(0.0, -up));
    // Capped under one, so even at her sunrise the night is still there.
    float dawnReach = above * below * pow(side, 6.0) * uDawnStrength * 0.88;
    float washed = 1.0 - dawnReach;

    col += mix(vec3(0.14, 0.17, 0.27), vec3(0.28, 0.24, 0.25), core) * milk * 0.9 * washed;

    /*
      Stars, and they have to be *round*.

      This lit the whole of a cell, so every star in the sky was a seven-pixel
      grey square — a dozen of them plainly visible as squares in any
      screenshot of the place the whole section is named after. Three things
      fix it: the star sits at its own point inside its cell rather than
      filling it, it falls off with distance from that point, and it has a
      size of its own so the field has a few bright ones and a great many
      faint. An even field of identical dots is a texture; the difference is
      whether it reads as depth.
    */
    float clear = 1.0 - dawnReach * 0.9;
    // The field: hundreds of small ones, denser inside the Milky Way.
    col += starField(vDir, 118.0, 0.963 - clamp(milk, 0.0, 1.0) * 0.03, 0.26, 1.0, uTime) * clear;
    // And the few you would actually name, with room to glow.
    col += starField(vDir, 38.0, 0.986, 0.32, 2.2, uTime) * clear;

    /*
      Her morning, as a stack rather than a stain.

      It was one orange mixed into the sky over a wide soft band, which from
      the camera's angle sat across the middle of the frame and read as a
      colour wash somebody had added. A dawn is not one colour: it is ember at
      the very bottom, amber above that, and then a cool pale band before the
      night takes over — the belt of Venus, and it is the part everybody leaves
      out. Stacking them and keeping the whole thing inside about fifteen
      degrees of the horizon is what makes it a sunrise happening somewhere
      else, rather than a filter.
    */
    float h = max(0.0, up);
    vec3 dawn = mix(uDawnLow, uDawnMid, smoothstep(0.0, 0.055, h));
    dawn = mix(dawn, uDawnHigh, smoothstep(0.045, 0.15, h));
    col = mix(col, dawn, dawnReach);

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
          /*
            Three stops, and the horizon is the *lightest* of them.

            The old pair went dark at the top and slightly less dark at the
            bottom, which is a gradient and not a sky. Air glows, and there is
            more of it in the way near the ground.
          */
          uZenith: { value: new Color('#05070f') },
          uHorizon: { value: new Color('#151d33') },
          /** The band that hugs the horizon the whole way round. */
          uAirglow: { value: new Color('#2a3a4d') },
          /*
            Her morning, in three: ember at the very bottom, amber over it, and
            then the cool pale band that sits between a sunrise and the night
            still above it. The last one is the part that makes it read as dawn
            rather than as an orange filter.
          */
          uDawnLow: { value: new Color('#c2532a') },
          uDawnMid: { value: new Color('#d99356') },
          uDawnHigh: { value: new Color('#5d7f8c') },
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
    /*
      It has to reach the horizon, or there is not one.

      This faded out between forty and a hundred and fifty metres, which from
      an eye two and a half metres up means the ground was gone long before it
      met the sky — so the whole lower half of the frame was dome, the split
      horizon this place is *named for* had no line in it, and the dawn had
      nothing to sit on.

      Out to a hundred and ninety it ends about three quarters of a degree
      below level, which is where the horizon is anyway: the edge and the
      horizon are the same line, so there is no edge to see. Radial, so the
      corners of the square never poke above it.
    */
    float fade = 1.0 - smoothstep(150.0, 192.0, vDist);
    vec3 col = uColor;
    // The far ground catches it, the way land does under a sunrise.
    col = mix(col, uDawn, smoothstep(70.0, 185.0, vDist) * uDawnStrength * 0.85);
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
// A place to stand: distant land and a path of sky caught on the ground
// ---------------------------------------------------------------------------

function ridge(seed: number, depth: number, height: number): BufferGeometry {
  const points = 72
  const positions: number[] = []
  const top = (index: number) => {
    const x = -150 + (300 * index) / (points - 1)
    const broad = Math.sin(index * .31 + seed) * .52 + Math.sin(index * .83 + seed * 2.1) * .19
    const peak = Math.max(0, Math.sin(index * .117 + seed * 4.3)) * .75
    return [x, -0.12 + (broad + peak) * height, depth] as const
  }
  for (let i = 0; i < points - 1; i++) {
    const a = top(i)
    const b = top(i + 1)
    positions.push(
      ...a, ...b, b[0], -18, depth,
      ...a, b[0], -18, depth, a[0], -18, depth,
    )
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeBoundingSphere()
  return geometry
}

function Horizon() {
  const layers = useMemo(() => [
    { geometry: ridge(1.8, -72, 2.7), color: '#263650', opacity: .72 },
    { geometry: ridge(4.2, -48, 2.35), color: '#15233b', opacity: .94 },
    { geometry: ridge(8.1, -31, 1.8), color: '#091425', opacity: 1 },
  ].map((layer) => ({
    ...layer,
    material: new MeshBasicMaterial({ color: layer.color, transparent: true, opacity: layer.opacity }),
  })), [])
  useEffect(() => () => {
    for (const layer of layers) {
      layer.geometry.dispose()
      layer.material.dispose()
    }
  }, [layers])
  return <>{layers.map((layer, index) => (
    <mesh key={index} geometry={layer.geometry} material={layer.material} renderOrder={index} />
  ))}</>
}

function SkyPath() {
  const geometry = useMemo(() => {
    const plane = new PlaneGeometry(18, 112)
    plane.rotateX(-Math.PI / 2)
    return plane
  }, [])
  const material = useMemo(() => new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float centre = 1.0 - smoothstep(.0, .5, abs(vUv.x - .5));
        float far = smoothstep(.02, .82, vUv.y) * (1.0 - smoothstep(.9, 1.0, vUv.y));
        float threads = .72 + .28 * sin(vUv.y * 95.0 - uTime * .4 + sin(vUv.x * 17.0));
        float alpha = centre * centre * far * threads * .24;
        gl_FragColor = vec4(mix(vec3(.24,.34,.53), vec3(.82,.66,.45), vUv.x), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }), [])
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])
  useFrame((state) => { material.uniforms.uTime.value = state.clock.elapsedTime })
  return <mesh geometry={geometry} material={material} position={[0, -.385, -47]} renderOrder={2} />
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
    /*
      Three numbers each, and they have to be *uncorrelated*.

      This was `(i * 2654435761) % 1000 / 1000` and two more like it, which is
      a linear congruence with no mixing in it at all: consecutive motes land a
      fixed stride apart in every axis at once, so ninety of them come out as
      two or three neat diagonal lines drifting across the sky. It was plainly
      visible in every screenshot of the place and read as a rendering fault,
      which — near enough — it was.

      A hash, not a stride. The sine trick is the same one the dome's stars use
      and it is enough for ninety specks.
    */
    const seed = new Float32Array(MOTES * 3)
    const scatter = (n: number) => {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
      return x - Math.floor(x)
    }
    for (let i = 0; i < MOTES; i++) {
      seed[i * 3] = scatter(i + 1)
      seed[i * 3 + 1] = scatter(i * 3.7 + 19.4)
      seed[i * 3 + 2] = scatter(i * 8.3 + 71.2)
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
          varying vec2 vUv;
          void main() {
            float drift = uTime * (0.05 + iSeed.z * 0.06);
            vec3 at = vec3(
              (iSeed.x - 0.5) * 34.0 + sin(drift + iSeed.y * 6.28) * 1.6,
              0.6 + iSeed.y * 7.0 + sin(drift * 0.7) * 0.5,
              (iSeed.z - 0.5) * 22.0 - 4.0
            );
            vFade = 0.3 + 0.7 * (0.5 + 0.5 * sin(uTime * 0.6 + iSeed.x * 12.0));
            vUv = uv;
            vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
            vec3 up    = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
            // No two the same size, or ninety identical specks read as a
            // pattern however well they are scattered.
            float size = 0.55 + iSeed.y * 0.9;
            vec3 local = (right * position.x + up * position.y) * size;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(local + at, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          precision mediump float;
          varying float vFade;
          varying vec2 vUv;
          void main() {
            /*
              A speck, not a *square*.

              This was a flat fill across the whole quad, which is exactly what
              it looked like: ninety small grey rectangles hanging in the sky
              of the place the section is named after. A billboard needs a
              falloff or it is a billboard.
            */
            float d = length(vUv - 0.5) * 2.0;
            float speck = pow(1.0 - smoothstep(0.0, 1.0, d), 2.4);
            if (speck < 0.01) discard;
            gl_FragColor = vec4(vec3(0.75, 0.8, 0.95), speck * vFade * 0.4);
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

  /*
    The dawn on the far horizon belongs to whoever the *sky* does not.

    It used to ask for "her hour" by name, which was right while the world
    always ran on yours. Now that the two are swapped by default — you get her
    day, she gets yours — naming a person here would have put the same hour on
    the sky and on the horizon, and the whole point of this place is that they
    are different. Asking for "the other one" instead makes the swap invisible
    to this section: whichever clock the world is having, the light across the
    plain is the one it is not. See systems/whoseHour.
  */
  const whose = useWhoseHour((w) => w.whose)
  const herHour = useMemo(
    () => otherHour(profiles, me, whose, Date.now()),
    [me, profiles, whose],
  )
  void hour

  const strength = Math.pow(Math.max(0, 1 - Math.abs(herHour - 6.5) / 5), 1.6)

  return (
    <>
      <Dome herHour={herHour} />
      <Plain strength={strength} />
      <Horizon />
      <SkyPath />
      <Motes />
      <TwoLights />
      <VoiceComets />
      {/* every message the two of you have ever sent, as a light */}
      <Conversation />
    </>
  )
}
