/**
 * The Fold.
 *
 * A shallow fold in the hills, full of mist, with an animal on the slope for
 * every practice either of you is keeping. The mist lifts as you work; what it
 * gives back is the far side of the hill and everything standing on it.
 *
 * The whole argument for the place — why growth only goes up, why absence is
 * distance rather than damage, and why the progress indicator is weather — is
 * in `README.md` beside this file.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useData } from '@/data/provider'
import { localDateKey } from '@/systems/time'
import { mistAt } from '@/systems/fold'
import { mistProgress, todoFor, useTending } from '@/systems/tending'
import { useSceneEnv } from '@/world/SceneEnv'
import { Ground, Thorns, Turf, Wall } from './Hillside'
import { Herd, seenAnimals, whichAnimal } from './Herd'
import { FOLD_X, FOLD_Y } from './layout'
import type { MistState } from './mist'

/**
 * How far you can see when the mist has gone.
 *
 * Not the palette's own fog distances: those are set for a meadow you can see
 * across, and out here the far ridge is at sixty-five metres. Pulled in a
 * little even at their most open, because a fold with no haze in it at all
 * stops being a fold and becomes a diagram of one.
 */
const OPEN = { near: 26, far: 108 }

/**
 * `?fold=clear` and `?fold=thick` pin the mist where a screenshot wants it.
 *
 * The same argument as `?rally=studio` and `?hour=`: the state worth looking at
 * here is *the far side of the hill*, and reaching it by hand means answering
 * twelve words first, which makes every screenshot a different picture and most
 * of them impossible to take at all under SwiftShader. Development only, and it
 * only ever moves the weather — nothing it does is a write.
 */
const SHOT =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('shot') === '1'

const PINNED: number | null = (() => {
  if (!import.meta.env?.DEV || typeof window === 'undefined') return null
  const asked = new URLSearchParams(window.location.search).get('fold')
  return asked === 'clear' ? 1 : asked === 'thick' ? 0 : null
})()

