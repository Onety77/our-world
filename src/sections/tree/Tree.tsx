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
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  IcosahedronGeometry,
  Raycaster,
  ShaderMaterial,
  Vector2,
  Vector3,
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
import { Letters, livePapers, paperCentre, type Hung } from '@/world/Letters'
import { useData } from '@/data/provider'
import type { Letter } from '@/data/types'
import { MEADOW_X, MEADOW_Z, thoughtSpot } from './layout'
import { greatTree, hangDrop, hangSpot } from './greatTree'
import { useSections } from '@/systems/sections'
import { takenOverNow } from '@/systems/attention'
import { QuestionVine } from './QuestionVine'
import { ambience } from '@/systems/ambience'

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
    // Carried through so the glow can leave a sealed thought dark until its
    // day — see the filter in `world/Letters`.
    openAt: letter.openAt,
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
  attribute float iUnread;
  attribute float iOpenAfter;
  attribute float iBornAfter;
  /** 0 stem and leaf, 1 petal, 2 centre. See bloomBase. */
  attribute float aPart;

  uniform highp float uTime;
  uniform float uWind;
  uniform float uAge;

  varying vec3 vColor;
  varying float vUp;
  varying float vDepth;
  varying float vPart;
  varying float vUnread;

  void main() {
    vColor = iColor;
    vPart = aPart;
    vUnread = iUnread * step(iOpenAfter, uAge);
    vUp = normalize(normal).y * 0.5 + 0.5;

    float growth = mix(.12, 1.0, smoothstep(0.0, 1.4, uAge - iBornAfter));
    vec3 p = position * iScale * growth;

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
  uniform highp float uTime;
  varying vec3 vColor;
  varying float vUp;
  varying float vDepth;
  varying float vPart;
  varying float vUnread;

  void main() {
    // Stem and leaf hold their own green whatever colour the flower is; the
    // centre is the flower's colour lifted most of the way to bone.
    vec3 stem = vec3(0.30, 0.36, 0.22);
    vec3 heart = mix(vColor, vec3(0.94, 0.90, 0.78), 0.72);
    // A petal is darker in its throat and lit at its tip: see bloomBase.
    float along = clamp((vPart - 1.0) / 0.45, 0.0, 1.0);
    vec3 petal = vColor * mix(0.62, 1.1, along);
    vec3 tint = vPart < 0.5 ? stem : (vPart < 1.5 ? petal : heart);

    vec3 col = tint * (0.62 + vUp * 0.5) * uLight;
    // Unread thoughts hold a little light in the flower, even after dusk.
    // It belongs to the petals and centre, never to the stem or a closed seal.
    col += vUnread * step(.5, vPart) * mix(vColor, vec3(1.0, .84, .48), .45)
      * (.24 + .1 * sin(uTime * 1.5));
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
  const data = useData()
  const epoch = useRef(data.now())
  const { palette } = useSceneEnv()
  const letters = useWorldSlice((s) => s.letters)

  // Only the thoughts, oldest first — the spiral has to be stable, so a new
  // thought must never renumber the ones already in the ground.
  const thoughts = useMemo(
    () => letters.filter((l) => l.placeId === 'tree').sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)),
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
          scale: 1.35 + ((h >>> 8) % 50) / 100,
          unread: t.by !== data.me && t.readAt === null ? 1 : 0,
          openAfter: t.openAt === null ? 0 : Math.max(0, (t.openAt - epoch.current) / 1000),
          bornAfter: (t.at - epoch.current) / 1000,
        }
      }),
    )
  }, [thoughts, data.me])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: BLOOM_VERT,
        fragmentShader: BLOOM_FRAG,
        side: DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uAge: { value: 0 },
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
    material.uniforms.uAge.value = (data.now() - epoch.current) / 1000
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
        let hash = 0
        for (const ch of thought.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
        const height = .78 * (1.35 + ((hash >>> 8) % 50) / 100)
        // aimed at the head of the plant, which is where the eye goes
        consider(thought.id, [x, y + height, z], 0.55)
        /*
          And at the sheet — which is *not* where the thread is tied.

          The knot is up on a branch and the paper is several metres under it;
          aiming at the knot, which is what this did, meant the target for a
          thought was a patch of leaves a long way above the thing you were
          pointing at. `paperCentre` is the one answer to where the sheet is.
        */
        // Where the sheet is *now*: it swings, and catches on branches.
        consider(thought.id, livePapers.get(thought.id) ?? paperCentre(hungFrom(thought, i)), 0.72)
      })
      if (best) {
        ambience.cue('paper', 0.42)
        open((best as { id: string }).id)
      }
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
        .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
        .map((letter, i) => hungFrom(letter, i)),
    [letters],
  )

  return <Letters hung={hung} me={me} palette={palette} tree={greatTree} />
}

