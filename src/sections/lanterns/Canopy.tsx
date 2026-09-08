/**
 * The leaves overhead, as the thing that actually keeps the light out.
 *
 * ---------------------------------------------------------------------------
 * **Dimming the palette was never going to be enough, and it took a daylight
 * screenshot to see why.**
 *
 * Everything this place draws reads its own dimmed palette, so the ground, the
 * grass, the trunks and the fog all darken together. The *sky* does not. Sky,
 * clouds and the far horizon belong to the world — they follow the camera and
 * carry across every slide, which is most of why four different environments
 * still read as one place, and taking them off this section would make the walk
 * look like a different game.
 *
 * So at three in the afternoon the lane was dark and the enormous bright thing
 * above it was not, which is not a lane under trees. It is a lane with the
 * lights turned down.
 *
 * A canopy is the honest answer: you cannot see much sky from inside a wood,
 * and the reason is leaves. This is one dome over the lane, darkest at the
 * zenith where the cover is thickest and clearing towards the horizon where you
 * are looking out from under it — which is exactly how a real canopy reads, and
 * it leaves the far view and the sunset colour intact instead of flattening
 * everything to grey.
 * ---------------------------------------------------------------------------
 *
 * One mesh, no lighting, drawn before everything and never written to depth.
 * It moves with the camera rather than with the lane, because it is the sky you
 * are under wherever you are standing.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three'
import type { SkyPalette } from '@/systems/palette'
import { ambientLightLevel } from '@/world/forms'

/** Comfortably inside the fog's far edge and outside anything the lane draws. */
const RADIUS = 190

export function Canopy({ palette, dark }: { palette: SkyPalette; dark: number }) {
  const geometry = useMemo(
    // Upper half only: there is no canopy under your feet, and drawing one
    // would put a dark shell between the camera and its own ground.
    () => new SphereGeometry(RADIUS, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52),
    [],
  )
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: /* glsl */ `
          varying float vUp;
          void main() {
            // Height up the dome, 0 at the horizon and 1 overhead.
            vUp = clamp(normalize(position).y, 0.0, 1.0);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          precision mediump float;
          uniform vec3 uColor;
          uniform float uDark;
          varying float vUp;
          void main() {
            /*
              Thin at the horizon, thick overhead.

              Squared rather than linear because cover is not evenly spread: you
              are looking through one layer of leaves straight up and through
              almost none of it sideways, and a linear ramp reads as a grey wash
              with a visible edge rather than as something above you.
            */
            // A floor as well as a ramp: from inside a wood you are looking
            // *through* trees at the horizon, not out of a clearing, so even the
            // low sky is filtered. Without the floor this did nothing at all on
            // a camera aimed along the lane, where the zenith is off screen.
            float cover = 0.45 + 0.55 * pow(vUp, 1.3);
            float a = cover * uDark;
            if (a <= 0.004) discard;
            gl_FragColor = vec4(uColor, a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
        transparent: true,
        depthWrite: false,
        side: BackSide,
        uniforms: {
          uColor: { value: new Color('#0a0d09') },
          uDark: { value: 0.7 },
        },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    /*
      Taken off the *world's* light rather than the dimmed one.

      What this has to cancel is the sky, and the sky is still bright. Tying it
      to the already-dimmed palette would have it back off exactly when it is
      needed most — at noon — which is the mistake that made the first version
      of this look fine at night and pointless in the afternoon.
    */
    /*
      Denser when the sky behind it is brighter.

      A fixed opacity is a filter, and a filter cannot hold a mood: at midnight
      it was doing nothing that needed doing and at three in the afternoon it
      was nowhere near enough, so the lane was properly dark at night and washed
      out by day. Leaves do not thin when the sun comes up — what changes is how
      much they have to stop — so this leans on the world's own light level and
      takes more out when there is more coming through.
    */
    const bright = ambientLightLevel(palette)
    material.uniforms.uDark.value = Math.min(1, 0.95 * dark * (0.6 + 0.85 * bright))
    // Leaf-dark, warmed a little by whatever is behind it, so the gaps between
    // the branches are not a different colour from the canopy around them.
    ;(material.uniforms.uColor.value as Color).set(palette.fogColor).multiplyScalar(0.16)
  }, [material, palette, dark])

  const dome = useRef<Mesh>(null)
  // It is the sky you are under, so it goes where you go.
  useFrame(({ camera }) => {
    dome.current?.position.copy(camera.position)
  })

  return <mesh ref={dome} geometry={geometry} material={material} frustumCulled={false} renderOrder={-1} />
}
