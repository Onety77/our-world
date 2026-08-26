/**
 * The glass, and the light it throws.
 *
 * ---------------------------------------------------------------------------
 * **Three things, and which one you get depends only on how far away you are.**
 *
 *   Far    one instanced quad in the memory's own average colour. No texture,
 *          no network, no decode. Most of the Glasshouse is only ever this, and
 *          that is not a compromise — a wall of coloured glass receding into
 *          the dark *is* the place. The brief asked for panes that "appear as
 *          pools of coloured glass, some warm, some blue, some almost dark",
 *          and the cheapest possible thing to draw turns out to be exactly it.
 *
 *   Near   a quad with the picture on it, for the handful you are standing
 *          among. It shows the sixteen-pixel preview out of the document first
 *          — instantly, with no request — and swaps to the real photograph when
 *          it arrives. So "the glass clears and the image appears" is the
 *          literal behaviour of a progressive load rather than an animation
 *          pretending to be one.
 *
 *   Open   not here at all. A photograph somebody chose deserves to be seen as
 *          it is, and anything drawn in this scene goes through ACES tone
 *          mapping, fog, and whatever the hour has done to the light. The one
 *          you have opened is DOM, over the top, untouched. See ui/Glasshouse.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { focus } from './aisle'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
} from 'three'
import type { Memory } from '@/data/types'
import type { SkyPalette } from '@/systems/palette'
import { ambientLightLevel } from '@/world/forms'
import { cropFor, HALF, paneAt, paneSize, slotFor } from './layout'

// ---------------------------------------------------------------------------
// The glass
// ---------------------------------------------------------------------------

/**
 * Turning a flat quad onto a wall.
 *
 * Shared between the instanced far panes and the single near ones so the two
 * can never disagree about where a pane is — which they would, silently, the
 * first time either was adjusted, and the tell would be a photograph sliding a
 * few centimetres as you walked up to it.
 *
 * The base geometry is a unit plane in x–y. `side` is -1 for the left wall and
 * 1 for the right; flipping z by it is what keeps a picture the right way round
 * rather than mirrored on one side of the aisle.
 */
const ONTO_THE_WALL = /* glsl */ `
  vec3 ontoWall(vec2 quad, vec3 centre, vec2 size, float side, float tilt) {
    vec2 flat2 = quad * size;
    float c = cos(tilt), s = sin(tilt);
    // Tilt within the wall plane, about the pane's own centre.
    vec2 turned = vec2(flat2.x * c - flat2.y * s, flat2.x * s + flat2.y * c);
    return vec3(centre.x, centre.y + turned.y, centre.z - turned.x * side);
  }
`

/**
 * What a pane looks like once it has been placed.
 *
 * Opaque, and that is a decision rather than an oversight. Transparent glass
 * needs sorting, and a hundred overlapping quads down a corridor sort wrongly
 * for at least one of them at every camera angle — a photograph flickering
 * through another photograph is far worse than glass that is not see-through.
 * What sells it as glass instead is the sheen, the light it drops on the floor,
 * and the fact that it is clearly lit from behind.
 */
const GLASS_BODY = /* glsl */ `
  vec3 glassBody(vec3 tint, vec2 uv, float light, float sun, vec3 sunColor) {
    // Lit from outside, so the top of a pane is brighter than its foot.
    float fromAbove = 0.55 + uv.y * 0.62;

    /*
      One diagonal streak of reflected sky.

      A single band across the glass at about thirty degrees, which is the one
      cue that reads instantly as "there is a pane here" — without it, a
      coloured rectangle on a wall is a poster.
    */
    float band = uv.x * 0.8 + uv.y * 0.6;
    float sheen = smoothstep(0.62, 0.72, band) * (1.0 - smoothstep(0.78, 0.94, band));

    // Leading, so old glass has a dark edge where the putty is.
    vec2 edge = min(uv, 1.0 - uv);
    float lead = smoothstep(0.0, 0.045, min(edge.x, edge.y));

    vec3 col = tint * fromAbove * light;
    col = mix(col, col * sunColor * 1.2, 0.3 * sun);
    col += sunColor * sheen * 0.16 * (0.35 + sun * 0.65);
    col *= mix(0.35, 1.0, lead);
    return col;
  }
`

