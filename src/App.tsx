import { useEffect, useMemo, useRef, useState } from 'react'
import { DataProvider, useData, useWorldSlice } from '@/data/provider'
import { ambience, type Place } from '@/systems/ambience'
import { paletteAt } from '@/systems/palette'
import { localHourIn } from '@/systems/time'
import { SECTIONS, sectionIndexById } from '@/sections/registry'
import { useSections } from '@/systems/sections'
import { attachSwipe } from '@/systems/swipe'
import { attachPointerLook } from '@/systems/pointerLook'
import { World } from '@/world/World'
import { Door } from '@/ui/Door'
import { Overlay } from '@/ui/Overlay'
import { Places } from '@/ui/Places'
import { Veil } from '@/ui/Veil'
import { Playing } from '@/ui/Playing'
import { Talking } from '@/ui/Talking'
import { Whisper } from '@/ui/Whisper'
import { SaidMenu } from '@/ui/Said'
import { Trouble } from '@/ui/Trouble'
import { Arrival } from '@/ui/Arrival'
import { Player } from '@/ui/Player'
import { watchForTrouble } from '@/systems/trouble'
import { PotForm } from '@/ui/Pot'
import { ProfileSheet } from '@/ui/Profile'
import { LetterReader, Writing } from '@/ui/Letters'
import { Glasshouse } from '@/ui/Glasshouse'
import { DevPanel } from '@/ui/DevPanel'
import { Threshold } from '@/ui/Threshold'
import { usePlaying } from '@/systems/playing'
import { useArrival } from '@/systems/arrival'
import { useTakenOver } from '@/systems/attention'
import { useMemories } from '@/systems/memories'

/**
 * `?hour=18.6` pins the clock, `?section=river` opens straight into a place,
 * and `?browse=river` selects that place in the garden *without* entering it.
 *
 * All three exist so any state can be opened directly and screenshotted —
 * "swipe there and see" is not a check anyone can repeat. The browse switch
 * earns its place because the garden is now half the work: the landmarks are
 * living previews, and there was no way to point a camera at one of them
 * except by hand.
 */
function fromUrl(key: string): string | null {
  if (typeof location === 'undefined') return null
  return new URLSearchParams(location.search).get(key)
}

function initialHour(): number | null {
  const raw = fromUrl('hour')
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) ? ((value % 24) + 24) % 24 : null
}

const startHour = initialHour()
const startSection = fromUrl('section')
const startBrowse = fromUrl('browse')
const startGame = fromUrl('game')

// Direct links begin inside their destination on the very first frame. Doing
// this in an effect briefly rendered the hub and fired an unnecessary black
// transition before screenshots (and people) could see the requested place.
if (startSection || startBrowse) {
  useSections.setState({
    index: sectionIndexById(startSection ?? startBrowse ?? ''),
    entered: Boolean(startSection),
  })
}

if (startGame) {
  usePlaying.setState({ gameId: startGame, solo: fromUrl('solo') === '1' })
  useArrival.setState({ shut: false })
}

