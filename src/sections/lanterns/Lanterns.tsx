/**
 * The lanterns, and the light they throw.
 *
 * ---------------------------------------------------------------------------
 * **Three ways a lantern is drawn, and why.**
 *
 * | | |
 * |---|---|
 * | **Far** | one instanced quad in the memory's own average colour. No texture, no request, no decode. |
 * | **Near** | a quad with the photograph on it, for the handful you are walking among. |
 * | **Open** | not in the scene at all — the interface draws it, over the world. |
 *
 * The far case is most of the walk and it is **not a fallback**. A chain of
 * lights in the colours of your own photographs is what the place looks like
 * from a distance, and it is the whole reason a memory carries a `tint`: two
 * hundred lanterns cost one draw call and not one network request.
 * ---------------------------------------------------------------------------
 *
 * Nothing here billboards, and that is the point of the place. A lantern is
 * turned to face the path you will be standing on when you reach it — see
 * `hangingFor` — so it is square to you when it matters and honestly angled the
 * rest of the time, which is what makes the lane read as a lane. The room this
 * replaced had to rotate its whole building about the viewer to achieve the
 * same thing.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  Texture,
} from 'three'
import type { Memory } from '@/data/types'
import { LIGHT_COLORS, type SkyPalette } from '@/systems/palette'
import { ambientLightLevel } from '@/world/forms'
import { useLanternLight } from '@/systems/lanternLight'
import { GLASS_W, hangingFor, paneSize, sideFor } from './layout'
import { blurTexture, paneTexture, retainPane, releasePane } from './picture'
import { LAMP_UP, postPieces } from './lanternGeometry'

/** Longest walk this draws lanterns for. */
const MOST = 600

/** How far above the hood the lamp on the post head sits, in metres. */
export { LAMP_UP } from './lanternGeometry'

/* -------------------------------------------------------------------------- */
/* the glass                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Shared between the far panes and the near one, so a photograph arriving
 * cannot change the shape, the size or the angle of what was already there.
 * The two shaders differ in exactly one thing: where the colour comes from.
 */
const GLASS_VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute float iYaw;
  attribute vec3 iTint;
  attribute float iAge;
  attribute vec2 iSize;

  varying vec2 vUv;
  varying vec3 vTint;
  varying float vAge;
  varying float vDepth;

  void main() {
    vUv = uv;
    vTint = iTint;
    vAge = iAge;

    float c = cos(iYaw);
    float s = sin(iYaw);
    // Standing upright, turned about the vertical to its own heading.
    // The base quad is one metre square; every lantern is its own size, taken
    // from the shape of the photograph in it — see 'paneSize'.
    vec2 p2 = position.xy * iSize;
    vec3 local = vec3(p2.x * c, p2.y, -p2.x * s);
    vec4 world = modelMatrix * vec4(iAt + local, 1.0);
    vec4 eye = viewMatrix * world;
    vDepth = -eye.z;
    gl_Position = projectionMatrix * eye;
  }
