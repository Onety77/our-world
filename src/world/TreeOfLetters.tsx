/**
 * The great tree, up close — one solid old tree.
 *
 * ---------------------------------------------------------------------------
 * **It was a hundred boxes and it looked like it.** The tree was drawn the way
 * the wood is: every limb two closed tubes, the leaves instanced cards. At
 * sixty metres that is invisible. At twenty-three, under a tree people stand
 * under, it showed steps up the trunk where the tubes met, sticks passing
 * through each other at every joint, a trunk that stopped at the grass like a
 * post, and a crown that drifted off its own twigs whenever the wind blew,
 * because the leaves bent at a different rate from the wood.
 *
 * So this sweeps **one continuous surface** along each limb of the tree grown
 * in `sections/tree/greatTree` — starting every branch inside the one it
 * leaves, so there is no seam anywhere from the roots to the twigs — flares
 * the trunk into buttresses over the surface roots where it meets the meadow,
 * and bakes the leaves into the same kind of mesh with the crown's own shade
 * in them: dark inside and underneath, lit at the top and the edges, which is
 * what makes a crown read as a mass and not a shell of chips.
 *
 * Bark and leaves share one shader and one bend (`treeWind`), and the threads
 * read the same bend on the CPU. Four draw calls, the shade included.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  FrontSide,
  ShaderMaterial,
  Vector3,
} from 'three'
import type { SkyPalette } from '@/systems/palette'
import { groundHeight } from '@/systems/terrain'
import { ambientLightLevel } from './forms'
import { leafGeometry } from './tree'
import { TREE_PHASE, TREE_SWAY, treeClock } from './treeWind'
import type { AncientTree, Vec } from '@/sections/tree/greatTree'

/* ---- the shader ------------------------------------------------------------------ */

