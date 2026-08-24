/**
 * Letters hanging from the branches.
 *
 * Each one is a folded sheet on a thread, turning slowly in the same wind as
 * everything else. Unread ones — meaning hers, that you haven't opened —
 * carry a soft glow, so you can tell from the path whether she's been.
 *
 * Two meshes for the lot: the papers, and the glows. Both instanced, so a tree
 * with three hundred letters on it costs the same as one with three.
 *
 * ---------------------------------------------------------------------------
 * **The thread is long, and it is long on purpose.**
 *
 * A paper used to hang about a metre below the branch it was tied to, on a
 * thread that ran *up* into the crown. Which is what a letter in a tree
 * actually does — and it meant that every thought either of you had ever
 * written was somewhere inside two thousand leaves. You could not see them
 * from the ground, you could not tell how many there were, and aiming a thumb
 * at one was aiming at foliage. The one thing in the place you are meant to
 * reach for was the one thing you could not find.
 *
 * So the thread is as long as it needs to be. Each letter is given a *height
 * to hang at* rather than a length of thread — down in the clear air under the
 * crown, at about the height of somebody standing — and the thread is whatever
 * reaches from the branch to there. A paper tied high in the tree gets six
 * metres of it and a paper on a low limb gets one, which is why they read as a
 * curtain rather than as a shelf. See `hangSpot` in `sections/tree/greatTree`.
 *
 * The other half of the fix is that the thread is now *visible*. It was two
 * and a half centimetres of dark paper colour, which at the twenty-seven
 * metres this is looked at from is two thirds of one pixel: it flickered in
 * and out as the tree moved and mostly was not there. It has a floor in screen
 * space now — never thinner than about a pixel and a half however far away it
 * is — which is the same trick a map draws a road with, and for the same
 * reason.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import type { SkyPalette } from '@/systems/palette'
import { LIGHT_COLORS } from '@/systems/palette'
import type { UserId } from '@/data/types'
import { useReading } from '@/systems/reading'
import { ambientLightLevel } from './forms'

/**
 * How wide a folded letter is, in metres.
 *
 * Generous. These hang seven metres up and are looked at from twenty-seven,
 * where a hand-sized sheet is four pixels of white and reads as a speck of
 * dust on the lens.
 */
export const PAPER = 0.62
/**
 * How tall the sheet itself is, in metres. Roughly a folded page.
 *
 * It was a metre and a bit, sized to be findable when it was hanging seven
 * metres up inside a crown. It is not up there any more — it hangs at head
 * height in clear air — and at that distance a metre of paper is a door.
 */
export const PAPER_HEIGHT = 0.86

/**
 * One thought, hanging.
 *
 * The knot rather than the paper, because the paper's place is derived: the
 * thread's length is what puts it where it is, and something has to own that
 * number. Everything that wants to point at the sheet — the tap target, the
 * glow — goes through `paperCentre` so there is one answer to where it is.
 *
 * This is deliberately not a `Letter`. A letter's stored `position` is where
 * its *flower* grew, on the ground, and that is the record; the paper in the
 * air is a second view of the same thought and its place is worked out fresh
 * every time from the tree. Passing a Letter in here and quietly meaning
 * something else by `position` is how those two drifted into each other
 * before.
 */
export interface Hung {
  id: string
  by: UserId
  readAt: number | null
  /** Where the thread is tied, on the branch. */
  knot: [number, number, number]
  /** Metres of thread between the knot and the top of the sheet. */
  drop: number
}

/** The middle of the sheet — what you look at, and what you tap. */
export function paperCentre(hung: Hung): [number, number, number] {
  return [hung.knot[0], hung.knot[1] - hung.drop - PAPER_HEIGHT / 2, hung.knot[2]]
}

