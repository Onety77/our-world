/**
 * Watching something together.
 *
 * ---------------------------------------------------------------------------
 * **Not a sixth place.** The garden's places are somewhere you go, and this is
 * not: it is the two of you sitting in front of the same screen, which is a
 * thing that happens *while* you are somewhere. So it lives where the music
 * lives — folded into the corner, reachable from the media control, over
 * whatever you were already looking at. Same argument as `ui/Whisper`, and the
 * same corner.
 *
 * **The one hard rule in this file: the stage is never unmounted.** A YouTube
 * iframe that leaves the document stops playing and forgets where it was, and
 * the entire point of tucking the screen away is that the video keeps going
 * while you walk around the garden. So the tree below does not change shape
 * between full and tucked — one element hosts the player for the whole life of
 * the session, and all that moves is the class on the root. Anything that
 * conditionally renders around `.together-stage` will silently break this, and
 * the way it breaks is that the video restarts.
 *
 * **The conversation under it is the same conversation.** There is one thread
 * between these two people and it is in the Stars; a second chat that only
 * existed while a video was on would be a place for things to get lost. What
 * you say here is said in the sky, and is there tomorrow.
 *
 * How the two devices stay on the same second is `systems/watching`. What talks
 * to YouTube is `systems/youtube`. This file is the room.
 * ---------------------------------------------------------------------------
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useReportTyping, useTheyAreTyping } from '@/systems/useTyping'
// One sentence, in one place: no pronoun of its own and no ellipsis. The rules
// it has to keep are checked in `npm run typing`, not remembered here.
import { writingLine } from '@/systems/typing'
import { createPortal } from 'react-dom'
import { useData, useWorldSlice } from '@/data/provider'
import { useSay } from '@/systems/useSay'
import type { Queued, ScreenLine, UserId } from '@/data/types'
import { ambience } from '@/systems/ambience'
import { attempt } from '@/systems/trouble'
import { useListening } from '@/systems/listening'
import {
  newSession,
  advance,
  beginnings,
  clock,
  correction,
  positionOf,
  queueItem,
  useWatching,
  videoIdIn,
} from '@/systems/watching'
import {
  ENDED,
  PAUSED,
  PLAYING,
  canSearch,
  makeScreen,
  search,
  titleOf,
  type Found,
  type Screen,
} from '@/systems/youtube'
import {
  filmFor,
  filmId,
  forgetFilms,
  holdFilm,
  isFilm,
  makeFilmScreen,
  offsetWords,
  printIn,
  putOffset,
  readFilm,
  readSubtitles,
  savedOffset,
  sizeIn,
  subsFor,
  dropSubs,
  holdSubs,
  type Film,
  type Subtitles,
} from '@/systems/film'
import {
  askForFilm,
  canRemember,
  fileFrom,
  recent,
  shelfFor,
  shelve,
  type Shelved,
} from '@/systems/filmShelf'
import { Ink } from './Ink'
import { Scrub } from './Scrub'
import { gainOf, useVolume } from '@/systems/volume'

/** How often the two screens are compared. See `DRIFT` for why not per frame. */
const CHECK_MS = 900
const CAPTIONS_KEY = 'garden:night-screen:captions'

function savedCaptionChoice(): boolean {
  try {
    return localStorage.getItem(CAPTIONS_KEY) === 'on'
  } catch {
    return false
  }
}

/**
 * A device with a mouse.
 *
 * The garden's existing question is `(pointer: coarse)` — see
 * `cornerCanBeTucked` — and this is the other side of it, asked for the one
 * decision that genuinely differs: a desktop's immersion is the browser's real
 * fullscreen, and a phone's is a layout. A phone can do element fullscreen too
 * and it is the wrong thing there, because portrait's best cinema is a film
 * across the top with the conversation under it, not a letterboxed strip in
 * the middle of a black screen.
 */
function hasMouse(): boolean {
  if (typeof matchMedia === 'undefined') return false
  /*
    `?mouse=1`, in development only, and it is the same bargain as `?mock=1`.

    ---------------------------------------------------------------------------
    This one question decides whether the film gets the browser's whole screen,
    which means a headless browser that answers it wrongly cannot check any of
    that half — and headless Chrome on a Windows laptop answers it wrongly. It
    reports ten touch points and therefore `(pointer: coarse)`, whatever the
    device metrics, the touch-emulation switch or `setEmulatedMedia` are told;
    the same machine running the same Chrome with a window answers `fine`.

    So the checker states the assumption in the URL rather than trying to talk
    the browser into it, and every other line of this feature — the request,
    the layout, the words over the picture, the click — is the real one. The
    switch is one-directional in the sense that matters: it cannot appear in a
    build anybody uses, because `import.meta.env.DEV` is false there.
    ---------------------------------------------------------------------------
  */
  if (import.meta.env?.DEV && typeof location !== 'undefined') {
    const asked = new URLSearchParams(location.search).get('mouse')
    if (asked === '1') return true
    if (asked === '0') return false
  }
  return matchMedia('(pointer: fine)').matches
}

/**
 * How long the words over a filled screen stay up with nothing happening.
 *
 * Fifteen seconds is long enough to read what she said and answer it, and
 * short enough that a film you are actually watching is a film with nothing on
 * it. A half-written line does not count as nothing — see `ScreenChat`, which
 * holds the overlay up for as long as there are words waiting to be sent, so
 * this is only ever the timer on an *empty* corner.
 */
const CHAT_REST_MS = 15_000

/** How many lines the overlay carries. The film is the thing on the screen. */
const CHAT_LINES = 7

const SCRIM_KEY = 'garden:night-screen:scrim'
const CORNER_KEY = 'garden:night-screen:corner'

/**
 * Which corner the conversation sits in, over a filled film.
 *
 * ---------------------------------------------------------------------------
 * Four, and the reason there is a choice at all is subtitles. They are drawn
 * along the bottom of the picture where subtitles have always been drawn, and
 * a long line of them reaches a good way towards both bottom corners — so the
 * one place the conversation cannot always live is the place it started.
 *
 * The top corners avoid them completely and cost a little of the picture's
 * sky; the bottom ones are further out of the way of the film and sometimes
 * in the way of the words. Which of those matters more depends on the film,
 * the subtitles and the person, which is exactly the shape of thing that
 * should be a setting rather than a decision made here.
 *
 * Per device, like the backing and the volume faders. Hers can be somewhere
 * else entirely and neither of you need ever know.
 * ---------------------------------------------------------------------------
 */
const CORNERS = ['bottom right', 'bottom left', 'top left', 'top right'] as const
type Corner = (typeof CORNERS)[number]

function savedCorner(): Corner {
  try {
    const stored = localStorage.getItem(CORNER_KEY)
    return CORNERS.includes(stored as Corner) ? (stored as Corner) : CORNERS[0]
  } catch {
    return CORNERS[0]
  }
}

/** `bottom right` becomes `at-bottom-right`, which is what the stylesheet reads. */
const cornerClass = (corner: Corner) => `at-${corner.replace(' ', '-')}`

/**
 * How much dark the words sit on, over the picture.
 *
 * ---------------------------------------------------------------------------
 * The right answer is *none* — a caption with a panel behind it is a panel over
 * the film, and the whole point of this overlay is that it is text on the
 * picture and nothing else. A text shadow carries it over almost everything.
 *
 * Almost. A white kitchen, a snow scene, a title card: pale text on pale
 * picture, and no amount of shadow saves it. So there is a dial, it starts
 * barely-there, and it goes to nothing at one end for anybody who would rather
 * read badly than see a box.
 * ---------------------------------------------------------------------------
 */
const SCRIM_REST = 0.4

function savedScrim(): number {
  try {
    /*
      The null is read before the number, and that is the whole function.

      `Number(localStorage.getItem(k))` on a key that was never set is
      `Number(null)`, which is **0** — finite, in range, and indistinguishable
      from somebody having deliberately turned the backing off. So the default
      was silently the one end of the dial nobody chose, and the words shipped
      onto the picture with nothing behind them at all. It looked like the
      shadow was not strong enough.
    */
    const stored = localStorage.getItem(SCRIM_KEY)
    if (stored === null) return SCRIM_REST
    const raw = Number(stored)
    return Number.isFinite(raw) && raw >= 0 && raw <= 0.7 ? raw : SCRIM_REST
  } catch {
    return SCRIM_REST
  }
}

/**
 * How far a finger must travel before it is moving the pane rather than tapping.
 *
 * Six pixels was too eager: a thumb on a small overlay is never still, and a
 * plain tap was routinely registering as a drag — which nudged the pane, saved
 * the nudge, and made every touch move it slightly. Twelve is still well under
 * a deliberate shove and comfortably over a hand that meant to stay put.
 */
const DRAG_ENOUGH = 12

/**
 * A node of its own, directly on the body, made once and never moved.
 *
 * ---------------------------------------------------------------------------
 * The miniature used to render inside `.corner` — the column that holds the
 * music and the last thing she said — because that is where the way in lives.
 * That was wrong in four separate ways, and on a phone all four fire at once.
 *
 * The corner **tucks**: a shove to the right slides it away with
 * `transform: translateX(100% + 2.5rem)` and `opacity: 0`. A child cannot
 * opt out of either. `position: fixed` does not help — a transformed
 * ancestor *becomes* the containing block, so the pane travels with it — and
 * opacity applies to the whole subtree, so it fades to nothing on the way.
 * The column is also `pointer-events: none` when tucked, and it is a
 * stacking context at `z-index: 11`, which quietly caps the pane's own 24.
 *
 * The result was a video still playing, out of sight, unreachable, with no way
 * to guess where it had gone. **On a desktop it never happened**, because the
 * corner can only tuck on a coarse pointer — see `cornerCanBeTucked`. So it
 * looked correct in every place it was easy to look at.
 *
 * A thing you can drag anywhere is not part of any column. It is its own node
 * on the body, and the only reason this is a function rather than a constant
 * is that the node has to survive React: the host is created once and reused,
 * so the YouTube iframe inside it is never re-parented and never stops
 * playing. See the note at the top of this file.
 * ---------------------------------------------------------------------------
 */
let host: HTMLElement | null = null
function paneHost(): HTMLElement {
  if (host && host.isConnected) return host
  host = document.createElement('div')
  host.className = 'together-host'
  document.body.appendChild(host)
  return host
}

