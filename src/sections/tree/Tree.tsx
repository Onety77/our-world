/**
 * The Tree of Thoughts.
 *
 * One great tree in a bright meadow. Every thought either of you writes grows
 * a flower at its foot — so the ground is a record. Empty at the start, and
 * after a year of small honest sentences it should be almost impassable with
 * colour. That accumulation *is* the feature; nothing here should ever remove
 * a flower.
 *
 * Tap a flower to read the thought that grew it.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  IcosahedronGeometry,
  Raycaster,
  ShaderMaterial,
  Vector2,
  Vector3,
  type BufferGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useReading } from '@/systems/reading'
import { raySphere } from '@/systems/terrain'
import { grabbed } from '@/systems/swipe'
import { treeGestureUsed } from '@/systems/treeOrbit'
import { useWorldSlice } from '@/data/provider'
import { useSceneEnv } from '@/world/SceneEnv'
import { ambientLightLevel } from '@/world/forms'
import { Grass } from '@/world/Grass'
import { Flowers } from '@/world/Flowers'
import { Trees } from '@/world/Trees'
import { TreeOfLetters } from '@/world/TreeOfLetters'
import { Letters, paperCentre, type Hung } from '@/world/Letters'
import { useData } from '@/data/provider'
import type { Letter } from '@/data/types'
import { MEADOW_X, MEADOW_Z, thoughtSpot } from './layout'
import { greatTree, hangDrop, hangSpot } from './greatTree'
import { useSections } from '@/systems/sections'
import { takenOverNow } from '@/systems/attention'
import { QuestionVine } from './QuestionVine'

/**
 * One thought as the tree hangs it: a knot on a branch, and the length of
 * thread that brings the paper down under the crown.
 *
 * In one place because two things need to agree about it — the mesh that draws
 * the sheet and the sphere you tap to open it — and they disagreed for a long
 * time, which is most of why nobody could open a thought from the air.
 */
function hungFrom(letter: Letter, index: number): Hung {
  return {
    id: letter.id,
    by: letter.by,
    readAt: letter.readAt,
    knot: hangSpot(index),
    drop: hangDrop(index),
  }
}

/**
 * A thought's flower.
 *
 * Deliberately not the meadow's scattered flowers — those are scenery. These
 * are placed, one per thought, in a slow outward spiral so the oldest sit
 * nearest the trunk and the newest ring the edge. Walking the spiral outward
 * is walking forward through everything the two of you have said.
 */