const FAR_VERT = /* glsl */ `
  attribute vec3 iCentre;
  attribute vec2 iSize;
  attribute vec3 iTint;
  /** x: -1 or 1, which wall. y: tilt in radians. z: 0..1 how formed it is. */
  attribute vec3 iFace;

  varying vec3 vTint;
  varying vec2 vUv;
  varying float vDepth;
  varying float vForm;

  ${ONTO_THE_WALL}

  void main() {
    vTint = iTint;
    vUv = uv;
    vForm = iFace.z;

    /*
      A pane grows into its frame as it forms.

      From the bottom, and in both dimensions at once, so the glass appears to
      be *poured* rather than to fade up. Under one, the quad is genuinely
      smaller, so there is never a half-transparent rectangle sitting in front
      of the ironwork.
    */
    vec2 quad = position.xy * mix(0.55, 1.0, iFace.z);
    quad.y += (mix(0.55, 1.0, iFace.z) - 1.0) * 0.5;

    vec3 world = ontoWall(quad, iCentre, iSize, iFace.x, iFace.y);
    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const FAR_FRAG = /* glsl */ `
  precision mediump float;

  uniform vec3 uFogColor;
  uniform vec3 uSunColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uLight;
  uniform float uSun;
  /** How far the rest of the room has stepped back — see NEAR_FRAG. */
  uniform float uHush;

  varying vec3 vTint;
  varying vec2 vUv;
  varying float vDepth;
  varying float vForm;

  ${GLASS_BODY}

  void main() {
    vec3 col = glassBody(vTint, vUv, uLight, uSun, uSunColor);
    // Newly formed glass is bright for a moment, the way something just made
    // is warm. Zero at rest, so this costs nothing for the whole building.
    col += vTint * (1.0 - vForm) * 0.5;

    // See uHush. Dimmed rather than faded out, so the wall stays a wall.
    col *= mix(1.0, 0.34, uHush);

    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fog);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const NEAR_VERT = /* glsl */ `
  /*
    Declared here as well as in the fragment, and it has to be.

    A vertex shader with no precision statement defaults to highp; a fragment
    that says mediump makes every float in it mediump. uForm is the one
    uniform these two share, so the linker saw the same name at two precisions
    and refused the whole program — which showed up as an entirely blank pane
    and one line in the console.
  */
  precision mediump float;

  uniform vec3 uCentre;
  uniform vec2 uSize;
  uniform vec2 uFace;
  uniform float uForm;

  varying vec2 vUv;
  varying float vDepth;

  ${ONTO_THE_WALL}

  void main() {
    vUv = uv;
    vec2 quad = position.xy * mix(0.55, 1.0, uForm);
    quad.y += (mix(0.55, 1.0, uForm) - 1.0) * 0.5;
    vec3 world = ontoWall(quad, uCentre, uSize, uFace.x, uFace.y);
    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const NEAR_FRAG = /* glsl */ `
  precision mediump float;

  uniform sampler2D uMap;
  uniform vec3 uTint;
  uniform vec3 uFogColor;
  uniform vec3 uSunColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uLight;
  uniform float uSun;
  uniform float uForm;
  /** 0 while only the sixteen-pixel preview is loaded, 1 once the picture is. */
  uniform float uSharp;
  /** Warm 0, cool 1 — whose memory this is. Drives the seal along one edge. */
  uniform float uWhose;
  /** 1 while the other one is looking at this same picture. */
  uniform float uTogether;
  /**
   * How much of the sampled picture to keep, about its centre.
   *
   * Every frame in the building is the same three by two, so a photograph that
   * is not that shape is *cropped* rather than squeezed — a stretched face is
   * worse than a cropped one by a distance that is not close. See cropFor in
   * layout.ts.
   */
  uniform vec2 uCrop;
  /** 0 by day, 1 after dark: the glass holds its own light. */
  uniform float uNight;

  /**
   * How far the rest of the room has stepped back, 0..1.
   *
   * Opening a memory turns you square to one pane, and the wall it is on runs
   * away either side of it full of other people's evenings — on a laptop the
   * neighbour is half a metre away and just as bright, and the eye goes to it
   * because it is *new*. So everything that is not the one you opened quietly
   * loses its light while the turn happens. Not hidden and not greyed: the
   * room is still there, it has just stopped talking.
   */
  uniform float uHush;

  varying vec2 vUv;
  varying float vDepth;

  ${GLASS_BODY}

  void main() {
    vec2 shot = (vUv - 0.5) * uCrop + 0.5;
    vec3 picture = texture2D(uMap, shot).rgb;

    /*
      The preview is sixteen pixels stretched over two metres of glass, so it
      is *blocks* — and blocks read as a broken image, not as a photograph
      arriving. Mixing it toward the flat average colour while it is the only
      thing loaded turns those blocks back into what they honestly are: the
      colour of the picture, roughly where it is.
    */
    vec3 shown = mix(mix(uTint, picture, 0.55), picture, uSharp);

    /*
      Through the glass — and glass takes light *away*.

      This multiplied the photograph by the pane's own body, which peaks a
      little over one, so every bright picture came out blown: a sunset went to
      near-white with a band across it and the thing you had hung was a pale
      rectangle. Real glass transmits perhaps three quarters and adds a sheen
      on top, and that is what this is now — the picture is a shade darker than
      the original and has a reflection on it, which is what "behind glass"
      looks like. The one you *open* is untouched, which is where the true
      colours belong.
    */
    vec3 glass = glassBody(vec3(1.0), vUv, uLight, uSun, uSunColor);
    vec3 col = shown * glass * 0.74;

    /*
      The seal — a short bar of warm or cool along one edge.

      Who left a memory is worth knowing and is not worth a name, an avatar or
      a face floating over somebody's photograph. It is the same two colours
      every other thing in this garden uses for the two of you.
    */
    vec3 warm = vec3(0.94, 0.66, 0.29);
    vec3 cool = vec3(0.62, 0.71, 0.91);
    vec3 mine = mix(warm, cool, uWhose);
    float seal = (1.0 - smoothstep(0.0, 0.022, vUv.x)) * smoothstep(0.06, 0.12, vUv.y)
      * (1.0 - smoothstep(0.4, 0.46, vUv.y));
    col += mine * seal * 1.6;

    /*
      Both of you, in front of the same photograph.

      The other edge lights in the *other* colour, and only while her presence
      says she has this one open. No avatar, no "seen by" — two lights along
      one piece of glass, which is the same sentence the Stars makes with two
      lights on a stone.
    */
    float other = (1.0 - smoothstep(0.978, 1.0, 1.0 - vUv.x))
      * smoothstep(0.06, 0.12, vUv.y) * (1.0 - smoothstep(0.4, 0.46, vUv.y));
    col += mix(cool, warm, uWhose) * other * uTogether * 1.6;

    col += uTint * (1.0 - uForm) * 0.5;

    /*
      After dark, the picture lights itself.

      There is no sun behind the glass at night, so by the letter of it a pane
      should be as black as the wall — and a building full of black rectangles
      is not what anybody wants to walk into at eleven. The fiction is the one
      the rest of this garden already keeps: what the two of you have kept
      holds its own light. The landmark says it by glowing from the inside and
      the pools on the floor say it by getting *stronger* after sunset, so the
      glass itself saying it is the same sentence in the same voice.
    */
    col += shown * uNight * 0.85;

    // See uHush. Dimmed rather than faded out, so the wall stays a wall.
    col *= mix(1.0, 0.34, uHush);

    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fog);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * The pool of colour a pane drops on the floor.
 *
 * Additive quads lying flat, one per pane, tinted and soft at the edges. Not a
 * reflection and not a projected texture: a real planar reflection is a second
 * render of the whole scene, and a light cookie is a shadow map, and both of
 * them cost more than this entire section does. What they would buy is
 * accuracy about something nobody in a firelit ruin is checking.
 *
 * What they *do* buy, and this does too, is the thing that makes the place: the
 * floor is the brightest surface in here and every colour on it came out of a
 * photograph.
 */
