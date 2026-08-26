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

import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ACESFilmicToneMapping, Group } from 'three'
import { useData, useWorldSlice } from '@/data/provider'
import { paletteAt } from '@/systems/palette'
import { warmWhenIdle } from '@/systems/later'
import { createFrameWatchdog, useQuality } from '@/systems/quality'
import { skyHour, useWhoseHour } from '@/systems/whoseHour'
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

/**
 * What the frame actually costs, on `window.__frame`, under `?shot=1`.
 *
 * ---------------------------------------------------------------------------
 * The third of the garden's telemetry hooks, and the broadest: `__glass` says
 * where one pane lands and `__rally` says what one car is doing, and this says
 * what the *whole renderer* is being asked to do — draw calls, triangles,
 * compiled programs, live geometries and textures, and how long a frame is
 * taking.
 *
 * It exists because "the world feels heavy" is not a fact anybody can act on.
 * Six places, two roads and a game each grew on their own budget, and the only
 * way to know which of them is spending the frame is to stand in each one and
 * ask. Every performance decision in this garden that was made by reasoning
 * about what *ought* to be expensive has been wrong at least once — the
 * Drowned Mile turned out to be the cheapest kilometre on either road, and the
 * Glasshouse's standoff was a fix for a problem that never existed.
 *
 * Under `?shot=1` only, and written once a second rather than once a frame:
 * this is a diagnostic, and a diagnostic that shows up in a profile is
 * measuring itself.
 * ---------------------------------------------------------------------------
 */
function FrameCost() {
  const { gl, scene } = useThree()
  const since = useRef(0)
  const frames = useRef(0)
  const worst = useRef(0)
  useFrame((_, delta) => {
    frames.current++
    worst.current = Math.max(worst.current, delta)
    since.current += delta
    if (since.current < 1) return
    /*
      And *which* meshes are spending it, which is the only part you can act on.

      A frame that costs seven hundred thousand triangles is a fact you cannot
      do anything with; "the grass is six hundred thousand of them" is a
      decision. Walked once a second, over a scene of a few dozen objects, and
      only under ?shot=1.
    */
    const heavy: [string, number][] = []
    scene.traverse((node) => {
      const mesh = node as unknown as {
        visible?: boolean
        geometry?: {
          index?: { count: number } | null
          instanceCount?: number
          attributes?: { position?: { count: number } }
        }
        count?: number
        isInstancedMesh?: boolean
        name?: string
        type?: string
      }
      const geometry = mesh.geometry
      if (!geometry || node.visible === false) return
      const verts = geometry.index ? geometry.index.count : geometry.attributes?.position?.count ?? 0
      /*
        Instances count, and most of this garden is instances.

        Nearly nothing here is an InstancedMesh — the grass, the flowers, the
        panes and the lanterns are all plain meshes carrying an
        InstancedBufferGeometry, because they are drawn by their own shaders
        rather than by three's. Counting only `isInstancedMesh` found forty-six
        thousand triangles in a frame the renderer said was seven hundred
        thousand, which is the kind of wrong that sends you optimising the
        wrong thing.
      */
      const instances =
        mesh.geometry?.instanceCount && mesh.geometry.instanceCount !== Infinity
          ? mesh.geometry.instanceCount
          : undefined
      const copies = instances ?? (mesh.isInstancedMesh ? mesh.count ?? 1 : 1)
      const tris = Math.round((verts / 3) * copies)
      if (tris > 500) heavy.push([`${mesh.name || 'mesh'}:${Math.round(verts / 3)}x${copies}`, tris])
    })
    heavy.sort((a, b) => b[1] - a[1])

    const info = gl.info
    ;(window as unknown as Record<string, unknown>).__frame = {
      calls: info.render.calls,
      tris: info.render.triangles,
      programs: info.programs?.length ?? -1,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      fps: Math.round(frames.current / since.current),
      worstMs: Math.round(worst.current * 1000),
      heaviest: heavy.slice(0, 8),
    }
    since.current = 0
    frames.current = 0
    worst.current = 0
  })
  return null
}

/**
 * Fetches every place and both games while nobody is asking for anything.
 *
 * The whole point of deferring them is that the *first* screen should not wait
 * on the fifth place. It is not that the fifth place should arrive late — so
 * once the garden is up and the first frames are through, the rest of the
 * world is quietly pulled down behind it. See `warmWhenIdle`.
 *
 * Deliberately a couple of seconds after mount, and on the idle callback where
 * there is one. This competes with the opening frames of a 3D scene for one
 * main thread, and a garden that stutters on arrival to prefetch somewhere you
 * have not asked for has spent its saving in the worst place it could.
 */
function WarmTheRest() {
  useEffect(
    () =>
      warmWhenIdle([
        ...SECTIONS.map((section) => section.Scene),
        ...GAMES.flatMap((game) => [game.Component, game.Stage].filter(Boolean) as { warm(): void }[]),
      ]),
    [],
  )
  return null
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

  /*
    Fetch the place you are heading for, the moment you decide to go there.

    This is the best hint in the garden and it is free: `index` moves as soon
    as a swipe or an arrow picks a destination, while the world below does not
    swap until half a fade later — see the timeout underneath. That gap is the
    whole window a deferred place needs, and it is there on every single
    journey, including the very first one.

    The neighbours too, because the next flick is faster than a network and the
    row is built to be flicked. Warming is idempotent and costs a resolved
    promise once the code is here — see `later` — so this can be as eager as it
    likes.
  */
  useEffect(() => {
    for (const near of [index, index - 1, index + 1]) {
      SECTIONS[near]?.Scene.warm()
    }
  }, [index])

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

  /*
    The world runs on *her* clock by default — see systems/whoseHour.

    You already know what time it is where you are; a sky that agreed with your
    window was telling you nothing. This one puts you in the hour she is in.
  */
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const whose = useWhoseHour((w) => w.whose)
  const myHour = hourOverride ?? skyHour(profiles, me, whose, nowTick)
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
      <WarmTheRest />
      {SHOTS ? <FrameCost /> : null}
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

        {/*
          One boundary around both, and the fallback is the garden itself.

          -------------------------------------------------------------------
          Places and games are fetched rather than shipped now — see `later` —
          which introduces exactly one way for this to go wrong: arriving
          somewhere before its code does, and standing in an empty world for a
          beat. That would be a worse thing than the loading time it bought.

          Two answers, and it needs both.

          The first is that nothing should ever *have* to wait: every place is
          warmed a couple of seconds after the garden settles, and the one a
          slide is heading for is warmed again the moment the slide starts. On
          any real visit the code is already here long before you are.

          The second is this, for the visit that is not real — a cold cache, a
          slow morning, a phone that dropped to one bar between the door and
          the first swipe. The fallback is the hub: the meadow, the treeline,
          the landmarks, the sky. So the worst case is not an empty world, it
          is *the garden you were already standing in*, held for a moment
          longer while the place you asked for arrives. Which is the same thing
          the fade between places was already doing.

          Never a spinner, and never nothing. Both would be the world admitting
          it is a website.
          -------------------------------------------------------------------
        */}
        <Suspense fallback={<GardenHub />}>
          {Stage ? <Stage /> : shown.entered ? (() => {
            const Current = SECTIONS[shown.section].Scene
            return <Current key={SECTIONS[shown.section].id} />
          })() : <GardenHub />}
        </Suspense>
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