/**
 * The great tree's shade on the meadow, and the foot the grass keeps clear of.
 *
 * The meadow was lit to the same noon under the crown as out in the open, and
 * grew straight through the trunk — a tree that casts no shade and stands in
 * grass that passes through it is a tree pasted onto a field.
 */
const SHADE = {
  at: [greatTree.foot[0], greatTree.foot[2]] as [number, number],
  radius: greatTree.spread * 1.15,
  strength: 0.85,
  foot: 0.9,
}

export default function Tree() {
  const { palette, grassCount, flowerCount } = useSceneEnv()

  return (
    <>
      {/* the ground it all stands in */}
      <Grass count={grassCount} palette={palette} shade={SHADE} />
      <Flowers count={flowerCount} palette={palette} radius={26} />

      {/*
        A ring of woodland round the clearing — closed all the way round.

        It used to open toward the camera "so the tree reads clear", which was
        right before you could turn: the camera now circles the whole tree, and
        the gap swung round into view as a bald wedge of fog in the treeline.
        Kept well back instead, past the reach of the crown in every direction.
      */}
      <Trees
        palette={palette}
        openings={[]}
        seed="tree:wood"
        count={130}
        centre={[MEADOW_X, MEADOW_Z]}
        innerRadius={34}
        outerRadius={78}
        gapWidth={0}
        flatten={0.25}
        /* Smaller than the great tree, always: a thing named for being great
           does not stand in a crowd of its own size. */
        heights={[5.5, 10]}
        /* Thirty metres off at the closest, behind the thing the place is
           named for. Half the cards, the same crown — see `leafDetail`. */
        leafDetail={0.5}
        /* The wood around the clearing, not the tree in it. */
        woodDetail={0.3}
      />
      {/*
        And the wood beyond it, so the horizon is trees.

        Behind the ring there was nothing but fog, and the fog is a few points
        off the sky's own colour: from the clearing the treeline stood in front
        of a flat white wall, which read as the edge of a stage set. A deeper
        belt out to a hundred and twenty metres, cheap — a silhouette is all a
        tree is at that distance — closes it.
      */}
      <Trees
        palette={palette}
        openings={[]}
        seed="tree:far-wood"
        count={110}
        centre={[MEADOW_X, MEADOW_Z]}
        innerRadius={80}
        outerRadius={125}
        gapWidth={0}
        flatten={0.15}
        heights={[8, 15]}
        leafDetail={0.3}
        woodDetail={0.25}
        hazeReach={1.7}
      />

      {/* The y here is an offset *above* the ground, not an absolute height —
          TreeOfLetters looks the terrain up itself. Passing MEADOW_Y counted
          the ground twice and sank the trunk by about twenty centimetres. */}
      <TreeOfLetters tree={greatTree} palette={palette} />
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

  const add = (g: BufferGeometry, which: number | ((i: number, g: BufferGeometry) => number)) => {
    let solid = (g.index ? g.toNonIndexed() : g) as BufferGeometry
    if (solid !== g) g.dispose()
    if (solid.getAttribute('uv')) solid.deleteAttribute('uv')
    if (!solid.getAttribute('normal')) solid.computeVertexNormals()
    solid = solid as BufferGeometry
    pieces.push(solid)
    for (let i = 0; i < solid.attributes.position.count; i++) part.push(typeof which === 'number' ? which : which(i, solid))
  }

  /**
   * A shaped blade, built by hand: narrow at its foot, widest two thirds up,
   * rounded to a tip, and curled up along its length. The flowers were cones,
   * and a cone is a stick figure's idea of a petal — at a metre and a half
   * across a clearing it read as exactly that.
   */
  const blade = (length: number, width: number, curl: number, stations = 6): BufferGeometry => {
    const profile = (t: number) => width * (0.25 + Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.75) * (t > 0.85 ? (1 - t) / 0.15 * 0.7 + 0.3 : 1)
    const position: number[] = []
    const along: number[] = []
    const at = (t: number, side: number) => {
      const w = profile(t) * side
      // Curl: the blade lifts out of its plane toward the tip, and cups across.
      return [w, t * length, curl * t * t * length + Math.abs(side) * width * 0.35]
    }
    for (let s = 0; s < stations; s++) {
      const t0 = s / stations
      const t1 = (s + 1) / stations
      const quad = [at(t0, -1), at(t0, 0), at(t1, -1), at(t1, 0), at(t0, 1), at(t1, 1)]
      // Two strips either side of the spine, so the cup across it shows.
      position.push(...quad[0], ...quad[1], ...quad[2], ...quad[2], ...quad[1], ...quad[3])
      position.push(...quad[1], ...quad[4], ...quad[3], ...quad[3], ...quad[4], ...quad[5])
      along.push(t0, t0, t1, t1, t0, t1, t0, t0, t1, t1, t0, t1)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
    g.computeVertexNormals()
    g.userData.along = along
    return g
  }

  const stem = new CylinderGeometry(0.011, 0.019, 0.74, 6, 3, true)
  stem.translate(0, 0.37, 0)
  add(stem, 0)

  // Two long leaves off the stem, low, arching out and away from each other.
  for (const [side, height, turn] of [[-1, 0.16, 0.2], [1, 0.3, 2.9]] as const) {
    const leaf = blade(0.32, 0.036, 0.9, 5)
    leaf.rotateX(-0.95)
    leaf.rotateY(turn + (side > 0 ? 0 : 0))
    leaf.translate(0, height, 0)
    add(leaf, 0)
  }

  // Sepals: five small green points under the head.
  for (let i = 0; i < 5; i++) {
    const sepal = blade(0.07, 0.02, -0.4, 3)
    sepal.rotateX(1.95)
    sepal.rotateY((i / 5) * Math.PI * 2 + 0.3)
    sepal.translate(0, 0.72, 0)
    add(sepal, 0)
  }

  /*
    The head: seven petals opening out of a cup, each shaded from a darker
    throat to a lit tip — `aPart` carries how far along the petal a vertex is,
    as 1 + 0.45·t, so the fragment stage can shade it without another attribute.
  */
  const PETALS = 7
  for (let i = 0; i < PETALS; i++) {
    const petal = blade(0.17, 0.052, 0.55, 5)
    const along = petal.userData.along as number[]
    petal.rotateX(0.95)
    petal.rotateY((i / PETALS) * Math.PI * 2)
    petal.translate(0, 0.745, 0)
    add(petal, (v) => 1 + along[v] * 0.45)
  }

  const centre = new IcosahedronGeometry(0.042, 1)
  centre.scale(1, 0.7, 1)
  centre.translate(0, 0.77, 0)
  add(centre, 2)

  const merged = mergeGeometries(pieces, false)
  for (const g of pieces) g.dispose()
  if (!merged) throw new Error('A thought failed to grow.')
  merged.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1))
  return merged
}