const BLOOM_VERT = /* glsl */ `
  attribute vec3 iOffset;
  attribute vec3 iColor;
  attribute float iPhase;
  attribute float iScale;
  /** 0 stem and leaf, 1 petal, 2 centre. See bloomBase. */
  attribute float aPart;

  uniform float uTime;
  uniform float uWind;

  varying vec3 vColor;
  varying float vUp;
  varying float vDepth;
  varying float vPart;

  void main() {
    vColor = iColor;
    vPart = aPart;
    vUp = normalize(normal).y * 0.5 + 0.5;

    vec3 p = position * iScale;

    // sway from the base, so the head moves and the root doesn't
    float sway = sin(uTime * 1.1 + iPhase) * 0.5 + sin(uTime * 2.3 + iPhase * 1.7) * 0.2;
    float lift = clamp(position.y * iScale + 0.2, 0.0, 2.0);
    p.x += sway * uWind * lift * 0.09;
    p.z += sway * uWind * lift * 0.04;

    vec4 mv = modelViewMatrix * vec4(p + iOffset, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const BLOOM_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uLight;
  varying vec3 vColor;
  varying float vUp;
  varying float vDepth;
  varying float vPart;

  void main() {
    // Stem and leaf hold their own green whatever colour the flower is; the
    // centre is the flower's colour lifted most of the way to bone.
    vec3 stem = vec3(0.30, 0.36, 0.22);
    vec3 heart = mix(vColor, vec3(0.94, 0.90, 0.78), 0.72);
    vec3 tint = vPart < 0.5 ? stem : (vPart < 1.5 ? vColor : heart);

    vec3 col = tint * (0.62 + vUp * 0.5) * uLight;
    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fog);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** Bloom colours. Warm for one of you, cool for the other — see below. */
const WARM_BLOOMS = ['#e8a04a', '#e0784e', '#e8c05a', '#d9834f']
const COOL_BLOOMS = ['#9aa8e0', '#b48ad8', '#7fb0d8', '#a88ad0']

function Blooms() {
  const { palette } = useSceneEnv()
  const letters = useWorldSlice((s) => s.letters)

  // Only the thoughts, oldest first — the spiral has to be stable, so a new
  // thought must never renumber the ones already in the ground.
  const thoughts = useMemo(
    () => letters.filter((l) => l.placeId === 'tree').sort((a, b) => a.at - b.at),
    [letters],
  )

  const geometry = useMemo(() => {
    if (thoughts.length === 0) return null
    return buildBlooms(
      thoughts.map((t, i) => {
        const [x, y, z] = thoughtSpot(i)
        const palette = t.by === 'warm' ? WARM_BLOOMS : COOL_BLOOMS
        let h = 0
        for (const ch of t.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
        return {
          position: [x, y, z] as [number, number, number],
          color: palette[h % palette.length],
          phase: (h % 628) / 100,
          // 1.35–1.85 of the base plant, which is about 0.8 m — so a thought
          // stands 1.1 to 1.5 m tall and clears meadow grass that reaches 0.76.
          scale: 1.35 + ((h >> 8) % 50) / 100,
        }
      }),
    )
  }, [thoughts])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: BLOOM_VERT,
        fragmentShader: BLOOM_FRAG,
        side: DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uWind: { value: 1 },
          uFogColor: { value: new Color('#c3cebe') },
          uFogNear: { value: 16 },
          uFogFar: { value: 150 },
          uLight: { value: 1 },
        },
      }),
    [],
  )

  useEffect(() => () => geometry?.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const u = material.uniforms
    u.uFogColor.value.set(palette.fogColor)
    u.uFogNear.value = palette.fogNear
    u.uFogFar.value = palette.fogFar
    u.uLight.value = ambientLightLevel(palette)
    u.uWind.value = palette.wind
  }, [material, palette])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    material.uniforms.uTime.value = t.current
  })

  /**
   * Picking a flower.
   *
   * By hand rather than through mesh events: the blooms are one instanced mesh,
   * so three.js can only tell us *that* it was hit, not which one — and the
   * targets need to be far bigger than the flowers anyway, because this is
   * aimed at with a thumb.
   */
  const open = useReading((s) => s.open)
  const { camera, size } = useThree()
  const ray = useMemo(() => new Raycaster(), [])
  const point = useMemo(() => new Vector3(), [])

  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      if (!useSections.getState().entered) return
      if (takenOverNow()) return
      if (grabbed() || treeGestureUsed()) return
      const target = e.target as HTMLElement | null
      if (target?.closest('button, input, textarea, select, a')) return

      const ndc = new Vector2(
        (e.clientX / size.width) * 2 - 1,
        -(e.clientY / size.height) * 2 + 1,
      )
      ray.setFromCamera(ndc, camera)

      /*
        Both the flower and the paper open the same thought.

        Two targets for one thing is deliberate: the paper is what you notice
        from a distance, hanging and turning in the crown, and the flower is
        what you notice underfoot when you are close. Whichever you reach for,
        it is the same sentence.
      */
      let best: { id: string; t: number } | null = null
      const consider = (id: string, at: [number, number, number], radius: number) => {
        point.set(at[0], at[1], at[2])
        const hit = raySphere(ray.ray.origin, ray.ray.direction, point, radius)
        if (hit !== null && (best === null || hit < best.t)) best = { id, t: hit }
      }

      thoughts.forEach((thought, i) => {
        const [x, y, z] = thoughtSpot(i)
        // aimed at the head of the plant, which is where the eye goes
        consider(thought.id, [x, y + 0.72, z], 0.7)
        /*
          And at the sheet — which is *not* where the thread is tied.

          The knot is up on a branch and the paper is several metres under it;
          aiming at the knot, which is what this did, meant the target for a
          thought was a patch of leaves a long way above the thing you were
          pointing at. `paperCentre` is the one answer to where the sheet is.
        */
        consider(thought.id, paperCentre(hungFrom(thought, i)), 0.72)
      })
      if (best) open((best as { id: string }).id)
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [thoughts, camera, size, ray, point, open])

  if (!geometry) return null
  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

/**
 * The thoughts, hanging.
 *
 * A folded sheet on a thread for every one, turning in the same wind as the
 * leaves. Hers, unopened, carries a glow — so from the far side of the meadow
 * you can tell whether she has been.
 *
 * Where a paper hangs comes from the tree rather than from what was stored
 * with the letter: a letter's stored position is where its flower grew, on the
 * ground, and it must stay that way — the flower is the record. The paper is a
 * second view of the same thought, in the air.
 */
function Hanging() {
  const { palette } = useSceneEnv()
  const me = useData().me
  const letters = useWorldSlice((s) => s.letters)

  const hung = useMemo(
    () =>
      letters
        .filter((l) => l.placeId === 'tree')
        .sort((a, b) => a.at - b.at)
        .map((letter, i) => hungFrom(letter, i)),
    [letters],
  )

  return <Letters hung={hung} me={me} palette={palette} />
}

export default function Tree() {
  const { palette, grassCount, flowerCount } = useSceneEnv()

  return (
    <>
      {/* the ground it all stands in */}
      <Grass count={grassCount} palette={palette} />
      <Flowers count={flowerCount} palette={palette} radius={26} />

      {/* a ring of woodland, open toward the camera so the tree reads clear */}
      <Trees
        palette={palette}
        openings={[Math.PI * 0.5]}
        seed="tree:wood"
        count={90}
        centre={[MEADOW_X, MEADOW_Z]}
        innerRadius={30}
        outerRadius={62}
        gapWidth={1.5}
        flatten={0.35}
        /* Thirty metres off at the closest, behind the thing the place is
           named for. Half the cards, the same crown — see `leafDetail`. */
        leafDetail={0.5}
        /* The wood around the clearing, not the tree in it — that one keeps
            every limb, because a letter hangs from one by index. */
        woodDetail={0.3}
      />

      {/* The y here is an offset *above* the ground, not an absolute height —
          TreeOfLetters looks the terrain up itself. Passing MEADOW_Y counted
          the ground twice and sank the trunk by about twenty centimetres. */}
      <TreeOfLetters parts={greatTree} palette={palette} />
      <Hanging />
      <Blooms />
      <QuestionVine />
    </>
  )
}

// ---------------------------------------------------------------------------

import { InstancedBufferAttribute, InstancedBufferGeometry } from 'three'

/**
 * One plant: a stem, a whorl of petals, and a centre.
 *
 * **Size is the whole point.** A thought used to be a single cone nine
 * centimetres across and thirty-four tall, standing in meadow grass that grows
 * to seventy-six — so every thought either of you had ever written was, quite
 * literally, invisible. You could plant one and watch nothing happen.
 *
 * A metre tall and built out of parts, it stands clear of the grass and reads
 * as a flower from across the clearing. `aPart` says which piece each vertex
 * belongs to (0 stem, 1 petal, 2 centre) so one instance colour can paint the
 * petals while the stem stays green — otherwise the whole plant, roots and
 * all, comes out lilac.
 */
function bloomBase(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  const part: number[] = []

  const add = (g: BufferGeometry, which: number) => {
    const solid = (g.index ? g.toNonIndexed() : g) as BufferGeometry
    pieces.push(solid)
    for (let i = 0; i < solid.attributes.position.count; i++) part.push(which)
  }

  const stem = new CylinderGeometry(0.012, 0.02, 0.72, 5)
  stem.translate(0, 0.36, 0)
  add(stem, 0)

  // two leaves, low and opposite-ish
  for (const side of [-1, 1]) {
    const leaf = new ConeGeometry(0.055, 0.26, 4)
    leaf.rotateZ(side * 1.15)
    leaf.translate(side * 0.09, 0.26, 0)
    add(leaf, 0)
  }

  // the head: five petals leaning outward off the top of the stem
  for (let i = 0; i < 5; i++) {
    const petal = new ConeGeometry(0.052, 0.2, 4)
    petal.translate(0, 0.1, 0)
    petal.rotateX(0.85)
    petal.rotateY((i / 5) * Math.PI * 2)
    petal.translate(0, 0.74, 0)
    add(petal, 1)
  }

  const centre = new IcosahedronGeometry(0.045, 0)
  centre.translate(0, 0.78, 0)
  add(centre, 2)

  const merged = mergeGeometries(pieces, false)
  for (const g of pieces) g.dispose()
  if (!merged) throw new Error('A thought failed to grow.')
  merged.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1))
  merged.deleteAttribute('uv')
  return merged
}

function buildBlooms(
  items: {
    position: [number, number, number]
    color: string
    phase: number
    scale: number
  }[],
): InstancedBufferGeometry {
  const solid = bloomBase()

  const geo = new InstancedBufferGeometry()
  geo.setAttribute('position', solid.attributes.position)
  geo.setAttribute('normal', solid.attributes.normal)
  geo.setAttribute('aPart', solid.attributes.aPart)

  const n = Math.max(1, items.length)
  const offset = new Float32Array(n * 3)
  const color = new Float32Array(n * 3)
  const phase = new Float32Array(n)
  const scale = new Float32Array(n)
  const c = new Color()

  items.forEach((it, i) => {
    offset.set(it.position, i * 3)
    c.set(it.color)
    color.set([c.r, c.g, c.b], i * 3)
    phase[i] = it.phase
    scale[i] = it.scale
  })

  geo.setAttribute('iOffset', new InstancedBufferAttribute(offset, 3))
  geo.setAttribute('iColor', new InstancedBufferAttribute(color, 3))
  geo.setAttribute('iPhase', new InstancedBufferAttribute(phase, 1))
  geo.setAttribute('iScale', new InstancedBufferAttribute(scale, 1))
  geo.instanceCount = items.length
  solid.dispose()
  return geo
}
