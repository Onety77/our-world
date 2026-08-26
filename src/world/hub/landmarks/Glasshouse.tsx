/**
 * The Glasshouse, seen from the garden.
 *
 * ---------------------------------------------------------------------------
 * **This one is not a preview. It is the actual state of the place.**
 *
 * The Tree's landmark is a tree and the Stars' is two lights on a cairn —
 * likenesses, because the things they open into cannot be put in a meadow.
 * This can: a conservatory *is* an object that stands in a garden, and it is
 * built here out of the same `ironFrame` the section uses, with the same
 * `slotFor` deciding where each pane sits and the real memories' own colours
 * in the glass.
 *
 * So it grows. An empty Glasshouse is a bare iron skeleton out on the grass;
 * one with two years in it is lit from the inside and throws colour on the
 * meadow around it, and there is nothing to keep in step because there is only
 * one description of the building.
 * ---------------------------------------------------------------------------
 *
 * It lies *along* the row rather than facing it — you see it in profile and
 * down its length at once, which is the shape of the thing, and the near gable
 * is left open so the aisle reads as somewhere that goes in.
 */

import { useEffect, useMemo } from 'react'
import {
  BoxGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import { useMemories } from '@/systems/memories'
import { useSceneEnv } from '@/world/SceneEnv'
import { ambientLightLevel, buildInstanced, useFormMaterial } from '@/world/forms'
import {
  flagstones,
  ironFrame,
  panelKey,
  roofGlazing,
  vines,
  wallGlazing,
} from '@/sections/glasshouse/ironwork'
import { BAY, paneAt, paneSize, slotFor } from '@/sections/glasshouse/layout'

/**
 * How much of the building the garden shows, in bays.
 *
 * Eight. The real one runs as far as the memories do, and a hundred metres of
 * conservatory lying in a meadow would be a hangar — at this distance the eye
 * wants an object, not an extent. What the far end does instead is fade into
 * the fog, which is exactly what a long building does when you look down it.
 */
const SHOWN = 8

/**
 * Which memories get glass in the preview.
 *
 * The most recent handful that happen to fall inside the shown bays, so the
 * newest things either of you kept are the colours you can see from outside.
 */
function previewed(all: { removed?: unknown }[]): number[] {
  const out: number[] = []
  const count = all.length
  /*
    Nothing yet is nothing, not "memory zero".

    `Math.max(0, count - 1)` clamps an empty Glasshouse to index 0 and the loop
    below then happily returns `[0]` — a memory that does not exist — and the
    caller reads `.width` off undefined. Which is a crash, in the *garden*,
    on the very first run before either of you has left anything: the one
    state that is guaranteed to happen and the one nothing else exercises.
  */
  if (count <= 0) return out
  const deepest = count - 1
  for (let i = deepest; i >= 0 && out.length < 22; i--) {
    if (slotFor(deepest).bay - slotFor(i).bay > SHOWN - 2) break
    // Taken out of the glass: it keeps its bay so nothing else moves, and it
    // has no colour to show from a meadow away.
    if (all[i].removed) continue
    out.push(i)
  }
  return out
}

/**
 * How many bays the preview is slid back by.
 *
 * A whole number of bays, and it has to be: the panes are set into wall
 * *panels*, and the panels are per bay — so shifting by a fraction would put
 * every photograph half in one panel and half in the next, with plain glass
 * showing through the join. The newest memory lands two bays in from the near
 * end, where it has ironwork on both sides of it.
 *
 * Without any shift a Glasshouse with a hundred memories in it would draw its
 * panes a hundred bays away and the garden would show eight bays of empty
 * ironwork — the building would appear to stop growing the moment it got
 * going, which is the opposite of the one thing this landmark exists to say.
 */
function shiftedBy(chosen: number[]): number {
  if (chosen.length === 0) return 0
  return slotFor(chosen[0]).bay - (SHOWN - 2)
}

const GLASS_VERT = /* glsl */ `
  attribute vec3 iCentre;
  attribute vec2 iSize;
  attribute vec3 iTint;
  attribute vec2 iFace;

  varying vec3 vTint;
  varying vec2 vUv;
  varying float vDepth;

  void main() {
    vTint = iTint;
    vUv = uv;
    vec2 flat2 = position.xy * iSize;
    float c = cos(iFace.y), s = sin(iFace.y);
    vec2 turned = vec2(flat2.x * c - flat2.y * s, flat2.x * s + flat2.y * c);
    vec3 world = vec3(iCentre.x, iCentre.y + turned.y, iCentre.z - turned.x * iFace.x);
    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const GLASS_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uFogColor;
  uniform vec3 uSunColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uLight;
  uniform float uNight;
  varying vec3 vTint;
  varying vec2 vUv;
  varying float vDepth;

  void main() {
    vec2 edge = min(vUv, 1.0 - vUv);
    float lead = smoothstep(0.0, 0.06, min(edge.x, edge.y));

    vec3 col = vTint * (0.5 + vUv.y * 0.7) * uLight;
    col = mix(col, col * uSunColor * 1.2, 0.3);
    /*
      Lit from within after dark.

      By day the sun is behind the glass and the panes are colour; by night the
      only light in the meadow is what the two of you have kept, and the
      building becomes a lantern. It is the same fact stated twice, which is
      what makes it worth looking at at every hour rather than only at one.
    */
    col += vTint * uNight * 0.9;
    col *= mix(0.3, 1.0, lead);

    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fog);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function GlasshouseLandmark() {
  const { palette } = useSceneEnv()
  const memories = useMemories((s) => s.all)

  const iron = useMemo(() => {
    const base = new BoxGeometry(1, 1, 1)
    const built = buildInstanced(base, ironFrame(SHOWN * BAY))
    base.dispose()
    return built
  }, [])
  useEffect(() => () => iron.dispose(), [iron])

  const floor = useMemo(() => {
    const base = new BoxGeometry(1, 1, 1)
    const built = buildInstanced(base, flagstones(SHOWN * BAY))
    base.dispose()
    return built
  }, [])
  useEffect(() => () => floor.dispose(), [floor])

  const growth = useMemo(() => {
    const base = new PlaneGeometry(1, 1)
    const built = buildInstanced(base, vines(SHOWN * BAY, 20))
    base.dispose()
    return built
  }, [])
  useEffect(() => () => growth.dispose(), [growth])

  /*
    The plain glazing, same as inside, and it is not optional out here either.

    Without it this landmark was a row of iron hoops with coloured cards
    floating between them — the exact "it is a pergola" failure the section
    itself had, repeated in the preview, which is precisely what building the
    landmark out of the same functions is supposed to prevent. It was left out
    the first time because the panes seemed like enough, and from twenty-five
    metres away they are not: what says *glasshouse* at that distance is a
    milky roof with holes in it.

    The panels a memory stands in are held open, using the same `panelKey`
    the section uses, so the two can never disagree about which is which.
  */
  const glazing = useMemo(() => {
    const chosen = previewed(memories)
    const taken = new Set(chosen.map((age) => {
      const slot = slotFor(age)
      return panelKey(slot.bay - shiftedBy(chosen), slot.side)
    }))
    const base = new PlaneGeometry(1, 1)
    const built = buildInstanced(base, [
      ...roofGlazing(SHOWN * BAY),
      ...wallGlazing(SHOWN * BAY, taken),
    ])
    base.dispose()
    return built
  }, [memories.length])
  useEffect(() => () => glazing.dispose(), [glazing])

  /*
    The glass, shifted so the newest bay lands at the near end of the preview.

    Without the shift a Glasshouse with a hundred memories in it would draw its
    panes a hundred bays away and the garden would show eight bays of empty
    ironwork — the building would appear to stop growing the moment it got
    going, which is the opposite of the one thing this landmark exists to say.
  */
  const glass = useMemo(() => {
    const chosen = previewed(memories)
    const quad = new PlaneGeometry(1, 1)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', quad.attributes.position)
    geo.setAttribute('uv', quad.attributes.uv)
    if (quad.index) geo.setIndex(quad.index)

    const n = Math.max(1, chosen.length)
    const centre = new Float32Array(n * 3)
    const size = new Float32Array(n * 2)
    const tint = new Float32Array(n * 3)
    const face = new Float32Array(n * 2)
    const c = new Color()
    const shift = shiftedBy(chosen) * BAY

    chosen.forEach((age, i) => {
      const slot = slotFor(age)
      const { w, h } = paneSize()
      const [x, y, z] = paneAt(slot, h)
      centre[i * 3] = x
      centre[i * 3 + 1] = y
      centre[i * 3 + 2] = z - shift
      size[i * 2] = w
      size[i * 2 + 1] = h
      c.set(memories[age].tint)
      tint.set([c.r, c.g, c.b], i * 3)
      face[i * 2] = slot.side
      face[i * 2 + 1] = slot.tilt
    })

    geo.setAttribute('iCentre', new InstancedBufferAttribute(centre, 3))
    geo.setAttribute('iSize', new InstancedBufferAttribute(size, 2))
    geo.setAttribute('iTint', new InstancedBufferAttribute(tint, 3))
    geo.setAttribute('iFace', new InstancedBufferAttribute(face, 2))
    geo.instanceCount = chosen.length
    quad.dispose()
    return geo
  }, [memories])
  useEffect(() => () => glass.dispose(), [glass])

  const ironMaterial = useFormMaterial(palette, { sway: 0.1, flatten: 0.25 })
  const stoneMaterial = useFormMaterial(palette, { sway: 0, flatten: 0.3 })
  const glazingMaterial = useFormMaterial(palette, {
    sway: 0.1,
    flatten: 0.25,
    doubleSided: true,
  })
  const leafMaterial = useFormMaterial(palette, {
    sway: 0.8,
    flatten: 0.2,
    doubleSided: true,
  })

  const glassMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: GLASS_VERT,
        fragmentShader: GLASS_FRAG,
        side: DoubleSide,
        uniforms: {
          uFogColor: { value: new Color('#c3cebe') },
          uSunColor: { value: new Color('#fff2d8') },
          uFogNear: { value: 16 },
          uFogFar: { value: 150 },
          uLight: { value: 1 },
          uNight: { value: 0 },
        },
      }),
    [],
  )
  useEffect(() => () => glassMaterial.dispose(), [glassMaterial])

  useEffect(() => {
    const u = glassMaterial.uniforms
    ;(u.uFogColor.value as Color).set(palette.fogColor)
    ;(u.uSunColor.value as Color).set(palette.sunColor)
    u.uFogNear.value = palette.fogNear
    u.uFogFar.value = palette.fogFar
    u.uLight.value = ambientLightLevel(palette)
    /*
      How much of the glow is coming from inside.

      Driven off the sun rather than the clock, so it follows the same curve
      everything else in the garden does and cannot disagree with the sky about
      whether it is dark.
    */
    u.uNight.value = Math.max(0, 1 - palette.sunIntensity / 0.9)
  }, [glassMaterial, palette])

  return (
    /*
      Turned across the row and a few degrees off square, so you see it in
      profile and down its length at once. Dead perpendicular would be a wall;
      dead-on would be a gable. This is the angle at which it is obviously a
      long building with an inside.
    */
    <group rotation={[0, Math.PI * 0.42, 0]}>
      <group position={[0, 0, -(SHOWN * BAY) / 2]}>
        <mesh geometry={floor} material={stoneMaterial} frustumCulled={false} />
        <mesh geometry={iron} material={ironMaterial} frustumCulled={false} />
        <mesh geometry={glazing} material={glazingMaterial} frustumCulled={false} />
        <mesh geometry={growth} material={leafMaterial} frustumCulled={false} />
        {memories.length > 0 && (
          <mesh geometry={glass} material={glassMaterial} frustumCulled={false} />
        )}
      </group>
    </group>
  )
}