`

/**
 * A lantern seen from far enough away that its picture is not worth fetching.
 *
 * It is not a grey rectangle waiting to become something. It is the photograph's
 * own average colour, lit from inside, which at any distance where you cannot
 * read a picture is *exactly what a lit picture looks like*. The chain reads in
 * your own colours from the moment the garden knows the memories exist.
 */
const FAR_FRAG = /* glsl */ `
  precision mediump float;

  uniform float uLight;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;

  varying vec2 vUv;
  varying vec3 vTint;
  varying float vAge;
  varying float vDepth;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;

    // The pane, and the frame around it.
    float inner = max(abs(p.x), abs(p.y));
    float glass = 1.0 - smoothstep(0.86, 0.94, inner);
    float frame = smoothstep(0.86, 0.92, inner) * (1.0 - smoothstep(0.985, 1.0, inner));

    /*
      Lit from inside, and more so after dark.

      A lantern by day is a picture in a box; a lantern at night is the only
      light there is. Both are the same surface with a different amount of its
      own glow showing, which is what a real one does — the sun simply stops
      competing with it.
    */
    float night = 1.0 - uLight;
    vec3 col = vTint * (0.62 + 0.85 * night);

    // A warm centre, because the light is behind the picture rather than on it.
    float middle = 1.0 - smoothstep(0.0, 1.25, length(p));
    col += vTint * middle * (0.16 + 0.5 * night);

    vec3 iron = vec3(0.016, 0.013, 0.011);
    col = mix(col, iron, frame);

    float a = max(glass, frame);
    if (a <= 0.01) discard;

    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fog);
    gl_FragColor = vec4(col, a * (1.0 - fog * 0.55));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function FarLanterns({
  memories,
  hide,
  palette,
}: {
  memories: Memory[]
  /**
   * The few that have their picture drawn instead, which must not also be drawn
   * here.
   *
   * Standing the near one a few millimetres proud of the far one was not
   * enough: at any distance the depth buffer cannot separate them and the two
   * quads tear down the middle, which on screen is every lantern split in half
   * with a hard line down it. Two surfaces in the same place is not something
   * to bias apart, it is something to stop doing — so the far chain simply
   * leaves a gap where the near ones are.
   */
  hide: Set<string>
  palette: SkyPalette
}) {
  const geometry = useMemo(() => {
    const quad = new PlaneGeometry(1, 1)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', quad.attributes.position)
    geo.setAttribute('uv', quad.attributes.uv)
    if (quad.index) geo.setIndex(quad.index)

    const most = Math.min(MOST, memories.length)
    const at = new Float32Array(Math.max(1, most) * 3)
    const yaw = new Float32Array(Math.max(1, most))
    const tint = new Float32Array(Math.max(1, most) * 3)
    const age = new Float32Array(Math.max(1, most))
    const size = new Float32Array(Math.max(1, most) * 2)
    const colour = new Color()

    let count = 0
    for (let i = 0; i < most; i++) {
      if (hide.has(memories[i].id)) continue
      const hung = hangingFor(i)
      at[count * 3] = hung.x
      at[count * 3 + 1] = hung.y
      at[count * 3 + 2] = hung.z
      yaw[count] = hung.yaw
      colour.set(memories[i].tint)
      tint[count * 3] = colour.r
      tint[count * 3 + 1] = colour.g
      tint[count * 3 + 2] = colour.b
      age[count] = memories.length <= 1 ? 0 : 1 - i / (memories.length - 1)
      // Its own shape, uncropped — see `paneSize`.
      const shape = paneSize(memories[i].width, memories[i].height)
      size[count * 2] = shape.w
      size[count * 2 + 1] = shape.h
      count++
    }

    geo.setAttribute('iAt', new InstancedBufferAttribute(at, 3))
    geo.setAttribute('iYaw', new InstancedBufferAttribute(yaw, 1))
    geo.setAttribute('iTint', new InstancedBufferAttribute(tint, 3))
    geo.setAttribute('iAge', new InstancedBufferAttribute(age, 1))
    geo.setAttribute('iSize', new InstancedBufferAttribute(size, 2))
    geo.instanceCount = count
    quad.dispose()
    return geo
  }, [memories, hide])

  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: GLASS_VERT,
        fragmentShader: FAR_FRAG,
        transparent: true,
        side: DoubleSide,
        uniforms: {
          uLight: { value: 1 },
          uFogColor: { value: new Color('#cfd8dc') },
          uFogNear: { value: 30 },
          uFogFar: { value: 150 },
        },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    material.uniforms.uLight.value = ambientLightLevel(palette)
    ;(material.uniforms.uFogColor.value as Color).set(palette.fogColor)
    material.uniforms.uFogNear.value = palette.fogNear
    material.uniforms.uFogFar.value = palette.fogFar
  }, [material, palette])

  if (memories.length === 0) return null
  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

/* -------------------------------------------------------------------------- */
/* the posts                                                                   */
/* -------------------------------------------------------------------------- */

const POST_VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute vec3 iScale;
  attribute float iYaw;

  varying float vDepth;
  varying float vUp;
  varying vec3 vNormalish;

  void main() {
    vUp = position.y + 0.5;

    /*
      Into the lantern's own frame, and the axes have to match the glass.

      A lantern's right is where the picture's width runs, and its normal is the
      way the picture faces — both decided by 'hangingFor'. Every piece of the
      ironwork is authored in those terms (the hood is wider than the pane, the
      arm reaches out along the right), so the same rotation the glass uses is
      the one that has to be used here. Getting the sign of the z term wrong
      puts the arm on the far side of the post and the hood behind the picture.
    */
    float c = cos(iYaw);
    float s = sin(iYaw);
    vec3 p = position * iScale;
    vec3 local = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);

    // Which way this face points, roughly, so the top of the hood catches the
    // sky and its underside stays dark.
    vNormalish = normalize(vec3(normal.x * c + normal.z * s, normal.y, -normal.x * s + normal.z * c));

    vec4 world = modelMatrix * vec4(iAt + local, 1.0);
    vec4 eye = viewMatrix * world;
    vDepth = -eye.z;
    gl_Position = projectionMatrix * eye;
  }