const PAPER_VERT = /* glsl */ `
  attribute vec3 iKnot;
  attribute float iDrop;
  attribute float iPhase;
  attribute float iTint;
  attribute float iIndex;

  uniform float uTime;
  uniform float uWind;
  uniform float uHover;
  /** Drawing-buffer height, in device pixels. See vThread. */
  uniform float uViewport;

  varying vec2 vUv;
  varying float vDepth;
  varying float vTint;
  varying float vLit;
  /** Where the sheet stops and the thread begins, as a uv.y. Per-instance. */
  varying float vPaperTop;
  /** Half the thread's width, in uv.x. Per-instance and per-distance. */
  varying float vThread;

  void main() {
    vUv = uv;
    vTint = iTint;
    vLit = abs(iIndex - uHover) < 0.5 ? 1.0 : 0.0;

    /*
      The quad is built in uv rather than read off its own corners.

      Every letter has a different length of thread, so no single piece of
      geometry is the right shape for all of them — the sheet has to stay one
      metre and a bit tall while the thread above it runs from one metre to
      six. So the four corners carry nothing but their uv, and the shape is
      worked out here: uv.y = 1 is the knot, uv.y = 0 is the bottom edge of the
      paper, and everything between is scaled by this instance's own drop.
    */
    float total = ${PAPER_HEIGHT.toFixed(3)} + iDrop;
    vPaperTop = ${PAPER_HEIGHT.toFixed(3)} / total;

    // hangs from the knot, so it swings from the thread rather than rotating
    // about its own middle like a coin
    float hang = uv.y - 1.0;

    float gust = sin(uTime * 0.42 + iKnot.x * 0.055 + iKnot.z * 0.041) * 0.5 + 0.5;
    float swing = sin(uTime * 1.05 + iPhase) * 0.5 + sin(uTime * 1.9 + iPhase * 1.6) * 0.2;
    // Generous. The swing is the whole tell that a paper is hanging on a
    // thread rather than pinned to the air, and it is read from twenty-odd
    // metres where a subtle one is no swing at all.
    float amount = swing * (0.35 + gust * 0.85) * uWind;

    /*
      Billboarded about the vertical only, not about both axes.

      It turns to face you so you never catch a sheet edge-on and lose it — but
      it hangs along *world* down, because that is what a thread does. Taking
      the up vector off the camera as well (which is what a full billboard is,
      and what this used to be) was invisible while the thread was a metre
      long; at six it means the whole curtain leans over whenever you look up
      at the crown, and papers hanging off the vertical read as a mistake
      rather than as weather.
    */
    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up = vec3(0.0, 1.0, 0.0);

    // A long thread swings further at the bottom than a short one, because it
    // is a longer pendulum. Proportional rather than fixed, or the six-metre
    // ones hang dead still next to the one-metre ones twitching.
    vec3 local = right * (position.x + amount * hang * total * 0.14)
               + up * (hang * total - abs(amount * hang) * total * 0.045);

    vec4 mv = modelViewMatrix * vec4(local + iKnot, 1.0);
    vDepth = -mv.z;

    /*
      The thread, given a floor in screen space.

      A real thread is a couple of millimetres and would be invisible; two and
      a half centimetres — what this was — is two thirds of a pixel at the
      distance the tree is read from, which is worse than invisible because it
      flickers. So: work out what one pixel is worth in metres at this depth,
      and never draw the thread narrower than about one and a half of them.
      Near to, the world width wins and it is a thread; far off, the pixel
      floor wins and it stays a hairline instead of dissolving.

      projectionMatrix[1][1] is 1/tan(fov/2), so this is the standard
      pixels-per-metre at a distance, turned inside out.
    */
    float metrePerPixel = 2.0 * vDepth / max(1.0, projectionMatrix[1][1] * uViewport);
    vThread = max(0.014, metrePerPixel * 0.75) / ${PAPER.toFixed(3)};

    gl_Position = projectionMatrix * mv;
  }
`

