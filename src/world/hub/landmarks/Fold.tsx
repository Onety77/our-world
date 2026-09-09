/**
 * The Fold, seen from the garden.
 *
 * A bank of grass with a broken wall running over it, a band of mist lying in
 * the dip, and one animal standing on the near side of it looking back at you.
 *
 * That is the whole section in one object: there is a fold in the ground, you
 * cannot see across it, and something lives there. Built from the same parts
 * the place itself is — the same stones, the same coat colours, the same
 * silhouette — so that walking in never contradicts what you were looking at.
 *
 * **The mist is the thing that had to be here.** An earlier arrangement was
 * just a bank and an animal, and it read as a small green hill with a sheep on
 * it: pleasant, and nothing to do with the section. The one fact worth
 * previewing is that the place is *hidden* until you have done something.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color,
  IcosahedronGeometry,
  PlaneGeometry,
  ShaderMaterial,
  type Mesh,
} from 'three'
import { makeRng, pick, range, seedFrom } from '@/systems/rng'
import { useSceneEnv } from '@/world/SceneEnv'
import { ambientLightLevel, buildInstanced, useFormMaterial, type FormInstance } from '@/world/forms'
import { coatOf, partsFor } from '@/sections/fold/creatures'

const STONE = ['#6b6a63', '#5c5b55', '#75736b', '#514f4a'] as const

/**
 * The height of the bank, in the landmark's own little coordinates.
 *
 * **Two ridges with a trough between them**, and the near one is the taller.
 * The first version was a single mound with a shallow dip behind it, and at the
 * twenty-seven metres this is seen from that reads as a flat raft of green
 * plates — there was no fold in it at all. What makes a fold legible at
 * distance is a *skyline that dips*: one edge in front of another with a gap
 * you can see into.
 */
function bank(x: number, z: number): number {
  const near = 1.6 * Math.exp(-((z - 2.2) * (z - 2.2)) / 11)
  const far = 1.5 * Math.exp(-((z + 6.4) * (z + 6.4)) / 15)
  const trough = 1.0 * Math.exp(-((z + 2.2) * (z + 2.2)) / 5)
  return near + far - trough + Math.sin(x * 0.5) * 0.14 - Math.abs(x) * 0.06
}