export function Together() {
  const data = useData()
  const me = data.me
  const profiles = useWorldSlice((s) => s.profiles)
  const presence = useWorldSlice((s) => s.presence)
  const them = profiles[me === 'warm' ? 'cool' : 'warm']

  const shared = useWatching((s) => s.shared)
  const open = useWatching((s) => s.open)
  const live = useWatching((s) => s.live)
  const tab = useWatching((s) => s.tab)
  const setTab = useWatching((s) => s.setTab)
  const tuck = useWatching((s) => s.tuck)

  const musicLevel = useVolume((s) => s.levels.music)
  const musicRef = useRef(musicLevel)
  musicRef.current = musicLevel

  const stage = useRef<HTMLDivElement>(null)
  const screen = useRef<Screen | null>(null)
  /** The id actually loaded in the persistent iframe. */
  const screenVideo = useRef<string | null>(null)
  /** True while this device is applying the shared truth, so it ignores itself. */
  const applying = useRef(false)
  const [trouble, setTrouble] = useState('')
  const [joined, setJoined] = useState(true)
  /** Where the picture is, for the beam. Not state — it moves twice a second. */
  const [where, setWhere] = useState(0)
  const [span, setSpan] = useState(0)
  const say = useSay()
  const [miniControls, setMiniControls] = useState(false)
  /** Immersion is a personal layout choice; it must never rearrange her screen. */
  const [immersive, setImmersive] = useState(false)
  /**
   * True while the browser is actually giving us the whole screen.
   *
   * Separate from `immersive` on purpose. Immersion is *what we are asking
   * for*; this is *what we got* — a request can be refused, a phone is never
   * asked, and either way the in-page layout is already up and works. Only the
   * second one may lay the picture edge to edge and hang the conversation over
   * it, because only the second one owns every pixel.
   */
  const [filling, setFilling] = useState(false)
  const [immersiveControls, setImmersiveControls] = useState(true)
  const immersiveTimer = useRef<number | null>(null)
  const lastImmersiveMove = useRef(0)
  /**
   * What kind of thing last pressed the film: `'mouse'`, `'touch'`, `'pen'`.
   *
   * Asked of the event rather than of the device, because the two are not the
   * same question. `matchMedia('(pointer: fine)')` describes what is plugged
   * in; this describes what was actually used, which is the thing the click
   * needs to know — and a laptop with a touchscreen answers the first question
   * "yes" while somebody is using their finger.
   */
  const lastImmersivePress = useRef<string>('mouse')
  const [captions, setCaptions] = useState(savedCaptionChoice)
  const captionsRef = useRef(captions)

  /*
    ---------------------------------------------------------------------------
    **A film off the disk, and which copy of it this machine has.**

    `shared.videoId` says which film is on and reaches both of you. This says
    whether *this device* can play it, and it never leaves the device — see the
    note at the top of `systems/film`. The two are allowed to disagree about
    the bytes: her copy is a perfectly good answer to "what should be on this
    screen" even when it is a different encode from his.

    `mine` is null in two completely different situations and the screen has
    to tell them apart: nothing is on at all, or something is on and this is
    the person who has not chosen their copy yet. `isFilm(shared.videoId)` is
    what separates them.
    ---------------------------------------------------------------------------
  */
  const [mine, setMine] = useState<Film | null>(null)
  const [reading, setReading] = useState(false)
  /*
    The subtitles this device is reading, which are nobody else's business.

    Chosen per film and per person, exactly like the offset and the volume:
    hers may be in a different language from his, and there is no version of
    this where one of you picking a subtitle file changes the other's screen.
  */
  const [subs, setSubs] = useState<Subtitles | null>(null)
  const [readingSubs, setReadingSubs] = useState(false)
  const [subTrouble, setSubTrouble] = useState('')
  /**
   * True once the film has decided it has no sound this browser can play.
   *
   * Not trouble — trouble replaces the picture, and this is a film that is
   * playing perfectly and silently. It is a notice, and it belongs beside the
   * film's own name where somebody hunting for a volume control will find it.
   */
  const [noSound, setNoSound] = useState(false)
  /**
   * True while somebody is looking for something to watch.
   *
   * ---------------------------------------------------------------------------
   * On a phone the night screen is a picture, a transport, a row of tabs and
   * then whatever is left — and what is left is about one search result. You
   * cannot choose between things you cannot see, so the half of the screen
   * that is doing nothing gets out of the way while you look.
   *
   * Focus is not enough on its own: you type a word, then take your finger off
   * the field to scroll the results, and everything would spring back and shove
   * the list down again mid-scroll. So a query still in the box counts as
   * looking, and it stops counting when the box is empty and nobody is in it —
   * which is exactly what choosing something does, since taking a result
   * clears the field.
   * ---------------------------------------------------------------------------
   */
  const [hunting, setHunting] = useState(false)
  const hunt = useWatching((s) => s.hunt)
  const searching = hunting || hunt.trim() !== ''
  /**
   * Films this device has opened before — see `systems/filmShelf`.
   *
   * Empty on a browser that cannot keep a handle, which is the whole of the
   * fallback: no shelf, no rows, and the ordinary file dialog exactly where it
   * has always been.
   */
  const [shelf, setShelf] = useState<Shelved[]>([])
  /** The one on the shelf that matches what is on, if there is one. */
  const [again, setAgain] = useState<Shelved | null>(null)
  const [pickTrouble, setPickTrouble] = useState('')
  /** How far this copy runs ahead of the anchor's. See `savedOffset`. */
  const [offset, setOffset] = useState(0)
  /*
    Read during render rather than through an effect: the sync loop is built
    once and cannot close over a value that changes while it is running, and an
    effect that copies it afterwards is a tick late every time it moves.
  */
  const offsetRef = useRef(offset)
  offsetRef.current = offset

  // --- the feed -------------------------------------------------------------
  useEffect(
    () => data.watchWatching((w) => useWatching.getState().setShared(w)),
    [data],
  )

  /*
    A video and a song are two things in one pair of ears.

    The corner player is stopped rather than ducked, exactly as a road stops it
    — see `silenced` in `systems/listening`. It does not come back by itself
    afterwards either: the next deliberate press starts it, and that is one rule
    rather than two.
  */
  useEffect(() => {
    if (live) useListening.getState().silence()
  }, [live])

  /*
    Landing on the half that has something to do.

    Opening a dark screen on the conversation is opening it on the one thing
    that cannot start a film. Only on the way *in* — once something is on, the
    tab is yours and switching to talk should stick.
  */
  useEffect(() => {
    if (open && !live) useWatching.getState().setTab('queue')
  }, [open, live])

  useEffect(() => {
    if (!live) setTrouble('')
  }, [live])

  /*
    The picture is the switch once the room is quiet. Controls stay present
    while paused, and leave after a short grace period while the film runs.
    Escape is deliberately local: it leaves immersion, never the shared film.
  */
  useEffect(() => {
    if (immersiveTimer.current !== null) {
      window.clearTimeout(immersiveTimer.current)
      immersiveTimer.current = null
    }
    if (!immersive) return

    setImmersiveControls(true)
    if (shared.playing && trouble === '' && joined) {
      immersiveTimer.current = window.setTimeout(() => {
        setImmersiveControls(false)
        immersiveTimer.current = null
      }, 3200)
    }

    /*
      Escape leaves, and it has to leave *the fullscreen too*.

      This used to flip the two pieces of state and stop there, which was
      right while immersion was only a layout. It is not any more: the same
      key the browser uses to end fullscreen would have left the page laid out
      for a window it no longer had — a letterboxed film with the browser back
      around it. Every way out now goes through one door.

      In practice the browser exits on its own and the listener below would
      have caught it; this is what makes that a second line of defence rather
      than the only one.
    */
    const leaveOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      leaveImmersion()
    }
    document.addEventListener('keydown', leaveOnEscape, true)
    return () => {
      document.removeEventListener('keydown', leaveOnEscape, true)
      if (immersiveTimer.current !== null) {
        window.clearTimeout(immersiveTimer.current)
        immersiveTimer.current = null
      }
    }
  }, [immersive, shared.playing, trouble, joined])

  /*
    ---------------------------------------------------------------------------
    **The browser's own door, and it opens both ways.**

    Fullscreen can end without this app being told to end it: Escape, F11, the
    tab going to the background, the browser deciding it has had enough. If
    immersion did not follow it out, the result is the worst state available —
    a page laid out for a screen it no longer has, with the picture edge to
    edge behind the browser's own furniture.

    So the element is the truth. `filling` is set from what the document says
    is fullscreen rather than from what was asked for, and leaving it leaves
    immersion with it.
    ---------------------------------------------------------------------------
  */
  useEffect(() => {
    const changed = () => {
      const ours = document.fullscreenElement === paneRef.current
      setFilling(ours)
      if (ours) return
      setImmersive(false)
      setImmersiveControls(true)
    }
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])

  /* A dark or folded screen cannot retain an invisible immersive layout. */
  useEffect(() => {
    if (open && live) return
    setImmersive(false)
    setImmersiveControls(true)
  }, [open, live])

  /*
    ---------------------------------------------------------------------------
    **Which kind of screen this is, and the one thing that may rebuild it.**

    The rule at the top of this file — that the stage is never unmounted — is
    about a YouTube iframe, which stops playing and forgets where it was the
    moment it leaves the document. It still holds inside a kind: swapping to
    the next video in the queue goes through `show()`, never through a rebuild.

    Across kinds it cannot hold, because the two are different elements. So the
    effect below is keyed on this as well as on `live`, and going from a video
    to a film tears one down and builds the other — which is correct, and is
    the only time it happens.
    ---------------------------------------------------------------------------
  */
  const kind = isFilm(shared.videoId) ? 'film' : 'youtube'
  const filmPrint = printIn(shared.videoId)

  /*
    ---------------------------------------------------------------------------
    **The anchor's timeline, and this machine's.**

    Everything shared is counted in the timeline of whoever put the film on.
    Everything the player here reports is counted in the copy of the film this
    machine actually has, and for two rips of one film those are not the same
    timeline — see `savedOffset` in `systems/film`.

    Every read from the player goes through `toShared`, and every instruction
    to it through `toHere`. With a matching file the offset is zero and both
    are the identity they always were, which is why the arithmetic below reads
    the same as it did before there were films in it.
    ---------------------------------------------------------------------------
  */
  const toShared = (here: number) => here - offsetRef.current
  const toHere = (there: number) => there + offsetRef.current

  // --- the screen -----------------------------------------------------------
  useEffect(() => {
    if (!live || !stage.current) return
    let alive = true
    let made: Screen | null = null

    /*
      A node React does not own, because YouTube destroys the one it is given.

      `YT.Player` does not fill an element — it *replaces* it with an iframe. Hand
      it a node React rendered and two things break: the ref points at something
      detached from the document, and React later tries to remove a child that is
      no longer its child. So a plain div is made here, appended into the element
      React does own, and handed over to be consumed. React never looks inside.
    */
    const host = document.createElement('div')
    stage.current.append(host)

    const anchor = useWatching.getState().shared
    const build = kind === 'film' ? makeFilmScreen : makeScreen
    void build(
      host,
      { videoId: anchor.videoId, at: positionOf(anchor, data.now()), playing: anchor.playing },
      (state: number) => {
        if (state === PLAYING || state === PAUSED) setTrouble('')
        /*
          ==================================================================
          **Whose end is the end.**

          Reaching the end moves both of you on to whatever is next, and for a
          YouTube video that is exactly right: the two of you are watching one
          object, so you arrive at its end together and the second write is
          the same as the first.

          Two rips of one film are not one object. Hers is four minutes
          shorter because it has no credits on it, so **her copy ends while
          his is still playing, and ends it for him too** — the film stops
          before it is over, on the machine of the person who has the whole
          thing, and nothing on either screen says why.

          So the copy that is not the one the anchor is counting in keeps its
          ending to itself. It stops, because it has genuinely run out; it
          does not decide the evening is over. The person whose copy the
          shared clock is measured against still ends it for both, which is
          the only definition of "the end" the two of you share.
          ==================================================================
        */
        if (state === ENDED && !applying.current && !otherCutRef.current) void onEnded()
        /*
          ==================================================================
          **YouTube's own play button is one of the controls now.**

          It used to fight the sync and lose in about a second, which is what
          the report described exactly: press the big red button, the film
          starts, and a moment later it stops itself. Nothing was broken —
          the loop below reads the shared anchor every nine hundred
          milliseconds and makes the player match it, and nobody had told the
          anchor that anything happened. So it dutifully undid it. Pausing
          with YouTube's button did the same in reverse, which is why that
          "worked" for a second too.

          The model was: the anchor is the truth and the player obeys. That is
          right for *her* device and wrong for the one with the finger on it.
          A press here is now a press on ours — it moves the shared screen,
          she gets it, and the loop has nothing to correct.

          `applying` is what stops this becoming a loop of its own: every
          change this app makes to the player sets it first, so only a state
          change nobody here asked for is treated as a person asking.
          ==================================================================
        */
        if (applying.current) return
        if (state !== PLAYING && state !== PAUSED) return
        const anchor = useWatching.getState().shared
        if (anchor.videoId === null) return
        const nowPlaying = state === PLAYING
        if (nowPlaying === anchor.playing) return
        const player = screen.current
        const at = player ? toShared(player.where()) : positionOf(anchor, data.now())
        /*
          Acted on straight away, and that is a decision rather than an
          oversight.

          Holding it for half a second first and re-asking the player what it
          is doing looks safer and is worse: the sync loop below runs every
          nine hundred milliseconds, so a hold can be outlived by a tick that
          drags the player back to the anchor — and the press is then thrown
          away because the player no longer agrees with the event that
          reported it. Writing immediately is what puts the anchor ahead of
          the loop, which is the whole point of treating a press as a press.
        */
        // Its own reported position, not the anchor's — the whole point is
        // that the player is ahead of what we believed.
        move({ ...anchor, playing: nowPlaying, at: Math.max(0, at) })
        setJoined(true)
      },
      (why) => setTrouble(why),
    )
      .then((built) => {
        if (!alive) {
          built.stop()
          return
        }
        made = built
        screen.current = built
        screenVideo.current = anchor.videoId
        built.captions(captionsRef.current)
        /*
          The fader, applied here rather than only when it next moves.

          `loud` had one caller — an effect on the music level — and that
          effect first runs while the screen is still being built, so
          `screen.current` is null and the call goes nowhere. YouTube survived
          that by defaulting to full volume; a `<video>` element starts where
          it is told to start, and `systems/film` deliberately tells it zero
          so a film cannot be briefly louder than the room. Between the two,
          a film played in silence until somebody happened to touch the fader.

          A ref rather than the value, because this closure is built once and
          the fader is a thing people move.
        */
        built.loud(gainOf(musicRef.current))
        setTrouble('')
      })
      .catch((why: unknown) => {
        if (alive) setTrouble(why instanceof Error ? why.message : String(why))
      })

    return () => {
      alive = false
      made?.stop()
      screen.current = null
      screenVideo.current = null
      // Whatever is left of it — the div, or the iframe it became.
      stage.current?.replaceChildren()
    }
    // Built once per kind for the life of a session. Rebuilding it on any
    // other change is the thing the note at the top of this file is about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, kind])

  /*
    The iframe survives a queue change, so it must explicitly be shown the new
    id. Previously only the Firestore anchor changed: the title and timer moved
    to the next item while YouTube stayed on the old one. This is the actual
    reason the old “next” control appeared unreliable.
  */
  useEffect(() => {
    const player = screen.current
    if (!live || !player || shared.videoId === null) return
    if (screenVideo.current === shared.videoId) return
    setJoined(true)
    applying.current = true
    player.show(shared.videoId, positionOf(shared, data.now()), shared.playing)
    screenVideo.current = shared.videoId
    window.setTimeout(() => { applying.current = false }, 80)
  }, [live, shared.videoId, shared.playing, shared.at, shared.since, data])

  /* The garden's music fader owns this too — it is music, whatever it is. */
  useEffect(() => {
    screen.current?.loud(gainOf(musicLevel))
  }, [musicLevel])

  /*
    ---------------------------------------------------------------------------
    Keeping the two of you on the same second.

    Everything the shared anchor says is applied *to* this device; nothing this
    device notices is written back. That one-way rule is what stops the two
    phones talking each other into a loop — a correction here would look like a
    move over there, which would arrive as a correction here, forever.

    Deliberate moves are the exception, and they are the buttons below.
    ---------------------------------------------------------------------------
  */
  useEffect(() => {
    if (!live) return
    let stop = 0
    const sync = () => {
      const player = screen.current
      if (!player) return
      const watching = useWatching.getState()
      const anchor = watching.shared
      if (anchor.videoId === null) return
      /*
        Not while a thumb is on the scrubber.

        This loop pulls the player back to the shared anchor, which is right
        every moment except that one: mid-drag the anchor is still where the
        film was before you took hold of it, so a correction is a fight with
        the finger — and it fights with a nine-hundred-millisecond round trip
        behind it, which is precisely what "sticky" felt like.

        The drag writes once, on release. Until then nothing here has anything
        to say.
      */
      if (watching.scrubbing) return

      const want = positionOf(anchor, data.now())
      const at = toShared(player.where())
      setWhere(at)
      setSpan(player.length())

      /*
        Nothing is corrected while the picture is not really running.

        An advert is the case this exists for, and your question is what found
        it: a pre-roll on one device and not the other means one of you is
        watching thirty seconds of something else while the shared clock keeps
        counting. The main video's time is meaningless during it, so a
        correction computed from it is a seek to a nonsense position — and the
        other device, seeing that write, follows it there.

        A duration of zero is the honest signal for "there is no main video
        playing yet", and it covers the other cases that look the same: metadata
        still loading, and a stall on a bad connection. When the advert ends the
        gap is large, and the ordinary seek puts you back beside her.
      */
      if (player.length() <= 0) return

      applying.current = true
      const gap = at - want
      const { do: how, rate } = correction(gap)
      /*
        ======================================================================
        **A paused film cannot drift, so a paused film seeks.**

        `correction` answers with one of three things, and the middle one —
        nudge the playback rate by a few per cent and let the gap close on its
        own — is the right answer *while a film is running* and is not an
        answer at all while it is stopped. A rate change on a paused video
        does nothing, so the gap is measured again nine hundred milliseconds
        later, found to be exactly the same, and drifted at again, for ever.

        It is reachable in the ordinary way: pause, and one of you nudges the
        scrubber by a second. Both screens are stopped, they are a second
        apart, and neither of them ever closes it — you press play together and
        start out of step, which is the one thing this whole loop exists to
        prevent.

        A seek is free here for the same reason it is expensive while playing:
        nothing is running, so there is no picture to stall and no sound to
        cut. The threshold that decides *whether* to correct is left where it
        is; only the method changes.
        ======================================================================
      */
      const settle = how === 'drift' && !anchor.playing ? 'seek' : how
      // Told in its own timeline, compared in the shared one.
      if (settle === 'seek') player.seek(toHere(want))
      player.rate(settle === 'drift' ? rate : 1)

      const state = player.state()
      const shouldPlay = anchor.playing
      if (shouldPlay && state !== 1) player.play()
      if (!shouldPlay && state === 1) player.pause()
      /*
        A browser that will not start on its own.

        Autoplay with sound is refused until this device has been touched, so a
        screen she started can sit here paused with no explanation. Asking again
        every second would not help; saying so, once, does.
      */
      setJoined(!shouldPlay || state === 1 || state === 3)
      /*
        Asked here rather than pushed from the screen, because this loop is
        already running at exactly the right cadence and a film needs a few
        seconds of playing before the question has an answer. React does
        nothing with a `false` it already holds, so asking every tick is free.
      */
      setNoSound(player.quiet?.() ?? false)
      window.setTimeout(() => {
        applying.current = false
      }, 60)
    }
    sync()
    stop = window.setInterval(sync, CHECK_MS)
    return () => window.clearInterval(stop)
  }, [live, data])

  /** Put a whole new truth on the wire. Every deliberate move goes through here. */
  const move = (next: {
    videoId: string | null
    title: string
    playing: boolean
    at: number
    queue: Queued[]
    session?: string
  }) => {
    if (next.videoId !== null && next.videoId !== screenVideo.current) {
      applying.current = true
      screen.current?.show(next.videoId, next.at, next.playing)
      screenVideo.current = next.videoId
      window.setTimeout(() => { applying.current = false }, 80)
    }
    void attempt(say('that didn’t reach {her} screen'), () =>
      data.setWatching({ ...next, session: next.session ?? shared.session }))
  }

  /*
    A sitting begins, and with it an empty page.

    Putting something on when nothing was on is the one moment that starts a
    conversation — not opening the room, which you might do to look at the
    queue, and not skipping to the next video, which is the same evening. So
    the id is minted here and nowhere else, and the previous sitting's lines
    go with the write that mints it. See `ScreenTalk` in `data/types`.
  */
  const beginSitting = () => {
    const session = newSession()
    void attempt(say('that didn’t reach {her} screen'), () => data.beginScreenTalk(session))
    return session
  }

  const put = (videoId: string, title: string, at = 0, playing = true) =>
    move({
      videoId, title, playing, at, queue: shared.queue,
      // Nothing was on: this is a new evening, not a continuation of one.
      session: shared.videoId === null ? beginSitting() : shared.session,
    })

  async function onEnded() {
    const { next, rest } = advance(useWatching.getState().shared.queue)
    if (next) move({ videoId: next.videoId, title: next.title, playing: true, at: 0, queue: rest })
    else move({ ...useWatching.getState().shared, playing: false, at: 0 })
  }

  /*
    ---------------------------------------------------------------------------
    **The picture moves here, not on the next tick of the sync loop.**

    This used to write the anchor and stop, leaving the loop to notice up to
    nine hundred milliseconds later and only then tell the player. Two things
    came out of that, and the second one is the reason for this note.

    The small one is feel: a pause that takes most of a second to happen is a
    pause you press twice.

    The real one is that the gap is long enough for YouTube to contradict it.
    The player is still running during those nine hundred milliseconds, and any
    state it reports in the meantime — the PLAYING that follows a buffer, most
    often — arrives with `applying` clear, which is this file's definition of
    "a person did that". So it is taken as a press on the player's own
    controls, and the anchor is dutifully moved back to playing. Pressing pause
    just after starting something could un-pause it, and it looked random
    because it depended on when a buffer happened to end.

    Moving the player in the same breath as the anchor closes the window: what
    it reports next is a state we asked for, and `applying` says so.
    ---------------------------------------------------------------------------
  */
  /*
    ---------------------------------------------------------------------------
    **A film is checked before it is put on, not after.**

    Putting something on reaches her screen, so everything that can be found
    out about a file is found out first — that the container is one a browser
    opens, that it decodes, and how long it is. A film that fails afterwards
    has failed in front of two people instead of one, and the second person has
    no idea which of them is broken.

    Joining is the same call with the other half of the answer: her copy does
    not have to be his copy, so it is held under *the anchor's* fingerprint and
    whether the bytes match is a thing to report rather than a thing to
    enforce. See `holdFilm`.
    ---------------------------------------------------------------------------
  */
  const takeFilm = async (
    file: File,
    why: 'start' | 'join',
    /*
      The way back to this file, when the browser gave us one. Kept only after
      the film has been read and found to be good — a shelf full of files that
      turned out not to open would be a shelf that wastes your time twice.
    */
    handle?: { name: string; getFile(): Promise<File> },
  ) => {
    setPickTrouble('')
    setReading(true)
    try {
      const film = await readFilm(file)
      if (film.why !== null) {
        setPickTrouble(film.why)
        return
      }
      const under = why === 'start' ? film.print : printIn(shared.videoId)
      if (under === null) return
      holdFilm(under, film)
      setMine(film)
      setOffset(savedOffset(under))
      if (handle) {
        await shelve({
          print: film.print,
          title: film.title,
          name: film.name,
          size: film.size,
          handle: handle as Shelved['handle'],
        })
        if (canRemember()) void recent().then(setShelf)
      }
      if (why === 'start') put(filmId(film.print), film.title)
      else screen.current?.show(filmId(under), toHere(positionOf(shared, data.now())), shared.playing)
    } catch {
      setPickTrouble('That file could not be read from here.')
    } finally {
      setReading(false)
    }
  }

  /*
    Which copy this device holds, whenever what is on changes.

    The person who started it is already in the map under their own print; the
    other person is not in it at all until they choose, which is exactly the
    state the invitation on the screen is for.
  */
  useEffect(() => {
    const print = printIn(shared.videoId)
    setPickTrouble('')
    if (print === null) {
      setMine(null)
      setOffset(0)
      return
    }
    setMine(filmFor(print))
    setOffset(savedOffset(print))
    setSubs(subsFor(print))
    setSubTrouble('')
    setNoSound(false)
  }, [shared.videoId])

  /*
    What is on the shelf, read when the screen is opened and whenever what is
    on changes.

    Two questions at once, and they are different: what has been watched here
    lately — for the empty screen — and whether *this* film is among it, which
    is what turns the invitation from a file hunt into one button.
  */
  useEffect(() => {
    if (!open || !canRemember()) {
      setShelf([])
      setAgain(null)
      return
    }
    let live = true
    void recent().then((films) => { if (live) setShelf(films) })
    void shelfFor(printIn(shared.videoId)).then((film) => { if (live) setAgain(film) })
    return () => { live = false }
  }, [open, shared.videoId])

  /*
    Subtitles, read and turned on in one move.

    Nobody chooses a subtitle file in order to leave it off, so picking one
    shows it — the switch is there afterwards for turning them back off, which
    is the rarer thing to want.
  */
  const takeSubtitles = async (file: File) => {
    const print = printIn(shared.videoId)
    if (print === null) return
    setSubTrouble('')
    setReadingSubs(true)
    try {
      const read = await readSubtitles(file)
      if (read.why !== null) {
        setSubTrouble(read.why)
        return
      }
      holdSubs(print, read)
      setSubs(read)
      captionsRef.current = true
      setCaptions(true)
      screen.current?.captions(true)
    } catch {
      setSubTrouble('That file could not be read from here.')
    } finally {
      setReadingSubs(false)
    }
  }

  const takeOutSubtitles = () => {
    const print = printIn(shared.videoId)
    if (print !== null) dropSubs(print)
    setSubs(null)
    setSubTrouble('')
    screen.current?.captions(false)
  }

  /*
    The dialog that hands back a handle, where there is one.

    Both doors lead to the same `takeFilm`; the only difference is whether
    there is anything worth putting on the shelf afterwards. On a browser
    without handles this is never called and `FilmPick`'s own input is the
    whole story.
  */
  const chooseAndKeep = async (why: 'start' | 'join') => {
    const got = await askForFilm()
    if (!got) return
    await takeFilm(got.file, why, got.handle)
  }

  /** A film off the shelf, which is one press and possibly one permission. */
  const openAgain = async (film: Shelved, why: 'start' | 'join') => {
    setPickTrouble('')
    const file = await fileFrom(film)
    if (!file) {
      setPickTrouble(
        `${film.name} could not be opened. It may have been moved or renamed — choose it again below.`,
      )
      void recent().then(setShelf)
      setAgain(null)
      return
    }
    await takeFilm(file, why, film.handle)
  }

  /** True when this copy is a different encode from the one the anchor counts. */
  const otherCut = mine !== null && filmPrint !== null && mine.print !== filmPrint
  /*
    Read by the screen callback, which is built once and would otherwise be
    holding whatever this was at the moment the film went on — which is always
    `false`, because a copy is chosen after that. See the note on `ENDED`.
  */
  const otherCutRef = useRef(otherCut)
  otherCutRef.current = otherCut

  const nudge = (by: number) => {
    if (filmPrint === null) return
    const next = Math.round((offset + by) * 10) / 10
    setOffset(next)
    putOffset(filmPrint, next)
    // Applied at once rather than at the next tick of the loop, so a nudge is
    // something you can hear land while your finger is still on the button.
    const player = screen.current
    if (player) player.seek(positionOf(shared, data.now()) + next)
  }

  const playPause = () => {
    const player = screen.current
    const at = player ? toShared(player.where()) : positionOf(shared, data.now())
    const next = !shared.playing
    if (player) {
      applying.current = true
      if (next) player.play()
      else player.pause()
      // Longer than the eighty milliseconds a video swap uses: a play or pause
      // can travel through BUFFERING on the way to the state it was asked for.
      window.setTimeout(() => { applying.current = false }, 260)
    }
    move({ ...shared, playing: next, at })
    setJoined(true)
  }

  const skip = () => void onEnded()

  /*
    ---------------------------------------------------------------------------
    **Space is play and pause, unless somebody is writing.**

    One key, two jobs, and they never overlap because they are never wanted at
    the same moment: in front of a film a space is the oldest gesture there is,
    and inside a sentence it is a space. What separates them is simply where
    the keyboard is pointing.

    Three things it stands aside for, and the third is the one worth writing
    down:

    - **A field.** Anything being typed into keeps its own spaces, ours and
      anybody else's, including the film chat's composer.
    - **A key somebody else has already handled**, which is what
      `defaultPrevented` means, and a modifier held down, which is a shortcut
      rather than a gesture.
    - **A focused control.** A space on a focused button *activates* it — that
      is what the browser does and what a keyboard user expects — so taking it
      would break `cc`, `stop` and every other control on the transport for
      anybody who reaches them by tab. The exception is the clear sheet over
      the film itself, which is a button only because it has to be something:
      it is where the focus lands after you click the picture, and it is
      exactly where a space should play and pause.

    Only while the screen is open, deliberately. A tucked film is a film you
    are half-watching from somewhere else in the garden, and space belongs to
    wherever you actually are — most sharply inside Ember Rally, where it is a
    driving control.
    ---------------------------------------------------------------------------
  */
  const playPauseRef = useRef(playPause)
  playPauseRef.current = playPause

  useEffect(() => {
    if (!open || !live) return
    const onSpace = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.code !== 'Space') return
      if (event.defaultPrevented) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const at = event.target as HTMLElement | null
      if (at && (at.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName))) return
      const focused = document.activeElement as HTMLElement | null
      if (
        focused &&
        !focused.classList.contains('together-immersive-wake') &&
        /^(BUTTON|A|INPUT|TEXTAREA|SELECT)$/.test(focused.tagName)
      ) {
        return
      }
      // Held, so the page does not also scroll and the sheet is not activated.
      event.preventDefault()
      playPauseRef.current()
    }
    document.addEventListener('keydown', onSpace)
    return () => document.removeEventListener('keydown', onSpace)
  }, [open, live])

  /* `seconds` is where on the scrubber, which is the shared timeline. */
  const goTo = (seconds: number) => {
    screen.current?.seek(toHere(seconds))
    move({ ...shared, at: Math.max(0, seconds) })
  }

  const clearImmersiveTimer = () => {
    if (immersiveTimer.current === null) return
    window.clearTimeout(immersiveTimer.current)
    immersiveTimer.current = null
  }

  const revealImmersiveControls = () => {
    setImmersiveControls(true)
    clearImmersiveTimer()
    if (!shared.playing || trouble !== '' || !joined) return
    immersiveTimer.current = window.setTimeout(() => {
      setImmersiveControls(false)
      immersiveTimer.current = null
    }, 3200)
  }

  const toggleImmersiveControls = () => {
    if (!immersiveControls) {
      revealImmersiveControls()
      return
    }
    if (!shared.playing) return
    clearImmersiveTimer()
    setImmersiveControls(false)
  }

  /*
    ---------------------------------------------------------------------------
    **Immersion asks the browser for the screen, and does not depend on getting
    it.**

    What this used to be was a layout: the picture took the left of the page
    and the conversation took a column down the right. On a desktop that is a
    video in a browser window with a tab strip, an address bar, a row of
    bookmarks and a taskbar around it, and a wide black gutter where a quarter
    of the film should be. It was immersive in name.

    So it asks for the real thing. The element handed over is the pane root,
    which is the whole point of asking for *an element* rather than the
    document: everything inside it comes with it, including the iframe — which
    is never re-parented and so never stops playing — and including the words
    over the picture. Fullscreening the document instead would put the browser
    in charge of what is on top, and the conversation would be under it.

    The request can be refused, and a phone is never asked. Both land in the
    same place: `immersive` is already true, the in-page layout is already up,
    and it is the fallback rather than an error path. Nothing here waits on the
    promise, and nothing tells anybody it failed, because from where you are
    sitting it did not.
    ---------------------------------------------------------------------------
  */
  const enterImmersion = () => {
    if (!live) return
    setTab('talk')
    setImmersiveControls(true)
    setImmersive(true)
    const el = paneRef.current
    if (!el || !hasMouse()) return
    if (!document.fullscreenEnabled) return
    /*
      Only *ours* is a reason to do nothing.

      This used to stand down whenever anything at all was fullscreen, which
      reads as caution and is a way to get stuck: a request that was made and
      whose `fullscreenchange` never arrived leaves the document holding an
      element while this app believes it holds nothing, and from there the way
      in is dead until the page is reloaded. Asking again when it is somebody
      else's element is allowed and simply swaps, which is the recovery.
    */
    if (document.fullscreenElement === el) return
    void el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
      /* The layout is the fallback and it is already on screen. */
    })
  }

  const leaveImmersion = () => {
    clearImmersiveTimer()
    setImmersive(false)
    setImmersiveControls(true)
    if (document.fullscreenElement !== paneRef.current) return
    void document.exitFullscreen().catch(() => {
      /* Already gone, or refused; the listener above holds the truth either way. */
    })
  }

  const toggleCaptions = () => {
    const next = !captionsRef.current
    captionsRef.current = next
    setCaptions(next)
    screen.current?.captions(next)
    try {
      localStorage.setItem(CAPTIONS_KEY, next ? 'on' : 'off')
    } catch {
      /* A private browser may refuse storage; the current sitting still works. */
    }
  }

  const fold = () => {
    leaveImmersion()
    setMiniControls(false)
    tuck()
  }

  const endSession = () => {
    screen.current?.pause()
    setTrouble('')
    // The files go with it. Each one holds a whole film open in memory, and
    // the next sitting is a new question about which copy anybody has.
    forgetFilms()
    setMine(null)
    setPickTrouble('')
    leaveImmersion()
    useWatching.getState().close()
    setMiniControls(false)
    // The screen goes dark and what was said in front of it goes with it.
    void attempt(say('that didn’t reach {her} screen'), () => data.beginScreenTalk(''))
    move({ videoId: null, title: '', playing: false, at: 0, queue: shared.queue, session: '' })
  }

  /*
    ---------------------------------------------------------------------------
    **Put the tucked pane wherever it is least in the way.**

    A fixed corner is a guess about what you are looking at, and it is wrong
    about half the time — it sat over the name of the place, then over the
    flowers, then over whatever it was you went back to the garden to see. The
    other answer on offer was snapping it to an edge alongside the music, which
    solves it in one direction and not in the others.

    So it is simply moved. Press it, drag it, let go, and it stays, the way a
    photograph moves on a desk. Held as fractions of the free space so a
    rotation cannot leave it off-screen, and clamped on the way in so a resize
    cannot either.

    A press that does not move is still a tap, and a tap still opens it. The
    threshold below is the only thing separating the two, and it is generous
    because a thumb on a small pane is never perfectly still.
    ---------------------------------------------------------------------------
  */
  const spot = useWatching((s) => s.spot)
  /** The element that actually carries the position while it is tucked. */
  const paneRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<{ id: number; dx: number; dy: number; moved: boolean } | null>(null)
  /*
    ---------------------------------------------------------------------------
    **Somewhere to put it down for good.**

    Ending a screen lived in one place: open the whole thing, find *end
    screen*. That is the right home for it — it is a shared act and you should
    be able to see what you are closing — but it was also the *only* way, and
    a small video you can pick up and move should be closeable by putting it
    down somewhere, which is what every phone has taught everybody to expect.

    So the ground opens while you are carrying it. The target only exists
    during a drag, it says what it does in words rather than as a bare cross,
    and it takes a deliberate journey to the bottom of the screen — you cannot
    fall into it, which matters because this ends the screen for **both** of
    you and there is no undo. That is also why it is not a tap: the miniature
    had a close button once, two taps from resting, and it ended sessions by
    accident. A gesture with a destination cannot be made by mistake.
    ---------------------------------------------------------------------------
  */
  const [carrying, setCarrying] = useState(false)
  const [overGround, setOverGround] = useState(false)
  const ground = useRef<HTMLDivElement>(null)
  /** True while the pointer is inside the target, read on the way up. */
  const willEnd = useRef(false)

  /** Generous, because the pane is under the thumb and the target is not. */
  const inTheGround = (x: number, y: number) => {
    const box = ground.current?.getBoundingClientRect()
    if (!box) return false
    const reach = 26
    return (
      x >= box.left - reach && x <= box.right + reach &&
      y >= box.top - reach && y <= box.bottom + reach
    )
  }

  const onPaneDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (open) return
    const box = event.currentTarget.getBoundingClientRect()
    dragging.current = {
      id: event.pointerId,
      // Where inside the pane the finger landed. Constant for the gesture, so
      // the pane keeps the same point under the thumb the whole way.
      dx: event.clientX - box.left,
      dy: event.clientY - box.top,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPaneMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const held = dragging.current
    if (!held || held.id !== event.pointerId) return
    const box = event.currentTarget.getBoundingClientRect()
    if (!held.moved) {
      const far =
        Math.abs(event.clientX - (box.left + held.dx)) +
        Math.abs(event.clientY - (box.top + held.dy))
      if (far < DRAG_ENOUGH) return
      held.moved = true
      // Only once it is genuinely a carry, so a tap never opens the ground.
      setCarrying(true)
    }
    const over = inTheGround(event.clientX, event.clientY)
    willEnd.current = over
    setOverGround(over)
    const free = {
      x: Math.max(1, window.innerWidth - box.width),
      y: Math.max(1, window.innerHeight - box.height),
    }
    useWatching.getState().putSpot({
      x: Math.max(0, Math.min(1, (event.clientX - held.dx) / free.x)),
      y: Math.max(0, Math.min(1, (event.clientY - held.dy) / free.y)),
    })
  }

  const onPaneUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const held = dragging.current
    dragging.current = null
    const dropped = willEnd.current
    willEnd.current = false
    setCarrying(false)
    setOverGround(false)
    if (!held || held.id !== event.pointerId) return

    /*
      -----------------------------------------------------------------------
      **A press that never travelled is a tap, and this is where that is
      decided — not by a `click` on the overlay underneath.**

      This was reported as "on desktop it doesn't accept any touch": the
      miniature could be dragged around perfectly, and nothing on it could be
      pressed. Not the way in, not anything.

      `onPaneDown` calls `setPointerCapture` so a drag cannot be lost out of a
      small box, and a captured pointer retargets the **compatibility mouse
      events** with it — `mousedown` and `mouseup` are delivered to the pane
      rather than to whatever is under the cursor. A `click` is synthesised at
      the nearest common ancestor of those two, which with capture in force is
      always the pane itself. So every button inside it was unreachable by
      mouse, and the `onClick` handlers were never wrong — they were never
      called.

      **Touch was fine, which is exactly why it survived.** A touch pointer is
      implicitly captured to its own target anyway, and the click a browser
      synthesises from a tap is aimed at the touch target rather than derived
      from the retargeted mouse pair. It worked on the one device it was tested
      on and could not work on the other.

      Deciding the tap here rather than downstream of a click makes the two
      pointer types one path, and the drag keeps its capture. What is left for
      `onClick` is the keyboard, which never had a capture in the first place.
      -----------------------------------------------------------------------
    */
    if (!held.moved) {
      // A cancelled gesture is not a tap — a phone can take the pointer away
      // mid-press for its own reasons, and that is not somebody asking.
      if (event.type === 'pointerup') setMiniControls((shown) => !shown)
      return
    }
    if (dropped) {
      /*
        Put down in the ground: the screen ends.

        The position is forgotten with it, so the next screen opens where the
        corner puts things rather than in the spot you dragged this one to in
        order to get rid of it.
      */
      useWatching.getState().putSpot(null)
      endSession()
      return
    }
    /*
      Swallow the click this drag is about to become.

      `preventDefault` on a pointerup does not stop the click that follows it —
      the browser fires one on whatever the finger went down on regardless, and
      on this pane that is the control that opens the screen. So the click is
      caught on the way up the tree, once, exactly as the corner's own shove
      does it. Without this, moving the pane out of the way also opened it.
    */
    const el = event.currentTarget
    const swallow = (click: Event) => {
      click.stopPropagation()
      click.preventDefault()
    }
    el.addEventListener('click', swallow, { capture: true, once: true })
    // If the finger went down on nothing clickable no click ever arrives, and
    // the listener would sit there waiting to eat the next honest tap.
    window.setTimeout(() => el.removeEventListener('click', swallow, true), 350)
  }

  /*
    Written straight onto the element, from the box it really has.

    `useMemo` could not do this correctly and was quietly wrong by about twenty
    pixels: it sized the free space from a `ref` holding either a guess or
    whatever the box measured the last time a finger went down, so the place a
    pane landed was not the place it had been dropped. A memo also cannot
    notice a rotation, so a position worked out in portrait stayed applied in
    landscape.

    Reading the live box in a layout effect fixes both, and adds the thing that
    matters most: it **cannot leave the pane somewhere you are unable to reach
    it.** Whatever is in storage, and whatever the screen has since become, the
    result is clamped into the viewport before it is applied.
  */
  useLayoutEffect(() => {
    const el = paneRef.current
    if (!el) return
    const settle = () => {
      if (open || spot === null) {
        el.style.removeProperty('left')
        el.style.removeProperty('top')
        return
      }
      const box = el.getBoundingClientRect()
      const free = {
        x: Math.max(0, window.innerWidth - box.width),
        y: Math.max(0, window.innerHeight - box.height),
      }
      el.style.left = `${Math.round(Math.max(0, Math.min(1, spot.x)) * free.x)}px`
      el.style.top = `${Math.round(Math.max(0, Math.min(1, spot.y)) * free.y)}px`
    }
    settle()
    window.addEventListener('resize', settle)
    window.addEventListener('orientationchange', settle)
    /*
      And whenever the pane itself changes shape.

      This is not belt and braces — it is the fix for a real failure. The
      element only exists once something is playing, so on a cold load the
      effect ran first with nothing to write to, and `[spot, open]` did not
      change when the video arrived, so it never ran again: the pane came back
      in the corner's default place rather than where it had been left.
      `live` is in the dependencies now for that reason, and the observer
      covers the same shape of mistake for anything that resizes it later.
    */
    const watch = new ResizeObserver(settle)
    watch.observe(el)
    return () => {
      watch.disconnect()
      window.removeEventListener('resize', settle)
      window.removeEventListener('orientationchange', settle)
    }
  }, [spot, open, live])


  // --- what is on --------------------------------------------------------
  const shown = shared.playing ? Math.max(where, 0) : shared.at

  /*
    ------------------------------------------------------------------------
    **Open, or playing. Not "playing" alone.**

    This read `if (!live) return null`, and `live` means a video has been
    chosen — so pressing the way in on a garden that had never watched anything
    set `open` and rendered nothing at all. You could not reach the search
    without a video, and you could not get a video without the search. The
    control worked perfectly and appeared to do nothing, which is the worst
    shape a bug can have.

    Open with nothing on is a real state and has to look like one: the screen is
    dark, and the queue is the half you land on, because choosing something is
    the only thing there is to do.
    ------------------------------------------------------------------------
  */
  if (!open && !live) return null

  return createPortal(
    <>
    <div
      /*
        The root is the box while it is tucked — the screen inside is
        `inset: 0` and fills it — so the drag, and the place it is remembered
        in, belong here rather than on the picture.
      */
      ref={paneRef}
      className={`together ${open ? 'full' : 'tucked'}${immersive ? ' immersive' : ''}${filling ? ' filling' : ''}${searching ? ' searching' : ''}${immersive && immersiveControls ? ' immersive-awake' : ''}${miniControls ? ' mini-awake' : ''}${!open && spot !== null ? ' placed' : ''}${overGround ? ' over-ground' : ''}`}
      onPointerDown={onPaneDown}
      onPointerMove={onPaneMove}
      onPointerUp={onPaneUp}
      onPointerCancel={onPaneUp}
    >
      {open && !immersive && (
        <>
          <div className="together-place" aria-hidden="true">
            <i className="together-glow warm" />
            <i className="together-glow cool" />
            <i className="together-horizon" />
          </div>
          <header className="together-header">
            <button type="button" className="together-back" onClick={live ? fold : tuck}>
              <span aria-hidden="true">←</span> back to the garden
            </button>
            <div className="together-place-name">
              <span>the night screen</span>
              <small>
                <i className={`together-presence warm${presence[me]?.online ? ' online' : ''}`} />
                you
                <i className={`together-presence cool${presence[them.id]?.online ? ' online' : ''}`} />
                {presence[them.id]?.online ? `${them.name} is here` : `${them.name} is away`}
              </small>
            </div>
            {live ? (
              <button type="button" className="together-end" onClick={endSession}>end screen</button>
            ) : <span className="together-end-space" />}
          </header>
        </>
      )}

      {/* The persistent YouTube host never leaves the document between views. */}
      {/*
        No pointer handlers here, deliberately.

        They used to be on this element *as well as* on the root, and since one
        is `inset: 0` inside the other every press ran the whole gesture twice
        — the second run overwriting the first's captured pointer and its grab
        offset. The root is the box that moves and the box that is remembered,
        so the root is the only thing that listens.
      */}
      <div
        className={`together-screen${live ? '' : ' dark'}${trouble ? ' has-trouble' : ''}${!open && spot !== null ? ' placed' : ''}`}
      >
        <div ref={stage} className="together-stage" />
        {open && live && !immersive && (
          <button
            type="button"
            className="together-immerse-enter"
            onClick={enterImmersion}
            aria-label="enter immersive view"
            title="immerse"
          >
            <span className="together-expand-mark" aria-hidden="true" />
          </button>
        )}
        {open && live && immersive && trouble === '' && joined && (
          <button
            type="button"
            className="together-immersive-wake"
            /*
              ---------------------------------------------------------------
              **The sheet has to be here. What it does with a click does not.**

              An iframe is another document: a pointer that lands on it is gone
              and this page never hears about it. So YouTube's own play button
              genuinely cannot be pressed while a clear layer of ours is over
              the film — and the layer cannot simply be removed, because it is
              also the only thing that lets a mouse wake our controls, and on
              the miniature the only thing that lets the pane be dragged at
              all. That was the reason, and it was a real one.

              It was the wrong conclusion though. On a device with a mouse the
              controls already come back on **movement**, a few lines below, so
              spending the click on them as well was spending it twice — and it
              left the single most expected gesture in front of a film, click
              to pause, doing nothing at all. It now pauses, the way it does in
              every player anybody has ever used, and the controls come up with
              it because pausing is when you want them.

              A finger has no movement to reveal anything with, so a tap there
              keeps its old job. Two pointer types, two different right
              answers.
              ---------------------------------------------------------------
            */
            onPointerDown={(event) => {
              lastImmersivePress.current = event.pointerType
            }}
            onClick={(event) => {
              /*
                A mouse pauses; a finger and the keyboard reveal the controls.

                `detail` is 0 only when the activation came from a key, and a
                key has no cursor to have aimed with — pausing on it would be
                acting on a press nobody made at anything. It gets the safe
                half, which is also the half the transport does not already
                offer from the keyboard.
              */
              const byMouse = event.detail !== 0 && lastImmersivePress.current === 'mouse'
              if (!byMouse) {
                toggleImmersiveControls()
                return
              }
              playPause()
              revealImmersiveControls()
            }}
            onPointerMove={(event) => {
              if (event.pointerType !== 'mouse') return
              const now = performance.now()
              if (immersiveControls && now - lastImmersiveMove.current < 180) return
              lastImmersiveMove.current = now
              revealImmersiveControls()
            }}
            aria-label={
              /*
                Named for what the *keyboard* gets, which is the controls —
                see `detail === 0` above. Naming it "pause" would be describing
                the mouse's half of this button to the one person who cannot
                reach it.
              */
              immersiveControls ? 'hide viewing controls' : 'show viewing controls'
            }
          />
        )}
        {!live && open && (
          <div className="together-nothing">
            <span className="together-empty-mark" aria-hidden="true">◇</span>
            <p>Nothing on yet.</p>
            <small>Find the first thing below, or bring a YouTube link.</small>
          </div>
        )}
        {!open && (
          <>
            {/*
              A clear sheet over the iframe, and it is load-bearing twice.

              An iframe is another document: a pointer that lands on it is
              gone, and nothing here ever hears about it. Without a layer of
              our own above it the miniature could not be dragged at all — so
              this is not decoration over the picture, it is the picture's
              only handle.

              It stays a real `<button>` for the keyboard, and its `onClick`
              answers to the keyboard alone: a pointer tap is settled in
              `onPaneUp`, and letting a click through as well would toggle
              twice and appear to do nothing. `detail` is 0 only for an
              activation that came from a key rather than a pointer, which is
              precisely the split we want.
            */}
            <button
              type="button"
              className="together-mini-reveal"
              onClick={(event) => {
                if (event.detail !== 0) return
                setMiniControls((shown) => !shown)
              }}
              aria-expanded={miniControls}
              aria-label="show miniature screen controls"
            />
            <div
              className="together-mini-actions"
              /*
                The controls are not the pane. Swallowing the press here keeps
                the gesture above from capturing the pointer, which is what
                lets these buttons receive an ordinary click — see the long
                note in `onPaneUp`.
              */
              onPointerDown={(event) => event.stopPropagation()}
            >
              {/*
                Play and pause, on the miniature.

                It is the one control anybody expects to find on a small video
                and the only one that was genuinely missing — YouTube's own
                button is under our sheet and unreachable by design, so "the
                play button doesn't work" was the honest reading of a picture
                with nothing to press.

                It reaches her screen, which is why it is behind the same two
                presses everything here is behind: one to wake the controls,
                one to use them. Unlike ending the session it is completely
                reversible, which is the line this overlay draws.
              */}
              <button
                type="button"
                onClick={playPause}
                aria-label={shared.playing ? 'pause for both of us' : 'play for both of us'}
              >
                <span aria-hidden="true">{shared.playing ? '❚❚' : '▶'}</span>
                {shared.playing ? 'pause' : 'play'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMiniControls(false)
                  useWatching.getState().show()
                }}
              >
                <span aria-hidden="true">↗</span> open
              </button>
              {/*
                There is no way to end the session from here, deliberately.

                ---------------------------------------------------------
                This had a `× close` beside the open, and it ended the screen
                **for both of you** — one tap, on a control the size of a
                thumbnail, sitting under a first tap that had only just
                revealed it. It was reported exactly as it behaves: touched it
                once, it disappeared, and it did not come back on a refresh,
                because what had actually happened was that the shared record
                had been emptied.

                Nothing that reaches across to her device belongs on a
                two-hundred-pixel overlay with no confirmation and no undo.
                Ending it lives in the full screen, next to the thing it ends,
                where it is called *end screen* and you can see what you are
                closing. From here the only move is to go and look.
                ---------------------------------------------------------
              */}
            </div>
          </>
        )}
        {trouble !== '' && (
          <div className="together-screen-trouble" role="status">
            <span className="together-trouble-mark" aria-hidden="true">◇</span>
            <p>{trouble}</p>
            {open && shared.queue.length > 0 && (
              <button type="button" onClick={skip}>try what is next</button>
            )}
          </div>
        )}
        {/*
          A film is on and this device has no copy of it.

          -----------------------------------------------------------------
          This is the whole second half of watching a film together, and it
          is *not* an error state — it is the ordinary condition of the
          person who did not put it on. Nothing has gone wrong, nothing has
          failed, and there is exactly one thing to do.

          It stands in front of "tap to join", which would otherwise be the
          message here and would be a lie: pressing play cannot help, because
          there is nothing on this machine to play. Everything that reaches
          this screen from her side has already happened correctly.
          -----------------------------------------------------------------
        */}
        {/*
          On the miniature as well as the full screen, and that is the point.

          This was gated on the screen being open, which meant the person who
          had folded the film into the corner and gone for a walk got a black
          rectangle with nothing on it when the other one put a film on —
          which is the exact failure this whole invitation exists to prevent,
          reproduced in miniature.

          The pane is small, so the stylesheet drops the paragraph and keeps
          the name and the way in. The button stops its own pointer from
          reaching the drag beneath it, as every control on the pane must.
        */}
        {live && isFilm(shared.videoId) && mine === null && trouble === '' && (
          <div className="film-ask">
            <p className="film-ask-what">
              {shared.by === me ? 'You put on' : `${them.name} put on`} <b>{shared.title}</b>
            </p>
            <small>
              It plays from your own copy of the file — nothing was uploaded and
              nothing is being sent. Choose it here and the two screens run
              together.
            </small>
            {/*
              One press when this device has opened this exact film before.

              This is the whole of what the shelf is for. The second night is
              otherwise identical to the first — a dialog, a folder, and a hunt
              for a film you were watching yesterday — and it lands at the one
              moment nobody wants to be doing anything but starting.
            */}
            {again !== null ? (
              <>
                <button
                  type="button"
                  className="film-choose"
                  disabled={reading}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => void openAgain(again, 'join')}
                >
                  {reading ? 'opening…' : `open ${again.name} again`}
                </button>
                <FilmPick
                  label="or choose another file"
                  busy={reading}
                  onFile={(file) => void takeFilm(file, 'join')}
                  keeping={canRemember() ? () => void chooseAndKeep('join') : undefined}
                  quiet
                />
              </>
            ) : (
              <FilmPick
                label="choose my copy"
                busy={reading}
                onFile={(file) => void takeFilm(file, 'join')}
                keeping={canRemember() ? () => void chooseAndKeep('join') : undefined}
              />
            )}
            {pickTrouble !== '' && <p className="film-trouble">{pickTrouble}</p>}
          </div>
        )}
        {open && !joined && trouble === '' && !(isFilm(shared.videoId) && mine === null) && (
          <button type="button" className="together-join" onClick={playPause}>
            tap to join {them.name} here
          </button>
        )}
      </div>

      {open && live && immersive && (
        <ImmersiveTransport
          awake={immersiveControls}
          captions={captions}
          film={isFilm(shared.videoId)}
          noSound={noSound}
          hasSubs={subs !== null}
          otherCut={otherCut}
          offset={offset}
          onNudge={nudge}
          playing={shared.playing}
          live={live}
          shown={shown}
          span={span}
          hasNext={shared.queue.length > 0}
          onPlayPause={playPause}
          onSkip={skip}
          onSeek={goTo}
          onToggleCaptions={toggleCaptions}
          onLeave={leaveImmersion}
          onActivity={revealImmersiveControls}
        />
      )}

      {/*
        Over the picture, when the picture is the whole screen.

        Not "instead of the panel on a narrow window" — instead of the panel
        when there is no room for one that isn't taken from the film. A column
        beside a fullscreen video is a video that is not fullscreen.
      */}
      {open && live && immersive && filling && (
        <ScreenChat session={shared.session} theirName={them.name} me={me} />
      )}

      {open && !filling && (
        <aside className="together-room" aria-label={immersive ? 'conversation beside the screen' : 'shared screen controls'}>
          {!immersive && (
            <>
              <Transport
                live={live}
                onStop={endSession}
                film={isFilm(shared.videoId)}
                noSound={noSound}
                mine={mine}
                subs={subs}
                otherCut={otherCut}
                theirSize={filmPrint === null ? 0 : sizeIn(filmPrint)}
                offset={offset}
                onNudge={nudge}
                captions={captions}
                playing={shared.playing}
                shown={shown}
                span={span}
                hasNext={shared.queue.length > 0}
                movedBy={shared.by === me ? 'you' : them.name}
                title={shared.title}
                onPlayPause={playPause}
                onSkip={skip}
                onSeek={goTo}
                onToggleCaptions={toggleCaptions}
                onTuck={fold}
              />

              <div className="together-tabs" role="tablist" aria-label="beside the screen">
                {(['talk', 'queue', 'film'] as const).map((which) => (
                  <button
                    key={which}
                    type="button"
                    role="tab"
                    aria-selected={tab === which}
                    className={`together-tab${tab === which ? ' on' : ''}`}
                    onClick={() => setTab(which)}
                  >
                    {which === 'talk'
                      ? 'talk'
                      : which === 'film'
                        ? 'our film'
                        : `find & queue${shared.queue.length > 0 ? ` · ${shared.queue.length}` : ''}`}
                  </button>
                ))}
              </div>
            </>
          )}

          {immersive || tab === 'talk' ? (
            <Talk session={shared.session} theirName={them.name} />
          ) : tab === 'film' ? (
            <OurFilm
              mine={mine}
              subs={subs}
              reading={reading}
              readingSubs={readingSubs}
              pickTrouble={pickTrouble}
              subTrouble={subTrouble}
              shelf={shelf}
              nothingOn={shared.videoId === null}
              onFilm={(file) => void takeFilm(file, 'start')}
              onKeepingFilm={canRemember() ? () => void chooseAndKeep('start') : undefined}
              onShelved={(film) => void openAgain(film, 'start')}
              onSubtitles={(file) => void takeSubtitles(file)}
              onDropSubtitles={takeOutSubtitles}
            />
          ) : (
            <Queue
              queue={shared.queue}
              theirName={them.name}
              nothingOn={shared.videoId === null}
              onHunting={setHunting}
              onPlayNow={(videoId, title) => put(videoId, title)}
              onQueue={(item) => move({ ...shared, queue: [...shared.queue, item] })}
              onDrop={(id) => move({ ...shared, queue: shared.queue.filter((q) => q.id !== id) })}
            />
          )}
        </aside>
      )}
    </div>
      {/*
        The ground, only while you are carrying it — and a *sibling* of the
        pane, not a child of it.

        The pane is a small fixed box with a stacking context of its own; a
        target living inside it would be trapped in that context and clipped
        to a corner of the screen, which is exactly the trap the pane itself
        was moved out of `.corner` to escape. See `paneHost` above.

        Words, not a bare cross. This ends the screen for both of you and
        there is no undo, so it names what it will do while you can still
        change your mind, and changes tense the moment you are over it — the
        last thing you read before letting go is the thing about to happen.
      */}
      {!open && carrying && (
        <div
          ref={ground}
          className={`together-ground${overGround ? ' over' : ''}`}
          aria-hidden="true"
        >
          <i />
          <span>{overGround ? 'let go to end it' : 'drag here to end'}</span>
        </div>
      )}
    </>,
    paneHost(),
  )
}

