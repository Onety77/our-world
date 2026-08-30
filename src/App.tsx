import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import { CornerTab } from '@/ui/CornerTab'
import { cornerCanBeTucked, cornerIsInTheWay, useCorner } from '@/systems/corner'
import { useTuckOnSwipe } from '@/ui/cornerSwipe'
import { DataProvider, useData, useWorldSlice } from '@/data/provider'
import { ambience, type Place } from '@/systems/ambience'
import { paletteAt } from '@/systems/palette'
import { skyHour, useWhoseHour } from '@/systems/whoseHour'
import { SECTIONS, sectionIndexById } from '@/sections/registry'
import { useSections } from '@/systems/sections'
import { attachSwipe } from '@/systems/swipe'
import { attachPointerLook } from '@/systems/pointerLook'
import { attachTreeOrbit } from '@/systems/treeOrbit'
import { World } from '@/world/World'
import { Door } from '@/ui/Door'
import { Overlay } from '@/ui/Overlay'
import { Places } from '@/ui/Places'
import { Veil } from '@/ui/Veil'
import { Playing } from '@/ui/Playing'
import { Talking } from '@/ui/Talking'
import { VoiceLights } from '@/ui/VoiceLights'
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
import { Questions, QuestionSeedNotice } from '@/ui/Questions'
/*
  The control room, fetched only by whoever opens its door.

  It is a whole page of switches behind a hidden path that exactly one person
  in the world knows, and it was in the first download of every visit anybody
  ever made. Deferred it costs nothing to have: /dev7731 is a route you arrive
  at deliberately, and a fetch on the way in is invisible against the decision
  to go there.
*/
const Admin = later(
  (): Promise<{ default: ComponentType }> =>
    import('@/ui/Admin').then((m) => ({ default: m.Admin as ComponentType })),
)
import { Threshold } from '@/ui/Threshold'
import { usePlaying } from '@/systems/playing'
import { useArrival } from '@/systems/arrival'
import { takenOverNow, useTakenOver } from '@/systems/attention'
import { useMemories } from '@/systems/memories'
import { atTheDoor, useHourOverride } from '@/systems/dev'
import { later } from '@/systems/later'
import { useWatchLocks } from '@/systems/locks'
import { usePublishedOutdoors } from '@/systems/outdoorsSync'

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
  // Shared world tuning must arrive before and while the ambience graph runs.
  // A local draft still wins on this device until it is saved or dropped.
  usePublishedOutdoors()
  // And what is shut while it is being worked on — see systems/locks.
  useWatchLocks()
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

  /*
    Whether the corner is currently sitting on top of something.

    Re-read on every orientation change rather than once, because turning the
    phone is exactly the moment this becomes true — and the whole complaint was
    about what happens when you turn it.
  */
  const [inTheWay, setInTheWay] = useState(() => cornerIsInTheWay(takenOver))
  useEffect(() => {
    const check = () => setInTheWay(cornerIsInTheWay(takenOver))
    check()
    if (typeof matchMedia === 'undefined') return
    const query = matchMedia('(orientation: landscape)')
    query.addEventListener('change', check)
    return () => query.removeEventListener('change', check)
  }, [takenOver])

  /*
    Whether this device gets to put the corner away at all.

    Separate from `inTheWay` on purpose: that one decides whether to tuck it
    *for* you, and only fires in the narrow case it was built for — a landscape
    phone with a game on the screen. Being *allowed* to move it is a different
    question with a much simpler answer, and gating both on the same three
    conditions is why there was no way to shift it in the Hollow.
  */
  const tucked = useCorner((s) => s.tucked)
  const [byThumb, setByThumb] = useState(cornerCanBeTucked)
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const query = matchMedia('(pointer: coarse)')
    const check = () => setByThumb(query.matches)
    query.addEventListener('change', check)
    return () => query.removeEventListener('change', check)
  }, [])

  /* A shove to the right does what the handle does. See `ui/cornerSwipe`. */
  const cornerNode = useRef<HTMLDivElement>(null)
  useTuckOnSwipe(cornerNode, {
    on: byThumb && !tucked,
    tuck: useCallback((at: number) => {
      const corner = useCorner.getState()
      if (corner.tucked) return
      corner.putAt(at)
      corner.toggle()
    }, []),
  })

  useEffect(() => {
    // A new takeover is a new screen; last time's decision does not carry.
    if (!takenOver) useCorner.getState().forget()
    else if (inTheWay) useCorner.getState().tuckOnce()
  }, [takenOver, inTheWay])

  const hourOverride = useHourOverride((h) => h.override)

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
    const orbit = attachTreeOrbit(el, () => {
      const state = useSections.getState()
      return state.entered && SECTIONS[state.index]?.id === 'tree' && !takenOverNow()
    })
    return () => {
      swipe.detach()
      look()
      orbit.detach()
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
    // A hidden phone is not present, and must not wake every twenty seconds to
    // undo the offline write made by `visibilitychange`.
    const here = () => {
      if (!document.hidden) data.publishPresence({ placeId: sectionId, online: true })
    }
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

  // The same hour the sky is running on, re-checked every half minute — the
  // wind and the ambient bed have to agree with what is on screen.
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const update = () => {
      if (!document.hidden) setTick(Date.now())
    }
    const id = setInterval(update, 30_000)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  const whose = useWhoseHour((w) => w.whose)
  const hour = hourOverride ?? skyHour(profiles, me, whose, tick)
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
  const currentQuestionId = useWorldSlice((state) => state.questions.current?.id ?? null)
  const currentQuestionComplete = useWorldSlice(
    (state) => state.questions.current?.completedAt != null,
  )
  const nextQuestionAt = useWorldSlice((state) => state.questions.nextAt)

  // Questions never form a backlog. Ask immediately on an empty Tree, then
  // wake at the rolling-day boundary even if this tab has stayed open all day.
  useEffect(() => {
    if (currentQuestionId && !currentQuestionComplete) return
    const open = () => void data.ensureQuestion().catch(() => {})
    const delay = nextQuestionAt === null ? 0 : Math.max(0, nextQuestionAt - data.now())
    if (delay === 0) {
      open()
      return
    }
    const timer = window.setTimeout(open, Math.min(delay, 2_147_000_000))
    return () => window.clearTimeout(timer)
  }, [data, currentQuestionId, currentQuestionComplete, nextQuestionAt])
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
      const hidden = document.hidden
      // The chosen song is a real <audio> element and may keep playing with
      // the screen off. The procedural weather is ours, and has no reason to
      // keep its AudioContext or animation loop alive where nobody can hear it.
      ambience.setSuspended(hidden)
      ambience.setMaster(hidden ? 0 : 0.85)
    }
    onVisibility()
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
      <Questions />
      <QuestionSeedNotice />
      <Playing />
      <Talking />
      <VoiceLights />
      {/*
        The two things that follow you everywhere, in one column.

        Music and the conversation are the same kind of thing — neither is
        somewhere you *go* — so they share a corner rather than taking one
        each. They have to: every other corner of this world is spoken for.
        The bottom left is the name of the place you are looking at and the way
        into it, the top left is the way back out, and the top right is the two
        of you and the clocks. See `.corner` in styles.css.
      */}
      {/*
        And on a phone held sideways, out of the way of whatever owns the
        screen — see `systems/corner`. It tucks itself the first time it would
        be sitting on a game's menu, and after that it does what you last told
        it to.
      */}
      <CornerTab show={byThumb} />
      <div
        ref={cornerNode}
        className={`${corner}${tucked && byThumb ? ' tucked' : ''}`}
      >
        <Whisper />
        <Player />
      </div>
      {/* One menu for whichever message was right-clicked — see ui/Said. */}
      <SaidMenu />
      <Trouble />
      {/* Over everything, until it is opened. Last so it is last in the
          stacking order as well as in the file. */}
      <Arrival name={profiles[me === 'warm' ? 'cool' : 'warm'].name} />
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
        {/*
          The control room instead of the world, not over it.

          Inside the provider, because everything it does needs the data layer —
          but ahead of <Garden />, so no Canvas is created, no shaders compile
          and no meadow renders behind a page of form controls.
        */}
        {atTheDoor() ? (
          <Suspense fallback={null}>
            <Admin />
          </Suspense>
        ) : (
          <Garden />
        )}
      </DataProvider>
    )
  } catch (e) {
    return <Fatal error={e as Error} />
  }
}
