/**
 * The world, assembled.
 *
 * Every place is laid out along one axis, `SECTION_SPACING` apart, and the
 * camera slides between them. That is the whole navigation model: no walking,
 * no travel, no avatar — one continuous space you move your view through.
 *
 * Only the places near the camera render. At eight hundred metres apart, with
 * fog closing at a hundred and fifty, you can never see two at once — so
 * anything more than one section away is wasted work.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ACESFilmicToneMapping, Group } from 'three'
import { useData, useWorldSlice } from '@/data/provider'
import { paletteAt } from '@/systems/palette'
import { createFrameWatchdog, useQuality } from '@/systems/quality'
import { localHourIn } from '@/systems/time'
import { SECTIONS } from '@/sections/registry'
import { FADE_MS, useSections } from '@/systems/sections'
import { usePlaying } from '@/systems/playing'
import { GAMES } from '@/world/games/registry'
import { useGameStage } from '@/world/games/stage'
import { SceneEnvProvider } from './SceneEnv'
import { SlideCamera } from './SlideCamera'
import { GardenHub } from './GardenHub'
import { Sky } from './Sky'
import { Clouds } from './Clouds'
import { Ground } from './Ground'
import { Horizon } from './Horizon'

/** `?shot=1` — see the `gl` options on the Canvas below. */
const SHOTS =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('shot') === '1'

/**
 * The sky, the weather and the far mountains — the things that are *around*
 * you rather than in front of you.
 *
 * They travel with the camera. In the old walkable world the camera never got
 * more than a couple of hundred metres from the origin, so anchoring them
 * there was invisible; with the places laid out hundreds of metres apart it
 * meant sliding to the river left the mountains behind and the sky off to one
 * side. Surroundings have no position of their own — they are wherever you
 * are looking from.
 */
function Surrounds({ children }: { children: React.ReactNode }) {
  const group = useRef<Group>(null)
  useFrame(({ camera }) => {
    if (!group.current) return
    group.current.position.x = camera.position.x
    group.current.position.z = camera.position.z
  })
  return <group ref={group}>{children}</group>
}

/** Steps quality down once if the device is clearly struggling. */
function FrameWatchdog() {
  const watch = useMemo(() => createFrameWatchdog(), [])
  useFrame((_, delta) => watch(delta))
  return null
}

/**
 * Which place is on screen.
 *
 * Exactly one, and it lives at the origin. The first version laid every place
 * out along an axis and slid the camera hundreds of metres between them, which
 * was lovely in theory and a bug farm in practice: everything that follows the
 * camera (grass, ground, sky) had to be taught to, everything that doesn't had
 * to be offset, and the two kinds leaked into each other constantly.
 *
 * So: one at a time, swapped at the darkest point of a short fade. The motion
 * you feel is the camera sliding a few metres sideways under that fade, which
 * is all the slide ever really was.
 */
function useShownWorld(): { entered: boolean; section: number } {
  const index = useSections((s) => s.index)
  const entered = useSections((s) => s.entered)
  const [shown, setShown] = useState({ entered, section: index })

  useEffect(() => {
    if (entered === shown.entered && (!entered || index === shown.section)) return
    // swap at the midpoint of the fade — see Veil in App
    const id = setTimeout(() => setShown({ entered, section: index }), FADE_MS / 2)
    return () => clearTimeout(id)
  }, [entered, index, shown])

  return shown
}

/**
 * Which places want the open sky.
 *
 * The cave has rock overhead and the star plain has its own night dome —
 * drawing the daylight sky in either would put a sun through the ceiling.
 *
 * The Glasshouse is open air despite being a building: half its roof is gone,
 * the sky through the broken panes is most of what lights it, and the wood it
 * stands in is visible down the whole length of the aisle. A conservatory with
 * no sky above it would be a corridor.
 */
const OPEN_AIR = new Set(['tree', 'river', 'glasshouse'])

function Scene({ hourOverride }: { hourOverride: number | null }) {
  const profiles = useWorldSlice((s) => s.profiles)
  const me = useData().me

  const grassCount = useQuality((q) => q.grassCount)
  const flowerCount = useQuality((q) => q.flowerCount)
  const dpr = useQuality((q) => q.dpr)

  // The world runs on *your* clock: you come here in your evening and it is
  // evening here.
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const myHour = hourOverride ?? localHourIn(profiles[me].timeZone, nowTick)
  const palette = useMemo(() => paletteAt(myHour), [myHour])

  const env = useMemo(
    () => ({ palette, grassCount, flowerCount, hour: myHour }),
    [palette, grassCount, flowerCount, myHour],
  )

  const shown = useShownWorld()

  /*
    A game may take the world.

    Ember Rally's race is not a board over the Hollow — it is a road under it,
    and it needs the camera and the whole frame. When a Stage is up, the
    section does not render, the sky does not render, and the slide camera
    stands down: two things steering one camera is a fight nobody wins. See
    `games/stage.ts` for why this is not a second Canvas.
  */
  const playingId = usePlaying((s) => s.gameId)
  const taken = useGameStage((s) => s.taken)
  const Stage = taken
    ? GAMES.find((game) => game.id === playingId)?.Stage
    : undefined

  const openAir = !Stage && (!shown.entered || OPEN_AIR.has(SECTIONS[shown.section].id))

  return (
    <>
      <FrameWatchdog />
      {shown.entered && !Stage ? <SlideCamera /> : null}

      <SceneEnvProvider value={env}>
        {/* Sky and ground belong to the world rather than to any one place, so
            they follow the camera and carry across every slide — which is most
            of why four different environments still read as one world. */}
        {openAir && (
          <>
            <Surrounds>
              <Sky palette={palette} pixelRatio={dpr} />
              <Clouds palette={palette} />
              <Horizon palette={palette} />
            </Surrounds>
            {/* Ground follows the camera on its own, snapping to its vertex
                spacing so the displaced surface never appears to crawl. */}
            <Ground palette={palette} />
          </>
        )}

        {Stage ? <Stage /> : shown.entered ? (() => {
          const Current = SECTIONS[shown.section].Scene
          return <Current key={SECTIONS[shown.section].id} />
        })() : <GardenHub />}
      </SceneEnvProvider>
    </>
  )
}

export function World({ hourOverride }: { hourOverride: number | null }) {
  const dpr = useQuality((q) => q.dpr)

  return (
    <Canvas
      dpr={dpr}
      gl={{
        antialias: false, // the grain and fog hide more aliasing than MSAA fixes
        powerPreference: 'high-performance',
        toneMapping: ACESFilmicToneMapping,
        // Every shader ends in the renderer's tonemapping+encode chunks, so
        // this exposure governs the whole frame at once — one knob, one look.
        toneMappingExposure: 0.98,
        /*
          `?shot=1` keeps the drawing buffer so it can be read back.

          Off by default, because holding the buffer costs memory and a copy on
          every frame for something nobody looking at the garden needs. It is
          on for one reason: the screenshot harness runs on a software renderer
          where the cave can take twenty seconds a frame, and Playwright's own
          screenshot goes through the compositor and gives up long before a
          frame is committed. With this, the canvas can simply be asked what it
          last drew — which is how any of the racer got reviewed at all.
        */
        preserveDrawingBuffer: SHOTS,
      }}
      camera={{ fov: 55, near: 0.1, far: 2400, position: [0, 4, 20] }}
    >
      <Scene hourOverride={hourOverride} />
    </Canvas>
  )
}