`

const POST_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uLight;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying float vDepth;
  varying float vUp;
  varying vec3 vNormalish;

  void main() {
    // Dark wood, a little paler where the lantern's own light falls on it.
    vec3 wood = vec3(0.022, 0.018, 0.014) * (0.55 + 0.45 * uLight);
    // The top faces catch what is left of the sky; the undersides do not.
    wood *= 0.72 + 0.55 * max(0.0, vNormalish.y);
    wood += vec3(0.020, 0.013, 0.006) * smoothstep(0.62, 1.0, vUp) * (1.0 - uLight) * 0.6;
    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    gl_FragColor = vec4(mix(wood, uFogColor, fog), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * What the lanterns hang from.
 *
 * A plain leaning stake, not a wrought-iron standard. The building this
 * replaced spent four hundred and forty-six lines on ironwork and then needed
 * three separate mechanisms to stop that ironwork being the subject. A stake is
 * the least furniture that can hold a light up, which means the light stays the
 * thing you are looking at.
 */
export function Posts({
  memories,
  waiting,
  palette,
}: {
  memories: Memory[]
  /** Draw one more bare post at the head of the lane, with no lamp on it. */
  waiting: boolean
  palette: SkyPalette
}) {
  const count = memories.length + (waiting ? 1 : 0)
  const geometry = useMemo(() => {
    // A centred unit box, scaled and placed per piece — see POST_VERT.
    const box = new BoxGeometry(1, 1, 1)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', box.attributes.position)
    geo.setAttribute('normal', box.attributes.normal)
    geo.setAttribute('uv', box.attributes.uv)
    if (box.index) geo.setIndex(box.index)

    const many = Math.min(MOST, count)
    const at: number[] = []
    const scale: number[] = []
    const yaw: number[] = []

    const piece = (
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      turn: number,
    ) => {
      at.push(x, y, z)
      scale.push(sx, sy, sz)
      yaw.push(turn)
    }

    for (let i = 0; i < many; i++) {
      postPieces(i, memories[i]?.width ?? 0, memories[i]?.height ?? 0, piece)
    }

    geo.setAttribute('iAt', new InstancedBufferAttribute(new Float32Array(at), 3))
    geo.setAttribute('iScale', new InstancedBufferAttribute(new Float32Array(scale), 3))
    geo.setAttribute('iYaw', new InstancedBufferAttribute(new Float32Array(yaw), 1))
    geo.instanceCount = yaw.length
    box.dispose()
    return geo
  }, [count, memories])

  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: POST_VERT,
        fragmentShader: POST_FRAG,
        uniforms: {
          uLight: { value: 1 },
          uFogColor: { value: new Color('#cfd8dc') },
          uFogNear: { value: 30 },
          uFogFar: { value: 150 },
        },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    material.uniforms.uLight.value = ambientLightLevel(palette)
    ;(material.uniforms.uFogColor.value as Color).set(palette.fogColor)
    material.uniforms.uFogNear.value = palette.fogNear
    material.uniforms.uFogFar.value = palette.fogFar
  }, [material, palette])

  if (count === 0) return null
  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

/* -------------------------------------------------------------------------- */
/* the light they throw                                                        */
/* -------------------------------------------------------------------------- */

const HALO_VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute vec3 iTint;
  attribute float iSize;

  varying vec2 vUv;
  varying vec3 vTint;

  void main() {
    vUv = uv;
    vTint = iTint;
    // Camera-facing, from the model-view matrix's own axes — a glow has no
    // orientation and one that turns with the lantern goes edge-on and dies.
    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    vec3 world = iAt + (right * position.x + up * position.y) * iSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`