export function FoldLandmark() {
  const { palette } = useSceneEnv()

  /** The ground, as a raft of flat stones tinted like turf. */
  const bankGeo = useMemo(() => {
    const rng = makeRng(seedFrom('hub:fold:bank'))
    const items: FormInstance[] = []
    const turf = [palette.grassBase, palette.grassTip, palette.ground]

    for (let i = 0; i < 150; i++) {
      const x = range(rng, -8.5, 8.5)
      const z = range(rng, -8, 5)
      const size = range(rng, 0.7, 1.5)
      items.push({
        offset: [x, bank(x, z) - size * 0.32, z],
        scale: [size * range(rng, 1.1, 1.8), size * range(rng, 0.4, 0.7), size * range(rng, 1.1, 1.8)],
        rot: rng() * Math.PI * 2,
        lean: [range(rng, -0.2, 0.2), range(rng, -0.2, 0.2)],
        phase: rng() * 6.28,
        color: pick(rng, turf),
      })
    }

    const base = new IcosahedronGeometry(1, 0)
    const built = buildInstanced(base, items)
    base.dispose()
    return built
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette.grassBase, palette.grassTip, palette.ground])

  /** A stub of the wall, running over the crest and stopping in a gap. */
  const wallGeo = useMemo(() => {
    const rng = makeRng(seedFrom('hub:fold:wall'))
    const items: FormInstance[] = []
    for (let x = -7.5; x < 7.5; x += 0.42) {
      if (x > -1.6 && x < 1.4) continue
      if (rng() < 0.12) continue
      const z = -5.2 + Math.sin(x * 0.4) * 0.8
      const foot = bank(x, z)
      const high = 0.55 + Math.sin(x * 0.3) * 0.16 + rng() * 0.14
      let up = 0
      while (up < high) {
        const thick = range(rng, 0.11, 0.19)
        items.push({
          offset: [x + range(rng, -0.05, 0.05), foot + up + thick * 0.5, z + range(rng, -0.08, 0.08)],
          scale: [range(rng, 0.15, 0.24), thick, range(rng, 0.15, 0.24)],
          rot: rng() * Math.PI * 2,
          lean: [range(rng, -0.18, 0.18), range(rng, -0.18, 0.18)],
          phase: rng() * 6.28,
          color: pick(rng, STONE),
        })
        up += thick
      }
    }
    const base = new IcosahedronGeometry(1, 0)
    const built = buildInstanced(base, items)
    base.dispose()
    return built
  }, [])

  /**
   * One animal, on the near lip, facing out.
   *
   * The shared practice's dog — drawn in the fold's own earth colours rather
   * than either person's, which is the same rule the section follows and for
   * the same reason: the thing the two of you keep together does not belong to
   * one of you.
   */
  const dogGeo = useMemo(() => {
    const parts = partsFor('dog')
    const scale = 1.05
    const at = { x: 2.4, z: 1.6 }
    const items: FormInstance[] = parts.map((part) => ({
      offset: [
        at.x + part.at[0] * scale,
        bank(at.x, at.z) + part.at[1] * scale,
        at.z + part.at[2] * scale,
      ],
      scale: [part.size[0] * scale, part.size[1] * scale, part.size[2] * scale],
      // Turned a little off square, so it reads as an animal that happens to be
      // looking this way rather than as a model placed facing the camera.
      rot: 0.34,
      phase: 0,
      lean: part.lean ?? [0, 0],
      color: coatOf('both', part.shade),
    }))
    const base = new IcosahedronGeometry(1, 1)
    const built = buildInstanced(base, items)
    base.dispose()
    return built
  }, [])

  useEffect(
    () => () => {
      bankGeo.dispose()
      wallGeo.dispose()
      dogGeo.dispose()
    },
    [bankGeo, wallGeo, dogGeo],
  )

  const material = useFormMaterial(palette, { sway: 0.12 })

  /*
    The mist: three long, soft cards lying in the trough.

    ---------------------------------------------------------------------------
    **Ordinary alpha, not additive**, and the first version got that wrong for a
    reason worth writing down. Additive is right for *light* — the Stars' two
    lights are additive so they never occlude each other — and mist is not
    light, it is something in the way. Added to a bright midday meadow it
    contributed almost nothing visible; the landmark went out with no mist in it
    at all, which is the one fact this preview exists to carry.

    Alpha blending has the failure additive was avoiding — a visible rectangle
    where the quad crosses something — and the shader answers that directly by
    taking the alpha to zero at every edge rather than by choosing a blend mode
    that cannot have edges. Depth is still not written: it is air.
    ---------------------------------------------------------------------------
  */
  const mistMaterial = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          /*
            Declared in both stages, and the two must agree.

            uTime is read by the vertex shader for the roll and by the fragment
            shader for the tearing. A vertex shader defaults to highp and the
            fragment shader below is mediump, so without this line the two
            declarations differ and the program fails to link -- the trap
            already written down in PLAN.md, which cost the Stars a whole
            section rendering as "try that again" once before.

            (And no backticks in here. This is a template literal, and one of
            those inside it ends the shader early -- which is exactly what
            npm run shaders looks for.)
          */
          precision mediump float;
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec3 p = position;
            // A slow roll along the band, so it is weather rather than a decal.
            p.y += sin(uv.x * 5.0 + uTime * 0.21) * 0.16;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          precision mediump float;
          uniform vec3 uColor;
          uniform float uPower;
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            vec2 p = vUv * 2.0 - 1.0;
            // Soft at both ends and top to bottom, so it has no edge anywhere.
            float across = 1.0 - smoothstep(0.2, 1.0, abs(p.x));
            float up = 1.0 - smoothstep(0.0, 1.0, abs(p.y));
            float body = across * up;
            // Broken up, or it is a painted stripe.
            float torn = 0.72 + 0.28 * sin(vUv.x * 13.0 + uTime * 0.3)
                              * sin(vUv.x * 5.0 - uTime * 0.17);
            // Alpha carries it now; the colour stays the fog colour rather
            // than being pre-multiplied down toward black at the soft edges.
            gl_FragColor = vec4(uColor, body * torn * uPower);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
        uniforms: {
          uColor: { value: new Color('#cfd6d8') },
          uPower: { value: 0.5 },
          uTime: { value: 0 },
        },
      }),
    [],
  )
  useEffect(() => () => mistMaterial.dispose(), [mistMaterial])

  useEffect(() => {
    /*
      Mist takes its colour from the fog, because that is literally what it is —
      and its strength from the light, because a bank of cloud at midnight is
      not a white band, it is a slightly less dark one.
    */
    ;(mistMaterial.uniforms.uColor.value as Color).set(palette.fogColor)
    // Lifted toward white: fog colour alone is the colour of the *far* haze,
    // and a bank of cloud sitting on the grass in front of you is brighter.
    ;(mistMaterial.uniforms.uColor.value as Color).lerp(new Color(0xffffff), 0.45)
    // Opaque enough to be the thing you notice. A band you have to look for
    // is a band that failed to say what this place is.
    mistMaterial.uniforms.uPower.value = 0.55 + ambientLightLevel(palette) * 0.35
  }, [mistMaterial, palette])

  const mistGeo = useMemo(() => new PlaneGeometry(17, 2.6), [])
  useEffect(() => () => mistGeo.dispose(), [mistGeo])

  const t = useRef(0)
  const bandRef = useRef<Mesh>(null)
  useFrame((_, delta) => {
    t.current += delta
    mistMaterial.uniforms.uTime.value = t.current
    if (bandRef.current) bandRef.current.position.y = 1.95 + Math.sin(t.current * 0.13) * 0.12
  })

  return (
    <group>
      <mesh geometry={bankGeo} material={material} frustumCulled={false} />
      <mesh geometry={wallGeo} material={material} frustumCulled={false} />
      <mesh geometry={dogGeo} material={material} frustumCulled={false} />
      {/*
        Above the near ridge, not down in the trough.

        The trough is where mist would really lie, and putting it there is what
        the first version did — where the near bank stood in front of it and hid
        it completely, so the landmark went out with no mist visible at all.
        That is the one fact this preview exists to carry. The cards do not
        *write* depth, but they are still depth-*tested*, so anything in front
        occludes them.

        Lifted to lie across the middle of the mound instead: the dog is on the
        crest in front of it, the far ridge is behind it, and what you read at
        twenty-seven metres is a white band sitting in a fold of ground.
      */}
      <group ref={bandRef} position={[0, 1.95, -3.2]}>
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            geometry={mistGeo}
            material={mistMaterial}
            position={[i === 1 ? -1.6 : i === 2 ? 2.1 : 0, i * 0.42, -i * 1.5]}
            rotation={[0, i * 0.09 - 0.09, 0]}
            renderOrder={20}
          />
        ))}
      </group>
    </group>
  )
}