function Garden() {
  const data = useData()
  const me = data.me
  const profiles = useWorldSlice((s) => s.profiles)

  /*
    The corner needs to know whether the top right is free.

    On a phone it docks *under* the two of you and the clocks — but `ui/Overlay`
    hides that block both when something takes the screen and when you are
    inside a place, and the corner did not know about either. So in a game, and
    in the Hollow, it was hanging in mid-air over the middle of the board with
    nothing above it. Same condition as the Overlay's own, deliberately: if one
    changes, the other has to. See `.corner.clear` in styles.css.
  */
  const takenOver = useTakenOver()
  const inside = useSections((s) => s.entered)
  // `only` as well when the screen is taken: `ui/Places` hides the way back
  // out too, so there is nothing left in the top *left* either and the corner
  // can sit on the very edge.
  const corner = takenOver ? 'corner clear only' : inside ? 'corner clear' : 'corner'

  const [hourOverride, setHourOverride] = useState<number | null>(startHour)

  const setCount = useSections((s) => s.setCount)
  const go = useSections((s) => s.go)

  // Tell the slide how many places there are, and open on the one asked for.
  useEffect(() => {
    setCount(SECTIONS.length)
    const wanted = startSection ?? startBrowse
    if (wanted) go(sectionIndexById(wanted))
  }, [setCount, go])

  /**
   * The gestures live on a transparent sheet over the whole window rather than
   * on the canvas: the canvas sits behind the text, and a swipe that dies
   * whenever your thumb crosses a word is not a swipe.
   */
  const surface = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = surface.current
    if (!el) return
    const swipe = attachSwipe(el)
    const look = attachPointerLook(el)
    return () => {
      swipe.detach()
      look()
    }
  }, [])

  /*
    Say that you are here.

    **Nothing called this before.** Presence was built for the walkable world —
    a figure with a position and a heading, published ten times a second — and
    when the avatar was cut, the last caller went with it. It has been dead
    ever since, which meant `online` was false for both of you forever and
    anything built on "are we both here" could never be true. The music's whole
    together-or-alone rule rests on it.

    A heartbeat rather than a stream, because there is nothing to stream any
    more: no position, no heading, just the fact of being in the garden.
    Twenty seconds is comfortably inside the forty-five the real backend treats
    as stale, and it is roughly three writes a minute rather than six hundred.
  */
  const sectionId = SECTIONS[useSections((s) => s.index)]?.id ?? 'garden'
  useEffect(() => {
    const here = () => data.publishPresence({ placeId: sectionId, online: true })
    here()
    const beat = setInterval(here, 20_000)

    // Closing the tab or putting the phone down is leaving. Saying so is what
    // stops her sitting in a "together" that is not true any more.
    const onVisibility = () => {
      data.publishPresence({ placeId: sectionId, online: !document.hidden })
    }
    const onLeave = () => data.publishPresence({ online: false })

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onLeave)
    return () => {
      clearInterval(beat)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onLeave)
      onLeave()
    }
  }, [data, sectionId])

  // The world runs on your clock, re-checked every half minute.
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const hour = hourOverride ?? localHourIn(profiles[me].timeZone, tick)
  const wind = useMemo(() => paletteAt(hour).wind, [hour])

  // --- sound ---------------------------------------------------------------
  // One voice for the whole garden, module-level — the composer's pen writes
  // into the same graph. See systems/ambience.
  useEffect(() => () => ambience.stop(), [])

  /*
    Every memory, watched for the whole session.

    Here rather than inside the Glasshouse, because the Glasshouse is not the
    only thing that needs them: its landmark out in the garden is built from
    the real list — how much of the building exists, and what colour its glass
    is, *is* the memory count and their tints — so it has to be known before
    you have ever gone in. One listener, because two would be two live reads of
    the same collection.

    Documents only. No photograph crosses this.
  */
  useEffect(
    () => data.watchMemories((all) => useMemories.getState().setAll(all)),
    [data],
  )
  useEffect(() => {
    ambience.setWind(wind)
  }, [wind])

  /*
    Every place has its own weather.

    Wind belongs to the open garden. Inside the Wellspring it drops back and
    the water comes up; inside the Hollow it goes away entirely and what is
    left is a fire; under the Stars it thins out to something high and far
    off. Carrying meadow wind down into a cave is worse than silence — the ear
    knows a cave is not windy, and a bed that ignores where you are standing
    quietly says the place is not real.

    Only the *inside* of a place counts. From the garden you are looking at
    all four of them across a valley, and what you can hear there is the wind.
  */
  const entered = useSections((s) => s.entered)
  useEffect(() => {
    ambience.setPlace(entered ? (sectionId as Place) : 'garden')
  }, [entered, sectionId])
  useEffect(() => {
    const onVisibility = () => {
      ambience.setMaster(document.hidden ? 0 : 0.85)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  /*
    Browsers won't start audio until the person has touched something, and the
    thing they touch is the way in — see ui/Arrival, which calls
    `ambience.start()` itself. This is only the backstop for anyone who gets
    past the gate without it having run, which the keyboard path can do.
  */
  useEffect(() => {
    const wake = () => void ambience.start()
    window.addEventListener('pointerdown', wake, { once: true })
    window.addEventListener('keydown', wake, { once: true })
    return () => {
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [])

  return (
    <>
      <World hourOverride={hourOverride} />
      {/* Catches every gesture that isn't on a control. Transparent, and above
          the canvas so nothing below can swallow a swipe. */}
      <div ref={surface} className="surface" />
      <Veil />
      <Places />
      <Threshold />
      <Overlay />
      <LetterReader />
      <Writing />
      <PotForm />
      <ProfileSheet />
      <Glasshouse />
      <Playing />
      <Talking />
      {/*
        The two things that follow you everywhere, in one column.

        Music and the conversation are the same kind of thing — neither is
        somewhere you *go* — so they share a corner rather than taking one
        each. They have to: every other corner of this world is spoken for.
        The bottom left is the name of the place you are looking at and the way
        into it, the top left is the way back out, and the top right is the two
        of you and the clocks. See `.corner` in styles.css.
      */}
      <div className={corner}>
        <Whisper />
        <Player />
      </div>
      {/* One menu for whichever message was right-clicked — see ui/Said. */}
      <SaidMenu />
      <Trouble />
      {/* Over everything, until it is opened. Last so it is last in the
          stacking order as well as in the file. */}
      <Arrival name={profiles[me === 'warm' ? 'cool' : 'warm'].name} />
      <DevPanel hourOverride={hourOverride} setHourOverride={setHourOverride} />
    </>
  )
}

/** Configuration and registry problems land here, named, instead of a blank page. */
function Fatal({ error }: { error: Error }) {
  return (
    <div className="fatal">
      <div className="inner">
        <h2>It didn&rsquo;t start.</h2>
        <pre>{error.message}</pre>
      </div>
    </div>
  )
}

export default function App() {
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const onError = (e: ErrorEvent) => setError(e.error ?? new Error(e.message))
    window.addEventListener('error', onError)
    // A rejected write is not a reason to replace the garden with a stack
    // trace, but it is very much a reason to say something — see systems/trouble.
    const stopWatching = watchForTrouble()
    return () => {
      window.removeEventListener('error', onError)
      stopWatching()
    }
  }, [])

  if (error) return <Fatal error={error} />

  try {
    return (
      <DataProvider door={(state) => <Door state={state} />}>
        <Garden />
      </DataProvider>
    )
  } catch (e) {
    return <Fatal error={e as Error} />
  }
}