const HALO_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uNight;
  varying vec2 vUv;
  varying vec3 vTint;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float glow = 1.0 - smoothstep(0.0, 1.0, d);
    glow = glow * glow;
    float a = glow * uNight * 0.85;
    if (a <= 0.003) discard;
    gl_FragColor = vec4(vTint * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * The air around each lantern, which is where the beauty of the place lives.
 *
 * A light with no halo is a bright rectangle; a light with one is a lamp in
 * mist. This is also the thing that makes the walk *grow*: one memory is a
 * single glow in the dark, forty is a chain of them curving away, and none of
 * that needed a building to be drawn around it.
 *
 * Additive and depth-write off, so overlapping halos on a bend pool into one
 * brighter patch rather than cutting each other out.
 */
export function Halos({ memories, palette }: { memories: Memory[]; palette: SkyPalette }) {
  const lamps = useLanternLight((s) => s.lamps)
  const geometry = useMemo(() => {
    const quad = new PlaneGeometry(1, 1)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', quad.attributes.position)
    geo.setAttribute('uv', quad.attributes.uv)
    if (quad.index) geo.setIndex(quad.index)

    const count = Math.min(MOST, memories.length)
    const at = new Float32Array(Math.max(1, count) * 3)
    const tint = new Float32Array(Math.max(1, count) * 3)
    const size = new Float32Array(Math.max(1, count))
    const colour = new Color()
    const warm = new Color(LIGHT_COLORS.warm)
    const cool = new Color(LIGHT_COLORS.cool)

    for (let i = 0; i < count; i++) {
      const hung = hangingFor(i)
      at[i * 3] = hung.x
      at[i * 3 + 1] = hung.y
      at[i * 3 + 2] = hung.z
      /*
        The halo takes the picture's colour pulled towards its keeper's light.
        The pane is the photograph; the air around it is whose lantern it is.
      */
      colour.set(memories[i].tint).lerp(memories[i].by === 'cool' ? cool : warm, 0.55)
      tint[i * 3] = colour.r
      tint[i * 3 + 1] = colour.g
      tint[i * 3 + 2] = colour.b
      size[i] = 1.75
    }

    geo.setAttribute('iAt', new InstancedBufferAttribute(at, 3))
    geo.setAttribute('iTint', new InstancedBufferAttribute(tint, 3))
    geo.setAttribute('iSize', new InstancedBufferAttribute(size, 1))
    geo.instanceCount = count
    quad.dispose()
    return geo
  }, [memories])

  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: HALO_VERT,
        fragmentShader: HALO_FRAG,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        uniforms: { uNight: { value: 0.5 } },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    // Never quite nothing, even at noon: a lit pane in daylight still has a
    // little bloom around it, and without any the lanterns look switched off.
    material.uniforms.uNight.value = (0.22 + 0.78 * (1 - ambientLightLevel(palette))) * lamps
  }, [material, palette, lamps])

  if (memories.length === 0) return null
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={4} />
}

/**
 * The flame on the head of each post.
 *
 * ---------------------------------------------------------------------------
 * **The source, which the place did not have.**
 *
 * Every light out here came *out of a photograph*, and a photograph is not a
 * lamp — which is most of why the lane read as lit signage rather than as a lit
 * lane. Now the post carries a small brass lamp above the hood and the picture
 * hangs below it, which is what a lantern on a pole has always been: the light
 * is the light, and the memory is what it is shining through.
 *
 * It burns in that memory's own colour, so the source and the picture agree —
 * and it is the one thing here that *moves*. A flame that does not breathe is a
 * bulb, and a bulb is the wrong century for this garden.
 * ---------------------------------------------------------------------------
 */
