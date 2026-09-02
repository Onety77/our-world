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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useReportTyping, useTheyAreTyping } from '@/systems/useTyping'
import { writingLine } from '@/systems/typing'
import { createPortal } from 'react-dom'
import { useData, useWorldSlice } from '@/data/provider'
import { useSay } from '@/systems/useSay'
import type { Queued, ScreenLine } from '@/data/types'
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
import { Ink } from './Ink'
import { gainOf, useVolume } from '@/systems/volume'

/** How often the two screens are compared. See `DRIFT` for why not per frame. */
const CHECK_MS = 900

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
    void makeScreen(
      host,
      { videoId: anchor.videoId, at: positionOf(anchor, data.now()), playing: anchor.playing },
      (state: number) => {
        if (state === PLAYING || state === PAUSED) setTrouble('')
        if (state === ENDED && !applying.current) void onEnded()
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
    // Built once for the life of a session. Rebuilding it on any other change
    // is the thing the note at the top of this file is about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live])

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
      const anchor = useWatching.getState().shared
      if (anchor.videoId === null) return

      const want = positionOf(anchor, data.now())
      const at = player.where()
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
      if (how === 'seek') player.seek(want)
      player.rate(how === 'drift' ? rate : 1)

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

  const playPause = () => {
    const player = screen.current
    const at = player ? player.where() : positionOf(shared, data.now())
    move({ ...shared, playing: !shared.playing, at })
    setJoined(true)
  }

  const skip = () => void onEnded()

  const goTo = (seconds: number) => {
    screen.current?.seek(seconds)
    move({ ...shared, at: Math.max(0, seconds) })
  }

  const fold = () => {
    setMiniControls(false)
    tuck()
  }

  const endSession = () => {
    screen.current?.pause()
    setTrouble('')
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
    if (!held?.moved || held.id !== event.pointerId) return
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
  const through = span > 0 ? Math.max(0, Math.min(1, shown / span)) : 0

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
      className={`together ${open ? 'full' : 'tucked'}${miniControls ? ' mini-awake' : ''}${!open && spot !== null ? ' placed' : ''}${overGround ? ' over-ground' : ''}`}
      onPointerDown={onPaneDown}
      onPointerMove={onPaneMove}
      onPointerUp={onPaneUp}
      onPointerCancel={onPaneUp}
    >
      {open && (
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
      <div
        className={`together-screen${live ? '' : ' dark'}${trouble ? ' has-trouble' : ''}${!open && spot !== null ? ' placed' : ''}`}
        onPointerDown={onPaneDown}
        onPointerMove={onPaneMove}
        onPointerUp={onPaneUp}
        onPointerCancel={onPaneUp}
      >
        <div ref={stage} className="together-stage" />
        {!live && open && (
          <div className="together-nothing">
            <span className="together-empty-mark" aria-hidden="true">◇</span>
            <p>Nothing on yet.</p>
            <small>Find the first thing below, or bring a YouTube link.</small>
          </div>
        )}
        {!open && (
          <>
            <button
              type="button"
              className="together-mini-reveal"
              onClick={() => setMiniControls((shown) => !shown)}
              aria-expanded={miniControls}
              aria-label="show miniature screen controls"
            />
            <div className="together-mini-actions">
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
        {open && !joined && trouble === '' && (
          <button type="button" className="together-join" onClick={playPause}>
            tap to join {them.name} here
          </button>
        )}
      </div>

      {open && (
        <aside className="together-room" aria-label="shared screen controls">
          <Transport
            live={live}
            onStop={endSession}
            playing={shared.playing}
            through={through}
            shown={shown}
            span={span}
            hasNext={shared.queue.length > 0}
            movedBy={shared.by === me ? 'you' : them.name}
            title={shared.title}
            onPlayPause={playPause}
            onSkip={skip}
            onSeek={goTo}
            onTuck={fold}
          />

          <div className="together-tabs" role="tablist" aria-label="beside the screen">
            {(['talk', 'queue'] as const).map((which) => (
              <button
                key={which}
                type="button"
                role="tab"
                aria-selected={tab === which}
                className={`together-tab${tab === which ? ' on' : ''}`}
                onClick={() => setTab(which)}
              >
                {which === 'talk' ? 'talk' : `find & queue${shared.queue.length > 0 ? ` · ${shared.queue.length}` : ''}`}
              </button>
            ))}
          </div>

          {tab === 'talk' ? (
            <Talk session={shared.session} theirName={them.name} />
          ) : (
            <Queue
              queue={shared.queue}
              theirName={them.name}
              nothingOn={shared.videoId === null}
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
 * The controls, which are a line of light and three marks.
 *
 * No rounded rectangle, no filled bar, no chrome — the beam under the corner
 * player already says "how far through this is" in this world's language, and a
 * second visual language for the same fact would be two answers to one question.
 */
function Transport({
  live,
  onStop,
  playing,
  through,
  shown,
  span,
  hasNext,
  movedBy,
  title,
  onPlayPause,
  onSkip,
  onSeek,
  onTuck,
}: {
  live: boolean
  onStop(): void
  playing: boolean
  through: number
  shown: number
  span: number
  hasNext: boolean
  movedBy: string
  title: string
  onPlayPause(): void
  onSkip(): void
  onSeek(seconds: number): void
  onTuck(): void
}) {
  const beam = useRef<HTMLDivElement>(null)

  const scrubTo = (clientX: number) => {
    const box = beam.current?.getBoundingClientRect()
    if (!box || box.width === 0 || span <= 0) return
    onSeek(((clientX - box.left) / box.width) * span)
  }

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

      <div
        ref={beam}
        className="together-beamline"
        role="slider"
        tabIndex={0}
        aria-label="how far through"
        aria-valuemin={0}
        aria-valuemax={Math.round(span)}
        aria-valuenow={Math.round(shown)}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          scrubTo(event.clientX)
        }}
        onPointerMove={(event) => {
          if (event.buttons === 0) return
          scrubTo(event.clientX)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') onSeek(Math.max(0, shown - 5))
          if (event.key === 'ArrowRight') onSeek(shown + 5)
        }}
      >
        <span className="together-beam" style={{ transform: `scaleX(${through})` }} />
        {/*
          Where you are, as a thing you can take hold of.

          A one-pixel beam says how far through you are and gives a thumb
          nothing to aim at — you can drag it, but only by trusting that the
          line is draggable, and you cannot see the point you are dragging. The
          mark is both halves of that: it reads the position at a glance and it
          is the handle. Left on `pointer-events: none` so it never eats the
          gesture belonging to the line underneath it.
        */}
        <span className="together-hold" style={{ left: `${through * 100}%` }} aria-hidden="true" />
      </div>

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
function Talk({ session, theirName }: { session: string; theirName: string }) {
  const data = useData()
  const me = data.me
  /** `say` is taken here — this one turns {her} into her name. */
  const inWords = useSay()
  const [draft, setDraft] = useState('')
  const [said, setSaid] = useState<ScreenLine[]>([])
  const feed = useRef<HTMLDivElement>(null)
  /*
    Gated on there being a sitting, because the field is disabled without one
    and a disabled field cannot be typed into — so reporting from here with no
    screen on would be reporting a draft nobody can add to.
  */
  useReportTyping(draft, session !== '')

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

  useEffect(() => {
    const conversation = feed.current
    if (conversation) conversation.scrollTop = conversation.scrollHeight
  }, [said.length])

  async function say() {
    const text = draft.trim()
    if (text === '' || session === '') return
    const line: ScreenLine = {
      id: `said-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
      by: me,
      body: text,
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
    setDraft('')
    ambience.said(true)
    const sent = await attempt(inWords('that didn’t reach {her} screen'), () =>
      data.sayOnScreen(session, line),
    )
    if (!sent) setSaid((was) => was.filter((l) => l.id !== line.id))
  }

  const writing = useTheyAreTyping()

  const shown = useMemo(() => {
    // The optimistic copy and the one off the wire are the same line.
    const byId = new Map<string, ScreenLine>()
    for (const line of said) byId.set(line.id, line)
    return [...byId.values()].sort((a, b) => a.at - b.at).slice(-60)
  }, [said])

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
      {/*
        Under the last thing said, above the field — where the next line will
        appear, which is the only place it means anything.

        A plain sentence rather than the three bouncing dots, because this room
        already has words in it and a room with words in it does not need a
        second vocabulary. The dots are also somebody else's house style; the
        garden says things.
      */}
      {writing && <p className="together-writing">{writingLine(theirName)}</p>}
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
  )
}

/** What is lined up, and the one field that finds more. */
function Queue({
  queue,
  theirName,
  nothingOn,
  onPlayNow,
  onQueue,
  onDrop,
}: {
  queue: Queued[]
  theirName: string
  nothingOn: boolean
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
          placeholder={canSearch ? 'a link, or something to look for' : 'paste a YouTube link'}
          label="find something to watch"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void look()
            }
          }}
        />
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
