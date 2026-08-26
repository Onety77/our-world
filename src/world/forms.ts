/**
 * Shared machinery for solid instanced shapes — trees, landmarks, rocks.
 *
 * They all use one shader so they all agree about fog. Two materials with
 * slightly different fog curves is the kind of thing nobody can name but
 * everybody can see: the treeline sits at a different depth from the ground it
 * stands on.
 */

import { useEffect, useMemo } from 'react'
import {
  Box3,
  Color,
  DoubleSide,
  FrontSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  ShaderMaterial,
  Sphere,
  Vector3,
  type BufferGeometry,
} from 'three'
import type { SkyPalette } from '@/systems/palette'

export const FORM_VERT = /* glsl */ `
  attribute vec3 iOffset;
  attribute vec3 iScale;
  attribute float iRot;
  attribute float iPhase;
  attribute vec3 iColor;
  /** Tilt in radians, about X then about Z. Branches and leaning trunks. */
  attribute vec2 iLean;
  /**
   * How high this piece's own origin sits above the foot of the thing it
   * belongs to. The wind bends by height, so a canopy eight metres up swings
   * and the trunk it sits on barely moves — see below.
   */
  attribute float iAnchorY;

  uniform float uTime;
  uniform float uWind;
  /**
   * How far the top travels, in metres, at ten metres up and full wind.
   * Stated in that unit because the bend is quadratic in height: a number that
   * suits a canopy would leave a reed motionless, and the alternative was
   * per-material constants nobody could reason about.
   */
  uniform float uSway;

  varying vec3 vColor;
  varying float vDepth;
  varying float vUp;
  /** Position within this landmark, for the ember light. See FORM_FRAG. */
  varying vec3 vLocal;
  varying vec3 vNormalLocal;

  vec3 rotX(vec3 v, float a) {
    float c = cos(a), s = sin(a);
    return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
  }
  vec3 rotZ(vec3 v, float a) {
    float c = cos(a), s = sin(a);
    return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
  }
  vec3 rotY(vec3 v, float a) {
    float c = cos(a), s = sin(a);
    return vec3(v.x * c - v.z * s, v.y, v.x * s + v.z * c);
  }

  void main() {
    vColor = iColor;

    vec3 p = position * iScale;
    vec3 n = normal;

    // Lean first, spin second. The other order would swing a branch around a
    // cone instead of tilting it in the direction it was given.
    p = rotZ(rotX(p, iLean.x), iLean.y);
    n = rotZ(rotX(n, iLean.x), iLean.y);
    p = rotY(p, iRot);
    n = rotY(n, iRot);

    vUp = normalize(n).y * 0.5 + 0.5;

    // Leans on the same gusts that move the grass, so the whole garden breathes
    // together instead of each layer having its own weather.
    float gust = sin(uTime * 0.31 + iOffset.x * 0.03 + iOffset.z * 0.024) * 0.5 + 0.5;
    float sway = sin(uTime * 0.61 + iPhase) * 0.6 + sin(uTime * 1.13 + iPhase * 1.4) * 0.25;
    // roughly -1..1, the weather with no opinion about what it is moving
    float wave = sway * (0.35 + gust * 0.8) * uWind;

    /*
      Bend by height above the root, not rigidly.

      Every instance used to be shifted bodily by the same amount, which slid
      whole trunks across the ground while their roots stayed put — the tell
      that a tree is a sprite and not a tree. Squaring the height concentrates
      the movement in the crown, which is what a real tree does: the bole holds
      and the top of it travels.
    */
    float h = max(0.0, iAnchorY + p.y);
    float bend = wave * uSway * h * h * 0.01;
    p.x += bend;
    p.z += bend * 0.4;

    vec3 local = p + iOffset;
    vLocal = local;
    vNormalLocal = normalize(n);

    vec4 mv = modelViewMatrix * vec4(local, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

export const FORM_FRAG = /* glsl */ `
  precision mediump float;

  uniform vec3 uFogColor;
  uniform vec3 uSunColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uSun;
  uniform float uLight;
  uniform float uFlatten;

  /*
    A single local light — a campfire, a pair of lanterns.

    This shader is not lit by the scene at all: it takes one ambient level and
    one sun colour and that is the whole lighting model, which is why it can
    draw a hundred and fifty trees in two calls. That was fine until the Hollow
    needed firelight on its own stone. A three.js point light next to it did
    exactly nothing, silently, because nothing here has ever read a light — so
    the cave mouth rendered as a grey heap of rubble at every hour.

    Rather than move the whole garden onto lit materials for one landmark,
    there is room for exactly one point light, in the landmark's own local
    space. uEmberPower of 0 — the default everywhere else — costs one multiply.
  */
  uniform vec3 uEmberPos;
  uniform vec3 uEmberColor;
  uniform float uEmberRange;
  uniform float uEmberPower;

  varying vec3 vColor;
  varying float vDepth;
  varying float vUp;
  varying vec3 vLocal;
  varying vec3 vNormalLocal;

  void main() {
    // uFlatten pushes distant landmarks toward silhouette, so they read as
    // shapes on the horizon rather than competing with what's underfoot
    float shade = mix(0.42 + vUp * 0.62, 0.7, uFlatten);

    /*
      No per-shader brightness compensation lives here any more. Every shader
      in the garden now ends with the renderer's own tone-mapping and
      colour-space chunks, so all of them agree about what "lit" means — the
      ×2.7 hack this block used to hold existed only because forms skipped the
      sRGB encode that standard materials got, and displayed at a quarter of
      their authored brightness.
    */

    // Scaled by the ambient light level, or the canopies stay lit at midnight
    // while the grass beneath them goes dark — trees glowing over a black
    // meadow is the giveaway that nothing here is actually lit by anything.
    vec3 col = vColor * shade * uLight;
    col = mix(col, col * uSunColor * 1.15, 0.32 * uSun * vUp * (1.0 - uFlatten));

    if (uEmberPower > 0.0) {
      vec3 toLight = uEmberPos - vLocal;
      float dist = length(toLight);
      // Inverse-square would go to nothing across a cave mouth; this falls off
      // over a stated radius instead, which is far easier to place by eye.
      float fall = max(0.0, 1.0 - dist / uEmberRange);
      float lambert = max(0.0, dot(normalize(vNormalLocal), toLight / max(dist, 0.001)));
      col += vColor * uEmberColor * uEmberPower * fall * fall * (0.25 + lambert * 0.75);
    }

    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fog);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export interface FormInstance {
  offset: [number, number, number]
  scale: [number, number, number]
  /** Spin about Y, radians. */
  rot: number
  phase: number
  color: string
  /** Tilt about X then Z, radians. Defaults to upright. */
  lean?: [number, number]
  /**
   * Height of this piece's origin above the foot of the tree, rock or landmark
   * it is part of. Drives how far the wind bends it. Defaults to 0, which is
   * correct for anything sitting on the ground.
   */
  anchorY?: number
}

