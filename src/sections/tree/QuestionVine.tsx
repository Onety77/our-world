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
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
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
import { MEADOW_X, MEADOW_Y, MEADOW_Z } from './layout'

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
  varying vec3 vColor;
  varying float vDepth;
  void main() {
    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    gl_FragColor = vec4(mix(vColor, uFogColor, fog), 1.0);
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

function vineSpot(index: number): [number, number, number] {
  const slot = ((index % SHOWN) + SHOWN) % SHOWN
  const angle = slot * 0.86 - 0.7
  const radius = 0.86 + Math.sin(slot * 1.7) * 0.08
  return [
    MEADOW_X + Math.cos(angle) * radius,
    MEADOW_Y + 0.85 + (slot / (SHOWN - 1)) * 7.2,
    MEADOW_Z + Math.sin(angle) * radius,
  ]
}

function flowerAt(position: [number, number, number], phase: number): BufferGeometry {
  const pieces: BufferGeometry[] = []
  for (let petal = 0; petal < 6; petal++) {
    const geometry = new ConeGeometry(0.105, 0.34, 5)
    geometry.translate(0, 0.17, 0)
    geometry.rotateZ(1.02)
    geometry.rotateY((petal / 6) * Math.PI * 2 + phase)
    geometry.translate(position[0], position[1], position[2])
    pieces.push(paint(geometry, petal % 2 === 0 ? '#dfa05e' : '#98a9d8'))
  }
  const centre = new IcosahedronGeometry(0.095, 1)
  centre.translate(position[0], position[1], position[2])
  pieces.push(paint(centre, '#efe0ad'))
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

function buildVine(): BufferGeometry {
  const points = Array.from({ length: SHOWN + 1 }, (_, index) => {
    const slot = Math.min(SHOWN - 1, index)
    const [x, y, z] = vineSpot(slot)
    return new Vector3(x, y - 0.04, z)
  })
  return paint(new TubeGeometry(new CatmullRomCurve3(points), 180, 0.026, 5, false), '#465b36')
}

function buildBud(position: [number, number, number]): BufferGeometry {
  const pieces: BufferGeometry[] = []
  const stem = new CylinderGeometry(0.026, 0.045, 0.88, 6)
  stem.translate(position[0], position[1] + 0.44, position[2])
  pieces.push(paint(stem, '#52643c'))
  for (let petal = 0; petal < 6; petal++) {
    const geometry = new ConeGeometry(0.22, 0.82, 6)
    geometry.rotateZ(0.3)
    geometry.rotateY((petal / 6) * Math.PI * 2)
    geometry.translate(position[0], position[1] + 0.98, position[2])
    pieces.push(paint(geometry, petal % 2 === 0 ? '#c9824e' : '#8295c6'))
  }
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
    },
  }), [])

  const first = Math.max(0, questions.history.length - SHOWN)
  const shown = useMemo(() => questions.history.slice(first), [questions.history, first])
  const indices = useMemo(
    () => shown.map((_, localIndex) => first + localIndex),
    [shown, first],
  )
  const flowers = useMemo(() => buildFlowers(indices), [indices])
  const vine = useMemo(() => questions.history.length > 0 ? buildVine() : null, [questions.history.length])
  const budPosition = useMemo<[number, number, number]>(
    () => [MEADOW_X + 1.5, MEADOW_Y + 0.08, MEADOW_Z + 0.75],
    [],
  )
  const bud = useMemo(
    () => questions.current && questions.current.completedAt === null ? buildBud(budPosition) : null,
    [questions.current, budPosition],
  )

  useEffect(() => {
    material.uniforms.uFogColor.value.set(palette.fogColor)
    material.uniforms.uFogNear.value = palette.fogNear
    material.uniforms.uFogFar.value = palette.fogFar
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

      if (questions.current?.completedAt === null) {
        point.set(budPosition[0], budPosition[1] + 0.82, budPosition[2])
        const distance = raySphere(ray.ray.origin, ray.ray.direction, point, 0.76)
        if (distance !== null) useQuestions.getState().openCurrent()
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
