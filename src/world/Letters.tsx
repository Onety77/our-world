/**
 * Letters hanging from the branches — on real threads.
 *
 * Each one is a folded sheet on a thread, turning in the same wind as the tree.
 * Unread ones — hers, that you haven't opened — carry a soft glow, so you can
 * tell from the path whether she's been.
 *
 * ---------------------------------------------------------------------------
 * **The thread used to be drawn, not hung.** It was a stripe in the paper's
 * own quad, swung by a sine in the vertex shader about a knot that never moved:
 * so it passed straight through any branch in its way, the knot floated clear
 * of its limb whenever the tree bent in the wind, and a paper swinging into the
 * crown went through the wood as if it were fog.
 *
 * Now every thread is a rope: a chain of points under gravity, pushed by the
 * wind, held to its length, tied to a knot that rides its branch as the branch
 * bends (`world/treeWind`) — and every limb thick enough to matter is solid
 * (`capsules` in `sections/tree/greatTree`). Swing a thread into a branch and
 * it catches there: the part touching the wood lies on it and drags along it,
 * and the rest of the thread and the paper go on swinging from that point.
 * Nobody arranged that; it is what a rope with a branch in the way does.
 *
 * Verlet integration at a fixed sixty steps a second, a handful of constraint
 * passes, collisions against a spatial hash of the wood. A tree with a hundred
 * thoughts on it is a couple of thousand points — well under a millisecond.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three'
import type { SkyPalette } from '@/systems/palette'
import { LIGHT_COLORS } from '@/systems/palette'
import type { UserId } from '@/data/types'
import { stillSealed } from '@/data/types'
import { useReading } from '@/systems/reading'
import { ambientLightLevel } from './forms'
import { treeClock } from './treeWind'
import { STEP, buildRopes, buildWood, stepRopes } from './threads'
import type { AncientTree } from '@/sections/tree/greatTree'

/**
 * How wide a folded letter is, in metres — a folded note, not a page.
 *
 * It was sixty centimetres by eighty-six, sized to be found seven metres up
 * inside a crown. The papers hang at head height now, under the lowest limbs
 * and fifteen metres nearer the eye than they used to be, and at that size
 * thirty of them were a line of washing.
 */
export const PAPER = 0.44
/** How tall the sheet itself is, in metres. */
export const PAPER_HEIGHT = 0.6

/**
 * One thought, hanging.
 *
 * The knot rather than the paper: the paper's place is the rope's business now,
 * and it moves. Everything that wants to point at the sheet — the tap target,
 * the glow — reads `livePapers`, with `paperCentre` as the answer before the
 * rope has run.
 *
 * Deliberately not a `Letter`: a letter's stored `position` is where its
 * *flower* grew, on the ground, and that is the record.
 */
export interface Hung {
  id: string
  by: UserId
  readAt: number | null
  /** The day it opens, or null. */
  openAt: number | null
  /** Where the thread is tied, on the branch, in the world. */
  knot: [number, number, number]
  /** Metres of thread between the knot and the top of the sheet. */
  drop: number
}

/** Where the middle of a sheet would be hanging straight down, at rest. */
export function paperCentre(hung: Hung): [number, number, number] {
  return [hung.knot[0], hung.knot[1] - hung.drop - PAPER_HEIGHT / 2, hung.knot[2]]
}

/** Where each sheet's middle is right now, by thought id. Read by the tap. */
export const livePapers = new Map<string, [number, number, number]>()

/* ---- drawing ------------------------------------------------------------------------- */