export default function Fold() {
  const { palette, grassCount } = useSceneEnv()
  const data = useData()

  const practices = useTending((s) => s.practices)
  const words = useTending((s) => s.words)
  const loaded = useTending((s) => s.loaded)
  const started = useTending((s) => s.started)
  const at = useTending((s) => s.at)
  const marked = useTending((s) => s.marked)

  /*
    Today, in this person's own timezone.

    Not the server's day and not UTC: at seven hours' distance "today" is two
    different days, and the person standing on the hill is the one whose day
    decides whether an animal has been fed. The same rule `practise` follows on
    the way in.
  */
  const me = data.me
  const profile = useMemo(() => data.snapshot().profiles[me], [data, me])
  const today = localDateKey(profile.timeZone)

  /*
    The mist, eased in a ref rather than in state.

    `mistProgress` steps once per word; what is drawn has to move continuously
    between those steps, and per-frame motion never goes through React. Every
    material in this place reads these two numbers once a frame — see `mist.ts`.
  */
  const mist = useRef<MistState>({ near: 6, far: 46 })
  const progress = PINNED ?? mistProgress({ started, at, marked })
  const target = mistAt(progress, OPEN)
  const want = useRef(target)
  want.current = target

  useFrame((_, delta) => {
    /*
      Slow. About four seconds to settle after a word, which is long enough
      that the hill is visibly *still opening* while you read the next one —
      the thing that makes the mist feel like weather rather than like a bar.
    */
    if (PINNED === null) {
      const chase = 1 - Math.exp(-0.7 * Math.min(delta, 1 / 20))
      mist.current.near += (want.current.near - mist.current.near) * chase
      mist.current.far += (want.current.far - mist.current.far) * chase
    } else {
      /*
        Pinned means pinned, with no easing at all.

        `delta` is capped at a twentieth of a second a frame — correctly, so a
        backgrounded tab does not simulate four minutes at once — and this
        renders at about three frames a second under SwiftShader. So fourteen
        real seconds of waiting advance the ease by about two, and a screenshot
        of `?fold=clear` came back at eleven metres of visibility instead of
        twenty-six. That is the trap PLAN.md already records about the racer's
        turntable: waiting for an eased value to arrive is not a plan, asking
        for it is.
      */
      mist.current.near = want.current.near
      mist.current.far = want.current.far
    }

    /*
      And what it is doing, published for the checks.

      A screenshot of a hillside in fog looks the same whether the mist is
      answering the work or stuck — so this says which, in numbers, the way the
      Glasshouse published its focus rectangle and the racer publishes the car.
      `?shot=1` only.
    */
    if (SHOT) {
      ;(window as unknown as { __fold: unknown }).__fold = {
        progress,
        started,
        done: at + marked.length,
        near: Math.round(mist.current.near * 10) / 10,
        far: Math.round(mist.current.far * 10) / 10,
        animals: seenAnimals.map((a) => ({
          id: a.id,
          x: Math.round(a.x),
          y: Math.round(a.y),
          away: Math.round(a.away),
        })),
        pick: whichAnimal,
      }
    }
  })

  /*
    Count what is outstanding, once, as soon as the Fold has actually answered.

    Gated on `loaded` and not merely on mount: the practices arrive a moment
    after the place does, and counting an empty list would decide there was
    nothing to do and clear the whole hill for good — `arrive` is deliberately
    write-once, so that mistake would not be recoverable within a visit.
  */
  useEffect(() => {
    if (!loaded) return
    const todo = todoFor(practices, words, me, today, Date.now())
    useTending.getState().arrive(todo.words.length + todo.marks.length)
  }, [loaded, practices, words, me, today])

  /*
    And set the fog where it belongs before the first frame, rather than easing
    down to it from the last visit — which would read as the mist rolling in on
    you as you walked up.
  */
  useEffect(() => {
    mist.current = { ...mistAt(mistProgress(useTending.getState()), OPEN) }
  }, [])

  /*
    A tap on an animal says what it is.

    Bound to the gesture sheet rather than to the canvas, for the reason `App`
    puts it there in the first place: the canvas sits behind the text, and a
    tap that dies whenever your thumb crosses a word is not a tap. A press that
    turns into a drag belongs to the camera and is ignored — the same `SLOP`
    rule the Lantern Walk uses, and the reason it exists there is that entering
    a place already leaves a finger on the screen.

    The picking itself is in `Herd`, off the positions it has already projected
    this frame. Nothing is raycast: the herd knows where it drew everything.
  */
  useEffect(() => {
    const surface = document.querySelector<HTMLElement>('.surface')
    if (!surface) return
    const SLOP = 8
    let from: { x: number; y: number } | null = null

    const down = (event: PointerEvent) => {
      from = { x: event.clientX, y: event.clientY }
    }
    const up = (event: PointerEvent) => {
      const start = from
      from = null
      if (!start) return
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > SLOP) return
      const hit = whichAnimal(event.clientX, event.clientY)
      // Tapping the grass puts the line away, which is the only way to dismiss
      // it — a close button on one line of text over a hillside is furniture.
      useTending.getState().touch(hit)
    }

    surface.addEventListener('pointerdown', down)
    surface.addEventListener('pointerup', up)
    surface.addEventListener('pointercancel', () => (from = null))
    return () => {
      surface.removeEventListener('pointerdown', down)
      surface.removeEventListener('pointerup', up)
    }
  }, [])

  // Walking back down ends the visit: the mist, the queue and what was
  // touched all belong to one arrival. See `leftTheHill`.
  useEffect(() => () => useTending.getState().leftTheHill(), [])

  return (
    <group position={[FOLD_X, FOLD_Y, 0]}>
      <Ground palette={palette} mist={mist} />
      <Turf palette={palette} mist={mist} count={Math.round(grassCount * 0.5)} />
      <Turf
        palette={palette}
        mist={mist}
        layer="far"
        count={Math.round(grassCount * 0.12)}
      />
      <Wall palette={palette} mist={mist} />
      <Thorns palette={palette} mist={mist} />
      <Herd practices={practices} palette={palette} today={today} mist={mist} />
    </group>
  )
}