const FLAME_VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute vec3 iTint;
  attribute float iSize;
  attribute float iPhase;

  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vTint;
  varying float vLive;

  void main() {
    vUv = uv;
    vTint = iTint;

    /*
      Two slow beats well apart, so no two lamps on the lane are ever in step
      and none of them repeats on a count anybody could follow.
    */
    float beat = sin(uTime * 2.1 + iPhase) * 0.5 + sin(uTime * 3.37 + iPhase * 1.7) * 0.5;
    vLive = 0.82 + beat * 0.18;

    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    vec3 world = iAt + (right * position.x + up * position.y) * iSize * vLive;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`

const FLAME_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uNight;
  varying vec2 vUv;
  varying vec3 vTint;
  varying float vLive;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    // A hard little core inside a soft halo: the core is the flame and the
    // halo is the air around it. Without the core it is a smudge.
    float core = 1.0 - smoothstep(0.0, 0.22, d);
    float halo = 1.0 - smoothstep(0.0, 1.0, d);
    float a = (core * 0.95 + halo * halo * 0.45) * vLive * (0.34 + 0.66 * uNight);
    if (a <= 0.003) discard;
    // Hotter than the picture it lights — a flame is nearly white in the middle.
    vec3 col = mix(vTint, vec3(1.0, 0.93, 0.82), core * 0.55);
    gl_FragColor = vec4(col * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function PoleLamps({ memories, palette }: { memories: Memory[]; palette: SkyPalette }) {
  const lamps = useLanternLight((s) => s.lamps)
  const geometry = useMemo(() => {
    const quad = new PlaneGeometry(1, 1)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', quad.attributes.position)
    geo.setAttribute('uv', quad.attributes.uv)
    if (quad.index) geo.setIndex(quad.index)

    const count = Math.min(MOST, memories.length)
    const at = new Float32Array(Math.max(1, count) * 3)
    const tint = new Float32Array(Math.max(1, count) * 3)
    const size = new Float32Array(Math.max(1, count))
    const phase = new Float32Array(Math.max(1, count))
    const colour = new Color()
    const warm = new Color(LIGHT_COLORS.warm)
    const cool = new Color(LIGHT_COLORS.cool)

    for (let i = 0; i < count; i++) {
      const hung = hangingFor(i)
      const shape = paneSize(memories[i].width, memories[i].height)
      const side = sideFor(i)
      const reach = GLASS_W / 2 + 0.055
      // On the post head — the same place `Posts` builds the brass cap.
      at[i * 3] = hung.x + Math.cos(hung.yaw) * reach * side
      at[i * 3 + 1] = hung.y + shape.h / 2 + 0.05 + LAMP_UP
      at[i * 3 + 2] = hung.z - Math.sin(hung.yaw) * reach * side
      colour.set(memories[i].tint).lerp(memories[i].by === 'cool' ? cool : warm, 0.68)
      tint[i * 3] = colour.r
      tint[i * 3 + 1] = colour.g
      tint[i * 3 + 2] = colour.b
      size[i] = 0.62
      phase[i] = (i * 2.399) % (Math.PI * 2)
    }

    geo.setAttribute('iAt', new InstancedBufferAttribute(at, 3))
    geo.setAttribute('iTint', new InstancedBufferAttribute(tint, 3))
    geo.setAttribute('iSize', new InstancedBufferAttribute(size, 1))
    geo.setAttribute('iPhase', new InstancedBufferAttribute(phase, 1))
    geo.instanceCount = count
    quad.dispose()
    return geo
  }, [memories])

  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: FLAME_VERT,
        fragmentShader: FLAME_FRAG,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        uniforms: { uTime: { value: 0 }, uNight: { value: 0.6 } },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    material.uniforms.uNight.value = (0.2 + 0.8 * (1 - ambientLightLevel(palette))) * lamps
  }, [material, palette, lamps])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
  })

  if (memories.length === 0) return null
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={6} />
}

/* -------------------------------------------------------------------------- */
/* the one you are standing at                                                 */
/* -------------------------------------------------------------------------- */

const NEAR_FRAG = /* glsl */ `
  precision mediump float;

  uniform sampler2D uMap;
  uniform vec3 uTint;
  uniform float uSharp;
  uniform float uForm;
  uniform float uLight;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;

  varying vec2 vUv;
  varying float vDepth;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float inner = max(abs(p.x), abs(p.y));
    float glass = 1.0 - smoothstep(0.96, 0.98, inner);
    float frame = smoothstep(0.96, 0.98, inner) * (1.0 - smoothstep(0.985, 1.0, inner));

    /*
      The whole photograph, and nothing taken off it.

      There is no crop here any more: the lantern is cut to the shape of the
      picture instead of the picture being cut to the shape of the lantern — see
      'paneSize'. So the UVs are the UVs.
    */
    vec3 shot = texture2D(uMap, vUv).rgb;

    // Until the real photograph has arrived this is the preview from the
    // document, which is sixteen pixels stretched — so it is crossed towards
    // the average colour rather than shown as a blur nobody asked for.
    vec3 col = mix(mix(uTint, shot, 0.25), shot, uSharp);

    float night = 1.0 - uLight;
    col *= mix(0.9, 1.0, uSharp);
    float middle = 1.0 - smoothstep(0.0, 1.25, length(p));
    col += uTint * middle * 0.035 * night * (1.0 - uSharp);

    vec3 iron = vec3(0.58, 0.52, 0.40);
    col = mix(col, iron, frame);

    float a = max(glass, frame) * uForm;
    if (a <= 0.01) discard;

    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fog * 0.45);
    gl_FragColor = vec4(col, a * (1.0 - fog * 0.55));
    #include <colorspace_fragment>
  }
