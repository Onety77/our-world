/**
 * The garden — the shared meadow the five places stand in.
 *
 * This is the home, not a menu of the sections. Each place is a real object
 * out on the grass with its own weather, water and light, and the camera
 * simply stands in front of whichever one you have chosen. Entering moves you
 * inside it; browsing does not load it.
 *
 * The landmarks are deliberately built from the same parts as the sections
 * they open into — the same tree generator, the same water, the same instanced
 * stone — so that walking in never contradicts what you were looking at.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { useSections } from '@/systems/sections'
import { useSceneEnv } from './SceneEnv'
import { HubCamera } from './hub/HubCamera'
import { ANCHORS, HUB_OPENING, HUB_ORIGIN, HUB_WOOD } from './hub/layout'
import { TreeLandmark } from './hub/landmarks/Tree'
import { RiverLandmark } from './hub/landmarks/River'
import { HollowLandmark } from './hub/landmarks/Hollow'
import { StarsLandmark } from './hub/landmarks/Stars'
import { GlasshouseLandmark } from './hub/landmarks/Glasshouse'
import { Grass } from './Grass'
import { Flowers } from './Flowers'
import { Trees } from './Trees'
import { Rocks } from './Rocks'

/**
 * The lift a place gets while it is the one you are looking at.
 *
 * Small on purpose. The old version shrank everything unselected to 82%, which
 * made the garden look like a carousel of thumbnails — three places visibly
 * *wrong* so that one could be right. These are real things standing in a
 * field; the selected one settles a few centimetres and breathes, and the
 * camera being pointed at it does the rest.
 */
function LivingLandmark({ index, children }: { index: number; children: React.ReactNode }) {
  const selected = useSections((s) => s.index === index)
  const group = useRef<Group>(null)
  const time = useRef(index * 1.7)
  const lift = useRef(0)

  useFrame((_, delta) => {
    if (!group.current) return
    time.current += delta
    lift.current += ((selected ? 1 : 0) - lift.current) * (1 - Math.exp(-3.6 * delta))
    const scale = 0.97 + lift.current * 0.03
    group.current.scale.setScalar(scale)
    group.current.position.y = Math.sin(time.current * 0.42) * 0.03 * (0.4 + lift.current)
  })

  return <group ref={group}>{children}</group>
}

/*
  Positional, and it must stay in step with the order of SECTIONS.

  Appending is safe; inserting is not. See the note in world/hub/layout — the
  index of a place is load-bearing in three files.
*/
const LANDMARKS = [
  TreeLandmark,
  RiverLandmark,
  HollowLandmark,
  StarsLandmark,
  GlasshouseLandmark,
]

export function GardenHub() {
  const { palette, grassCount, flowerCount } = useSceneEnv()

  return (
    <>
      <HubCamera />
      <ambientLight
        color={palette.ambientColor}
        intensity={palette.ambientIntensity * 2.2}
      />
      <directionalLight
        position={[-12, 24, 14]}
        color={palette.sunColor}
        intensity={palette.sunIntensity * 1.6}
      />

      <Grass count={Math.round(grassCount * 0.86)} palette={palette} />
      <Flowers count={Math.round(flowerCount * 0.45)} palette={palette} radius={58} />
      <Trees
        palette={palette}
        openings={[HUB_OPENING.at]}
        seed="garden-hub:wood"
        count={170}
        centre={HUB_ORIGIN}
        innerRadius={HUB_WOOD.inner}
        outerRadius={HUB_WOOD.outer}
        gapWidth={HUB_OPENING.width}
        /* Seventy-four metres away at the very nearest, and the fog is
           finished with them by a hundred and fifty. See `leafDetail`. */
        leafDetail={0.34}
      />
      <Rocks
        palette={palette}
        seed="garden-hub:stones"
        count={110}
        centre={HUB_ORIGIN}
        innerRadius={10}
        outerRadius={72}
        minSize={0.16}
        maxSize={0.72}
      />

      {LANDMARKS.map((Landmark, index) => {
        const anchor = ANCHORS[index]
        return (
          <group key={index} position={[anchor.x, anchor.y, anchor.z]}>
            <LivingLandmark index={index}>
              <Landmark />
            </LivingLandmark>
          </group>
        )
      })}
    </>
  )
}