const PAPER_FRAG = /* glsl */ `
  precision mediump float;

  uniform vec3 uPaper;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uLight;

  varying vec2 vUv;
  varying float vDepth;
  varying float vTint;
  varying float vLit;
  varying float vPaperTop;
  varying float vThread;

  void main() {
    vec3 col;

    if (vUv.y > vPaperTop) {
      // The thread. Without it the letters read as rectangles floating in mid
      // air with no relationship to the tree at all — this one detail is most
      // of what makes them look hung rather than pasted on.
      if (abs(vUv.x - 0.5) > vThread) discard;
      /*
        Darker where it leaves the branch and lighter where it reaches the
        paper. A thread of one flat value reads as a drawn line; this reads as
        one that is catching the light along part of its length, which is what
        a thread against a bright sky actually does.
      */
      float along = (vUv.y - vPaperTop) / max(0.001, 1.0 - vPaperTop);
      col = uPaper * mix(0.62, 0.3, along) * uLight;
    } else {
      float py = vUv.y / vPaperTop;

      /*
        The fold, and it has to be *strong*.

        Two halves at 1.0 and 0.9 is a four per cent difference after tone
        mapping, which is nothing — the sheets came out as flat white
        rectangles, and a flat white rectangle is the one thing the design law
        says may not exist. What makes a folded sheet read as paper rather than
        as a card is that the two halves face different ways and therefore take
        visibly different light: the near half is turned toward you and the far
        half is turned away, with a hard crease between them.

        Each half also ramps rather than sitting flat, because a fold in paper
        is a curve near the crease and not a hinge.
      */
      float side = vUv.x < 0.5 ? 0.0 : 1.0;
      float across = abs(vUv.x - 0.5) * 2.0;
      float fold = mix(mix(1.12, 0.99, across), mix(0.80, 0.66, across), side);
      // the crease itself, a dark hairline where the two halves meet
      float crease = 1.0 - (1.0 - smoothstep(0.0, 0.045, across)) * 0.3;

      col = uPaper * fold * crease * (0.92 + vTint * 0.16) * uLight;
      /*
        Ink. Not letterforms — at this size any real writing is noise — but the
        *presence* of writing: a few darker bands across the upper two thirds
        where lines of it would be, fading out toward the bottom of the sheet
        the way a short note does.
      */
      float lines = sin(py * 24.0) * 0.5 + 0.5;
      float written = smoothstep(0.12, 0.3, py) * (1.0 - smoothstep(0.62, 0.92, py));
      float margin = smoothstep(0.06, 0.16, across) * (1.0 - smoothstep(0.62, 0.86, across));
      col *= 1.0 - lines * written * margin * 0.17;
      // the corners turn down slightly — darker toward the bottom edge
      col *= 0.86 + py * 0.2;
    }

    // the one you are pointing at lifts, so it is obvious it can be taken down
    col *= 1.0 + vLit * 0.85;

    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fog);

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
  precision mediump float;
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

/** A quad whose corners carry only their uv — the shape is made in the shader. */
function papersGeometry(hung: Hung[]): InstancedBufferGeometry {
  const base = new PlaneGeometry(PAPER, 1)
  const geo = new InstancedBufferGeometry()
  geo.setAttribute('position', base.attributes.position)
  geo.setAttribute('uv', base.attributes.uv)
  if (base.index) geo.setIndex(base.index)
  base.dispose()

  const count = Math.max(1, hung.length)
  const knot = new Float32Array(count * 3)
  const drop = new Float32Array(count)
  const phase = new Float32Array(count)
  const tint = new Float32Array(count)
  const index = new Float32Array(count)

  hung.forEach((letter, i) => {
    knot.set(letter.knot, i * 3)
    drop[i] = letter.drop
    phase[i] = (i * 2.399) % (Math.PI * 2)
    tint[i] = (i * 0.618) % 1
    index[i] = i
  })

  geo.setAttribute('iKnot', new InstancedBufferAttribute(knot, 3))
  geo.setAttribute('iDrop', new InstancedBufferAttribute(drop, 1))
  geo.setAttribute('iPhase', new InstancedBufferAttribute(phase, 1))
  geo.setAttribute('iTint', new InstancedBufferAttribute(tint, 1))
  geo.setAttribute('iIndex', new InstancedBufferAttribute(index, 1))
  geo.instanceCount = hung.length
  return geo
}

function glowsGeometry(at: [number, number, number][]): InstancedBufferGeometry {
  const base = new PlaneGeometry(PAPER * 6, PAPER * 6)
  const geo = new InstancedBufferGeometry()
  geo.setAttribute('position', base.attributes.position)
  geo.setAttribute('uv', base.attributes.uv)
  if (base.index) geo.setIndex(base.index)
  base.dispose()

  const offset = new Float32Array(Math.max(1, at.length) * 3)
  at.forEach((p, i) => offset.set(p, i * 3))
  geo.setAttribute('iOffset', new InstancedBufferAttribute(offset, 3))
  geo.instanceCount = at.length
  return geo
}

export function Letters({
  hung,
  me,
  palette,
}: {
  hung: Hung[]
  me: UserId
  palette: SkyPalette
}) {
  const { papers, glows, glowColor } = useMemo(() => {
    const built = {
      papers: papersGeometry(hung),
      // hers, unopened — the only thing in the tree that glows, and it glows
      // around the *paper* rather than around the knot it hangs from
      glows: glowsGeometry(
        hung.filter((l) => l.by !== me && l.readAt === null).map(paperCentre),
      ),
      glowColor: LIGHT_COLORS[me === 'warm' ? 'cool' : 'warm'],
    }
    return built
  }, [hung, me])

  useEffect(
    () => () => {
      papers.dispose()
      glows.dispose()
    },
    [papers, glows],
  )

  const paperMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: PAPER_VERT,
        fragmentShader: PAPER_FRAG,
        side: DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uWind: { value: 1 },
          uPaper: { value: new Color('#e8e0cd') },
          uFogColor: { value: new Color('#c3cebe') },
          uFogNear: { value: 16 },
          uFogFar: { value: 150 },
          uLight: { value: 1 },
          uHover: { value: -1 },
          uViewport: { value: 800 },
        },
      }),
    [],
  )

  const glowMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uColor: { value: new Color(glowColor) },
          uPulse: { value: 0.4 },
        },
      }),
    [glowColor],
  )

  useEffect(() => () => paperMaterial.dispose(), [paperMaterial])
  useEffect(() => () => glowMaterial.dispose(), [glowMaterial])

  useEffect(() => {
    const u = paperMaterial.uniforms
    u.uFogColor.value.set(palette.fogColor)
    u.uFogNear.value = palette.fogNear
    u.uFogFar.value = palette.fogFar
    u.uLight.value = ambientLightLevel(palette)
    u.uWind.value = palette.wind
  }, [paperMaterial, palette])

  const hovered = useReading((s) => s.hoveredLetterId)
  const hoveredIndex = useMemo(
    () => (hovered ? hung.findIndex((l) => l.id === hovered) : -1),
    [hovered, hung],
  )

  useEffect(() => {
    paperMaterial.uniforms.uHover.value = hoveredIndex
  }, [paperMaterial, hoveredIndex])

  const t = useRef(0)
  useFrame(({ gl }, delta) => {
    t.current += delta
    paperMaterial.uniforms.uTime.value = t.current
    // The drawing buffer, not the window: the thread's pixel floor has to be
    // in the pixels actually being drawn, and the two differ by the device
    // ratio and again by whatever the quality tier settled on.
    paperMaterial.uniforms.uViewport.value = gl.domElement.height
    // a slow breath rather than a blink — it should read as alive, not as a
    // notification badge
    glowMaterial.uniforms.uPulse.value =
      0.32 + Math.sin(t.current * 1.1) * 0.12 + Math.sin(t.current * 0.53) * 0.05
  })

  if (hung.length === 0) return null

  return (
    <>
      <mesh geometry={glows} material={glowMaterial} frustumCulled={false} renderOrder={3} />
      <mesh geometry={papers} material={paperMaterial} frustumCulled={false} />
    </>
  )
}