export function buildInstanced(
  base: BufferGeometry,
  items: FormInstance[],
): InstancedBufferGeometry {
  const geo = new InstancedBufferGeometry()
  geo.setAttribute('position', base.attributes.position)
  geo.setAttribute('normal', base.attributes.normal)
  if (base.index) geo.setIndex(base.index)

  const n = Math.max(1, items.length)
  const offset = new Float32Array(n * 3)
  const scale = new Float32Array(n * 3)
  const rot = new Float32Array(n)
  const phase = new Float32Array(n)
  const color = new Float32Array(n * 3)
  const lean = new Float32Array(n * 2)
  const anchorY = new Float32Array(n)
  const c = new Color()

  items.forEach((it, i) => {
    offset.set(it.offset, i * 3)
    scale.set(it.scale, i * 3)
    rot[i] = it.rot
    phase[i] = it.phase
    if (it.lean) lean.set(it.lean, i * 2)
    anchorY[i] = it.anchorY ?? 0
    c.set(it.color)
    color[i * 3] = c.r
    color[i * 3 + 1] = c.g
    color[i * 3 + 2] = c.b
  })

  geo.setAttribute('iOffset', new InstancedBufferAttribute(offset, 3))
  geo.setAttribute('iScale', new InstancedBufferAttribute(scale, 3))
  geo.setAttribute('iRot', new InstancedBufferAttribute(rot, 1))
  geo.setAttribute('iPhase', new InstancedBufferAttribute(phase, 1))
  geo.setAttribute('iColor', new InstancedBufferAttribute(color, 3))
  geo.setAttribute('iLean', new InstancedBufferAttribute(lean, 2))
  geo.setAttribute('iAnchorY', new InstancedBufferAttribute(anchorY, 1))
  geo.instanceCount = items.length
  return geo
}

/**
 * The same field, cut into pieces the graphics card can skip.
 *
 * ---------------------------------------------------------------------------
 * **Nothing in this garden was ever culled, and that was most of what it cost.**
 *
 * Every big field here — the wood, the meadow, the flowers — was built as one
 * instanced mesh and marked `frustumCulled={false}`. There was a good reason:
 * an instanced geometry's bounding sphere is computed from the *base* shape,
 * which is one leaf or one blade a few centimetres across sitting at the
 * origin. Three would look at that sphere, decide the whole wood was a
 * thumbnail-sized object behind the camera, and delete the entire treeline the
 * moment you turned your head. Switching culling off is the standard fix and
 * it is the wrong permanent one, because it means **every blade of grass
 * behind you is transformed, sixty times a second, forever.**
 *
 * The camera sees about eighty degrees of a field that surrounds it on all
 * three hundred and sixty. So roughly three quarters of every field was being
 * drawn where it could not possibly be seen.
 *
 * This cuts a field into square tiles and gives each one an honest bounding
 * sphere, so the ordinary frustum test can do its ordinary job. The cost is
 * draw calls — one per tile instead of one per field — and this garden has
 * enormous headroom there: it renders whole places in eighteen calls, and the
 * budget on any device made this decade is in the hundreds.
 *
 * **The sphere is padded, and the padding is not optional.** Every one of these
 * fields is displaced in the vertex shader by the wind, so a tile's real
 * extent is wider than the positions it was built from — and a bounding volume
 * that is slightly too small does not look like a bounding volume that is
 * slightly too small. It looks like a corner of the meadow blinking out as you
 * turn, which is far worse than the cost of drawing a tile you did not need.
 * ---------------------------------------------------------------------------
 */
