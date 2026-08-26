/**
 * The Wellspring — a river, and the two of you are its rainfall.
 *
 * The whole reading is the water. Nothing the two of you have set aside is
 * expressed as a bar or a percentage: the river is narrow and slow and low in
 * its bed when the pot is empty, and wide, fast and brimming when it is full.
 * You should be able to swipe here, glance once, and know how you are doing
 * without reading a number.
 *
 * The number is there too, because pretending otherwise would be precious —
 * but it is never called "saved". It is ours.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import { useWorldSlice } from '@/data/provider'
import { potTotal } from '@/data/local'
import { useData } from '@/data/provider'
import { otherUser } from '@/data/types'
import { isHersAndNew, useStoodIn } from '@/systems/newness'
import { progressToward } from '@/data/money'
import { useSceneEnv } from '@/world/SceneEnv'
import {
  makeWaterMaterial,
  ribbonGeometry,
  tuneWater,
  type RibbonOptions,
} from '@/world/water'
import { Rocks } from '@/world/Rocks'
import { Grass } from '@/world/Grass'
import { VALLEY } from '@/systems/terrain'
import { riverFullness } from './layout'

/**
 * The water.
 *
 * This used to be a straight rectangle two hundred and twenty metres long with
 * its own private shader, and from the bank it read as a flat teal wedge — a
 * shape, not a river. It now runs on the garden's shared water (world/water),
 * which is the same code the Wellspring's landmark out in the garden uses.
 *
 * That sharing is the point rather than a tidiness win. The landmark is a
 * *preview* of this place; when the two were separate implementations the
 * preview promised moving water and walking in delivered a coloured triangle.
 *
 * The channel meanders. A river drawn dead straight down its own valley is the
 * single clearest tell that it was drawn rather than eroded — see the note on
 * ribbons in world/water.
 */
const CHANNEL: RibbonOptions = {
  length: 240,
  rows: 200,
  // Gentle over this distance: five metres of wander across two hundred and
  // forty is a lazy river, not a snake.
  meander: 5.0,
  width: [11.5, 15.0],
}

function Water({ fullness, carrying }: { fullness: number; carrying: boolean }) {
  const { palette } = useSceneEnv()

  const geometry = useMemo(() => ribbonGeometry(CHANNEL), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  // Chop scales with the size of the water: this is a real river and its swell
  // is a good deal heavier than the brook standing in for it in the garden.
  const material = useMemo(() => makeWaterMaterial({ flow: 0, chop: 2.4, width: 0.16, length: CHANNEL.length }), [])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => tuneWater(material, palette), [material, palette])

  // Ease toward the real fullness rather than snapping: putting money in
  // should visibly *raise the river* while you watch, not cut to a new one.
  const shown = useRef(fullness)
  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    shown.current += (fullness - shown.current) * (1 - Math.exp(-1.4 * delta))
    const u = material.uniforms
    u.uTime.value = t.current
    u.uFlow.value = shown.current
    /*
      Empty is a stream you could step over; full brims the whole bed. This
      spread is the dial — the number in the corner is only a footnote to it.
    */
    u.uWidth.value = 0.16 + shown.current * 0.84
    // And whether it is carrying anything of hers you have not seen. Eased, so
    // it comes up like light rather than switching on.
    const want = carrying ? 1 : 0
    u.uCarrying.value += (want - u.uCarrying.value) * (1 - Math.exp(-1.1 * delta))
  })

  // Just above the valley floor, rising with fullness. Tied to VALLEY.depth so
  // the water can never end up under its own bed.
  const surface = -VALLEY.depth + 0.55 + fullness * 1.7
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[0, surface, 0]}
      frustumCulled={false}
    />
  )
}

export default function River() {
  const { palette, grassCount } = useSceneEnv()
  const world = useWorldSlice((s) => s)

  /*
    Whether she put something in while you were away.

    The pot's own total is in the corner, to the penny, and stays there — this
    does not try to say how much. It says that the river is carrying something
    you have not seen yet, which is a different sentence and the one a river
    can actually make.
  */
  const since = useStoodIn('river')
  const me = useData().me
  const carrying = useMemo(
    () => world.contributions.some((c) => isHersAndNew(c, otherUser(me), since)),
    [world.contributions, me, since],
  )

  const fullness = useMemo(() => {
    const total = potTotal(world)
    return riverFullness(progressToward(total, world.pot.goal?.amount ?? null), total.minor)
  }, [world])

  return (
    <>
      <Grass count={Math.round(grassCount * 0.55)} palette={palette} />
      <Water fullness={fullness} carrying={carrying} />

      {/* the banks: boulders down both sides, and scree behind them */}
      <Rocks
        palette={palette}
        centre={[-VALLEY.bed - 1.5, 0]}
        seed="river:west-bank"
        count={70}
        innerRadius={0}
        outerRadius={5}
        minSize={0.5}
        maxSize={2.2}
      />
      <Rocks
        palette={palette}
        centre={[VALLEY.bed + 1.5, 0]}
        seed="river:east-bank"
        count={70}
        innerRadius={0}
        outerRadius={5}
        minSize={0.5}
        maxSize={2.2}
      />
      <Rocks
        palette={palette}
        centre={[0, -34]}
        seed="river:upstream"
        count={40}
        innerRadius={6}
        outerRadius={16}
        minSize={0.6}
        maxSize={2.8}
      />
    </>
  )
}
