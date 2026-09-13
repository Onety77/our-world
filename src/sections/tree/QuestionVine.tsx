/**
 * The Tree's second kind of memory.
 *
 * Thoughts own the meadow. Paired answers own one narrow vine around the lower
 * trunk, so the two records never become visual noise for each other. The
 * archive is unbounded, but the tree shows at most 72 blossoms: after that an
 * old bloom settles into the bark while its question remains in the reader.
 */
import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import {
  BufferAttribute,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  Raycaster,
  ShaderMaterial,
  TubeGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useWorldSlice } from '@/data/provider'
import { useQuestions } from '@/systems/questions'
import { raySphere } from '@/systems/terrain'
import { grabbed } from '@/systems/swipe'
import { treeGestureUsed } from '@/systems/treeOrbit'
import { takenOverNow } from '@/systems/attention'
import { useSections } from '@/systems/sections'
import { useSceneEnv } from '@/world/SceneEnv'
import { ambientLightLevel } from '@/world/forms'
import { budSpot, greatTree, trunkAt } from './greatTree'

const SHOWN = 72

const VERT = /* glsl */ `
  varying vec3 vColor;
  varying float vDepth;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  /* The garden's light level: without it the vine and its blossoms stayed at noon while the tree went to dusk. */
  uniform float uLight;
  varying vec3 vColor;
  varying float vDepth;
  void main() {
    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    gl_FragColor = vec4(mix(vColor * (0.25 + uLight * 0.75), uFogColor, fog), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function paint(geometry: BufferGeometry, color: string): BufferGeometry {
  const solid = geometry.index ? geometry.toNonIndexed() : geometry
  if (solid !== geometry) geometry.dispose()
  const c = new Color(color)
  const colors = new Float32Array(solid.attributes.position.count * 3)
  for (let i = 0; i < solid.attributes.position.count; i++) {
    colors.set([c.r, c.g, c.b], i * 3)
  }
  solid.setAttribute('color', new BufferAttribute(colors, 3))
  return solid
}

/**
 * Where the nth paired answer blooms: on the bark itself, spiralling up the
 * trunk from knee height to the crotch.
 *
 * It was a fixed spiral a little under a metre from the tree's centre — which
 * the old, thin trunk was about the size of. The great tree is an old tree now,
 * a metre and more through with buttresses at its foot, and a vine at that
 * radius would be growing inside the wood. So it asks the trunk where the bark is.
 */
function vineSpot(index: number): [number, number, number] {
  const slot = ((index % SHOWN) + SHOWN) % SHOWN
  /*
    Spaced on a square root, so the first answers climb quickly and later ones
    pack in above: evenly, fourteen answers were a knot of blossom in the
    first half metre off the ground.
  */
  const y = 0.9 + Math.sqrt(slot / (SHOWN - 1)) * 2.4
  // Climbing, not ringing: a turn every eighty centimetres or so. Flatter and it read as straps.
  const angle = slot * 0.25 + 1.2
  const trunk = trunkAt(y)
  const radius = trunk.radius + 0.07 + Math.sin(slot * 1.7) * 0.02
  return [trunk.x + Math.cos(angle) * radius, greatTree.foot[1] + y, trunk.z + Math.sin(angle) * radius]
}

/**
 * A paired answer's blossom, open on the bark: six rounded petals, warm and cool
 * alternating — both of you — facing out from the trunk. They were cones
 * pointing every way, which at the foot of the tree read as a spiky ball.
 */
function flowerAt(position: [number, number, number], phase: number): BufferGeometry {
  const pieces: BufferGeometry[] = []
  // Facing out from the trunk's axis.
  const trunk = trunkAt(position[1] - greatTree.foot[1])
  const out = Math.atan2(position[2] - trunk.z, position[0] - trunk.x)
  for (let petal = 0; petal < 6; petal++) {
    const shape = new CircleGeometry(0.075, 7)
    shape.scale(0.62, 1, 1)
    shape.translate(0, 0.085, 0.004)
    shape.rotateZ((petal / 6) * Math.PI * 2 + phase)
    // Cupped a little toward the viewer.
    shape.rotateX(-0.25)
    shape.rotateY(Math.PI / 2 - out)
    shape.translate(position[0], position[1], position[2])
    const solid = paint(shape, petal % 2 === 0 ? '#dfa05e' : '#98a9d8')
    // The back of it too: the vine is seen from all the way round.
    const back = solid.clone()
    const idx = back.attributes.position
    for (let i = 0; i < idx.count; i += 3) {
      const x = idx.getX(i), y = idx.getY(i), z = idx.getZ(i)
      idx.setXYZ(i, idx.getX(i + 2), idx.getY(i + 2), idx.getZ(i + 2))
      idx.setXYZ(i + 2, x, y, z)
    }
    pieces.push(solid, back)
  }
  const centre = new IcosahedronGeometry(0.035, 1)
  centre.translate(position[0], position[1], position[2])
  pieces.push(paint(centre, '#efe0ad'))
  for (const piece of pieces) {
    if (piece.getAttribute('uv')) piece.deleteAttribute('uv')
    if (piece.getAttribute('normal')) piece.deleteAttribute('normal')
  }
  const merged = mergeGeometries(pieces, false)
  for (const piece of pieces) piece.dispose()
  if (!merged) throw new Error('A paired answer failed to bloom.')
  return merged
}

function buildFlowers(indices: number[]): BufferGeometry | null {
  if (indices.length === 0) return null
  const flowers = indices.map((index) => flowerAt(vineSpot(index), index * 0.37))
  const merged = mergeGeometries(flowers, false)
  for (const flower of flowers) flower.dispose()
  return merged
}

/**
 * The vine, as far as it has grown: from the grass to a little past the newest
 * blossom. It used to be drawn to its full height from the first answer, which
 * is a vine that was planted grown.
 */
function buildVine(count: number): BufferGeometry {
  const reach = Math.min(SHOWN - 1, count + 1)
  const [bx, , bz] = vineSpot(0)
  const points = [new Vector3(bx, greatTree.foot[1] - 0.05, bz)]
  for (let slot = 0; slot <= reach; slot++) {
    const [x, y, z] = vineSpot(slot)
    points.push(new Vector3(x, y - 0.04, z))
  }
  return paint(new TubeGeometry(new CatmullRomCurve3(points), Math.max(24, reach * 6), 0.022, 5, false), '#465b36')
}

/**
 * The question, as a bud that has not opened.
 *
 * It was six cones leaning out from a stem — orange and blue, alternating —
 * which from the path read as a small striped dress standing at the tree's
 * foot. A bud is one closed shape: fat low down and drawn to a point, its
 * petals wrapped round each other, sitting in a cup of sepals. The two
 * colours stay, as the two petals wrapped round each other in a spiral —
 * the question is for both of you.
 */
function buildBud(position: [number, number, number]): BufferGeometry {
  const pieces: BufferGeometry[] = []
  const stem = new CylinderGeometry(0.022, 0.04, 0.82, 7)
  stem.translate(position[0], position[1] + 0.41, position[2])
  pieces.push(paint(stem, '#52643c'))

  // The bud: a lathe, widest a third of the way up, closed at the tip.
  const profile: Vector2[] = []
  const STEPS = 12
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS
    const r = Math.sin(Math.pow(t, 0.75) * Math.PI) * 0.19 * (1 - t * 0.25) + 0.004
    profile.push(new Vector2(r, t * 0.62))
  }
  const bud = new LatheGeometry(profile, 20).toNonIndexed()
  const warm = new Color('#c9824e')
  const cool = new Color('#8295c6')
  const colours = new Float32Array(bud.attributes.position.count * 3)
  const p = bud.attributes.position
  const mixed = new Color()
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i))
    const y = p.getY(i)
    // Two petals wrapped round each other: a spiral seam from the base to the tip.
    const s = Math.sin(a + y * 7.5)
    mixed.copy(warm).lerp(cool, s * 0.5 + 0.5)
    // Darker where the petals overlap, at the seam.
    mixed.multiplyScalar(0.82 + Math.abs(s) * 0.22)
    colours.set([mixed.r, mixed.g, mixed.b], i * 3)
  }
  bud.setAttribute('color', new BufferAttribute(colours, 3))
  bud.deleteAttribute('uv')
  bud.rotateZ(0.08)
  bud.translate(position[0], position[1] + 0.8, position[2])
  pieces.push(bud)

  // Sepals: a green cup the bud sits in.
  for (let i = 0; i < 5; i++) {
    const sepal = new ConeGeometry(0.05, 0.24, 4)
    sepal.translate(0, 0.12, 0)
    sepal.rotateX(0.55)
    sepal.rotateY((i / 5) * Math.PI * 2)
    sepal.translate(position[0], position[1] + 0.78, position[2])
    pieces.push(paint(sepal, '#4f6338'))
  }
  for (const piece of pieces) if (piece.getAttribute('uv')) piece.deleteAttribute('uv')
  const merged = mergeGeometries(pieces, false)
  for (const piece of pieces) piece.dispose()
  if (!merged) throw new Error('The question bud failed to form.')
  return merged
}

export function QuestionVine() {
  const questions = useWorldSlice((state) => state.questions)
  const { palette } = useSceneEnv()
  const { camera, size } = useThree()
  const ray = useMemo(() => new Raycaster(), [])
  const point = useMemo(() => new Vector3(), [])
  const material = useMemo(() => new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: true,
    uniforms: {
      uFogColor: { value: new Color('#c3cebe') },
      uFogNear: { value: 16 },
      uFogFar: { value: 150 },
      uLight: { value: 1 },
    },
  }), [])

  const first = Math.max(0, questions.history.length - SHOWN)
  const shown = useMemo(() => questions.history.slice(first), [questions.history, first])
  const indices = useMemo(
    () => shown.map((_, localIndex) => first + localIndex),
    [shown, first],
  )
  const flowers = useMemo(() => buildFlowers(indices), [indices])
  const vine = useMemo(
    () => (questions.history.length > 0 ? buildVine(Math.min(SHOWN, questions.history.length)) : null),
    [questions.history.length],
  )
  const budPosition = useMemo<[number, number, number]>(() => [budSpot[0], budSpot[1] + 0.02, budSpot[2]], [])
  const bud = useMemo(
    () => questions.current ? buildBud(budPosition) : null,
    [questions.current, budPosition],
  )

  useEffect(() => {
    material.uniforms.uFogColor.value.set(palette.fogColor)
    material.uniforms.uFogNear.value = palette.fogNear
    material.uniforms.uFogFar.value = palette.fogFar
    material.uniforms.uLight.value = ambientLightLevel(palette)
  }, [material, palette])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => flowers?.dispose(), [flowers])
  useEffect(() => () => vine?.dispose(), [vine])
  useEffect(() => () => bud?.dispose(), [bud])

  useEffect(() => {
    const onUp = (event: PointerEvent) => {
      if (!useSections.getState().entered || takenOverNow()) return
      if (grabbed() || treeGestureUsed()) return
      const target = event.target as HTMLElement | null
      if (target?.closest('button, input, textarea, select, a')) return
      ray.setFromCamera(
        new Vector2(
          (event.clientX / size.width) * 2 - 1,
          -(event.clientY / size.height) * 2 + 1,
        ),
        camera,
      )

      let nearest: { id: string; distance: number } | null = null
      shown.forEach((round, localIndex) => {
        const at = vineSpot(first + localIndex)
        point.set(...at)
        const distance = raySphere(ray.ray.origin, ray.ray.direction, point, 0.34)
        if (distance !== null && (!nearest || distance < nearest.distance)) {
          nearest = { id: round.id, distance }
        }
      })
      if (nearest) {
        useQuestions.getState().openArchive((nearest as { id: string }).id)
        return
      }

      if (questions.current) {
        point.set(budPosition[0], budPosition[1] + 0.82, budPosition[2])
        const distance = raySphere(ray.ray.origin, ray.ray.direction, point, 0.76)
        if (distance !== null) {
          if (questions.current.completedAt !== null && questions.nextAt !== null) {
            useQuestions.getState().openGrowing()
          } else {
            useQuestions.getState().openCurrent()
          }
        }
      }
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [shown, first, questions.current, budPosition, ray, point, camera, size])

  return (
    <>
      {vine ? <mesh geometry={vine} material={material} frustumCulled={false} /> : null}
      {flowers ? <mesh geometry={flowers} material={material} frustumCulled={false} /> : null}
      {bud ? <mesh geometry={bud} material={material} frustumCulled={false} /> : null}
    </>
  )
}