export function buildTiles(
  base: BufferGeometry,
  items: FormInstance[],
  {
    tile = 24,
    sway = 2.5,
  }: {
    /** Metres to a side. Smaller culls more and costs more draw calls. */
    tile?: number
    /** Metres of wind travel to allow for. See above — err large. */
    sway?: number
  } = {},
): InstancedBufferGeometry[] {
  if (items.length === 0) return [buildInstanced(base, items)]

  const buckets = new Map<string, FormInstance[]>()
  for (const item of items) {
    const key = `${Math.floor(item.offset[0] / tile)},${Math.floor(item.offset[2] / tile)}`
    const into = buckets.get(key)
    if (into) into.push(item)
    else buckets.set(key, [item])
  }

  const out: InstancedBufferGeometry[] = []
  for (const group of buckets.values()) {
    const geo = buildInstanced(base, group)

    /*
      The box the tile really occupies.

      Taken from each instance's own position *and its scale*, because these
      are not points: a limb is anchored at its foot and runs its whole length
      away from it, and a bounding volume built from the anchors alone would be
      short by the height of a tree.
    */
    let minX = Infinity
    let minY = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let maxZ = -Infinity
    for (const it of group) {
      const reach = Math.max(Math.abs(it.scale[0]), Math.abs(it.scale[1]), Math.abs(it.scale[2]))
      minX = Math.min(minX, it.offset[0] - reach)
      minY = Math.min(minY, it.offset[1] - reach)
      minZ = Math.min(minZ, it.offset[2] - reach)
      maxX = Math.max(maxX, it.offset[0] + reach)
      maxY = Math.max(maxY, it.offset[1] + reach)
      maxZ = Math.max(maxZ, it.offset[2] + reach)
    }

    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const cz = (minZ + maxZ) / 2
    const radius =
      Math.hypot(maxX - cx, maxY - cy, maxZ - cz) + sway

    geo.boundingSphere = new Sphere(new Vector3(cx, cy, cz), radius)
    /*
      And a box to match, because three checks the sphere first and then, for
      anything that survives, nothing else — but other code (raycasts, helpers,
      a future shadow pass) reads the box, and a geometry whose two bounds
      disagree is a bug waiting for whoever adds that code.
    */
    geo.boundingBox = new Box3(
      new Vector3(minX - sway, minY - sway, minZ - sway),
      new Vector3(maxX + sway, maxY + sway, maxZ + sway),
    )
    out.push(geo)
  }
  return out
}

export function useFormMaterial(
  palette: SkyPalette,
  {
    sway = 0.3,
    flatten = 0,
    doubleSided = false,
  }: { sway?: number; flatten?: number; doubleSided?: boolean } = {},
) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: FORM_VERT,
        fragmentShader: FORM_FRAG,
        /*
          Leaves are flat, and a flat thing culled from behind is a hole.

          Half the leaves in any crown have their back to you, so with the
          default single-sided material a tree comes out visibly moth-eaten
          from every angle.
        */
        side: doubleSided ? DoubleSide : FrontSide,
        uniforms: {
          uTime: { value: 0 },
          uWind: { value: 1 },
          uSway: { value: sway },
          uFlatten: { value: flatten },
          uFogColor: { value: new Color('#c3cebe') },
          uSunColor: { value: new Color('#fff2d8') },
          uFogNear: { value: 16 },
          uFogFar: { value: 150 },
          uSun: { value: 1 },
          uLight: { value: 1 },
          uEmberPos: { value: new Vector3() },
          uEmberColor: { value: new Color('#ff8f42') },
          uEmberRange: { value: 10 },
          uEmberPower: { value: 0 },
        },
      }),
    [sway, flatten, doubleSided],
  )

  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const u = material.uniforms
    u.uFogColor.value.set(palette.fogColor)
    u.uSunColor.value.set(palette.sunColor)
    u.uFogNear.value = palette.fogNear
    u.uFogFar.value = palette.fogFar
    u.uSun.value = Math.min(1, palette.sunIntensity)
    u.uLight.value = ambientLightLevel(palette)
    u.uWind.value = palette.wind
  }, [material, palette])

  return material
}

/**
 * One number for "how lit is everything right now", 0..1. Shared by the trees,
 * the landmarks and the flowers so they all darken together at dusk rather than
 * each fading on its own schedule.
 */
export function ambientLightLevel(palette: SkyPalette): number {
  return Math.min(1, palette.sunIntensity * 0.55 + palette.ambientIntensity * 0.45)
}