function buildBlooms(
  items: {
    position: [number, number, number]
    color: string
    phase: number
    scale: number
    unread: number
    openAfter: number
    bornAfter: number
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
  const unread = new Float32Array(n)
  const openAfter = new Float32Array(n)
  const bornAfter = new Float32Array(n)
  const c = new Color()

  items.forEach((it, i) => {
    offset.set(it.position, i * 3)
    c.set(it.color)
    color.set([c.r, c.g, c.b], i * 3)
    phase[i] = it.phase
    scale[i] = it.scale
    unread[i] = it.unread
    openAfter[i] = it.openAfter
    bornAfter[i] = it.bornAfter
  })

  geo.setAttribute('iOffset', new InstancedBufferAttribute(offset, 3))
  geo.setAttribute('iColor', new InstancedBufferAttribute(color, 3))
  geo.setAttribute('iPhase', new InstancedBufferAttribute(phase, 1))
  geo.setAttribute('iScale', new InstancedBufferAttribute(scale, 1))
  geo.setAttribute('iUnread', new InstancedBufferAttribute(unread, 1))
  geo.setAttribute('iOpenAfter', new InstancedBufferAttribute(openAfter, 1))
  geo.setAttribute('iBornAfter', new InstancedBufferAttribute(bornAfter, 1))
  geo.instanceCount = items.length
  solid.dispose()
  return geo
}