const TREE_VERT = /* glsl */ `
  attribute vec3 color;
  /** 0 for bark; for a leaf, its own flutter phase, 0..1 plus a little. */
  attribute float aFlutter;
  uniform highp float uTime;
  uniform float uWind;
  uniform float uSway;
  uniform float uPhase;
  uniform vec3 uFoot;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vDepth;
  void main() {
    vec3 p = position;
    // The one bend — see world/treeWind, which computes the same number for the threads.
    float gust = sin(uTime * 0.31 + uFoot.x * 0.03 + uFoot.z * 0.024) * 0.5 + 0.5;
    float sway = sin(uTime * 0.61 + uPhase) * 0.6 + sin(uTime * 1.13 + uPhase * 1.4) * 0.25;
    float wave = sway * (0.35 + gust * 0.8) * uWind;
    float h = max(0.0, p.y);
    float bend = wave * uSway * h * h * 0.01;
    p.x += bend;
    p.z += bend * 0.4;
    // A leaf trembles on its stalk; bark does not.
    if (aFlutter > 0.0) {
      float f = sin(uTime * (2.4 + fract(aFlutter * 7.31) * 1.8) + aFlutter * 40.0);
      p += normal * f * 0.04 * (0.4 + uWind);
    }
    vColor = color;
    vNormal = normal;
    vec4 mv = modelViewMatrix * vec4(p + uFoot, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const TREE_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uFogColor;
  uniform vec3 uSunColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uSun;
  uniform float uLight;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vDepth;
  void main() {
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    float up = n.y * 0.5 + 0.5;
    // The garden's own light (world/forms), with a little direction in it so a
    // round limb reads as round: lit on the sun's side, turned away on the other.
    float shade = 0.42 + up * 0.62;
    float toward = max(0.0, dot(n, normalize(vec3(0.45, 0.78, 0.42))));
    shade *= 0.78 + toward * 0.34;
    vec3 col = vColor * shade * uLight;
    col = mix(col, col * uSunColor * 1.15, 0.32 * uSun * up);
    const float HAZE_HOLD = 0.30;
    float s = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, s * (1.0 - HAZE_HOLD * s));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** The ground's shade under the crown: soft, dappled, and darker near the trunk. */
const SHADE_VERT = /* glsl */ `
  attribute float aShade;
  varying float vShade;
  varying vec2 vAt;
  varying float vDepth;
  void main() {
    vShade = aShade;
    vAt = position.xz;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const SHADE_FRAG = /* glsl */ `
  precision highp float;
  uniform float uLight;
  uniform float uFogNear;
  uniform float uFogFar;
  varying float vShade;
  varying vec2 vAt;
  varying float vDepth;
  void main() {
    // Dapples: light coming through the gaps in the crown.
    float d = sin(vAt.x * 1.9 + sin(vAt.y * 1.3)) * sin(vAt.y * 2.3 + sin(vAt.x * 0.9)) * 0.5 + 0.5;
    float dapple = smoothstep(0.55, 0.9, d);
    float far = 1.0 - smoothstep(uFogNear, uFogFar, vDepth);
    // Only as dark as the day is bright: there is no shade under a tree at night.
    float a = vShade * (1.0 - dapple * 0.55) * 0.42 * uLight * far;
    gl_FragColor = vec4(vec3(0.02, 0.03, 0.01), a);
  }
`

/* ---- building ---------------------------------------------------------------------- */

interface Mesh {
  position: number[]
  normal: number[]
  color: number[]
  flutter: number[]
  index: number[]
}

function empty(): Mesh {
  return { position: [], normal: [], color: [], flutter: [], index: [] }
}

function hash(a: number, b: number): number {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return v - Math.floor(v)
}

const BARK = new Color('#6f604f')
const BARK_DARK = new Color('#4b4036')
const BARK_TWIG = new Color('#7d6f5e')
const MOSS = new Color('#5a6a3e')
const CANOPY = ['#49543a', '#3f4a33', '#55603f', '#3a4430', '#5c6042', '#666a45', '#6e6c4a', '#717148'].map((c) => new Color(c))

/**
 * Sweep a tube along a curve. Parallel-transported frames, so the bark does
 * not twist round a bend; `radiusAt` may shape each vertex (the trunk's flare).
 */
function sweep(
  out: Mesh,
  points: Vec[],
  radii: number[],
  sides: number,
  shapeAt: (ring: number, angle: number, radius: number, at: Vec) => { r: number; colour: Color },
  cap: boolean,
) {
  const n = points.length
  if (n < 2) return
  const base = out.position.length / 3
  let normalV = new Vector3()
  const tangent = new Vector3()
  const prevTangent = new Vector3()
  const binormal = new Vector3()
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)]
    const b = points[Math.min(n - 1, i + 1)]
    tangent.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize()
    if (i === 0) {
      const ref = Math.abs(tangent.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)
      normalV = new Vector3().crossVectors(tangent, ref).normalize()
    } else {
      // Carry the previous frame round the bend by the smallest rotation.
      const axis = new Vector3().crossVectors(prevTangent, tangent)
      const len = axis.length()
      if (len > 1e-6) {
        axis.divideScalar(len)
        const angle = Math.acos(Math.max(-1, Math.min(1, prevTangent.dot(tangent))))
        normalV.applyAxisAngle(axis, angle)
      }
    }
    prevTangent.copy(tangent)
    binormal.crossVectors(tangent, normalV).normalize()
    const p = points[i]
    for (let k = 0; k < sides; k++) {
      const angle = (k / sides) * Math.PI * 2
      const c = Math.cos(angle)
      const s = Math.sin(angle)
      const dx = normalV.x * c + binormal.x * s
      const dy = normalV.y * c + binormal.y * s
      const dz = normalV.z * c + binormal.z * s
      const { r, colour } = shapeAt(i, Math.atan2(dz, dx), radii[i], p)
      out.position.push(p[0] + dx * r, p[1] + dy * r, p[2] + dz * r)
      out.normal.push(dx, dy, dz)
      out.color.push(colour.r, colour.g, colour.b)
      out.flutter.push(0)
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = base + i * sides + k
      const b = base + i * sides + ((k + 1) % sides)
      const c = a + sides
      const d = b + sides
      out.index.push(a, c, b, b, c, d)
    }
  }
  if (cap) {
    const tip = points[n - 1]
    const r = radii[n - 1]
    const centre = out.position.length / 3
    out.position.push(tip[0] + tangent.x * r, tip[1] + tangent.y * r, tip[2] + tangent.z * r)
    out.normal.push(tangent.x, tangent.y, tangent.z)
    out.color.push(BARK_TWIG.r, BARK_TWIG.g, BARK_TWIG.b)
    out.flutter.push(0)
    const last = base + (n - 1) * sides
    for (let k = 0; k < sides; k++) out.index.push(last + k, centre, last + ((k + 1) % sides))
  }
}