const POOL_VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute vec2 iSpread;
  attribute vec3 iTint;
  attribute float iPower;

  varying vec2 vUv;
  varying vec3 vTint;
  varying float vPower;
  varying float vDepth;

  void main() {
    vUv = uv;
    vTint = iTint;
    vPower = iPower;
    vec3 world = vec3(iAt.x + position.x * iSpread.x, iAt.y, iAt.z + position.y * iSpread.y);
    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const POOL_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uFogFar;
  /*
    How much of this is the sun, and how much is the memory itself.

    By day these are shafts of light through coloured glass and they behave
    like it. After dark there is no sun to make them and they are *still here*,
    a little stronger — because in this garden the things the two of you keep
    hold their own light, which is the same thing the Stars says with two lamps
    on a stone and the landmark says by glowing from the inside at night.

    It is also the only way the place works at every hour instead of one.
  */
  uniform float uNight;
  varying vec2 vUv;
  varying vec3 vTint;
  varying float vPower;
  varying float vDepth;

  void main() {
    vec2 d = (vUv - 0.5) * 2.0;
    // Softer across the aisle than along it, so a pool is a shaft of light
    // lying down rather than a disc painted under each pane.
    float fall = 1.0 - clamp(length(vec2(d.x * 0.78, d.y)), 0.0, 1.0);
    float glow = fall * fall * vPower * mix(1.0, 1.5, uNight);
    // Pools far down the aisle would otherwise stack into a solid bar of
    // light at the vanishing point.
    glow *= 1.0 - smoothstep(uFogFar * 0.35, uFogFar * 0.8, vDepth);
    gl_FragColor = vec4(vTint * glow, glow);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

// ---------------------------------------------------------------------------

/** A unit quad, shared by everything here. */
function useQuad(): PlaneGeometry {
  const quad = useMemo(() => new PlaneGeometry(1, 1), [])
  useEffect(() => () => quad.dispose(), [quad])
  return quad
}

function useLit(material: ShaderMaterial, palette: SkyPalette) {
  useEffect(() => {
    const u = material.uniforms
    if (u.uFogColor) u.uFogColor.value.set(palette.fogColor)
    if (u.uSunColor) u.uSunColor.value.set(palette.sunColor)
    if (u.uFogNear) u.uFogNear.value = palette.fogNear
    if (u.uFogFar) u.uFogFar.value = palette.fogFar
    if (u.uLight) u.uLight.value = ambientLightLevel(palette)
    if (u.uSun) u.uSun.value = Math.min(1, palette.sunIntensity)
    // Off the sun rather than the clock — see the note in NEAR_FRAG.
    if (u.uNight) u.uNight.value = Math.max(0, Math.min(1, 1 - palette.sunIntensity / 0.9))
  }, [material, palette])
}

/**
 * Every pane in the building, in one draw call.
 *
 * `formingId` is the memory hung a moment ago, which grows into its frame
 * rather than appearing. Everything else is already at rest, and the shader
 * costs one multiply to say so.
 */
export function FarPanes({
  memories,
  palette,
  formingId,
  hideIds,
}: {
  memories: Memory[]
  palette: SkyPalette
  formingId: string | null
  /** Drawn near instead, with their picture on. Left out to avoid two panes. */
  hideIds: Set<string>
}) {
  const quad = useQuad()

  /*
    Built by walking the memories once and keeping the *age* of each pane that
    made it in.

    The obvious version — filter, then look each survivor's index back up — is
    quadratic, and it is quadratic in the one number that grows forever here.
    At two hundred memories that is forty thousand comparisons every time
    either of you steps far enough down the aisle to change which five are
    drawn near.
  */
  const { geometry, drawn } = useMemo(() => {
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', quad.attributes.position)
    geo.setAttribute('uv', quad.attributes.uv)
    if (quad.index) geo.setIndex(quad.index)

    const n = Math.max(1, memories.length)
    const centre = new Float32Array(n * 3)
    const size = new Float32Array(n * 2)
    const tint = new Float32Array(n * 3)
    const face = new Float32Array(n * 3)
    const c = new Color()
    const drawn: string[] = []

    let i = 0
    for (let age = 0; age < memories.length; age++) {
      const memory = memories[age]
      // Taken out of the glass: the wall's plain glazing has gone back into
      // that panel and there is nothing here to draw. It keeps its age so
      // every pane after it stays where it is. See `Memory.removed`.
      if (memory.removed) continue
      if (hideIds.has(memory.id)) continue
      // The index in the *whole* list, never in the filtered one — a pane's
      // place in the building is its age and nothing else.
      const slot = slotFor(age)
      const { w, h } = paneSize()
      centre.set(paneAt(slot, h), i * 3)
      size[i * 2] = w
      size[i * 2 + 1] = h
      c.set(memory.tint)
      tint.set([c.r, c.g, c.b], i * 3)
      face[i * 3] = slot.side
      face[i * 3 + 1] = slot.tilt
      face[i * 3 + 2] = memory.id === formingId ? 0 : 1
      drawn.push(memory.id)
      i++
    }

    geo.setAttribute('iCentre', new InstancedBufferAttribute(centre, 3))
    geo.setAttribute('iSize', new InstancedBufferAttribute(size, 2))
    geo.setAttribute('iTint', new InstancedBufferAttribute(tint, 3))
    geo.setAttribute('iFace', new InstancedBufferAttribute(face, 3))
    geo.instanceCount = i
    return { geometry: geo, drawn }
  }, [memories, hideIds, formingId, quad])

  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: FAR_VERT,
        fragmentShader: FAR_FRAG,
        // Glass has no back — but a pane a few degrees off true, seen from the
        // far end of a long building, will show one, and a hole in a wall is
        // worse than a picture seen from behind.
        side: DoubleSide,
        uniforms: {
          uFogColor: { value: new Color('#c3cebe') },
          uSunColor: { value: new Color('#fff2d8') },
          uFogNear: { value: 16 },
          uFogFar: { value: 150 },
          uLight: { value: 1 },
          uSun: { value: 1 },
          uHush: { value: 0 },
        },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useLit(material, palette)

  /*
    A forming pane is the only animated thing in the whole building, and it
    lasts a couple of seconds. Its row is found once, when it starts, rather
    than searched for every frame.
  */
  const born = useRef(0)
  const row = useRef(-1)
  useEffect(() => {
    born.current = 0
    row.current = formingId ? drawn.indexOf(formingId) : -1
  }, [formingId, drawn])

  useFrame((_, delta) => {
    /*
      The whole far wall steps back while a memory is open.

      Every pane in this batch is by definition not the one being looked at —
      opening one walks you to its bay, which makes it near — so there is no
      exception to carve out and no attribute to update. One uniform, once a
      frame, for the entire building.
    */
    material.uniforms.uHush.value = focus.open

    if (row.current < 0 || born.current >= 1) return
    born.current = Math.min(1, born.current + delta / 2.2)
    const attr = geometry.getAttribute('iFace') as InstancedBufferAttribute
    // Eased, so the glass slows as it fills rather than stopping dead.
    attr.setZ(row.current, 1 - Math.pow(1 - born.current, 3))
    attr.needsUpdate = true
  })

  if (memories.length === 0) return null
  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

/**
 * One pane close enough to be worth its picture.
 *
 * The texture starts as the preview that came down in the document — no
 * request, no wait — and is replaced in place when the real photograph
 * resolves. `uSharp` crossing from 0 to 1 is what the eye reads as the glass
 * clearing.
 */
export function NearPane({
  memory,
  index,
  palette,
  picture,
  together,
  forming,
  opened,
}: {
  memory: Memory
  index: number
  palette: SkyPalette
  /** A resolved URL for the display copy, or null while it is still coming. */
  picture: string | null
  together: boolean
  forming: boolean
  /** True for the one memory being looked at. The only pane that keeps its light. */
  opened: boolean
}) {
  const quad = useQuad()
  const slot = useMemo(() => slotFor(index), [index])
  const size = useMemo(() => paneSize(), [memory])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: NEAR_VERT,
        fragmentShader: NEAR_FRAG,
        side: DoubleSide,
        uniforms: {
          uMap: { value: null as Texture | null },
          uTint: { value: new Color(memory.tint) },
          uCentre: { value: new Vector3() },
          uSize: { value: new Vector2(1, 1) },
          uFace: { value: new Vector2(1, 0) },
          uForm: { value: forming ? 0 : 1 },
          uSharp: { value: 0 },
          uWhose: { value: memory.by === 'cool' ? 1 : 0 },
          uTogether: { value: 0 },
          uCrop: { value: new Vector2(1, 1) },
          uNight: { value: 0 },
          uHush: { value: 0 },
          uFogColor: { value: new Color('#c3cebe') },
          uSunColor: { value: new Color('#fff2d8') },
          uFogNear: { value: 16 },
          uFogFar: { value: 150 },
          uLight: { value: 1 },
          uSun: { value: 1 },
        },
      }),
    // Rebuilt when the memory changes, because everything above is about it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memory.id],
  )
  useEffect(() => () => material.dispose(), [material])
  useLit(material, palette)

  useEffect(() => {
    const u = material.uniforms
    const [x, y, z] = paneAt(slot, size.h)
    ;(u.uCentre.value as Vector3).set(x, y, z)
    ;(u.uSize.value as Vector2).set(size.w, size.h)
    ;(u.uFace.value as Vector2).set(slot.side, slot.tilt)
    ;(u.uTint.value as Color).set(memory.tint)
    ;(u.uCrop.value as Vector2).set(...cropFor(memory.width, memory.height))
    u.uWhose.value = memory.by === 'cool' ? 1 : 0
  }, [material, slot, size, memory])

  /*
    Two textures, in order, and the first one is free.

    The preview is a data URI already in memory, so it decodes without a
    request and the pane is never a blank rectangle. The photograph replaces it
    when it arrives. Both are disposed when this pane goes out of range —
    without that, walking the length of the Glasshouse leaks a texture per
    memory and the tab is out of GPU memory by the far end.
  */
  const held = useRef<Texture[]>([])
  useEffect(() => {
    return () => {
      for (const texture of held.current) texture.dispose()
      held.current = []
    }
  }, [memory.id])

  useEffect(() => {
    if (!memory.blur) return
    let gone = false
    const image = new Image()
    image.onload = () => {
      if (gone) return
      const texture = new Texture(image)
      texture.needsUpdate = true
      held.current.push(texture)
      material.uniforms.uMap.value = texture
    }
    image.src = memory.blur
    return () => {
      gone = true
    }
  }, [memory.blur, material])

  const sharp = useRef(0)
  useEffect(() => {
    if (!picture) return
    let gone = false
    const image = new Image()
    // The mock hands back a blob: URL and the real layer a signed one on
    // another origin; without this the second is a tainted texture and WebGL
    // refuses it with a security error rather than a broken picture.
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      if (gone) return
      const texture = new Texture(image)
      texture.needsUpdate = true
      held.current.push(texture)
      material.uniforms.uMap.value = texture
      sharp.current = 0
    }
    image.src = picture
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
    // Eased rather than switched: her opening the same picture should arrive
    // as a light coming up, not as a rectangle changing state.
    const want = together ? 1 : 0
    u.uTogether.value += (want - u.uTogether.value) * (1 - Math.exp(-4 * delta))

    // Straight off the turn, so the room dims exactly as fast as it swings.
    u.uHush.value = opened ? 0 : focus.open
  })

  return <mesh geometry={quad} material={material} frustumCulled={false} />
}

