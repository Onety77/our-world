/**
 * One flower on the floor in front of every memory, in that memory's colours.
 *
 * ---------------------------------------------------------------------------
 * **This is the thing that turns a tunnel with pictures in it into pictures
 * that have grown into a tunnel.**
 *
 * The Glasshouse had the right idea and the wrong emphasis: the ironwork was
 * the subject and the photographs were decoration along its edges. A building
 * cannot be talked out of that — but it can be *grown over*. A flower standing
 * in front of each pane, taking its colour from the photograph above it, does
 * three things at once. It puts something living at eye-drop level where the
 * floor was empty stone. It repeats each memory's colour twice, so the colour
 * belongs to the place rather than to the glass. And it makes the count of
 * what the two of you have kept legible from anywhere in the building, because
 * a row of flowers reads as *many* long before a row of rectangles does.
 *
 * And after dark it is the lamp. The petals hold light like everything else
 * here does, so the aisle at midnight is lit from the floor by the memories
 * themselves — which is both the prettiest the place ever looks and the only
 * reason the photographs are visible at all at that hour.
 * ---------------------------------------------------------------------------
 *
 * One instanced mesh for the lot. A stem, a whorl of petals and a centre, in
 * about forty triangles — the same shape the Tree of Thoughts grows, because
 * the two places are doing the same thing and should look like they know it.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  ShaderMaterial,
  type BufferGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { makeRng, range, seedFrom } from '@/systems/rng'
import type { Memory } from '@/data/types'
import type { SkyPalette } from '@/systems/palette'
import { ambientLightLevel } from '@/world/forms'
import { HALF, paneAt, paneSize, slotFor } from './layout'

const VERT = /* glsl */ `
  precision mediump float;

  attribute vec3 iOffset;
  attribute vec3 iColor;
  attribute vec2 iSway;
  attribute float iScale;
  /** 0 stem and leaf, 1 petal, 2 centre. See flowerBase. */
  attribute float aPart;

  uniform float uTime;

  varying vec3 vColor;
  varying float vUp;
  varying float vDepth;
  varying float vPart;

  void main() {
    vColor = iColor;
    vPart = aPart;
    vUp = normalize(normal).y * 0.5 + 0.5;

    vec3 p = position * iScale;

    /*
      A slow lean, from the foot.

      There is no wind inside a building, so this is much smaller than the
      meadow's — it is the draught through the broken roof, and its only job is
      to stop forty identical flowers reading as a printed pattern.
    */
    float lean = sin(uTime * 0.5 + iSway.x) * 0.55 + sin(uTime * 0.83 + iSway.y) * 0.28;
    float lift = clamp(position.y * iScale, 0.0, 2.0);
    p.x += lean * lift * 0.035;
    p.z += lean * lift * 0.018;

    vec4 mv = modelViewMatrix * vec4(p + iOffset, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */ `
  precision mediump float;

  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uLight;
  uniform float uNight;

  varying vec3 vColor;
  varying float vUp;
  varying float vDepth;
  varying float vPart;

  void main() {
    /*
      The stem stays green whatever colour the flower is.

      Tinting the whole plant by the photograph gives you a green flower with a
      green stalk or a red flower with a red stalk, and both read as one solid
      object rather than as a plant. The centre is the flower's own colour
      lifted most of the way to bone, which is what a real one does.
    */
    vec3 stem = vec3(0.26, 0.33, 0.20);
    vec3 heart = mix(vColor, vec3(0.96, 0.92, 0.80), 0.7);
    vec3 tint = vPart < 0.5 ? stem : (vPart < 1.5 ? vColor : heart);

    vec3 col = tint * (0.58 + vUp * 0.55) * uLight;

    /*
      And after dark it is a lamp.

      The petals and the centre light; the stem does not, so the flower reads
      as a small held light on a stalk rather than as a glowing weed. This is
      the floor lighting of the whole building at night.
    */
    if (vPart >= 0.5) {
      col += tint * uNight * (vPart < 1.5 ? 0.85 : 1.5);
    }

    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fog);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * Where a memory's flower stands.
 *
 * On the floor, in from the wall and just off the pane's own centre line, so
 * a row of them down one side is a wandering line rather than a fence. The z
 * comes from `paneAt` rather than from the slot, for the same reason
 * everything else does: the pane's height is clamped there and the two must
 * not drift apart.
 */
function flowerAt(index: number): [number, number, number] {
  const slot = slotFor(index)
  const rng = makeRng(seedFrom(`glasshouse:flower:${index}`))
  const { h } = paneSize()
  const [, , z] = paneAt(slot, h)
  return [
    // Between the dwarf wall and the aisle, never against the skirting.
    slot.side * (HALF - range(rng, 0.42, 0.86)),
    0.02,
    z + range(rng, -0.5, 0.5),
  ]
}