function geometryOf(m: Mesh): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(m.position), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(m.normal), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(m.color), 3))
  g.setAttribute('aFlutter', new BufferAttribute(new Float32Array(m.flutter), 1))
  g.setIndex(m.index)
  g.computeBoundingSphere()
  return g
}

function buildBark(tree: AncientTree): BufferGeometry {
  const m = empty()
  const tint = new Color()
  const rootAngles = tree.roots.map((r) => Math.atan2(r.points[1][2], r.points[1][0]))

  /*
    The trunk, from half a metre under the meadow to the top of the tree in one
    curve — its rings close together low down, where the flare is shaped.
  */
  sweep(m, tree.trunk.points, tree.trunk.radii, 30, (ring, angle, radius, at) => {
    const y = at[1]
    // Buttresses over the roots, gone by head height.
    const flare = Math.exp(-Math.max(0, y + 0.15) / 0.55)
    let lobe = 0
    for (const ra of rootAngles) lobe = Math.max(lobe, Math.pow(Math.max(0, Math.cos(angle - ra)), 10))
    // Bark ridges running up the trunk, a little spiralled.
    const ridge = Math.pow(Math.abs(Math.sin(angle * 11 + y * 0.5 + hash(ring, 3) * 0.4)), 3)
    // A gentle flare into the roots — a tree in its prime, not a buttressed ancient.
    const r = radius * (1 + flare * (0.12 + lobe * 0.4)) * (1 - ridge * 0.035)
    tint.copy(BARK).lerp(BARK_DARK, ridge * 0.55 + Math.max(0, 0.4 - y) * 0.5)
    // Moss on the shaded side of the lower trunk.
    const north = Math.max(0, -Math.sin(angle)) * Math.max(0, 1 - y / 2.4)
    tint.lerp(MOSS, north * 0.45)
    // Under the crown the bole is in shade, and it thins to a branch's colour at the top.
    tint.multiplyScalar(1 - Math.min(1, Math.max(0, y) / 6) * 0.14)
    tint.lerp(BARK_TWIG, Math.max(0, Math.min(1, (0.3 - radius) / 0.2)) * 0.6)
    return { r, colour: tint }
  }, false)

  // Every limb, from inside the wood it leaves to its tip — as round as it is thick.
  for (const l of tree.limbs) {
    const r0 = l.radii[0]
    const sides = r0 > 0.25 ? 16 : r0 > 0.12 ? 11 : r0 > 0.06 ? 7 : 5
    sweep(m, l.points, l.radii, sides, (ring, angle, radius) => {
      const ridge = radius > 0.08 ? Math.pow(Math.abs(Math.sin(angle * 7 + ring * 0.7)), 3) : 0
      // Rougher and darker where the wood is old and thick, paler out at the twigs.
      tint.copy(BARK).lerp(BARK_TWIG, Math.max(0, Math.min(1, (0.3 - radius) / 0.26))).lerp(BARK_DARK, ridge * 0.4)
      return { r: radius * (1 - ridge * 0.04), colour: tint }
    }, true)
  }

  // Surface roots, out of the flare and down into the meadow.
  for (const root of tree.roots) {
    sweep(m, root.points, root.radii, 10, (_ring, angle, radius) => {
      tint.copy(BARK_DARK).lerp(BARK, 0.35 + Math.max(0, Math.sin(angle)) * 0.3)
      return { r: radius, colour: tint }
    }, true)
  }
  return geometryOf(m)
}