/**
 * The one way a file gets in, and it is a real file input.
 *
 * ---------------------------------------------------------------------------
 * Nothing is uploaded by this, and that is worth being able to see from the
 * markup: a chosen file becomes an object URL and is handed to a `<video>`.
 * There is no request anywhere in this path.
 *
 * `accept` is deliberately loose. A file this browser cannot open is a thing
 * to *explain* rather than a thing to hide — a picker that will not show you
 * your own .mkv teaches you nothing, while one that shows it and then says
 * why it cannot play it sends you off with an errand.
 *
 * The input is cleared on every change. Without that, choosing the same file a
 * second time — after fixing it, most likely — fires no event at all, and the
 * button appears to be broken at the exact moment somebody is already annoyed.
 * ---------------------------------------------------------------------------
 */
function FilmPick({
  label,
  busy,
  onFile,
  keeping,
  takes = 'video/*,.mp4,.m4v,.mov,.webm,.mkv,.avi',
  quiet = false,
}: {
  label: string
  busy: boolean
  onFile(file: File): void
  /*
    The other door, on a browser that has one.

    Chromium can open a file dialog that hands back a *handle* as well as a
    file — a bookmark this device can come back to tomorrow, which is what
    `systems/filmShelf` keeps. When it exists it is used, and the input below
    stays in the markup as the path every other browser takes.
  */
  keeping?: () => void
  /** What the dialog offers first. Loose on purpose — see the note below. */
  takes?: string
  /** A word rather than a button, for the second thing on a line. */
  quiet?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        className="film-input"
        accept={takes}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) onFile(file)
        }}
      />
      <button
        type="button"
        className={quiet ? 'film-quiet' : 'film-choose'}
        disabled={busy}
        /*
          The press stops here, and on the miniature that is the difference
          between this button working and not.

          A film nobody on this device has chosen shows its invitation on the
          tucked pane too, which is the pane you drag — so a press on this
          button reaches the pane's gesture, which captures the pointer, which
          retargets the compatibility mouse events, which means the click is
          synthesised on the pane instead of here. Exactly the trap documented
          at length in `onPaneUp`, in a second place.

          Harmless in the full screen, where the pane takes no gesture at all.
        */
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => (keeping ? keeping() : input.current?.click())}
      >
        {busy ? 'reading the file…' : label}
      </button>
    </>
  )
}

