import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three'
import { LIGHT_COLORS } from '@/systems/palette'
import { useVoiceLights, voicePlayback } from '@/systems/voiceLights'

const VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute vec3 iColor;
  attribute float iSeed;
  attribute float iPulse;
  attribute float iSide;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vPulse;

  void main() {
    vUv = uv;
    vColor = iColor;
    vPulse = iPulse;
    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    float drift = sin(uTime * .22 + iSeed * 13.0) * .55;
    float lift = cos(uTime * .17 + iSeed * 7.0) * .28;
    float tremble = 1.0 + iPulse * .16;
    float angle = iSide * .16;
    vec2 turned = vec2(
      position.x * cos(angle) - position.y * sin(angle),
      position.x * sin(angle) + position.y * cos(angle)
    );
    vec3 local = (right * turned.x + up * turned.y) * tremble;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(iAt + vec3(drift, lift, 0.0) + local, 1.0);
  }
`

const FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vPulse;

  void main() {
    vec2 p = vUv;
    float coreD = length((p - vec2(.79, .5)) * vec2(1.0, 3.8));
    float core = 1.0 - smoothstep(.0, .13, coreD);
    float halo = 1.0 - smoothstep(.02, .42, coreD);
    float line = exp(-abs(p.y - .5) * 22.0);
    float taper = smoothstep(.02, .78, p.x) * (1.0 - smoothstep(.79, 1.0, p.x));
    float broken = .72 + .28 * sin(p.x * 47.0 + p.y * 13.0);
    float tail = line * taper * broken;
    float wake = exp(-abs(p.y - .5) * 7.0) * smoothstep(.0, .76, p.x) * .16;
    float alpha = core + halo * (.42 + vPulse * .34) + tail * .72 + wake;
    if (alpha < .01) discard;
    vec3 color = mix(vColor * .58, vec3(1.0), core + vPulse * .22);
    gl_FragColor = vec4(color, alpha * (.7 + vPulse * .45));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** The recordings themselves, each with a long enough tail to read as an event. */
export function VoiceComets() {
  const lights = useVoiceLights((state) => state.lights)
  const ids = useRef<string[]>([])

  const geometry = useMemo(() => {
    const base = new PlaneGeometry(4.5, 1.2)
    const result = new InstancedBufferGeometry()
    result.setAttribute('position', base.attributes.position)
    result.setAttribute('uv', base.attributes.uv)
    if (base.index) result.setIndex(base.index)
    base.dispose()
    return result
  }, [])
  const material = useMemo(() => new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
  }), [])

  useEffect(() => {
    const count = Math.max(1, lights.length)
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    const pulses = new Float32Array(count)
    const sides = new Float32Array(count)
    ids.current = lights.map((light) => light.id)
    lights.forEach((light, index) => {
      const side = light.by === 'warm' ? -1 : 1
      const ring = light.slot % 4
      positions[index * 3] = side * (6.2 + ring * 2.25)
      positions[index * 3 + 1] = 5.8 + (light.slot % 3) * 2.15
      positions[index * 3 + 2] = -10.5 - light.slot * 3.8
      const color = new Color(LIGHT_COLORS[light.by])
      colors.set([color.r, color.g, color.b], index * 3)
      seeds[index] = light.slot * .173 + (light.by === 'cool' ? .51 : .13)
      pulses[index] = .08
      sides[index] = side
    })
    const pulse = new InstancedBufferAttribute(pulses, 1)
    pulse.setUsage(DynamicDrawUsage)
    geometry.setAttribute('iAt', new InstancedBufferAttribute(positions, 3))
    geometry.setAttribute('iColor', new InstancedBufferAttribute(colors, 3))
    geometry.setAttribute('iSeed', new InstancedBufferAttribute(seeds, 1))
    geometry.setAttribute('iPulse', pulse)
    geometry.setAttribute('iSide', new InstancedBufferAttribute(sides, 1))
    geometry.instanceCount = lights.length
  }, [geometry, lights])

  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])

  const projected = useMemo(() => new Vector3(), [])
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    const attr = geometry.getAttribute('iPulse') as InstancedBufferAttribute | undefined
    if (!attr) return
    ids.current.forEach((id, index) => {
      const target = voicePlayback.id === id && voicePlayback.playing
        ? .25 + voicePlayback.amplitude
        : .08
      attr.setX(index, attr.getX(index) + (target - attr.getX(index)) * .18)

      // The DOM button is only the accessible hit area. Put it directly over
      // the projected 3D core so touching the visible comet is what opens it.
      const at = geometry.getAttribute('iAt') as InstancedBufferAttribute
      const seed = (geometry.getAttribute('iSeed') as InstancedBufferAttribute).getX(index)
      projected.set(
        at.getX(index) + Math.sin(state.clock.elapsedTime * .22 + seed * 13) * .55,
        at.getY(index) + Math.cos(state.clock.elapsedTime * .17 + seed * 7) * .28,
        at.getZ(index),
      ).project(state.camera)
      const button = document.querySelector<HTMLElement>(`[data-voice-light="${id}"]`)
      if (button) {
        button.style.left = `${(projected.x * .5 + .5) * state.size.width}px`
        button.style.top = `${(-projected.y * .5 + .5) * state.size.height}px`
      }
    })
    attr.needsUpdate = true
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />
}