export function Flowers({
  memories,
  palette,
}: {
  memories: Memory[]
  palette: SkyPalette
}) {
  const geometry = useMemo(() => {
    const solid = flowerBase()
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', solid.attributes.position)
    geo.setAttribute('normal', solid.attributes.normal)
    geo.setAttribute('aPart', solid.attributes.aPart)

    const n = Math.max(1, memories.length)
    const offset = new Float32Array(n * 3)
    const color = new Float32Array(n * 3)
    const sway = new Float32Array(n * 2)
    const scale = new Float32Array(n)
    const c = new Color()

    let i = 0
    for (let age = 0; age < memories.length; age++) {
      const memory = memories[age]
      // A memory taken out of the glass takes its flower with it — the wall
      // closes over the pane, and the floor closes over this.
      if (memory.removed) continue
      const rng = makeRng(seedFrom(`glasshouse:bloom:${age}`))
      offset.set(flowerAt(age), i * 3)
      /*
        The photograph's own colour, lifted.

        The stored tint is an *average*, which for most photographs is a muted
        mid — beautiful in a wall of glass and muddy in a flower. Pushing it
        away from grey gives the plant a flower's colour while keeping it
        recognisably this memory's.
      */
      c.set(memory.tint)
      const grey = (c.r + c.g + c.b) / 3
      c.setRGB(
        Math.min(1, grey + (c.r - grey) * 2.1),
        Math.min(1, grey + (c.g - grey) * 2.1),
        Math.min(1, grey + (c.b - grey) * 2.1),
      )
      color.set([c.r, c.g, c.b], i * 3)
      sway[i * 2] = rng() * 6.28
      sway[i * 2 + 1] = rng() * 6.28
      scale[i] = range(rng, 0.82, 1.25)
      i++
    }

    geo.setAttribute('iOffset', new InstancedBufferAttribute(offset, 3))
    geo.setAttribute('iColor', new InstancedBufferAttribute(color, 3))
    geo.setAttribute('iSway', new InstancedBufferAttribute(sway, 2))
    geo.setAttribute('iScale', new InstancedBufferAttribute(scale, 1))
    geo.instanceCount = i
    solid.dispose()
    return geo
  }, [memories])

  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        // Petals are cones seen from every side as you walk past them.
        side: DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uFogColor: { value: new Color('#c3cebe') },
          uFogNear: { value: 16 },
          uFogFar: { value: 150 },
          uLight: { value: 1 },
          uNight: { value: 0 },
        },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const u = material.uniforms
    ;(u.uFogColor.value as Color).set(palette.fogColor)
    u.uFogNear.value = palette.fogNear
    u.uFogFar.value = palette.fogFar
    u.uLight.value = ambientLightLevel(palette)
    // Off the sun, like every other night term in this section, so nothing
    // here can ever disagree with the sky about whether it is dark.
    u.uNight.value = Math.max(0, Math.min(1, 1 - palette.sunIntensity / 0.9))
  }, [material, palette])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
  })

  if (geometry.instanceCount === 0) return null
  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

/**
 * One plant: a stem, two leaves, five petals and a centre.
 *
 * `aPart` says which piece each vertex belongs to, so one instance colour can
 * paint the petals while the stem stays green — without it the whole plant,
 * roots and all, comes out the colour of the photograph.
 *
 * Deliberately small: a memory's flower is knee-high, not waist-high. It is
 * marking a pane, not competing with it.
 */
function flowerBase(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  const part: number[] = []

  const add = (g: BufferGeometry, which: number) => {
    const solid = (g.index ? g.toNonIndexed() : g) as BufferGeometry
    pieces.push(solid)
    for (let i = 0; i < solid.attributes.position.count; i++) part.push(which)
  }

  const stem = new CylinderGeometry(0.008, 0.014, 0.34, 4)
  stem.translate(0, 0.17, 0)
  add(stem, 0)

  for (const side of [-1, 1]) {
    const leaf = new ConeGeometry(0.035, 0.14, 3)
    leaf.rotateZ(side * 1.2)
    leaf.translate(side * 0.05, 0.13, 0)
    add(leaf, 0)
  }

  for (let i = 0; i < 5; i++) {
    const petal = new ConeGeometry(0.038, 0.13, 3)
    petal.translate(0, 0.065, 0)
    petal.rotateX(0.9)
    petal.rotateY((i / 5) * Math.PI * 2)
    petal.translate(0, 0.35, 0)
    add(petal, 1)
  }

  const centre = new IcosahedronGeometry(0.03, 0)
  centre.translate(0, 0.37, 0)
  add(centre, 2)

  const merged = mergeGeometries(pieces, false)
  for (const g of pieces) g.dispose()
  if (!merged) throw new Error('A memory failed to flower.')
  merged.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1))
  merged.deleteAttribute('uv')
  return merged
}