/** `1.4 GB`/**
 * Films this device has opened before.
 *
 * ---------------------------------------------------------------------------
 * The row is the film's own name and one press, and the press may bring up the
 * browser's own "let this site read that file again?" — which is the bargain
 * and is worth saying nothing about, because the answer is obviously yes to
 * the person who put it there.
 *
 * It is absent rather than empty on a browser without handles, and absent
 * rather than empty before anything has been watched. A heading over nothing
 * is a promise that has not been kept yet.
 * ---------------------------------------------------------------------------
 */
function FilmShelf({
  films,
  busy,
  onOpen,
}: {
  films: Shelved[]
  busy: boolean
  onOpen(film: Shelved): void
}) {
  if (films.length === 0) return null
  return (
    <div className="film-shelf">
      <p className="film-shelf-label">watched here before</p>
      <ul>
        {films.map((film) => (
          <li key={film.print}>
            <button type="button" disabled={busy} onClick={() => onOpen(film)}>
              <span className="film-shelf-title">{film.title}</span>
              <span className="film-shelf-size">{heft(film.size)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** `1.4 GB`, because a byte count is not something anybody reads. */
function heft(bytes: number): string {
  if (bytes <= 0) return ''
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`
}

/**
 * Lining two different encodes up, by hand, because nothing else can.
 *
 * ---------------------------------------------------------------------------
 * When the two of you have the same file this never appears, and it should
 * not: the clock does the whole job. When you have different rips of the same
 * film it is the only thing that can do the job, because the difference is not
 * drift — it is a distributor card at the front of one of them, and no amount
 * of synchronising fixes a film that genuinely starts four seconds later.
 *
 * It is a *viewing* control, so it sits with the viewing controls and its
 * setting never leaves this device. Pressing the reading itself puts it back
 * to nothing, which is the one thing you want when you have nudged your way
 * into a mess.
 * ---------------------------------------------------------------------------
 */
function Nudge({
  offset,
  wide,
  onNudge,
}: {
  offset: number
  /** The full transport has room for the ten-second jumps; the film does not. */
  wide: boolean
  onNudge(by: number): void
}) {
  return (
    <span className="film-nudge" role="group" aria-label="line this copy up with theirs">
      {wide && (
        <button type="button" onClick={() => onNudge(-10)} aria-label="ten seconds earlier">
          −10
        </button>
      )}
      <button type="button" onClick={() => onNudge(-1)} aria-label="a second earlier">
        −1
      </button>
      <button
        type="button"
        className="film-nudge-read"
        onClick={() => onNudge(-offset)}
        aria-label={`this copy is ${offsetWords(offset)}; put it back`}
        title="put it back"
      >
        {offsetWords(offset)}
      </button>
      <button type="button" onClick={() => onNudge(1)} aria-label="a second later">
        +1
      </button>
      {wide && (
        <button type="button" onClick={() => onNudge(10)} aria-label="ten seconds later">
          +10
        </button>
      )}
    </span>
  )
}

/** The small set of controls that is allowed to exist over an immersed film. */
function ImmersiveTransport({
  awake,
  captions,
  film,
  noSound,
  hasSubs,
  otherCut,
  offset,
  onNudge,
  playing,
  live,
  shown,
  span,
  hasNext,
  onPlayPause,
  onSkip,
  onSeek,
  onToggleCaptions,
  onLeave,
  onActivity,
}: {
  awake: boolean
  captions: boolean
  film: boolean
  noSound: boolean
  hasSubs: boolean
  otherCut: boolean
  offset: number
  onNudge(by: number): void
  playing: boolean
  /** Whether there is a film at all — the scrubber and skips need it. */
  live: boolean
  shown: number
  span: number
  hasNext: boolean
  onPlayPause(): void
  onSkip(): void
  onSeek(seconds: number): void
  onToggleCaptions(): void
  onLeave(): void
  onActivity(): void
}) {
  return (
    <div
      className={`together-immersive-controls${awake ? ' awake' : ''}`}
      aria-hidden={!awake}
      inert={!awake}
      onPointerDown={(event) => {
        event.stopPropagation()
        onActivity()
      }}
    >
      <button
        type="button"
        className="together-immersion-exit"
        onClick={onLeave}
        aria-label="leave immersive view"
      >
        <span className="together-contract-mark" aria-hidden="true" />
      </button>

      <div className="together-immersive-transport">
        {/*
          Said over the film as well, because this is where somebody is when
          they notice. One line, and only ever in a case that is genuinely
          wrong — it is not a thing that appears during a normal evening.
        */}
        {noSound && (
          <p className="film-hush">
            no sound from this copy — no audio track, or one the browser cannot play
          </p>
        )}
        <Scrub
          shown={shown}
          span={span}
          live={live}
          onSeek={onSeek}
          onActivity={onActivity}
        />

        <div className="together-immersive-moves">
          <span className="together-clock">{clock(shown)}{span > 0 ? ` / ${clock(span)}` : ''}</span>
          <button
            type="button"
            className="together-go"
            onClick={onPlayPause}
            aria-label={playing ? 'pause for both of us' : 'play for both of us'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button
            type="button"
            className="together-next"
            onClick={onSkip}
            disabled={!hasNext}
            aria-label="next in the queue"
          >
            ›
          </button>
          {(!film || hasSubs) && (
            <button
              type="button"
              className={`together-caption${captions ? ' on' : ''}`}
              onClick={onToggleCaptions}
              aria-pressed={captions}
              aria-label={captions ? 'turn captions off' : 'turn captions on'}
            >
              cc
            </button>
          )}
          {/*
            Narrow here, and it has to be reachable here.

            Two rips are discovered to be out of step while you are watching
            them, which is when the film is filling the screen — a control you
            have to leave immersion to reach is one you use once and then put
            up with being four seconds apart.
          */}
          {otherCut && <Nudge offset={offset} wide={false} onNudge={onNudge} />}
        </div>
      </div>
    </div>
  )
}

/**
 * The controls, which are a line of light and three marks.
 *
 * No rounded rectangle, no filled bar, no chrome — the beam under the corner
 * player already says "how far through this is" in this world's language, and a
 * second visual language for the same fact would be two answers to one question.
 */
function Transport({
  live,
  onStop,
  film,
  noSound,
  mine,
  subs,
  otherCut,
  theirSize,
  offset,
  onNudge,
  captions,
  playing,
  shown,
  span,
  hasNext,
  movedBy,
  title,
  onPlayPause,
  onSkip,
  onSeek,
  onToggleCaptions,
  onTuck,
}: {
  live: boolean
  onStop(): void
  /** A film off the disk rather than a video, which changes what is offered. */
  film: boolean
  /** The film plays but this browser cannot decode its sound. */
  noSound: boolean
  mine: Film | null
  /** Only to know whether `cc` has anything to switch; the tab owns choosing. */
  subs: Subtitles | null
  otherCut: boolean
  /** The byte count the anchor's fingerprint carries, for saying how they differ. */
  theirSize: number
  offset: number
  onNudge(by: number): void
  captions: boolean
  playing: boolean
  shown: number
  span: number
  hasNext: boolean
  movedBy: string
  title: string
  onPlayPause(): void
  onSkip(): void
  onSeek(seconds: number): void
  onToggleCaptions(): void
  onTuck(): void
}) {
  return (
    <div className="together-transport">
      <p className="together-now">
        <span className="together-title">{title || 'nothing on'}</span>
        {/*
          Who moved it last, and it earns its place.

          The one thing that is genuinely strange about a shared screen is a
          video pausing when you did not pause it. One word removes the whole
          confusion, and it is the difference between "this is broken" and "she
          is saying something".
        */}
        <span className="together-by">{playing ? 'playing' : 'paused'} · {movedBy}</span>
      </p>

      {/*
        Which copy is loaded, and whether it is the same one.

        Worth a line of its own because it is the single fact that explains
        every strange thing a shared film can do. Matching, it says so once and
        is never thought about again; different, it says how they differ and
        hands over the only control that can help.
      */}
      {/*
        A film that plays and cannot be heard.

        Phrased as a fact about the file and a thing to do about it, because
        that is what it is — nothing here is broken, and the person reading it
        has almost certainly just been through their own volume controls twice.
      */}
      {/*
        The symptom first, then the likely cause — and it is *likely* rather
        than certain, which the old wording got wrong.

        What is actually known is that no audio has been decoded. That is
        produced by a track the browser cannot play, and it is produced just as
        exactly by a file with no sound on it at all: a screen recording, a
        silent clip, something exported without its audio. Saying "this copy's
        sound is in a format the browser cannot play" is a guess stated as a
        fact, and it is the wrong guess about half the time somebody films
        their own thing.
      */}
      {noSound && (
        <p className="film-trouble">
          No sound is coming from this copy. Either it has no audio track, or
          its audio is a format the browser cannot play — usually AC3 or DTS,
          which is what a disc rip carries. The picture is unaffected either
          way, and an .mp4 with AAC sound plays everywhere.
        </p>
      )}

      {film && mine !== null && (
        <p className={`film-copy${otherCut ? ' other' : ''}`}>
          <span className="film-copy-name">{mine.name}</span>
          <span className="film-copy-note">
            {otherCut
              ? `a different copy · yours ${heft(mine.size)}${theirSize > 0 ? `, theirs ${heft(theirSize)}` : ''}`
              : `the same copy · ${heft(mine.size)}`}
          </span>
        </p>
      )}

      <Scrub shown={shown} span={span} live={live} onSeek={onSeek} />

      <div className="together-moves">
        <span className="together-clock">{clock(shown)}{span > 0 ? ` / ${clock(span)}` : ''}</span>
        <button type="button" className="together-go" onClick={onPlayPause} disabled={!live}
          aria-label={playing ? 'pause for both of us' : 'play for both of us'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <button type="button" className="together-next" onClick={onSkip} disabled={!hasNext}
          aria-label="next in the queue">
          ›
        </button>
        {/*
          Hidden for a film rather than offered and ignored.

          An .mp4 almost never carries a track a browser will show, so this
          control would be a switch that does nothing — which is worse than an
          absent one, because it makes somebody wonder whether their subtitles
          are broken. Subtitles for a film want a chosen `.srt` beside it, and
          that is a feature rather than a line here.
        */}
        {live && (!film || subs !== null) && (
          <button
            type="button"
            className={`together-caption${captions ? ' on' : ''}`}
            onClick={onToggleCaptions}
            aria-pressed={captions}
            aria-label={captions ? 'turn captions off' : 'turn captions on'}
          >
            cc
          </button>
        )}
        {otherCut && <Nudge offset={offset} wide onNudge={onNudge} />}
        {/*
          Two ways out, and they are genuinely different.

          Folding away leaves it playing in the corner — that is the point of
          the tucked pane. Stopping ends it for *both* of you, which is why it
          is only offered while something is actually on: a "stop" on a dark
          screen is a control that cannot do anything.
        */}
        {live && (
          <button type="button" className="together-tuck" onClick={onStop}>
            stop
          </button>
        )}
        <button type="button" className="together-tuck" onClick={onTuck}>
          {live ? 'fold away' : 'close'}
        </button>
      </div>
    </div>
  )
}

/**
 * The conversation in front of the screen — and it is not the Stars.
 *
 * ---------------------------------------------------------------------------
 * It used to be. The same feed, the same messages, the same history: you would
 * open a film and be looking at whatever the two of you had been talking about
 * that afternoon, and then say "wait, go back" into it, forever, sitting
 * between a letter and a question.
 *
 * They are not the same conversation. What is said here is *about the thing on
 * the screen* — it is short, it is fast, it is half reaction, and it stops
 * making sense the moment the screen is off. The Stars is the opposite: it is
 * the two of you, it is kept, and it is read again.
 *
 * So this one lives and dies with the sitting. A new screen is a new page; the
 * screen going dark takes it with it; nothing here is ever merged into the
 * Stars. There is no history to scroll back through because there is nothing
 * before tonight — which is the correct amount of history for a running
 * commentary on a film.
 * ---------------------------------------------------------------------------
 */
/**
 * One sitting's conversation: what has been said, and how to add to it.
 *
 * ---------------------------------------------------------------------------
 * Two things show this and they are not the same shape — a panel beside the
 * screen, and a handful of lines lying over a filled one. What they share is
 * every part that is easy to get subtly wrong: which sitting a line belongs
 * to, the optimistic copy that has to be replaced rather than joined, undoing
 * that copy when the write is refused, and the sound.
 *
 * Written twice, one of them would drift. The same argument as the three
 * composers in `systems/useTyping`, and the same answer.
 * ---------------------------------------------------------------------------
 */
function useScreenTalk(session: string) {
  const data = useData()
  const me = data.me
  /** `say` is taken by the sender below — this one turns {her} into her name. */
  const inWords = useSay()
  const [said, setSaid] = useState<ScreenLine[]>([])

  useEffect(() => {
    if (session === '') {
      setSaid([])
      return
    }
    return data.watchScreenTalk((talk) => {
      // Lines from a sitting that has ended are not this conversation.
      setSaid(talk.session === session ? talk.said : [])
    })
  }, [data, session])

  const say = async (text: string): Promise<boolean> => {
    const body = text.trim()
    if (body === '' || session === '') return false
    const line: ScreenLine = {
      id: `said-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
      by: me,
      body,
      at: Date.now(),
    }
    /*
      Shown immediately, then sent.

      The wire is the truth and it will arrive with its own copy — which
      replaces this one rather than joining it, because they share an id. A
      film does not wait for a round trip to Lagos before showing you what you
      just typed.
    */
    setSaid((was) => [...was, line])
    ambience.said(true)
    const sent = await attempt(inWords('that didn’t reach {her} screen'), () =>
      data.sayOnScreen(session, line),
    )
    if (!sent) setSaid((was) => was.filter((l) => l.id !== line.id))
    return sent
  }

  const shown = useMemo(() => {
    // The optimistic copy and the one off the wire are the same line.
    const byId = new Map<string, ScreenLine>()
    for (const line of said) byId.set(line.id, line)
    return [...byId.values()].sort((a, b) => a.at - b.at).slice(-60)
  }, [said])

  return { shown, say, me }
}

function Talk({ session, theirName }: { session: string; theirName: string }) {
  const [draft, setDraft] = useState('')
  const { shown, say: send, me } = useScreenTalk(session)
  const feed = useRef<HTMLDivElement>(null)
  /*
    Gated on there being a sitting, because the field is disabled without one
    and a disabled field cannot be typed into — so reporting from here with no
    screen on would be reporting a draft nobody can add to.
  */
  useReportTyping(draft, session !== '')

  useEffect(() => {
    const conversation = feed.current
    if (conversation) conversation.scrollTop = conversation.scrollHeight
  }, [shown.length])

  async function say() {
    const text = draft
    if (text.trim() === '' || session === '') return
    setDraft('')
    await send(text)
  }

  const writing = useTheyAreTyping()

  return (
    <div className="together-talk">
      <div ref={feed} className="together-said">
        {shown.length === 0 ? (
          <p className="together-none">
            {session === ''
              ? 'Put something on, and this is where you talk about it.'
              : 'Nothing said yet. This page is only for tonight.'}
          </p>
        ) : (
          shown.map((line) => (
            <p key={line.id} className={`together-line ${line.by === me ? 'mine' : 'hers'}`}>
              {line.body}
            </p>
          ))
        )}
      </div>
      <div className="together-composer">
        {/* This line always keeps its place, so typing never moves the field. */}
        <p className="together-writing" aria-live="polite" aria-atomic="true">
          {writing ? <span aria-label={`${theirName} is typing`}>typing</span> : null}
        </p>
        <div className="together-write">
          <Ink
            className="ink together-field"
            value={draft}
            onChange={setDraft}
            placeholder={session === '' ? 'nothing on yet' : `to ${theirName}`}
            label={`say something to ${theirName} about what is on`}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void say()
              }
            }}
          />
          <button
            type="button"
            className="together-send"
            disabled={draft.trim() === '' || session === ''}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => void say()}
          >
            send
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * The conversation over a filled screen.
 *
 * ---------------------------------------------------------------------------
 * **The film gets the whole screen, and the words live on top of it.** That is
 * the trade this component exists to make. A column beside the picture is
 * honest and it costs a quarter of the film; a few lines lying over the
 * bottom-right corner cost a corner of the picture, only while somebody is
 * saying something, and give the rest of it back.
 *
 * Four rules, and each one is doing work:
 *
 * **No box.** No panel, no border, no card. Words on the picture, in the
 * colour of whoever said them, carried by a shadow rather than by a surface.
 * The one concession is `--screen-chat-scrim` — a wash of dark behind the
 * type, for the white kitchen and the snow scene — which starts barely-there
 * and goes all the way to nothing. See `SCRIM_REST`.
 *
 * **It leaves.** Fifteen seconds with nothing said and nothing being written
 * and it fades off the picture entirely. A film you are watching should have
 * nothing on it.
 *
 * **It comes back on its own.** A line arriving brings it back — the message
 * you did not know about is the one thing here that must never be missed —
 * and so does her starting to type, which is the same news half a second
 * earlier.
 *
 * **You do not go and find the field.** Start typing and it is there, with
 * what you typed already in it. This is the part that makes the rest work:
 * reaching for a control, aiming at it and pressing it is a thing you do
 * *instead of* watching, which is why talking over a film normally means one
 * of you has stopped watching it. A keystroke costs nothing.
 * ---------------------------------------------------------------------------
 */
function ScreenChat({
  session,
  theirName,
  me,
}: {
  session: string
  theirName: string
  me: UserId
}) {
  const { shown: everything, say: send } = useScreenTalk(session)
  const [draft, setDraft] = useState('')
  const [composing, setComposing] = useState(false)
  const [awake, setAwake] = useState(true)
  const [scrim, setScrim] = useState(savedScrim)
  const [corner, setCorner] = useState<Corner>(savedCorner)
  const field = useRef<HTMLTextAreaElement>(null)
  const rest = useRef<number | null>(null)
  const writing = useTheyAreTyping()

  useReportTyping(draft, composing && session !== '')

  const shown = useMemo(() => everything.slice(-CHAT_LINES), [everything])

  /*
    ---------------------------------------------------------------------------
    **Read during render, not in an effect.**

    The document key listener is registered once and must not be torn down and
    rebuilt on every keystroke, so it cannot close over `draft` — it would send
    whatever was written one character ago. An effect that copies the value
    afterwards has the same fault one tick later.

    Assigning here is the version that is always right: it happens as part of
    the render that produced the value, so by the time any handler can run, the
    ref and the screen agree.
    ---------------------------------------------------------------------------
  */
  const draftRef = useRef(draft)
  draftRef.current = draft
  const composingRef = useRef(composing)
  composingRef.current = composing

  /*
    Put the caret back after a key this component handled itself.

    Every key that gets here is a key the textarea did *not* receive, which
    means the browser had the focus somewhere else — the film, the wake sheet,
    nothing at all. Typing should move it back, exactly as clicking into the
    field would, so the next character goes to the field natively and selection,
    dictation and a phone's own keyboard all behave normally.

    Null-safe on purpose: on the very first character the field has not been
    rendered yet, and the effect below catches that case when it mounts.
  */
  const keepTheCaret = () => {
    const el = field.current
    if (!el || document.activeElement === el) return
    el.focus()
    const end = el.value.length
    el.setSelectionRange(end, end)
  }


  /*
    One timer, re-armed by everything that counts as something happening. It is
    replaced rather than stacked, so there is never more than one alive.
  */
  const wake = useCallback(() => {
    setAwake(true)
    if (rest.current !== null) window.clearTimeout(rest.current)
    rest.current = window.setTimeout(() => {
      rest.current = null
      setAwake(false)
      setComposing(false)
    }, CHAT_REST_MS)
  }, [])

  useEffect(
    () => () => {
      if (rest.current !== null) window.clearTimeout(rest.current)
    },
    [],
  )

  /*
    A line arriving, or her beginning one. Her typing wakes it about a second
    before the line does, which is the difference between reading her message
    and watching it appear.
  */
  useEffect(() => { wake() }, [shown.length, wake])
  useEffect(() => { if (writing) wake() }, [writing, wake])
  /*
    And a draft in progress is not "nothing happening", however long the pause.

    Somebody thinking mid-sentence for sixteen seconds should not have the
    field taken away with their words still in it — and at fifteen that pause is
    an ordinary one rather than an unusually long one, which is what makes this
    load-bearing rather than a nicety. Every keystroke re-arms the timer; this
    re-arms it for the silences between them, so a started line keeps the
    overlay up until it is sent or emptied.
  */
  useEffect(() => { if (draft !== '') wake() }, [draft, wake])

  /*
    ---------------------------------------------------------------------------
    **Type, and the field is there.**

    The listener is on the document rather than on anything focusable, because
    the entire point is that nothing has to be focused first. It stands aside
    for the three cases that would make it wrong: a modifier held down (that is
    a shortcut, not a sentence), a key something else has already handled, and
    a field that already owns the keyboard — including this one's own, which is
    how every character after the first reaches the textarea normally.

    A single-character `key` is the test for "this is typing". It is true for
    letters, digits, punctuation, every accented character and every script;
    it is false for Escape, Tab, the arrows and the function keys, which have
    names instead. Enter opens an empty field, because somebody who wants to
    say something and has not yet decided what will press it.
    ---------------------------------------------------------------------------
  */
  useEffect(() => {
    if (session === '') return
    const typed = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const at = event.target as HTMLElement | null
      const inAField =
        !!at && (at.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName))

      /*
        Enter sends, from wherever the keyboard happens to be pointing.

        This is the half that was missing. Enter used only to *open* the field
        and leave the sending to the textarea's own handler — which meant it
        worked if and only if the browser had put the caret in there, and if it
        had not, pressing Enter did nothing at all until you reached for the
        mouse and clicked the field. That is the exact thing this overlay
        exists to avoid.

        A real field that is not ours keeps its own Enter. Ours does too, by
        the line at the top: the textarea's handler runs first and calls
        `preventDefault`, so this one has already stood aside by the time it
        looks.
      */
      if (event.key === 'Enter' && !event.shiftKey) {
        if (inAField) return
        event.preventDefault()
        if (draftRef.current.trim() !== '') {
          void say()
          return
        }
        // Nothing written: nothing is sent, and the field simply opens.
        setComposing(true)
        wake()
        return
      }

      if (inAField) return

      /*
        And backspace erases, for the same reason.

        It is not a printable character, so it fell through the test below and
        was never handled anywhere but inside the textarea — the same
        focus-dependent trap as Enter, and more obvious in use, because you can
        watch the letters go on and then refuse to come off.

        On an empty line it puts the overlay away instead. Escape cannot do
        that job here: the browser takes Escape for leaving fullscreen and will
        not be talked out of it, so without this there was no way to change
        your mind about writing except to wait out the fifteen seconds.
      */
      if (event.key === 'Backspace') {
        if (draftRef.current === '') {
          if (!composingRef.current) return
          event.preventDefault()
          setComposing(false)
          return
        }
        event.preventDefault()
        setDraft((was) => was.slice(0, -1))
        wake()
        keepTheCaret()
        return
      }

      if (event.key.length !== 1) return
      /*
        Space is not a way to start writing, because space is play and pause.

        Every other single character opens the field, and a space would too if
        it were allowed to — it is one character like any other. But a space is
        also the gesture in front of a film, and a leading space is worth
        nothing as the first thing in a sentence. So it goes to the film, and
        the moment there *is* a field with the keyboard in it this listener
        stands aside for it anyway and a space is a space again.
      */
      if (event.key === ' ') return
      event.preventDefault()
      setComposing(true)
      // Appended rather than replacing: a line left half-written when the
      // overlay rested is still yours when you come back to it.
      setDraft((was) => was + event.key)
      wake()
      keepTheCaret()
    }
    document.addEventListener('keydown', typed)
    return () => document.removeEventListener('keydown', typed)
  }, [session, wake])

  /* The caret belongs after what you have already typed, not in front of it. */
  useEffect(() => {
    if (!composing) return
    const el = field.current
    if (!el) return
    el.focus()
    const end = el.value.length
    el.setSelectionRange(end, end)
  }, [composing])

  /*
    Stepped rather than picked from a list of four.

    A control on top of a film has to be small, and a person moving the
    conversation is not choosing an abstract corner — they are getting it off
    something, and they will know when it is off it. Pressing until it looks
    right is fewer decisions than reading four options and choosing one.
  */
  const nextCorner = () => {
    const next = CORNERS[(CORNERS.indexOf(corner) + 1) % CORNERS.length]
    setCorner(next)
    try {
      localStorage.setItem(CORNER_KEY, next)
    } catch {
      /* A private browser may refuse storage; it still holds tonight. */
    }
  }

  const putScrim = (next: number) => {
    setScrim(next)
    try {
      localStorage.setItem(SCRIM_KEY, String(next))
    } catch {
      /* A private browser may refuse storage; the setting still holds tonight. */
    }
  }

  async function say() {
    const text = draftRef.current
    if (text.trim() === '') return
    setDraft('')
    wake()
    await send(text)
    /*
      Left open, because talking over a film is a back-and-forth rather than one
      message — and closing it would take the keyboard away between two halves
      of the same thought. It goes when the fifteen seconds go.
    */
    field.current?.focus()
  }

  return (
    <div
      className={`screen-chat ${cornerClass(corner)}${awake ? ' awake' : ''}${composing ? ' writing' : ''}`}
      style={{ '--screen-chat-scrim': String(scrim) } as CSSProperties}
      aria-label={`what you and ${theirName} are saying about this`}
    >
      <div className="screen-chat-said">
        {shown.map((line) => (
          <p key={line.id} className={`screen-chat-line ${line.by === me ? 'mine' : 'hers'}`}>
            <b>{line.by === me ? 'you' : theirName}</b>
            {line.body}
          </p>
        ))}
      </div>

      {/* This line keeps its place whether or not she is writing, so a message
          arriving never shifts the field out from under the cursor. */}
      <p className="screen-chat-writing" aria-live="polite" aria-atomic="true">
        {writing ? <span>{writingLine(theirName)}</span> : null}
      </p>

      {composing ? (
        <div className="screen-chat-compose">
          <Ink
            className="ink screen-chat-field"
            value={draft}
            onChange={setDraft}
            innerRef={field}
            placeholder={`to ${theirName}`}
            label={`say something to ${theirName} about what is on`}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void say()
              }
            }}
          />
          <button
            type="button"
            className="screen-chat-send"
            disabled={draft.trim() === ''}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => void say()}
          >
            send
          </button>
          {/*
            The dial for the white kitchen, and it lives here rather than with
            the viewing controls.

            You discover you need it at the exact moment you cannot read a
            line, and that moment is this one. A control you have to go and
            open a different set of controls to reach is a control you use once
            and then stop using. It is here only while you are writing, which
            is the only time this corner belongs to you rather than to the film.
          */}
          {/*
            Where the words sit, next to how dark they sit on — the two things
            you reach for when something on the picture is in the way of
            something else on the picture.
          */}
          <button
            type="button"
            className="screen-chat-corner"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              nextCorner()
              field.current?.focus()
            }}
            aria-label={`the conversation is in the ${corner}; move it`}
          >
            {corner}
          </button>
          <label className="screen-chat-scrim-set">
            <span aria-hidden="true">backing</span>
            <input
              type="range"
              min={0}
              max={0.7}
              step={0.05}
              value={scrim}
              onChange={(event) => putScrim(Number(event.currentTarget.value))}
              /*
                Back to the sentence afterwards. Without this the next thing
                typed goes to the slider and moves it, because the slider is a
                field and the document listener correctly stands aside for it.
              */
              onPointerUp={() => field.current?.focus()}
              onBlur={() => field.current?.focus()}
              aria-label="how much dark the words sit on"
            />
          </label>
        </div>
      ) : (
        <p className="screen-chat-hint">type to say something</p>
      )}
    </div>
  )
}