/** A thread: a strip turned to face the eye, never thinner than about a pixel and a half. */
const THREAD_VERT = /* glsl */ `
  attribute vec3 aTangent;
  attribute float aSide;
  attribute float aAlong;
  uniform float uViewport;
  varying float vAlong;
  varying float vDepth;
  void main() {
    vAlong = aAlong;
    vec3 toEye = cameraPosition - position;
    vec3 side = normalize(cross(aTangent, toEye) + vec3(1e-5, 0.0, 0.0));
    vec4 centre = viewMatrix * vec4(position, 1.0);
    float depth = -centre.z;
    float metrePerPixel = 2.0 * depth / max(1.0, projectionMatrix[1][1] * uViewport);
    float half_ = max(0.004, metrePerPixel * 0.75);
    vec4 mv = viewMatrix * vec4(position + side * aSide * half_, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const THREAD_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uPaper;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uLight;
  varying float vAlong;
  varying float vDepth;
  void main() {
    vec3 col = uPaper * mix(0.62, 0.34, vAlong) * uLight;
    col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vDepth));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const PAPER_VERT = /* glsl */ `
  attribute vec3 iTop;
  attribute vec3 iBottom;
  attribute float iTint;
  attribute float iIndex;
  attribute float iSealed;
  uniform float uHover;
  uniform highp float uTime;
  varying vec2 vUv;
  varying float vDepth;
  varying float vTint;
  varying float vLit;
  varying float vSealed;
  void main() {
    vUv = uv;
    vTint = iTint;
    vLit = abs(iIndex - uHover) < 0.5 ? 1.0 : 0.0;
    vSealed = iSealed;
    vec3 down = iBottom - iTop;
    vec3 mid = (iTop + iBottom) * 0.5;
    vec3 axis = normalize(down + vec3(0.0, -1e-5, 0.0));
    /*
      Turned to face you about its own thread, so you never lose one edge-on —
      and turning a little on it, the way a sheet on a string does.
    */
    vec3 toEye = cameraPosition - mid;
    vec3 right = normalize(cross(axis, toEye) + vec3(1e-5, 0.0, 0.0));
    vec3 facing = cross(right, axis);
    float twist = sin(uTime * 0.7 + iIndex * 2.3) * 0.32;
    right = right * cos(twist) + facing * sin(twist);
    float furl = mix(1.0, 0.34, iSealed);
    vec3 p = iTop + down * (1.0 - uv.y) + right * position.x * ${PAPER.toFixed(3)} * furl;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const PAPER_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uPaper;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uLight;
  varying vec2 vUv;
  varying float vDepth;
  varying float vTint;
  varying float vLit;
  varying float vSealed;
  void main() {
    vec3 col;
    float py = vUv.y;
    float across = abs(vUv.x - 0.5) * 2.0;
    if (vSealed > 0.5) {
      // A roll with a cord round it, and nothing written on the outside.
      float roll = sqrt(max(0.0, 1.0 - across * across));
      col = uPaper * (0.58 + roll * 0.5) * (0.92 + vTint * 0.16) * uLight;
      col *= 1.0 - (1.0 - smoothstep(0.016, 0.05, abs(py - 0.56))) * 0.5;
      col *= 0.84 + py * 0.22;
    } else {
      // A fold: two halves facing different ways, and a crease between.
      float side = vUv.x < 0.5 ? 0.0 : 1.0;
      /*
        Soft, now. Hard halves and three bands of "ink" read, at the size these
        hang at, as a little white box with stripes — a stack of cards, not a
        note. The fold is a gentle turn, the writing a faint grey the eye takes
        for writing without resolving any line of it, and the edges curl darker.
      */
      float fold = mix(mix(1.06, 0.98, across), mix(0.9, 0.82, across), side);
      float crease = 1.0 - (1.0 - smoothstep(0.0, 0.05, across)) * 0.14;
      col = uPaper * fold * crease * (0.94 + vTint * 0.12) * uLight;
      float written = smoothstep(0.2, 0.34, py) * (1.0 - smoothstep(0.66, 0.82, py));
      float margin = smoothstep(0.1, 0.2, across) * (1.0 - smoothstep(0.6, 0.78, across));
      col *= 1.0 - written * margin * 0.07;
      float edge = max(across, abs(py - 0.5) * 2.0);
      col *= 1.0 - smoothstep(0.82, 1.0, edge) * 0.14;
      col *= 0.9 + py * 0.12;
    }
    col *= 1.0 + vLit * 0.85;
    col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vDepth));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const GLOW_VERT = /* glsl */ `
  attribute vec3 iOffset;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up    = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    vec3 local = right * position.x + up * position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(local + iOffset, 1.0);
  }
`