/** The same transform the form shader applies — scale, lean about X, spin about Y — for a leaf card. */
function buildLeaves(tree: AncientTree, detail: number): BufferGeometry {
  const m = empty()
  const leaf = leafGeometry()
  const lp = leaf.getAttribute('position')
  const ln = leaf.getAttribute('normal')
  const tint = new Color()
  const p = new Vector3()
  const nrm = new Vector3()
  let seed = 1
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (const spray of tree.sprays) {
    // Fewer, larger cards at lower detail, so the crown keeps its area and silhouette.
    const cards = Math.max(3, Math.round(34 * detail * spray.weight))
    const size = spray.size / Math.sqrt(detail)
    for (let i = 0; i < cards; i++) {
      // A wide cone round where the twig was heading, golden angle round it.
      const spin = i * 2.399 + rand() * 0.6
      const tilt = 0.3 + rand() * 1.05
      const [hx, hy, hz] = spray.heading
      const refUp = Math.abs(hy) > 0.95 ? [1, 0, 0] : [0, 1, 0]
      let ux = refUp[1] * hz - refUp[2] * hy
      let uy = refUp[2] * hx - refUp[0] * hz
      let uz = refUp[0] * hy - refUp[1] * hx
      const ul = Math.hypot(ux, uy, uz) || 1
      ux /= ul; uy /= ul; uz /= ul
      const vx = hy * uz - hz * uy, vy = hz * ux - hx * uz, vz = hx * uy - hy * ux
      const c = Math.cos(tilt), s = Math.sin(tilt)
      const dx = hx * c + (ux * Math.cos(spin) + vx * Math.sin(spin)) * s
      const dy = hy * c + (uy * Math.cos(spin) + vy * Math.sin(spin)) * s
      const dz = hz * c + (uz * Math.cos(spin) + vz * Math.sin(spin)) * s
      // Spread along a reach that never collapses to a point, or the spray is a blob.
      const along = (-0.18 + rand()) * spray.reach
      const ox = spray.at[0] + dx * along
      const oy = spray.at[1] + dy * along
      const oz = spray.at[2] + dz * along
      const leanX = Math.acos(Math.max(-1, Math.min(1, dy)))
      const rotY = Math.atan2(-dx, dz)
      const sx = size * (0.75 + rand() * 0.5)
      const sy = size * (0.85 + rand() * 0.5)
      /*
        The crown's own shade, baked: dark in the middle and underneath, lit at
        the top and the rim. A leaf's distance out from the trunk against the
        crown's spread, and its height against the crown's top.
      */
      const outN = Math.min(1, Math.hypot(ox, oz) / Math.max(1, tree.spread))
      const upN = Math.min(1, Math.max(0, (oy - tree.crownBase) / Math.max(1, tree.top - tree.crownBase)))
      const ao = 0.62 + 0.3 * outN + 0.28 * upN
      tint.copy(CANOPY[Math.floor(rand() * CANOPY.length)]).multiplyScalar(Math.min(1.12, ao))
      const flutter = 0.05 + rand()
      const first = m.position.length / 3
      const cx = Math.cos(leanX), sxn = Math.sin(leanX), cy = Math.cos(rotY), syn = Math.sin(rotY)
      for (let v = 0; v < lp.count; v++) {
        p.set(lp.getX(v) * sx, lp.getY(v) * sy, lp.getZ(v) * size)
        nrm.set(ln.getX(v), ln.getY(v), ln.getZ(v))
        for (const q of [p, nrm]) {
          const y1 = q.y * cx - q.z * sxn
          const z1 = q.y * sxn + q.z * cx
          const x2 = q.x * cy - z1 * syn
          const z2 = q.x * syn + z1 * cy
          q.set(x2, y1, z2)
        }
        m.position.push(ox + p.x, oy + p.y, oz + p.z)
        m.normal.push(nrm.x, nrm.y, nrm.z)
        m.color.push(tint.r, tint.g, tint.b)
        m.flutter.push(flutter)
      }
      for (let v = 0; v < lp.count; v++) m.index.push(first + v)
    }
  }
  leaf.dispose()
  return geometryOf(m)
}

