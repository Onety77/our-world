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
 *
 * ---------------------------------------------------------------------------
 * **What stands here is the record.** Every contribution the two of you have
 * made is a stone in the shallows — sized by what it was, in the colour of
 * whoever put it in, the newest nearest you and the oldest away upstream — so
 * the river's bed *is* the history, the way the Tree's flowers are the
 * thoughts. And the water rises out of a spring at the head of the valley,
 * which is what a wellspring is: not a channel somebody dug, a place the
 * water comes up.
 *
 * The camera looks up the valley: the water comes toward you and runs past,
 * because flow reads best coming at the eye, and the spring is the subject.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ConeGeometry, CylinderGeometry, IcosahedronGeometry, Color } from 'three'

import { useWorldSlice } from '@/data/provider'
import { potTotal } from '@/data/local'
import { useData } from '@/data/provider'
import { otherUser, USER_IDS, type Contribution } from '@/data/types'
import { isHersAndNew, useStoodIn } from '@/systems/newness'
import { progressToward } from '@/data/money'
import { LIGHT_COLORS } from '@/systems/palette'
import { ambience } from '@/systems/ambience'
import { makeRng, pick, range, seedFrom } from '@/systems/rng'
import { useSceneEnv } from '@/world/SceneEnv'
import { buildInstanced, useFormMaterial, type FormInstance } from '@/world/forms'
import {
  bankAt,
  makeWaterMaterial,
  ribbonGeometry,
  tuneWater,
} from '@/world/water'
import { Grass } from '@/world/Grass'
import { VALLEY } from '@/systems/terrain'
import { CHANNEL, CHANNEL_Z, HEAD, riverFullness, surfaceAt } from './layout'
import { Riverlife } from './Riverlife'

/**
 * The water.
 *
 * It runs on the garden's shared water (world/water), which is the same code
 * the Wellspring's landmark out in the garden uses. That sharing is the point
 * rather than a tidiness win: the landmark is a *preview* of this place, and
 * when the two were separate implementations the preview promised moving
 * water and walking in delivered a coloured triangle.
 *
 * The channel bends. It used to wander five metres over two hundred and forty,
 * which from a camera looking straight down it was no wander at all — the
 * river ran dead straight up its own valley, the single clearest tell that it
 * was drawn rather than eroded. Eight metres of meander in a bed thirteen
 * either side is a river that swings from bank to bank; at full flow its edges
 * climb the banks through the bends, which is what brimming looks like. The
 * shape lives in `layout.ts`, where the camera can read it too.
 */
function Water({ fullness, carrying }: { fullness: number; carrying: boolean }) {
  const { palette } = useSceneEnv()

  const geometry = useMemo(() => ribbonGeometry(CHANNEL), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  // Chop scales with the size of the water: this is a real river and its swell
  // is a good deal heavier than the brook standing in for it in the garden.
  // (Less chop than it had: at 2.4 every crest lit as a white rung across the
  // whole width, and a river of them is a ladder — the water's own file says so.)
  const material = useMemo(() => makeWaterMaterial({ flow: 0, chop: 1.5, width: 0.16, length: CHANNEL.length }), [])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => tuneWater(material, palette), [material, palette])

  /*
    The fall at the spring: the same water, stood on end, a short ribbon
    pouring from the rock into the pool. It shares the river's material, so it
    widens and quickens as the river does — a full pot is a spring in spate.
  */
  const fall = useMemo(() => ribbonGeometry({ length: 3.2, meander: 0.08, width: [1.5, 2.0] }), [])
  useEffect(() => () => fall.dispose(), [fall])

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
  const surface = surfaceAt(fullness)
  return (
    <>
      <mesh geometry={geometry} material={material} position={[0, surface, CHANNEL_Z]} frustumCulled={false} />
      {/* Down the face of the spring rock into the pool: its downstream is -y. */}
      <mesh
        geometry={fall}
        material={material}
        position={[bankAt(0, CHANNEL).x, surface + 1.35, HEAD - 1.2]}
        rotation={[Math.PI / 2, 0, 0]}
        frustumCulled={false}
      />
    </>
  )
}

/* ---- what stands on the banks ------------------------------------------------ */

const DRY_STONE = ['#8a857a', '#7b766c', '#948e81', '#6f6a61', '#a09889'] as const
const WET_STONE = ['#4e4b44', '#575349', '#605c52', '#453f39'] as const
const REED = ['#4a5539', '#3f4a33', '#57603e', '#6a6b44'] as const
const WILLOW = ['#5f6b45', '#6f7a4e', '#4e5a3a'] as const
const TIMBER = '#3b2f24'

