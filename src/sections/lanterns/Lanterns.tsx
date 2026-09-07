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
  Vector2,
} from 'three'
import type { Memory } from '@/data/types'
import { LIGHT_COLORS, type SkyPalette } from '@/systems/palette'
import { ambientLightLevel } from '@/world/forms'
import { GLASS_H, GLASS_W, LANTERN_Y, hangingFor, sideFor } from './layout'
import { blurTexture, cropFor, paneTexture } from './picture'

/** Longest walk this draws lanterns for. */
const MOST = 600

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
    vec3 local = vec3(
      position.x * c,
      position.y,
      -position.x * s
    );
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
    const quad = new PlaneGeometry(GLASS_W, GLASS_H)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', quad.attributes.position)
    geo.setAttribute('uv', quad.attributes.uv)
    if (quad.index) geo.setIndex(quad.index)

    const most = Math.min(MOST, memories.length)
    const at = new Float32Array(Math.max(1, most) * 3)
    const yaw = new Float32Array(Math.max(1, most))
    const tint = new Float32Array(Math.max(1, most) * 3)
    const age = new Float32Array(Math.max(1, most))
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
      count++
    }

    geo.setAttribute('iAt', new InstancedBufferAttribute(at, 3))
    geo.setAttribute('iYaw', new InstancedBufferAttribute(yaw, 1))
    geo.setAttribute('iTint', new InstancedBufferAttribute(tint, 3))
    geo.setAttribute('iAge', new InstancedBufferAttribute(age, 1))
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
  attribute float iYaw;

  varying float vDepth;
  varying float vUp;

  void main() {
    vUp = position.y + 0.5;
    float c = cos(iYaw);
    float s = sin(iYaw);
    vec3 local = vec3(position.x * c - position.z * s, position.y, position.x * s + position.z * c);
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

  void main() {
    // Dark wood, a little paler where the lantern's own light falls on it.
    vec3 wood = vec3(0.022, 0.018, 0.014) * (0.55 + 0.45 * uLight);
    wood += vec3(0.05, 0.032, 0.014) * smoothstep(0.55, 1.0, vUp) * (1.0 - uLight) * 0.8;
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
export function Posts({ count, palette }: { count: number; palette: SkyPalette }) {
  const geometry = useMemo(() => {
    const box = new BoxGeometry(0.05, LANTERN_Y + 0.82, 0.05)
    box.translate(0, (LANTERN_Y + 0.82) / 2, 0)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', box.attributes.position)
    geo.setAttribute('uv', box.attributes.uv)
    if (box.index) geo.setIndex(box.index)

    const many = Math.min(MOST, count)
    const at = new Float32Array(Math.max(1, many) * 3)
    const yaw = new Float32Array(Math.max(1, many))
    for (let i = 0; i < many; i++) {
      const hung = hangingFor(i)
      /*
        Beside the light, not through it.

        The post used to stand at the lantern's own centre, which is where a
        signpost stands — and once it was tall enough to read as a lamp standard
        rather than a stake, it came straight up through the middle of every
        photograph. A lantern hangs off the side of its post; that is what makes
        it a lantern and a sign a sign.

        Along the pane's own right vector, so it stays on the outside edge
        however the lantern is turned. `sideFor` puts it on the verge side, away
        from the path you are walking down.
      */
      const out = (GLASS_W / 2 + 0.055) * sideFor(i)
      at[i * 3] = hung.x + Math.cos(hung.yaw) * out
      // The post stands on the ground; the lantern hangs from it part-way up.
      at[i * 3 + 1] = hung.y - LANTERN_Y
      at[i * 3 + 2] = hung.z - Math.sin(hung.yaw) * out
      yaw[i] = hung.yaw
    }
    geo.setAttribute('iAt', new InstancedBufferAttribute(at, 3))
    geo.setAttribute('iYaw', new InstancedBufferAttribute(yaw, 1))
    geo.instanceCount = many
    box.dispose()
    return geo
  }, [count])

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
    float a = glow * uNight * 0.55;
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
    material.uniforms.uNight.value = 0.22 + 0.78 * (1 - ambientLightLevel(palette))
  }, [material, palette])

  if (memories.length === 0) return null
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={4} />
}

/* -------------------------------------------------------------------------- */
/* the one you are standing at                                                 */
/* -------------------------------------------------------------------------- */

const NEAR_FRAG = /* glsl */ `
  precision mediump float;

  uniform sampler2D uMap;
  uniform vec3 uTint;
  uniform vec2 uCrop;
  uniform vec2 uCropFocus;
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
    float glass = 1.0 - smoothstep(0.86, 0.94, inner);
    float frame = smoothstep(0.86, 0.92, inner) * (1.0 - smoothstep(0.985, 1.0, inner));

    /*
      The photograph, filled to the frame around its authored point.

      The crop is a scale and an offset on the UVs rather than anything clever:
      whichever axis is too long is shortened, and the window slides to the part
      that was chosen when the memory was kept.
    */
    vec2 uv = (vUv - 0.5) * uCrop + uCropFocus;
    vec3 shot = texture2D(uMap, clamp(uv, 0.001, 0.999)).rgb;

    // Until the real photograph has arrived this is the preview from the
    // document, which is sixteen pixels stretched — so it is crossed towards
    // the average colour rather than shown as a blur nobody asked for.
    vec3 col = mix(mix(uTint, shot, 0.55), shot, uSharp);

    float night = 1.0 - uLight;
    col *= 0.72 + 0.62 * night;
    float middle = 1.0 - smoothstep(0.0, 1.25, length(p));
    col += uTint * middle * (0.10 + 0.34 * night);

    vec3 iron = vec3(0.016, 0.013, 0.011);
    col = mix(col, iron, frame);

    float a = max(glass, frame) * uForm;
    if (a <= 0.01) discard;

    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fog);
    gl_FragColor = vec4(col, a * (1.0 - fog * 0.55));
    #include <tonemapping_fragment>
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
    const quad = new PlaneGeometry(GLASS_W, GLASS_H)
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
    geo.instanceCount = 1
    quad.dispose()
    return geo
  }, [index])
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
          uCrop: { value: new Vector2(1, 1) },
          uCropFocus: { value: new Vector2(0.5, 0.5) },
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
    ;(u.uCrop.value as Vector2).set(...cropFor(memory.width, memory.height))
    // Stored top-to-bottom for DOM/CSS; texture UVs rise bottom-to-top.
    ;(u.uCropFocus.value as Vector2).set(memory.cropX ?? 0.5, 1 - (memory.cropY ?? 0.5))
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
  useEffect(() => {
    if (!picture) return
    let gone = false
    void paneTexture(picture)
      .then((texture) => {
        if (gone) return
        material.uniforms.uMap.value = texture
        sharp.current = 0
        material.uniforms.uSharp.value = 0
      })
      .catch(() => {
        /* Walking past again asks once more. */
      })
    return () => {
      gone = true
    }
  }, [picture, material])

  const form = useRef(forming ? 0 : 1)
  useFrame((_, delta) => {
    const u = material.uniforms
    if (u.uMap.value && picture && sharp.current < 1) {
      sharp.current = Math.min(1, sharp.current + delta * 1.6)
      u.uSharp.value = sharp.current
    }
    form.current = Math.min(1, form.current + delta / 2.2)
    u.uForm.value = 1 - Math.pow(1 - form.current, 3)
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />
}