/** A disc of shade over the meadow under the crown, laid on the ground's own shape. */
function buildShade(tree: AncientTree): BufferGeometry {
  const RINGS = 14
  const SEGS = 48
  const radius = tree.spread * 1.08
  const position: number[] = []
  const shade: number[] = []
  const index: number[] = []
  const [fx, , fz] = tree.foot
  position.push(fx, groundHeight(fx, fz) + 0.06, fz)
  shade.push(1)
  for (let r = 1; r <= RINGS; r++) {
    const d = (r / RINGS) * radius
    for (let k = 0; k < SEGS; k++) {
      const a = (k / SEGS) * Math.PI * 2
      // Ragged at the rim, where the crown is.
      const rim = d * (1 + Math.sin(a * 5 + 1.3) * 0.06 + Math.sin(a * 11) * 0.03)
      const x = fx + Math.cos(a) * rim
      const z = fz + Math.sin(a) * rim
      position.push(x, groundHeight(x, z) + 0.06, z)
      const t = r / RINGS
      shade.push(Math.pow(1 - t, 0.9) * (t > 0.92 ? (1 - t) / 0.08 : 1))
    }
  }
  for (let k = 0; k < SEGS; k++) index.push(0, 1 + ((k + 1) % SEGS), 1 + k)
  for (let r = 0; r < RINGS - 1; r++) {
    for (let k = 0; k < SEGS; k++) {
      const a = 1 + r * SEGS + k
      const b = 1 + r * SEGS + ((k + 1) % SEGS)
      index.push(a, b, a + SEGS, b, b + SEGS, a + SEGS)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  g.setAttribute('aShade', new BufferAttribute(new Float32Array(shade), 1))
  g.setIndex(index)
  g.computeBoundingSphere()
  return g
}

export function TreeOfLetters({
  tree,
  palette,
  detail = 1,
  shaded = true,
}: {
  tree: AncientTree
  palette: SkyPalette
  /** How many leaf cards, as a fraction: 1 under it, less for the garden's preview of it. */
  detail?: number
  /** Whether to lay its shade on the ground — only where the ground is the world's. */
  shaded?: boolean
}) {
  const { bark, leaves, shade } = useMemo(
    () => ({ bark: buildBark(tree), leaves: buildLeaves(tree, detail), shade: buildShade(tree) }),
    [tree, detail],
  )
  useEffect(() => () => {
    bark.dispose()
    leaves.dispose()
    shade.dispose()
  }, [bark, leaves, shade])

  const materials = useMemo(() => {
    const make = (side: typeof FrontSide | typeof DoubleSide) =>
      new ShaderMaterial({
        vertexShader: TREE_VERT,
        fragmentShader: TREE_FRAG,
        side,
        uniforms: {
          uTime: { value: 0 },
          uWind: { value: 1 },
          uSway: { value: TREE_SWAY },
          uPhase: { value: TREE_PHASE },
          uFoot: { value: new Vector3(...tree.foot) },
          uFogColor: { value: new Color('#c3cebe') },
          uSunColor: { value: new Color('#fff2d8') },
          uFogNear: { value: 16 },
          uFogFar: { value: 150 },
          uSun: { value: 1 },
          uLight: { value: 1 },
        },
      })
    return {
      bark: make(FrontSide),
      leaves: make(DoubleSide),
      shade: new ShaderMaterial({
        vertexShader: SHADE_VERT,
        fragmentShader: SHADE_FRAG,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        uniforms: { uLight: { value: 1 }, uFogNear: { value: 16 }, uFogFar: { value: 150 } },
      }),
    }
  }, [tree])
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials])

  useEffect(() => {
    const light = ambientLightLevel(palette)
    for (const m of [materials.bark, materials.leaves]) {
      const u = m.uniforms
      ;(u.uFogColor.value as Color).set(palette.fogColor)
      ;(u.uSunColor.value as Color).set(palette.sunColor)
      u.uFogNear.value = palette.fogNear
      u.uFogFar.value = palette.fogFar
      u.uSun.value = Math.min(1, palette.sunIntensity)
      u.uLight.value = light
      u.uWind.value = palette.wind
    }
    materials.shade.uniforms.uLight.value = Math.min(1, palette.sunIntensity)
    materials.shade.uniforms.uFogNear.value = palette.fogNear
    materials.shade.uniforms.uFogFar.value = palette.fogFar
    treeClock.wind = palette.wind
  }, [materials, palette])

  useFrame(({ clock }) => {
    // The one clock — the threads read it too. Set from the renderer's own, not
    // added to, so the landmark and the section both mounted cannot run it at double speed.
    treeClock.t = clock.elapsedTime
    materials.bark.uniforms.uTime.value = treeClock.t
    materials.leaves.uniforms.uTime.value = treeClock.t
  })

  return (
    <>
      {shaded ? <mesh geometry={shade} material={materials.shade} frustumCulled={false} renderOrder={1} /> : null}
      <mesh geometry={bark} material={materials.bark} frustumCulled={false} />
      <mesh geometry={leaves} material={materials.leaves} frustumCulled={false} />
    </>
  )
}