/** The bank at a point down the channel, in the section's own space. */
function bank(t: number) {
  const b = bankAt(t, CHANNEL)
  return { x: b.x, z: b.z + CHANNEL_Z, half: b.half }
}

/**
 * The stones of the bank and the shallows, following the water; the spring's
 * rock at the head; and the record — one stone per contribution.
 */
function Stones({ fullness, contributions }: { fullness: number; contributions: readonly Contribution[] }) {
  const { palette } = useSceneEnv()
  const me = useData().me
  // Rebuilt only when the water has moved enough to matter, not per kobo.
  const level = Math.round(surfaceAt(fullness) * 10) / 10
  const width = 0.16 + Math.round(fullness * 10) * 0.084

  const built = useMemo(() => {
    const rng = makeRng(seedFrom('river:stones'))
    const items: FormInstance[] = []
    const push = (x: number, y: number, z: number, bulk: number, colour: string, squash = 0.65, lean = 0.4) => {
      items.push({
        offset: [x, y, z],
        scale: [bulk * range(rng, 0.9, 1.5), bulk * squash * range(rng, 0.8, 1.2), bulk * range(rng, 0.9, 1.5)],
        rot: rng() * Math.PI * 2,
        lean: [range(rng, -lean, lean), range(rng, -lean, lean)],
        phase: 0,
        color: colour,
      })
    }

    /*
      Down both banks: boulders at the water's edge where the current has
      left them, half in, and scree up the bank behind. Placed off the channel
      itself so they follow every bend — stones scattered by eye along a river
      drawn by a formula will not follow it.
    */
    for (let i = 0; i < 150; i++) {
      const t = 0.02 + rng() * 0.96
      const { x, z, half } = bank(t)
      const side = rng() < 0.5 ? -1 : 1
      const edge = half * width
      const out = edge + range(rng, -0.6, 2.2)
      const bulk = range(rng, 0.35, 1.5) * (out < edge ? 0.8 : 1)
      const wet = out < edge + 0.5
      // Sunk by a third or so, so they sit *in* the ground — or the water.
      const y = wet ? level - bulk * 0.35 : Math.max(level - 0.3, -VALLEY.depth + 0.1) - bulk * range(rng, 0.2, 0.4)
      push(x + side * out, y, z, bulk, pick(rng, wet ? WET_STONE : DRY_STONE))
    }
    // Scree on the slopes.
    for (let i = 0; i < 110; i++) {
      const t = rng()
      const { x, z, half } = bank(t)
      const side = rng() < 0.5 ? -1 : 1
      const out = half * width + range(rng, 2.5, 9)
      const bulk = range(rng, 0.14, 0.5)
      push(x + side * out, -VALLEY.depth + 0.25 + Math.max(0, out - VALLEY.bed) * 0.28 - bulk * 0.3, z, bulk, pick(rng, DRY_STONE))
    }
    // Stones standing in the current, heads above the water.
    for (let i = 0; i < 26; i++) {
      const t = 0.08 + rng() * 0.9
      const { x, z, half } = bank(t)
      const bulk = range(rng, 0.4, 1.1)
      push(x + range(rng, -0.7, 0.7) * half * width, level - bulk * 0.45, z, bulk, pick(rng, WET_STONE), 0.7)
    }

    /*
      The spring's rock: a horseshoe of dark, wet boulders round the head of
      the water, higher at the back, with the fall coming over the middle of
      it — the shape the Hollow's mouth has, for the same reason: a ring would
      put stone between you and the thing it is there to hold.
    */
    const head = bank(0)
    for (let i = 0; i < 46; i++) {
      const a = range(rng, 0.45, Math.PI - 0.45)
      const r = range(rng, 3.0, 7.5)
      const x = head.x + Math.cos(a) * r
      const z = head.z - 1.5 - Math.sin(a) * r * 0.7
      const bulk = range(rng, 1.0, 2.6)
      // Higher at the back, so it is a rock face the water comes out of.
      const rise = Math.sin(a) * range(rng, 0.8, 4.2)
      push(x, level - 0.4 + rise, z, bulk, pick(rng, i % 4 === 0 ? DRY_STONE : WET_STONE), 0.85, 0.5)
    }
    for (let i = 0; i < 8; i++) {
      // The lip the fall comes over, and the pool's rim.
      push(head.x + range(rng, -2.4, 2.4), level - 0.2, head.z - range(rng, 0.4, 1.6), range(rng, 0.5, 1.0), pick(rng, WET_STONE), 0.7)
    }

    /*
      The record. Newest nearest the camera, oldest away up toward the spring;
      each in the shallows on its keeper's side of the current, sized by what
      it was — on a slow curve, so a big deposit is a big stone and not a
      boulder that dams the river.
    */
    const sorted = [...contributions].sort((a, b) => b.at - a.at)
    const recordFrom = 0.36
    const recordTo = 0.9
    sorted.forEach((c, i) => {
      const t = sorted.length === 1 ? 0.75 : recordTo - (i / Math.max(1, sorted.length - 1)) * (recordTo - recordFrom)
      const { x, z, half } = bank(t)
      const side = c.by === 'warm' ? -1 : 1
      const bulk = 0.42 + Math.log10(1 + c.inPotCurrency.minor / 1_000_000) * 0.42
      const mine = c.by === me
      // Its keeper's light, laid over stone: warm or cool, and a little brighter for yours.
      const tint = new Color(pick(rng, DRY_STONE)).lerp(new Color(LIGHT_COLORS[c.by]), mine ? 0.42 : 0.34)
      push(x + side * half * width * range(rng, 0.45, 0.8), level - bulk * 0.4, z, bulk, `#${tint.getHexString()}`, 0.75, 0.25)
    })

    const base = new IcosahedronGeometry(1, 1)
    const geo = buildInstanced(base, items)
    base.dispose()
    return geo
  }, [level, width, contributions, me])

  useEffect(() => () => built.dispose(), [built])
  const material = useFormMaterial(palette, { sway: 0 })
  return <mesh geometry={built} material={material} frustumCulled={false} />
}

