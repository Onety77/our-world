/**
 * Everything the two of you have ever said, hanging in the sky.
 *
 * One light per message. The newest sits low and near, just above the horizon
 * where her dawn is; everything older climbs and recedes, so the conversation
 * runs up into the star field and the oldest things you said are the furthest
 * away and the faintest — until, far enough back, they are indistinguishable
 * from the stars they are hanging among.
 *
 * That is the whole idea of the place. Two people seven timezones apart cannot
 * have a conversation in real time very often; what they have instead is a
 * long accumulating thing, and this makes the accumulation the view.
 *
 * The *words* are not drawn here — they are DOM text in `ui/Talking`, laid
 * over this. Two reasons, and the second is the real one: type rendered into a
 * WebGL texture at this size is mush next to the browser's own hinting, and
 * text that lives in the DOM can be selected, read by a screen reader, and
 * scaled by someone who has set a larger font. A conversation is the last
 * thing in this world that should be a picture of words.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import { useData } from '@/data/provider'
import { LIGHT_COLORS } from '@/systems/palette'
import { SKY, seedOf, skySpot, stepWalk, useTalking, walk } from '@/systems/talking'

/**
 * How far back a light is still drawn.
 *
 * Generous — they cost nothing and the depth of the field is the point. Past
 * this they would be behind the sky dome anyway.
 */
const DRAWN = 140

const VERT = /* glsl */ `
  attribute vec3 iOffset;
  attribute vec3 iColor;
  /** Position in the conversation, newest 0, counting into the past. */
  attribute float iAge;
  attribute float iSeed;
  /**
   * How many hearts are on it: 0, 1, or 2.
   *
   * The reason a heart is worth having in this world at all. Everywhere else a
   * reaction is a little grey number under a message; here it changes the
   * *sky* — the light for that thing burns bigger, steadier and warmer, and it
   * goes on doing it for as long as the conversation exists. Walk back through
   * a year of it and the nights that mattered are the bright ones.
   */
  attribute float iHeart;

  uniform float uWalk;
  uniform float uTime;
  uniform float uRise;
  uniform float uRecede;

  varying vec3 vColor;
  varying vec2 vUv;
  varying float vNear;
  varying float vHeart;

  void main() {
    /*
      A hearted light is pulled toward ember, and one with two hearts on it
      further still. Not *replaced* by it — whose message it was is still the
      first thing the colour says, and a heart must never take that away.
    */
    vColor = mix(iColor, vec3(1.0, 0.62, 0.34), clamp(iHeart, 0.0, 2.0) * 0.28);
    vHeart = iHeart;
    vUv = uv;

    /*
      The light's own place in the sky, worked out here rather than on the CPU.

      Walking back through the conversation moves every single light at once,
      every frame. Rebuilding the instance buffer to do that would mean
      uploading the whole field on each wheel tick; shifting them in the vertex
      stage costs one subtraction.
    */
    float age = iAge - uWalk;

    vec3 at = iOffset;
    at.y += age * uRise;
    at.z -= age * uRecede;

    // how near the read head this is, 1 at it and falling away in both
    // directions — the words are only legible around there and the lights
    // should agree with the words
    vNear = 1.0 - clamp(abs(age) / 9.0, 0.0, 1.0);

    // a slow breath, out of step between one light and the next
    float breath = 1.0 + sin(uTime * (0.8 - iHeart * 0.16) + iSeed * 6.28) * 0.09;

    // billboarded, so a light is a light from wherever you are standing
    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up    = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    // Older lights are further off and would shrink to nothing on perspective
    // alone; growing them with age keeps the far end of the conversation as a
    // field of stars rather than as dust. A hearted one is bigger again, and
    // breathes more slowly: a steadier light.
    float size = breath * (1.0 + max(0.0, age) * 0.06) * (1.0 + iHeart * 0.24);
    vec3 offset = (right * position.x + up * position.y) * size;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(at + offset, 1.0);
  }
`

const FRAG = /* glsl */ `
  precision mediump float;

  uniform float uUnread;

  varying vec3 vColor;
  varying vec2 vUv;
  varying float vNear;
  varying float vHeart;

  void main() {
    float d = length(vUv - 0.5) * 2.0;

    // A small hard core inside a wide, soft corona — the same ratio the sun
    // uses. Without the corona these read as dots, and a conversation made of
    // dots is a chart.
    float core = 1.0 - smoothstep(0.0, 0.22, d);
    float halo = pow(1.0 - smoothstep(0.0, 1.0, d), 2.6);

    float glow = core * 1.15 + halo * 0.62;
    // The ones you are reading burn a little brighter than the ones you are not.
    glow *= 0.42 + vNear * 0.58;

    // A heart is worth about a third again in brightness, on top of the size
    // and the colour it has already been given.
    vec3 col = vColor * glow * (1.0 + uUnread * 0.25 + vHeart * 0.34);

    gl_FragColor = vec4(col, glow);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function Conversation() {
  const me = useData().me
  const messages = useTalking((s) => s.messages)

  const geometry = useMemo(() => {
    const base = new PlaneGeometry(0.62, 0.62)
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', base.attributes.position)
    geo.setAttribute('uv', base.attributes.uv)
    if (base.index) geo.setIndex(base.index)

    const shown = messages.slice(-DRAWN)
    const n = Math.max(1, shown.length)
    const offset = new Float32Array(n * 3)
    const color = new Float32Array(n * 3)
    const age = new Float32Array(n)
    const seed = new Float32Array(n)
    const heart = new Float32Array(n)
    const c = new Color()

    const newest = messages.length - 1
    shown.forEach((m, i) => {
      const indexInAll = messages.length - shown.length + i
      const own = newest - indexInAll
      const s = seedOf(m.id)
      // Only x is baked in; the shader does the rise and the recede so walking
      // back through the conversation costs no upload.
      const [x] = skySpot(0, s)
      offset.set([x, SKY.base, -SKY.near], i * 3)
      c.set(LIGHT_COLORS[m.by])
      color.set([c.r, c.g, c.b], i * 3)
      age[i] = own
      seed[i] = s
      heart[i] =
        (m.hearts?.warm === undefined ? 0 : 1) + (m.hearts?.cool === undefined ? 0 : 1)
    })

    geo.setAttribute('iOffset', new InstancedBufferAttribute(offset, 3))
    geo.setAttribute('iColor', new InstancedBufferAttribute(color, 3))
    geo.setAttribute('iAge', new InstancedBufferAttribute(age, 1))
    geo.setAttribute('iSeed', new InstancedBufferAttribute(seed, 1))
    geo.setAttribute('iHeart', new InstancedBufferAttribute(heart, 1))
    geo.instanceCount = shown.length
    base.dispose()
    return geo
    // me is read for nothing here, but a re-key on it is harmless and keeps
    // the two-light colouring honest if the device ever changes hands
  }, [messages, me])

  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uWalk: { value: 0 },
          uTime: { value: 0 },
          uRise: { value: SKY.rise },
          uRecede: { value: SKY.recede },
          uUnread: { value: 0 },
        },
      }),
    [],
  )

  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    walk.count = messages.length
  }, [messages])

  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    stepWalk(Math.min(delta, 1 / 20))
    material.uniforms.uTime.value = t.current
    material.uniforms.uWalk.value = walk.at
  })

  if (messages.length === 0) return null

  return (
    <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={4} />
  )
}