const GLOW_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uPulse;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float halo = pow(1.0 - smoothstep(0.0, 1.0, d), 2.6);
    float a = halo * uPulse;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function Letters({
  hung,
  me,
  palette,
  tree,
}: {
  hung: Hung[]
  me: UserId
  palette: SkyPalette
  tree: AncientTree
}) {
  const foot = tree.foot
  const wood = useMemo(() => buildWood(tree), [tree])

  const built = useMemo(() => {
    const ropes = buildRopes(hung, foot, PAPER_HEIGHT)
    // Let the curtain settle before anyone sees it: threads that start straight
    // through a spray find their way round the wood, and the swing dies down.
    for (let s = 0; s < 180; s++) stepRopes(ropes, wood, foot, treeClock.t - (180 - s) * STEP, treeClock.wind)

    // Threads: two vertices a point, strip-indexed.
    const threadPoints = hung.reduce((n, _, i) => n + ropes.segments[i] + 1, 0)
    const threadGeo = new BufferGeometry()
    const tPos = new BufferAttribute(new Float32Array(threadPoints * 2 * 3), 3)
    const tTan = new BufferAttribute(new Float32Array(threadPoints * 2 * 3), 3)
    tPos.setUsage(DynamicDrawUsage)
    tTan.setUsage(DynamicDrawUsage)
    const side = new Float32Array(threadPoints * 2)
    const along = new Float32Array(threadPoints * 2)
    const index: number[] = []
    let v = 0
    hung.forEach((_, k) => {
      const n = ropes.segments[k]
      for (let s = 0; s <= n; s++) {
        side[v * 2] = -1
        side[v * 2 + 1] = 1
        along[v * 2] = along[v * 2 + 1] = s / n
        if (s < n) {
          const a = v * 2
          index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
        }
        v++
      }
    })
    threadGeo.setAttribute('position', tPos)
    threadGeo.setAttribute('aTangent', tTan)
    threadGeo.setAttribute('aSide', new BufferAttribute(side, 1))
    threadGeo.setAttribute('aAlong', new BufferAttribute(along, 1))
    threadGeo.setIndex(index)
    threadGeo.boundingSphere = new Sphere(new Vector3(...foot), 60)

    // Papers: one instanced quad, top and bottom moved every frame.
    const base = new PlaneGeometry(1, 1)
    const papers = new InstancedBufferGeometry()
    papers.setAttribute('position', base.attributes.position)
    papers.setAttribute('uv', base.attributes.uv)
    papers.setIndex(base.index)
    base.dispose()
    const count = Math.max(1, hung.length)
    const top = new InstancedBufferAttribute(new Float32Array(count * 3), 3)
    const bottom = new InstancedBufferAttribute(new Float32Array(count * 3), 3)
    top.setUsage(DynamicDrawUsage)
    bottom.setUsage(DynamicDrawUsage)
    const tint = new Float32Array(count)
    const idx = new Float32Array(count)
    const sealed = new Float32Array(count)
    const now = Date.now()
    hung.forEach((h, i) => {
      tint[i] = (i * 0.618) % 1
      idx[i] = i
      sealed[i] = stillSealed(h, me, now) ? 1 : 0
    })
    papers.setAttribute('iTop', top)
    papers.setAttribute('iBottom', bottom)
    papers.setAttribute('iTint', new InstancedBufferAttribute(tint, 1))
    papers.setAttribute('iIndex', new InstancedBufferAttribute(idx, 1))
    papers.setAttribute('iSealed', new InstancedBufferAttribute(sealed, 1))
    papers.instanceCount = hung.length
    papers.boundingSphere = new Sphere(new Vector3(...foot), 60)

    /*
      Hers, unopened — the only thing in the tree that glows, round the paper.
      A sealed thought does not glow: the words are not on this device, and a
      light that draws somebody to a paper that cannot say anything is the
      world making a promise it has to break.
    */
    const glowing = hung
      .map((h, i) => (h.by !== me && h.readAt === null && !stillSealed(h, me, now) ? i : -1))
      .filter((i) => i >= 0)
    const glowBase = new PlaneGeometry(PAPER * 6, PAPER * 6)
    const glows = new InstancedBufferGeometry()
    glows.setAttribute('position', glowBase.attributes.position)
    glows.setAttribute('uv', glowBase.attributes.uv)
    glows.setIndex(glowBase.index)
    glowBase.dispose()
    const glowAt = new InstancedBufferAttribute(new Float32Array(Math.max(1, glowing.length) * 3), 3)
    glowAt.setUsage(DynamicDrawUsage)
    glows.setAttribute('iOffset', glowAt)
    glows.instanceCount = glowing.length
    glows.boundingSphere = new Sphere(new Vector3(...foot), 60)

    return { ropes, threadGeo, papers, glows, glowing }
  }, [hung, me, foot, wood])

  useEffect(() => () => {
    built.threadGeo.dispose()
    built.papers.dispose()
    built.glows.dispose()
  }, [built])

  const materials = useMemo(() => {
    const paper = { value: new Color('#e8e0cd') }
    const fog = () => ({
      uFogColor: { value: new Color('#c3cebe') },
      uFogNear: { value: 16 },
      uFogFar: { value: 150 },
      uLight: { value: 1 },
    })
    return {
      thread: new ShaderMaterial({
        vertexShader: THREAD_VERT,
        fragmentShader: THREAD_FRAG,
        side: DoubleSide,
        uniforms: { ...fog(), uPaper: paper, uViewport: { value: 800 } },
      }),
      paper: new ShaderMaterial({
        vertexShader: PAPER_VERT,
        fragmentShader: PAPER_FRAG,
        side: DoubleSide,
        uniforms: { ...fog(), uPaper: paper, uHover: { value: -1 }, uTime: { value: 0 } },
      }),
      glow: new ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uColor: { value: new Color(LIGHT_COLORS[me === 'warm' ? 'cool' : 'warm']) },
          uPulse: { value: 0.4 },
        },
      }),
    }
  }, [me])
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials])

  useEffect(() => {
    for (const m of [materials.thread, materials.paper]) {
      const u = m.uniforms
      ;(u.uFogColor.value as Color).set(palette.fogColor)
      u.uFogNear.value = palette.fogNear
      u.uFogFar.value = palette.fogFar
      u.uLight.value = ambientLightLevel(palette)
    }
  }, [materials, palette])

  const hovered = useReading((s) => s.hoveredLetterId)
  useEffect(() => {
    materials.paper.uniforms.uHover.value = hovered ? hung.findIndex((l) => l.id === hovered) : -1
  }, [materials, hovered, hung])

  const debt = useRef(0)
  useEffect(() => () => {
    for (const h of hung) livePapers.delete(h.id)
  }, [hung])

  useFrame(({ gl }, delta) => {
    const { ropes, threadGeo, papers, glows, glowing } = built
    // A fixed step, caught up at most three at a time so a hitch does not become a stampede.
    debt.current = Math.min(debt.current + delta, STEP * 3)
    let t = treeClock.t - debt.current
    while (debt.current >= STEP) {
      t += STEP
      stepRopes(ropes, wood, foot, t, treeClock.wind)
      debt.current -= STEP
    }

    const pos = ropes.pos
    const tp = threadGeo.getAttribute('position') as BufferAttribute
    const tt = threadGeo.getAttribute('aTangent') as BufferAttribute
    const top = papers.getAttribute('iTop') as InstancedBufferAttribute
    const bottom = papers.getAttribute('iBottom') as InstancedBufferAttribute
    const glowAt = glows.getAttribute('iOffset') as InstancedBufferAttribute
    const [fx, fy, fz] = foot
    let v = 0
    for (let k = 0; k < ropes.ropes; k++) {
      const s0 = ropes.start[k]
      const n = ropes.segments[k]
      for (let s = 0; s <= n; s++) {
        const i = (s0 + s) * 3
        const a = (s0 + Math.max(0, s - 1)) * 3
        const b = (s0 + Math.min(n, s + 1)) * 3
        const x = pos[i] + fx, y = pos[i + 1] + fy, z = pos[i + 2] + fz
        const ttx = pos[b] - pos[a], tty = pos[b + 1] - pos[a + 1], ttz = pos[b + 2] - pos[a + 2]
        for (let d = 0; d < 2; d++) {
          tp.setXYZ(v * 2 + d, x, y, z)
          tt.setXYZ(v * 2 + d, ttx, tty, ttz)
        }
        v++
      }
      const ti = (s0 + n) * 3
      const bi = (s0 + n + 1) * 3
      top.setXYZ(k, pos[ti] + fx, pos[ti + 1] + fy, pos[ti + 2] + fz)
      bottom.setXYZ(k, pos[bi] + fx, pos[bi + 1] + fy, pos[bi + 2] + fz)
      const centre = livePapers.get(hung[k].id) ?? [0, 0, 0]
      centre[0] = (pos[ti] + pos[bi]) / 2 + fx
      centre[1] = (pos[ti + 1] + pos[bi + 1]) / 2 + fy
      centre[2] = (pos[ti + 2] + pos[bi + 2]) / 2 + fz
      livePapers.set(hung[k].id, centre)
    }
    glowing.forEach((k, g) => {
      const c = livePapers.get(hung[k].id)
      if (c) glowAt.setXYZ(g, c[0], c[1], c[2])
    })
    tp.needsUpdate = true
    tt.needsUpdate = true
    top.needsUpdate = true
    bottom.needsUpdate = true
    glowAt.needsUpdate = true

    materials.thread.uniforms.uViewport.value = gl.domElement.height
    materials.paper.uniforms.uTime.value = treeClock.t
    materials.glow.uniforms.uPulse.value =
      0.32 + Math.sin(treeClock.t * 1.1) * 0.12 + Math.sin(treeClock.t * 0.53) * 0.05
  })

  if (hung.length === 0) return null
  return (
    <>
      <mesh geometry={built.glows} material={materials.glow} frustumCulled={false} renderOrder={3} />
      <mesh geometry={built.threadGeo} material={materials.thread} frustumCulled={false} />
      <mesh geometry={built.papers} material={materials.paper} frustumCulled={false} />
    </>
  )
}