/**
 * Reeds along the water, and willows on the banks — the things that grow
 * where the ground is wet, which is how a river looks like a river from the
 * bank before you have seen the water. They sway on the garden's wind.
 */
function Growth({ fullness }: { fullness: number }) {
  const { palette } = useSceneEnv()
  const level = Math.round(surfaceAt(fullness) * 10) / 10
  const width = 0.16 + Math.round(fullness * 10) * 0.084

  const reeds = useMemo(() => {
    const rng = makeRng(seedFrom('river:reeds'))
    const items: FormInstance[] = []
    /*
      In clumps at the water's edge, not a lawn of poles up the bank: a reed
      bed is a few dozen stems out of one root, and it stands where its feet
      are wet. Thin — a reed is a finger, and the first cut made them fence
      posts that filled the near frame.
    */
    for (let c = 0; c < 64; c++) {
      const t = 0.03 + rng() * 0.95
      const { x, z, half } = bank(t)
      const side = rng() < 0.5 ? -1 : 1
      const out = half * width + range(rng, -0.4, 1.6)
      const cx = x + side * out
      const cz = z
      const stems = 6 + Math.floor(rng() * 10)
      for (let i = 0; i < stems; i++) {
        const tall = range(rng, 0.8, 1.9)
        items.push({
          offset: [cx + range(rng, -0.5, 0.5), Math.min(level - 0.25, -VALLEY.depth + 0.3), cz + range(rng, -0.5, 0.5)],
          scale: [range(rng, 0.012, 0.024), tall, range(rng, 0.012, 0.024)],
          rot: rng() * Math.PI * 2,
          lean: [range(rng, -0.16, 0.16), range(rng, -0.16, 0.16)],
          phase: rng() * 6.28,
          color: pick(rng, REED),
          anchorY: 0,
        })
      }
    }
    const base = new ConeGeometry(1, 1, 4)
    base.translate(0, 0.5, 0)
    const geo = buildInstanced(base, items)
    base.dispose()
    return geo
  }, [level, width])

  const willows = useMemo(() => {
    const rng = makeRng(seedFrom('river:willows'))
    const trunks: FormInstance[] = []
    const strands: FormInstance[] = []
    for (let i = 0; i < 7; i++) {
      const t = 0.12 + (i / 7) * 0.8 + rng() * 0.06
      const { x, z, half } = bank(t)
      const side = i % 2 === 0 ? -1 : 1
      const out = half * 1.0 + range(rng, 1.5, 4)
      const fx = x + side * out
      const fz = z
      const fy = -VALLEY.depth + 0.2 + Math.max(0, out - VALLEY.bed) * 0.28
      const height = range(rng, 4.5, 7)
      // Leaning out over the water.
      trunks.push({
        offset: [fx, fy, fz],
        scale: [range(rng, 0.28, 0.4), height, range(rng, 0.28, 0.4)],
        rot: 0,
        lean: [0, side * -range(rng, 0.12, 0.26)],
        phase: 0,
        color: TIMBER,
      })
      // A lean of θ about Z carries the top by height·sin θ toward +x for a negative θ.
      const crownX = fx + side * height * 0.2
      const count = 54 + Math.floor(rng() * 16)
      for (let k = 0; k < count; k++) {
        const a = rng() * Math.PI * 2
        const reach = range(rng, 0.3, 2.8)
        const drop = range(rng, 2.0, height * 0.9)
        // A strand is a long thin cone hanging point-down from the crown,
        // splayed a little outward, so the whole is a fountain and not a comb.
        const splay = range(rng, 0.06, 0.22)
        strands.push({
          offset: [crownX + Math.cos(a) * reach, fy + height - 0.1 + range(rng, -0.5, 0.5), fz + Math.sin(a) * reach],
          scale: [range(rng, 0.05, 0.11), drop, range(rng, 0.05, 0.11)],
          rot: a,
          lean: [Math.PI - splay, 0],
          phase: rng() * 6.28,
          color: pick(rng, WILLOW),
          anchorY: height,
        })
      }
      // And a small bushy head where the strands come from — small, and
      // inside the fountain: a wide flat crown over hanging strands is a palm.
      for (let k = 0; k < 9; k++) {
        const a = rng() * Math.PI * 2
        const reach = range(rng, 0.1, 0.9)
        strands.push({
          offset: [crownX + Math.cos(a) * reach, fy + height - 0.3 + range(rng, -0.3, 0.4), fz + Math.sin(a) * reach],
          scale: [range(rng, 0.35, 0.6), range(rng, 0.3, 0.5), range(rng, 0.35, 0.6)],
          rot: rng() * Math.PI * 2,
          lean: [range(rng, -0.4, 0.4), range(rng, -0.4, 0.4)],
          phase: rng() * 6.28,
          color: pick(rng, WILLOW),
          anchorY: height,
        })
      }
    }
    const trunk = new CylinderGeometry(0.55, 1, 1, 6, 1)
    trunk.translate(0, 0.5, 0)
    const strand = new ConeGeometry(1, 1, 4)
    strand.translate(0, 0.5, 0)
    const out = { trunks: buildInstanced(trunk, trunks), strands: buildInstanced(strand, strands) }
    trunk.dispose()
    strand.dispose()
    return out
  }, [])

  useEffect(() => () => reeds.dispose(), [reeds])
  useEffect(() => () => { willows.trunks.dispose(); willows.strands.dispose() }, [willows])
  const reedMaterial = useFormMaterial(palette, { sway: 0.9 })
  const woodMaterial = useFormMaterial(palette, { sway: 0 })
  const strandMaterial = useFormMaterial(palette, { sway: 0.5 })

  return (
    <>
      <mesh geometry={reeds} material={reedMaterial} frustumCulled={false} />
      <mesh geometry={willows.trunks} material={woodMaterial} frustumCulled={false} />
      <mesh geometry={willows.strands} material={strandMaterial} frustumCulled={false} />
    </>
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

  void USER_IDS

  /*
    And it sounds as full as it is. The Wellspring's bed is the water layer of
    the ambient mix; an empty pot is a trickle over stones and a full one is a
    river you would raise your voice over. Set twice, because the place's own
    crossfade clears any voicing when it arrives, and it can arrive a beat
    after this scene does.
  */
  useEffect(() => {
    const voice = () => ambience.setShade({ water: 0.4 + fullness * 0.6, air: 0.5 - fullness * 0.15 })
    voice()
    const again = window.setTimeout(voice, 2200)
    return () => {
      window.clearTimeout(again)
      ambience.setShade(null)
    }
  }, [fullness])

  return (
    <>
      <Grass count={Math.round(grassCount * 0.55)} palette={palette} />
      <Water fullness={fullness} carrying={carrying} />
      <Stones fullness={fullness} contributions={world.contributions} />
      <Growth fullness={fullness} />
      <Riverlife fullness={fullness} />
    </>
  )
}