/**
 * Our own film: choosing one, and everything about the copy on this device.
 *
 * ---------------------------------------------------------------------------
 * **A tab, because it is one of the two ways to put something on.**
 *
 * This began as a section wedged under the YouTube search, and that was the
 * wrong shape twice over. It pushed the queue itself off the bottom of a panel
 * that is not tall — so the list of what the two of you had lined up, which is
 * the point of that half, had nowhere left to be. And it read as something
 * fitted in wherever there was room, which is exactly what it was.
 *
 * Watching a film off the disk is not a footnote to searching YouTube. It is
 * the other answer to the same question, so it stands beside it.
 *
 * Everything here is about **this device's copy** and reaches nobody else: the
 * file, the shelf it is remembered on, the subtitles, and how far out of step
 * it is. What is shared is only ever which film is on — see the note at the
 * top of `systems/film`. The controls that belong to *watching* rather than to
 * *choosing* stay on the transport where they can be reached mid-film.
 * ---------------------------------------------------------------------------
 */
function OurFilm({
  mine,
  subs,
  reading,
  readingSubs,
  pickTrouble,
  subTrouble,
  shelf,
  nothingOn,
  onFilm,
  onKeepingFilm,
  onShelved,
  onSubtitles,
  onDropSubtitles,
}: {
  mine: Film | null
  subs: Subtitles | null
  reading: boolean
  readingSubs: boolean
  pickTrouble: string
  subTrouble: string
  shelf: Shelved[]
  nothingOn: boolean
  onFilm(file: File): void
  onKeepingFilm?: () => void
  onShelved(film: Shelved): void
  onSubtitles(file: File): void
  onDropSubtitles(): void
}) {
  return (
    <div className="together-queue film-tab">
      <p className="film-way-note">
        Something you both already have. It stays on your machine — nothing is
        uploaded, nothing is sent, and only the clock is shared. An .mp4 with
        H.264 video and AAC sound plays everywhere.
      </p>

      <FilmPick
        label={nothingOn ? 'choose a film from this device' : 'put on a film from this device'}
        busy={reading}
        onFile={onFilm}
        keeping={onKeepingFilm}
      />
      {pickTrouble !== '' && <p className="film-trouble">{pickTrouble}</p>}

      <FilmShelf films={shelf} busy={reading} onOpen={onShelved} />

      {/*
        Subtitles live here rather than on the transport, and it is the same
        argument as the tab itself: they are a fact about the copy on this
        machine, chosen once and then left alone. The transport is for the
        things you reach for while the film is running.
      */}
      {mine !== null && (
        <div className="film-tab-subs">
          <p className="together-list-label">subtitles</p>
          {subs === null ? (
            <>
              <p className="film-way-note">
                A separate <b>.srt</b> or <b>.vtt</b> beside the film. Yours
                only — {`hers can be a different language, or none at all`}.
              </p>
              <FilmPick
                label="add subtitles"
                busy={readingSubs}
                onFile={onSubtitles}
                takes=".srt,.vtt,.sbv,text/plain"
              />
            </>
          ) : (
            <p className="film-subs">
              <span className="film-subs-name">{subs.name}</span>
              <span className="film-subs-count">{subs.cues.length} lines</span>
              <button type="button" className="film-quiet" onClick={onDropSubtitles}>
                take out
              </button>
            </p>
          )}
          {subTrouble !== '' && <p className="film-trouble">{subTrouble}</p>}
        </div>
      )}
    </div>
  )
}