`

export function NearLantern({
  memory,
  index,
  palette,
  picture,
  forming,
}: {
  memory: Memory
  index: number
  palette: SkyPalette
  /** A resolved URL for the display copy, or null while it is still coming. */
  picture: string | null
  forming: boolean
}) {
  const geometry = useMemo(() => {
    const quad = new PlaneGeometry(1, 1)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', quad.attributes.position)
    geo.setAttribute('uv', quad.attributes.uv)
    if (quad.index) geo.setIndex(quad.index)
    const hung = hangingFor(index)
    /*
      A hair in front of the far pane rather than replacing it.

      Swapping which instance the far mesh draws would mean rebuilding its
      buffers every time you take a step. Standing this five millimetres proud
      costs nothing, and the far pane behind it is the same colour, so even the
      moment of arrival has nothing to see.
    */
    const lean = 0.006
    geo.setAttribute(
      'iAt',
      new InstancedBufferAttribute(
        new Float32Array([
          hung.x + Math.sin(hung.yaw) * lean,
          hung.y,
          hung.z + Math.cos(hung.yaw) * lean,
        ]),
        3,
      ),
    )
    geo.setAttribute('iYaw', new InstancedBufferAttribute(new Float32Array([hung.yaw]), 1))
    geo.setAttribute('iTint', new InstancedBufferAttribute(new Float32Array([0, 0, 0]), 3))
    geo.setAttribute('iAge', new InstancedBufferAttribute(new Float32Array([0]), 1))
    const shape = paneSize(memory.width, memory.height)
    geo.setAttribute(
      'iSize',
      new InstancedBufferAttribute(new Float32Array([shape.w, shape.h]), 2),
    )
    geo.instanceCount = 1
    quad.dispose()
    return geo
  }, [index, memory.width, memory.height])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: GLASS_VERT,
        fragmentShader: NEAR_FRAG,
        transparent: true,
        side: DoubleSide,
        uniforms: {
          uMap: { value: null as Texture | null },
          uTint: { value: new Color(memory.tint) },
          uSharp: { value: 0 },
          uForm: { value: forming ? 0 : 1 },
          uLight: { value: 1 },
          uFogColor: { value: new Color('#cfd8dc') },
          uFogNear: { value: 30 },
          uFogFar: { value: 150 },
        },
      }),
    // Rebuilt when the memory changes, because everything above is about it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memory.id],
  )
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const u = material.uniforms
    ;(u.uTint.value as Color).set(memory.tint)
    // Stored top-to-bottom for DOM/CSS; texture UVs rise bottom-to-top.
  }, [material, memory])

  useEffect(() => {
    material.uniforms.uLight.value = ambientLightLevel(palette)
    ;(material.uniforms.uFogColor.value as Color).set(palette.fogColor)
    material.uniforms.uFogNear.value = palette.fogNear
    material.uniforms.uFogFar.value = palette.fogFar
  }, [material, palette])

  /*
    The preview belongs to this lantern and is disposed with it; the photograph
    belongs to the cache in `picture.ts`, which outlives it. Disposing that one
    here is what would make walking back along the lane decode everything again.
  */
  const own = useRef<Texture[]>([])
  useEffect(
    () => () => {
      for (const texture of own.current) texture.dispose()
      own.current = []
    },
    [memory.id],
  )

  useEffect(() => {
    if (!memory.blur) return
    let gone = false
    void blurTexture(memory.blur)
      .then((texture) => {
        if (gone) {
          texture.dispose()
          return
        }
        own.current.push(texture)
        if (!material.uniforms.uMap.value) material.uniforms.uMap.value = texture
      })
      .catch(() => {
        /* The lantern keeps its colour, which is honestly what we have. */
      })
    return () => {
      gone = true
    }
  }, [memory.blur, material])

  const sharp = useRef(0)
  const ready = useRef(false)
  useEffect(() => {
    if (!picture) return
    let gone = false
    retainPane(picture)
    ready.current = false
    void paneTexture(picture)
      .then((texture) => {
        if (gone) return
        material.uniforms.uMap.value = texture
        ready.current = true
        sharp.current = 0
        material.uniforms.uSharp.value = 0
      })
      .catch(() => {
        /* Walking past again asks once more. */
      })
    return () => {
      gone = true
      ready.current = false
      releasePane(picture)
    }
  }, [picture, material])

  const form = useRef(forming ? 0 : 1)
  useFrame((_, delta) => {
    const u = material.uniforms
    if (ready.current && sharp.current < 1) {
      sharp.current = Math.min(1, sharp.current + delta * 2.6)
      u.uSharp.value = sharp.current
    }
    form.current = Math.min(1, form.current + delta / 2.2)
    u.uForm.value = 1 - Math.pow(1 - form.current, 3)
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />
}