/**
 * Every pool of colour on the floor, in one draw call.
 *
 * Rebuilt whenever the memories change and then left alone — the pools do not
 * move, because the panes do not. What moves is the building, and the group
 * this sits inside carries it.
 */
export function Pools({
  memories,
  palette,
  litId,
  freshIds,
}: {
  memories: Memory[]
  palette: SkyPalette
  /** The one that is open, whose colour fills the room. */
  litId: string | null
  /**
   * The ones she hung while you were away.
   *
   * The pools were already this room's way of saying a photograph is *there*.
   * So a memory you have not seen does not need a new kind of mark — it does
   * the thing the room already does, a little harder, and it breathes rather
   * than sitting steady, because a steady light is furniture and a moving one
   * is somebody having been here. Only ever hers, and only until you come.
   * See useStoodIn.
   */
  freshIds: Set<string>
}) {
  const quad = useQuad()

  /*
    One pool per pane that still has glass in it.

    `lit` comes back alongside, mapping each *row of this buffer* to the memory
    it belongs to — because once removed memories are skipped, the row index
    and the memory's age are no longer the same number, and the frame loop
    below has to brighten the right row when one is opened.
  */
  const { geometry, lit } = useMemo(() => {
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', quad.attributes.position)
    geo.setAttribute('uv', quad.attributes.uv)
    if (quad.index) geo.setIndex(quad.index)

    const n = Math.max(1, memories.length)
    const at = new Float32Array(n * 3)
    const spread = new Float32Array(n * 2)
    const tint = new Float32Array(n * 3)
    const power = new Float32Array(n)
    const c = new Color()
    const lit: string[] = []

    let i = 0
    for (let age = 0; age < memories.length; age++) {
      const memory = memories[age]
      // Nothing in the glass, so nothing on the floor.
      if (memory.removed) continue
      const slot = slotFor(age)
      const { w, h } = paneSize()
      const [, , poolZ] = paneAt(slot, h)
      /*
        The pool lands between the wall and the middle of the aisle, not
        directly under the pane. Light coming through a window at head height
        falls *inward*; a glow centred on the skirting is a strip light.
      */
      at[i * 3] = slot.side * HALF * 0.42
      at[i * 3 + 1] = 0.035
      at[i * 3 + 2] = poolZ
      spread[i * 2] = HALF * 1.5
      spread[i * 2 + 1] = w * 1.25
      c.set(memory.tint)
      tint.set([c.r, c.g, c.b], i * 3)
      power[i] = 1.5
      lit.push(memory.id)
      i++
    }

    geo.setAttribute('iAt', new InstancedBufferAttribute(at, 3))
    geo.setAttribute('iSpread', new InstancedBufferAttribute(spread, 2))
    geo.setAttribute('iTint', new InstancedBufferAttribute(tint, 3))
    geo.setAttribute('iPower', new InstancedBufferAttribute(power, 1))
    geo.instanceCount = i
    return { geometry: geo, lit }
  }, [memories, quad])

  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: POOL_VERT,
        fragmentShader: POOL_FRAG,
        transparent: true,
        blending: AdditiveBlending,
        // Light does not occlude. Without this the pools cut holes in each
        // other and in the flagstones they are lying on.
        depthWrite: false,
        /*
          Double-sided, and this is not belt and braces — it is the bug.

          POOL_VERT lays the quad down by mapping the plane's own y onto world
          z. That remap *reverses the winding*: a triangle wound one way in the
          plane's own space comes out wound the other when seen from above, so
          every pool was a back face and every one of them was culled. Nothing
          errored and nothing warned; the floor was simply bare — including at
          eight times the intended brightness with depth testing switched off,
          which is how long it took to stop blaming the blend mode.

          **Any vertex shader that swaps or negates an axis has changed the
          winding of everything it draws.** The near panes and the empty frame
          flip z by the wall they are on, so they are double-sided for exactly
          the same reason, and were only ever visible on one side of the aisle
          by luck.
        */
        side: DoubleSide,
        uniforms: { uFogFar: { value: 150 }, uNight: { value: 0 } },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    material.uniforms.uFogFar.value = palette.fogFar
    // Off the sun rather than the clock, so it can never disagree with the sky.
    material.uniforms.uNight.value = Math.max(0, Math.min(1, 1 - palette.sunIntensity / 0.9))
  }, [material, palette])

  const flood = useRef(0)
  const clock = useRef(0)

  useFrame((_, delta) => {
    const attr = geometry.getAttribute('iPower') as InstancedBufferAttribute | undefined
    if (!attr) return
    clock.current += delta
    // The row of the buffer, not the memory's age — see `lit` above.
    const row = litId ? lit.indexOf(litId) : -1
    const want = row >= 0 ? 1 : 0
    const next = flood.current + (want - flood.current) * (1 - Math.exp(-3 * delta))
    const breathing = freshIds.size > 0
    if (!breathing && Math.abs(next - flood.current) < 0.0005 && want === 0) return
    flood.current = next
    // Slow: about seven seconds a breath. Anything quicker reads as a warning.
    const breath = 0.62 + 0.38 * Math.sin(clock.current * 0.9)
    for (let i = 0; i < lit.length; i++) {
      // The open one floods; the rest dim under it, so the room takes the
      // colour of the photograph you are looking at.
      const base = i === row ? 0.5 + flood.current * 2.6 : 0.5 * (1 - flood.current * 0.72)
      // And one she left while you were away burns above all of it — but only
      // until you have opened it, at which point it is simply a memory again.
      const fresh = i !== row && freshIds.has(lit[i]) ? 1.5 * breath * (1 - flood.current * 0.5) : 0
      attr.setX(i, base + fresh)
    }
    attr.needsUpdate = true
  })

  if (lit.length === 0) return null
  // No rotation on the mesh: POOL_VERT already lays the quad down, mapping the
  // plane's own y onto world z. Turning the mesh as well would stand every
  // pool back up on its edge.
  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}