/** What is lined up, and the one field that finds more. */
function Queue({
  queue,
  theirName,
  nothingOn,
  onHunting,
  onPlayNow,
  onQueue,
  onDrop,
}: {
  queue: Queued[]
  theirName: string
  nothingOn: boolean
  /** Whether the field has the keyboard, so the screen can make room. */
  onHunting(looking: boolean): void
  onPlayNow(videoId: string, title: string): void
  onQueue(item: Queued): void
  onDrop(id: string): void
}) {
  const data = useData()
  const hunt = useWatching((s) => s.hunt)
  const setHunt = useWatching((s) => s.setHunt)
  /*
    Rolled once for this visit. `useState` with an initialiser rather than
    `useMemo`: a memo may legitimately be thrown away and recomputed, and
    suggestions that changed while you were reading them would be worse than
    suggestions that never changed at all.
  */
  const [ideas] = useState(beginnings)
  const [found, setFound] = useState<Found[]>([])
  const [looking, setLooking] = useState(false)
  const [trouble, setTrouble] = useState('')
  const request = useRef<AbortController | null>(null)
  /** So clearing the field can hand the keyboard straight back to it. */
  const field = useRef<HTMLTextAreaElement>(null)

  const pasted = videoIdIn(hunt)

  const findWords = async (words: string) => {
    request.current?.abort()
    const next = new AbortController()
    request.current = next
    setLooking(true)
    setTrouble('')
    try {
      const suggestions = await search(words, next.signal)
      if (!next.signal.aborted) setFound(suggestions)
    } catch (why) {
      if (next.signal.aborted) return
      setTrouble(why instanceof Error ? why.message : String(why))
      setFound([])
    } finally {
      if (request.current === next) {
        request.current = null
        setLooking(false)
      }
    }
  }

  /* Search while the thought is being typed; Enter remains a shortcut, not a requirement. */
  useEffect(() => {
    const words = hunt.trim()
    if (!canSearch || pasted !== null || words.length < 2) {
      request.current?.abort()
      if (words === '' || pasted !== null) setFound([])
      return
    }
    const wait = window.setTimeout(() => { void findWords(words) }, 320)
    return () => window.clearTimeout(wait)
    // `findWords` deliberately reads no render state beyond this search term.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hunt, pasted])

  useEffect(() => () => request.current?.abort(), [])

  async function look() {
    if (pasted !== null) {
      /*
        A link is not a search — nothing has to be asked of anybody, and this
        works with no API key at all.

        The name is looked up anyway, because a queue that reads
        `https://youtu.be/dQw4w9WgXcQ` is a queue nobody can read. oEmbed is
        public and free; if it does not answer, the id is still better than the
        whole URL and the video still plays either way.
      */
      const said = hunt.trim()
      setHunt('')
      setFound([])
      const name = (await titleOf(pasted)) || pasted
      if (nothingOn) onPlayNow(pasted, name)
      else onQueue(queueItem(data.me, { videoId: pasted, title: name }))
      void said
      return
    }
    if (hunt.trim() === '') return
    await findWords(hunt.trim())
  }

  const take = (video: Found, choice: 'now' | 'next') => {
    if (choice === 'now') onPlayNow(video.videoId, video.title)
    else onQueue(queueItem(data.me, { videoId: video.videoId, title: video.title }))
    setFound([])
    setHunt('')
  }

  return (
    <div className="together-queue">
      <div className="together-hunt">
        <Ink
          className="ink together-field"
          value={hunt}
          onChange={setHunt}
          innerRef={field}
          onFocus={() => onHunting(true)}
          onBlur={() => onHunting(false)}
          placeholder={canSearch ? 'a link, or something to look for' : 'paste a YouTube link'}
          label="find something to watch"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void look()
            }
          }}
        />
        {/*
          One press to empty it, and it is not a nicety.

          Clearing a search by holding backspace is fine on a keyboard and
          miserable on a phone, where the alternative to this is thirty taps or
          a select-all most people do not know is there. It appears only when
          there is something to clear, so the field is unadorned the rest of
          the time — and it puts the keyboard back where it was rather than
          dismissing it, because emptying a search is nearly always the start
          of a different one.
        */}
        {hunt !== '' && (
          <button
            type="button"
            className="together-clear"
            aria-label="clear what you are looking for"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              setHunt('')
              field.current?.focus()
            }}
          >
            ×
          </button>
        )}
        <button
          type="button"
          className="together-find"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void look()}
          disabled={hunt.trim() === '' || looking}
        >
          {pasted !== null ? (nothingOn ? 'play' : 'add') : looking ? '…' : 'find'}
        </button>
      </div>


      {trouble !== '' && <p className="together-trouble flat">{trouble}</p>}
      {!canSearch && pasted === null && hunt.trim() !== '' && (
        <p className="together-trouble flat">
          Searching is off — no YouTube key on this build. A pasted link still works.
        </p>
      )}

      {canSearch && hunt.trim() === '' && (
        <div className="together-prompts" aria-label="things to discover">
          <span>begin somewhere</span>
          {ideas.map((idea) => (
            <button type="button" key={idea} onClick={() => setHunt(idea)}>{idea}</button>
          ))}
        </div>
      )}

      {found.length > 0 && (
        <div className="together-discovery">
          <p className="together-list-label">suggestions</p>
          <ul className="together-found">
            {found.map((video) => (
              <li key={video.videoId}>
                {video.thumb !== '' && <img src={video.thumb} alt="" loading="lazy" />}
                <span className="together-found-words">
                  <span className="together-found-title">{video.title}</span>
                  <span className="together-found-who">{video.channel}</span>
                </span>
                <span className="together-found-actions">
                  <button type="button" onClick={() => take(video, 'now')}>play now</button>
                  <button type="button" onClick={() => take(video, 'next')}>{nothingOn ? 'line up' : 'add next'}</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="together-up-next">
        <p className="together-list-label">up next · {queue.length}</p>
        {queue.length === 0 ? (
          <p className="together-none">
            Nothing lined up. Whatever either of you adds plays next.
          </p>
        ) : (
          <ol className="together-lined">
            {queue.map((item) => (
              <li key={item.id}>
                <span className="together-lined-title">{item.title || item.videoId}</span>
                <span className="together-lined-who">
                  {item.by === data.me ? 'you' : theirName}
                </span>
                <button
                  type="button"
                  className="together-drop"
                  onClick={() => onDrop(item.id)}
                  aria-label={`take ${item.title || 'this'} out of the queue`}
                >
                  take out
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
