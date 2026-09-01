/**
 * The words in the Stars.
 *
 * The lights are drawn in the scene (`sections/stars/Conversation`); this is
 * the text hanging on them. DOM rather than geometry, for one reason that
 * matters more than the rest: a conversation is the last thing in this world
 * that should be a picture of words. Here it can be selected, copied, read
 * aloud by a screen reader, and scaled by somebody who has set a larger type
 * size — and it is sharp, which type baked into a WebGL texture at this size
 * is not.
 *
 * No panel, no bubble, no card. Each message is text lying on the sky with the
 * garden's lift shadow under it, which is the design law and is also simply
 * what looks right against a star field. Depth is done with size and opacity
 * rather than perspective maths: the further back in the conversation, the
 * smaller and fainter, until it is only a light with no words left on it.
 *
 * The whole column leans against the pointer, so it sits *in* the sky rather
 * than on the glass in front of it.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import type { Message, UserId } from '@/data/types'
import { useSections } from '@/systems/sections'
import { SECTIONS } from '@/sections/registry'
import { ambience } from '@/systems/ambience'
import { attempt } from '@/systems/trouble'
import { gaze } from '@/systems/pointerLook'
import { useTakenOver } from '@/systems/attention'
import { heartedBy, messageById, toNewest, useTalking, walk } from '@/systems/talking'
import { useSaidGestures } from './Said'
import { shouldTell, tell } from '@/systems/notify'
import { useDismissOutside } from './useDismissOutside'
import { onActivity, useActivity, wakeWorld } from '@/systems/activity'

/** How many messages stay laid out around the one being read. */
const ABOVE = 12
const BELOW = 4

/** Sky between the bottom of one line and the top of the next, in pixels. */
const AIR = 24

/**
 * How far above the newest message each message hangs, measured.
 *
 * ---------------------------------------------------------------------------
 * **This was a constant, and a constant cannot be right.** Every line was
 * pushed up by `age * 74`, which is about the height of one line of serif and
 * a timestamp — true on a laptop, where almost everything she says fits on one
 * line, and false on a phone, where the column is 78% of 390px and the same
 * sentence takes three. The result was two people's messages printed through
 * each other on the primary surface, and it never showed up because every
 * screenshot of the Stars had been taken at 1280 wide.
 *
 * So the spacing is measured from the laid-out lines instead — centre to
 * centre, so the per-frame `scale()` (which is about each element's own
 * middle) cannot move anything. `offsetHeight` is layout and ignores the
 * transforms, so this can be read while the sky is moving.
 * ---------------------------------------------------------------------------
 */
interface Ladder {
  first: number
  up: number[]
}

function ladder(root: HTMLElement): Ladder {
  const measured = Array.from(root.children, (kid) => ({
    age: Number((kid as HTMLElement).dataset.age ?? '0'),
    height: (kid as HTMLElement).offsetHeight,
  })).sort((a, b) => a.age - b.age)

  if (measured.length === 0) return { first: 0, up: [] }
  const up = new Array<number>(measured.length)
  up[0] = 0
  const air = window.innerWidth <= 544 ? 18 : AIR
  for (let i = 1; i < measured.length; i++) {
    up[i] = up[i - 1] + (measured[i - 1].height + measured[i].height) / 2 + air
  }
  return { first: measured[0].age, up }
}

/** The ladder read at a fractional age, because the walk eases between rungs. */
function rung(ladder: Ladder, age: number): number {
  const { first, up } = ladder
  const local = age - first
  if (up.length === 0) return local * (AIR + 44)
  const last = up.length - 1
  if (local <= 0) return up[0] + local * (up.length > 1 ? up[1] - up[0] : AIR + 44)
  if (local >= last) {
    return up[last] + (local - last) * (last > 0 ? up[last] - up[last - 1] : AIR + 44)
  }
  const low = Math.floor(local)
  return up[low] + (up[low + 1] - up[low]) * (local - low)
}

function spoken(at: number): string {
  const d = new Date(at)
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  // The date only when it is not today. Most of a conversation happens on the
  // day you are reading it, and "AUG 22" nine times down a column is furniture.
  if (d.toDateString() === new Date().toDateString()) return time
  const day = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return `${day} · ${time}`
}

/**
 * Whether this message needs its time written under it.
 *
 * Only when it says something you did not already know: the first one, a new
 * day, or a real gap since the last. Six identical stamps down a column is
 * noise, and noise is the thing this place has least room for — you are
 * looking at a sky.
 */
const A_WHILE = 20 * 60 * 1000

function marksTime(at: number, previous: number | null): boolean {
  if (previous === null) return true
  if (at - previous > A_WHILE) return true
  return new Date(at).toDateString() !== new Date(previous).toDateString()
}

/**
 * Whether the Stars is the place currently open.
 *
 * The overlay is mounted for the whole world, so it has to ask — the section
 * registry is the only thing that knows which index the Stars ended up at, and
 * hard-coding 3 here would break the moment a section is added before it.
 */
function useInTheStars(): boolean {
  // The place on screen, not the one being travelled to — see the note on
  // `shown` in `systems/sections`. Anything drawing the inside of a place has
  // to arrive on the same frame the place does.
  const { entered, section: index } = useSections((s) => s.shown)
  const takenOver = useTakenOver()
  return entered && !takenOver && SECTIONS[index]?.id === 'stars'
}

/**
 * One line in the sky.
 *
 * Its own component so the gesture handlers have somewhere to live — see
 * `ui/Said`. There is nothing drawn on it that you could press: the paragraph
 * *is* the control, and what is visible is only ever what has happened to it.
 */
function Said({
  message,
  age,
  mine,
  answering,
  when,
  me,
  delivery,
  onOpenReply,
}: {
  message: Message
  age: number
  mine: boolean
  answering: Message | null
  when: string | null
  me: UserId
  delivery: 'sending' | 'failed' | null
  onOpenReply(id: string): void
}) {
  const gestures = useSaidGestures(message)
  const yours = heartedBy(message, me)
  const hers = heartedBy(message, me === 'warm' ? 'cool' : 'warm')

  return (
    <p
      data-age={age}
      data-by={mine ? 'me' : 'them'}
      className={`said ${mine ? 'mine' : 'hers'}`}
      {...gestures}
    >
      {/*
        What it answers, above it.

        The words rather than a marker, because a reply that says "in reply to"
        and nothing else is asking you to go and find the thing — and the whole
        reason to quote is that the thing may be a long way up the sky by now.
        Truncated by CSS, not here: the full text stays in the document for
        anything reading it aloud.
      */}
      {message.replyTo &&
        (answering ? (
          <button
            type="button"
            className="said-answering"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onOpenReply(answering.id)
            }}
            aria-label={`go to the message: ${answering.body}`}
          >
            {answering.body}
          </button>
        ) : (
          <span className="said-answering gone">something said a long time ago</span>
        ))}

      <span className="said-body">{message.body}</span>

      {/* State, not controls. A heart that is on is a fact about the message
          now, in the colour of whoever left it. */}
      {(yours || hers) && (
        <span className="said-hearts" aria-label="hearted">
          {yours && <i className="mine" aria-hidden="true">♥</i>}
          {hers && <i className="hers" aria-hidden="true">♥</i>}
        </span>
      )}

      {when && <span className="said-when">{when}</span>}
      {delivery && (
        <span className={`said-delivery ${delivery}`}>
          {delivery === 'failed' ? 'not sent' : 'sending'}
        </span>
      )}
    </p>
  )
}

export function Talking() {
  const here = useInTheStars()
  const data = useData()
  const me = data.me
  const messages = useTalking((s) => s.messages)
  const optimistic = useTalking((s) => s.optimistic)
  const failed = useTalking((s) => s.failed)
  const loading = useTalking((s) => s.loading)
  const composing = useTalking((s) => s.composing)
  const startWriting = useTalking((s) => s.startWriting)
  const stopWriting = useTalking((s) => s.stopWriting)
  const replyTo = useTalking((s) => s.replyTo)
  const answer = useTalking((s) => s.answer)
  const profiles = useWorldSlice((s) => s.profiles)
  const lastReadAt = useWorldSlice((s) => s.lastReadAt)
  const idle = useActivity((s) => s.idle)

  const them = profiles[me === 'warm' ? 'cool' : 'warm']

  // --- the feed -------------------------------------------------------------
  useEffect(() => data.watchMessages((m) => useTalking.getState().setMessages(m)), [data])

  /*
    Being here is what "read" means.

    Not scrolling past, not receiving — being in the Stars with it on screen.
    It is the only claim the garden can make about it that is actually true,
    and the honesty law says make only those.
  */
  useEffect(() => {
    if (!here) return
    void data.markMessagesRead()
  }, [here, data, messages.length])

  const [viewAge, setViewAgeState] = useState(0)
  const viewAgeRef = useRef(0)
  const [awayFromNewest, setAwayFromNewest] = useState(false)
  const awayRef = useRef(false)

  const showAge = (age: number) => {
    const furthest = Math.max(0, messages.length - 1)
    const next = Math.max(0, Math.min(furthest, age))
    viewAgeRef.current = next
    setViewAgeState(next)
  }

  const showAway = (away: boolean) => {
    if (awayRef.current === away) return
    awayRef.current = away
    setAwayFromNewest(away)
  }

  const goNewest = () => {
    toNewest()
    showAge(0)
    showAway(false)
    wakeWorld()
  }

  useEffect(() => {
    if (here) goNewest()
    // `messages.length` deliberately does not belong here: an arriving line
    // must not drag somebody away from the history they are currently reading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here])

  /*
    Something arriving makes a sound, and sometimes a notification.

    Keyed off the newest message's *id* rather than the count, because the
    count also moves when an old message is hearted and re-sent down the
    snapshot — and a heart on something from last week is not a new message.

    The ref starts at whatever is already there rather than at null, so opening
    the garden to a conversation with forty things in it does not announce the
    fortieth as though it had just been said. There is exactly one moment this
    should fire: while you are here, and something lands.
  */
  const heard = useRef<string | null>(null)
  useEffect(() => {
    const newest = messages.at(-1)
    if (!newest) return
    const first = heard.current === null
    if (heard.current === newest.id) return
    heard.current = newest.id
    if (first || newest.by === me) return

    // Network activity has no pointer event to wake the visual governor. Let
    // the arriving line and its light move at the active cadence for a moment.
    wakeWorld()
    ambience.said(false)
    if (shouldTell(here)) tell(them.name, newest.body)
  }, [messages, me, here, them.name])

  /*
    A new line must not move the sentence currently under your finger.

    Ages are counted from the newest message, so appending one makes every
    existing age one larger. Shift the walk by that exact amount while history
    is open; at the bottom, the ordinary incoming-message motion is wanted.
  */
  const previousNewest = useRef<string | null>(null)
  useEffect(() => {
    const newest = messages.at(-1)
    const previous = previousNewest.current
    previousNewest.current = newest?.id ?? null
    if (!previous || !awayRef.current) return
    const oldHead = messages.findIndex((message) => message.id === previous)
    if (oldHead < 0) return
    const added = messages.length - 1 - oldHead
    if (added <= 0) return
    walk.at += added
    walk.to += added
    showAge(viewAgeRef.current + added)
  }, [messages])

  // --- walking back ---------------------------------------------------------
  const surface = useRef<HTMLDivElement>(null)
  const column = useRef<HTMLDivElement>(null)

  const moveWalk = (amount: number) => {
    const furthest = Math.max(0, messages.length - 1)
    walk.to = Math.max(0, Math.min(furthest, walk.to + amount))
    if (Math.abs(walk.to - viewAgeRef.current) >= 2) showAge(Math.round(walk.to))
    showAway(walk.to > 1.1)
    wakeWorld()
  }

  useEffect(() => {
    if (!here) return
    const root = surface.current
    if (!root) return

    const onWheel = (e: WheelEvent) => {
      // Down through the wheel is back through time, the way a scrollback goes.
      e.preventDefault()
      moveWalk(e.deltaY * 0.009)
    }

    let dragging = false
    let lastY = 0
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement)?.closest('button, input, textarea, a')) return
      dragging = true
      lastY = e.clientY
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      const dy = e.clientY - lastY
      lastY = e.clientY
      // Dragging down pulls the older messages toward you, the way dragging a
      // sheet of paper moves the paper.
      moveWalk(dy * 0.027)
    }
    const up = () => {
      dragging = false
    }

    root.addEventListener('wheel', onWheel, { passive: false })
    root.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    return () => {
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
    }
  }, [here, messages.length])

  /*
    Per frame, and never through React.

    Every line's size, opacity and offset changes continuously as the sky is
    walked through. Rendering that from state would be a re-render per frame of
    a list — the exact thing the technical law is about. So React puts the
    lines in the document once and this writes their styles directly.
  */
  useEffect(() => {
    if (!here) return
    let raf = 0
    let laneTop = -Infinity
    let laneBottom = Infinity
    let heights: number[] = []
    let columnTop = 0
    // Measured once a layout, not once a frame: reading `offsetHeight` sixty
    // times a second for every line is a forced reflow per line per frame.
    let up: Ladder = { first: 0, up: [] }
    let start = () => {}
    const remeasure = () => {
      if (column.current) {
        up = ladder(column.current)
        heights = Array.from(column.current.children, (kid) => (kid as HTMLElement).offsetHeight)
      }

      /*
        A phone has two pieces of furniture the desktop sky does not have to
        negotiate: the way out plus music above, and writing plus voice-lights
        below. Their heights are not constants (safe areas, an opened player,
        and the composer all change them), so measure the real controls and
        make the conversation live between them.

        This is intentionally only a narrow-screen rule. On desktop those
        controls sit in corners and the wide conversation never meets them.
      */
      if (window.innerWidth <= 544) {
        const leave = document.querySelector<HTMLElement>('.leave-place')
        const openPlayer = document.querySelector<HTMLElement>('.corner:not(.tucked) .player.open')
        const writer = document.querySelector<HTMLElement>('.start-saying, .saying')
        const visibleBox = (element: HTMLElement | null) => {
          if (!element) return null
          const box = element.getBoundingClientRect()
          return box.width > 0 && box.height > 0 ? box : null
        }
        const leaveBox = visibleBox(leave)
        const playerBox = visibleBox(openPlayer)
        const writerBox = visibleBox(writer)
        const viewportBottom = window.visualViewport
          ? window.visualViewport.offsetTop + window.visualViewport.height
          : window.innerHeight
        laneTop = Math.max(
          0,
          leaveBox?.bottom ?? 0,
          playerBox?.bottom ?? 0,
        ) + 10
        laneBottom = Math.min(
          viewportBottom,
          writerBox?.top ?? window.innerHeight,
        ) - 10

        /*
          The read head belongs beside the composer, not at a percentage of a
          phone whose usable height changes whenever its keyboard does. The
          currently read message gets a calm thirty-pixel breath above the
          writing control; older lines use every real pixel above it.
        */
        if (column.current) {
          const newest = Array.from(column.current.children).find(
            (kid) => Number((kid as HTMLElement).dataset.age) === Math.round(walk.at),
          ) as HTMLElement | undefined
          const headHeight = newest?.offsetHeight ?? 54
          const wanted = laneBottom - headHeight - 28
          column.current.style.top = `${Math.max(laneTop + 18, wanted)}px`
        }
      } else {
        laneTop = -Infinity
        laneBottom = Infinity
        if (column.current) column.current.style.top = ''
      }
      if (column.current) columnTop = column.current.getBoundingClientRect().top
      start()
    }
    // A rotated phone, a font that arrived late, or a quote that wrapped
    // differently all change the rungs; the observer catches all three.
    const watch = new ResizeObserver(remeasure)
    if (column.current) {
      watch.observe(column.current)
      for (const kid of column.current.children) watch.observe(kid)
    }
    for (const control of document.querySelectorAll<HTMLElement>(
      '.leave-place, .player, .start-saying, .saying',
    )) {
      watch.observe(control)
    }
    const classes = new MutationObserver(remeasure)
    for (const control of document.querySelectorAll<HTMLElement>('.corner, .player')) {
      classes.observe(control, { attributes: true, attributeFilter: ['class'] })
    }

    let lastFrame = 0
    let settledFrames = 0
    let previousWalk = Number.NaN
    let previousYaw = Number.NaN
    let previousPitch = Number.NaN
    start = () => {
      if (raf === 0) raf = requestAnimationFrame(tick)
    }
    const tick = (now: number) => {
      raf = 0
      // During a quiet reading spell, match the Canvas's low cadence. Once the
      // walk and gaze have truly settled, stop altogether; the next input
      // wakes it through the shared imperative activity signal.
      if (idle && now - lastFrame < 1000 / 12) {
        start()
        return
      }
      lastFrame = now
      const root = column.current
      if (!root) return

      const head = rung(up, walk.at)
      const lines = root.children
      for (let i = 0; i < lines.length; i++) {
        const el = lines[i] as HTMLElement
        const own = Number(el.dataset.age ?? '0')
        const age = own - walk.at
        /*
          Which side of the column it sits on.

          Colour alone was not enough. Warm cream and cool blue-white are
          plainly different on a dark sky and nearly identical against her
          dawn, which is exactly where the newest messages hang — so the one
          cue was failing in the one place it mattered. A lean reads instantly
          at any brightness and still needs no bubble.

          Proportional to the window, not a fixed forty pixels: the column is
          already 78% of a narrow screen, and a fixed lean pushed the longest
          lines straight off the right-hand edge of a phone.
        */
        const lean = Math.min(44, window.innerWidth * 0.055)
        const side = el.dataset.by === 'me' ? lean : -lean

        // Above the head is the past, below it is the newest few. The distance
        // is the measured one, so a three-line message takes three lines of
        // sky and the one above it starts where it ends.
        const lift = -(rung(up, own) - head)
        const shrink = Math.max(0.42, 1 - Math.max(0, age) * 0.055)
        let fade =
          age < -0.9
            ? // Below the read head is the future you have scrolled away from.
              // It has to be gone before it reaches the composer, or a ghost
              // line sits on top of the invitation to write the next one.
              Math.max(0, 1 + (age + 0.9) * 2.2)
            : Math.max(0, 1 - Math.max(0, age - 4.5) / 4)

        /*
          Fade at the reading lane, not at the viewport.

          The old column happily kept drawing through the music, the back
          control, the voice-light beacon and the composer. Hiding overflow is
          impossible here because the column itself has no height—its children
          are absolutely positioned—so the honest boundary belongs in the
          same frame calculation that places those children. A full line is
          considered, not merely its centre, which keeps even a three-line
          message out of the controls.
        */
        if (Number.isFinite(laneTop) && Number.isFinite(laneBottom)) {
          const height = heights[i] ?? 0
          const centre = columnTop + lift + gaze.pitch * 90 + height / 2
          const half = height * shrink / 2
          const intoTop = Math.max(0, Math.min(1, (centre - half - laneTop) / 30))
          const intoBottom = Math.max(0, Math.min(1, (laneBottom - centre - half) / 30))
          fade *= Math.min(intoTop, intoBottom)
        }

        el.style.transform =
          `translate3d(${side + gaze.yaw * -150 + Math.sin(own * 1.7) * 6}px,` +
          ` ${lift + gaze.pitch * 90}px, 0) scale(${shrink})`
        el.style.opacity = String(fade)
        // Once a line is faint enough to be unreadable it must also stop
        // catching the pointer, or the newest message sits under a stack of
        // invisible ones.
        el.style.pointerEvents = fade > 0.5 ? 'auto' : 'none'
      }

      const still =
        Math.abs(walk.at - previousWalk) < 0.0002 &&
        Math.abs(gaze.yaw - previousYaw) < 0.0002 &&
        Math.abs(gaze.pitch - previousPitch) < 0.0002
      previousWalk = walk.at
      previousYaw = gaze.yaw
      previousPitch = gaze.pitch
      settledFrames = still ? settledFrames + 1 : 0
      showAway(walk.at > 1.1)
      if (settledFrames < 4) start()
    }
    const viewport = window.visualViewport
    const fitViewport = () => {
      const talking = surface.current
      if (talking && viewport) {
        talking.style.setProperty('--talking-top', `${viewport.offsetTop}px`)
        talking.style.setProperty('--talking-height', `${viewport.height}px`)
      }
      remeasure()
    }
    window.addEventListener('resize', fitViewport)
    viewport?.addEventListener('resize', fitViewport)
    viewport?.addEventListener('scroll', fitViewport)
    const stopListening = onActivity(start)
    fitViewport()
    start()
    return () => {
      cancelAnimationFrame(raf)
      stopListening()
      watch.disconnect()
      classes.disconnect()
      window.removeEventListener('resize', fitViewport)
      viewport?.removeEventListener('resize', fitViewport)
      viewport?.removeEventListener('scroll', fitViewport)
    }
  }, [here, messages, composing, idle, viewAge])

  // --- writing --------------------------------------------------------------
  const [draft, setDraft] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const composer = useRef<HTMLDivElement>(null)

  // The draft lives above the conditional render, so folding the composer
  // does not throw away an unfinished message.
  useDismissOutside(here && composing, stopWriting, [composer], { allowOutsideDrag: true })

  useEffect(() => {
    if (composing) field.current?.focus()
  }, [composing])

  useEffect(() => {
    if (!here && composing) stopWriting()
  }, [here, composing, stopWriting])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!here) return
      if (e.key === 'Escape' && composing) {
        stopWriting()
        return
      }
      // Anything typed with nothing else focused opens the composer and keeps
      // the character — you should be able to just start saying something.
      if (
        !composing &&
        e.key.length === 1 &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !(e.target as HTMLElement)?.closest('input, textarea')
      ) {
        setDraft((d) => d + e.key)
        startWriting()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [here, composing, startWriting, stopWriting])

  const write = (next: string) => {
    const grew = next.length - draft.length
    if (grew === 1) ambience.nib(0.4 + Math.random() * 0.25)
    else if (grew > 1) ambience.nib(0.85)
    else if (grew < 0) ambience.nib(0.35, true)
    setDraft(next)
  }

  async function say() {
    const text = draft.trim()
    if (text === '') return
    const outgoing = {
      id: `said-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
      at: Date.now(),
    }
    const message: Message = {
      ...outgoing,
      by: me,
      body: text,
      ...(replyTo ? { replyTo } : {}),
    }
    useTalking.getState().queue(message)
    setDraft('')
    if (replyTo !== null) answer(null)
    goNewest()
    ambience.said(true)
    field.current?.focus()
    const sent = await attempt('that didn’t send', () =>
      data.sendMessage(text, message.replyTo, outgoing),
    )
    if (!sent) useTalking.getState().fail(outgoing.id)
    /*
      The reply is answered, but the composer stays open.

      This used to call `stopWriting()`, which unmounts the field — and on a
      phone unmounting the field is what puts the keyboard away. So every
      single message ended with the keyboard sliding down and the whole column
      jumping up to fill the space it left, and saying two things in a row
      meant tapping back in and waiting for it to come up again. That is not
      how texting anybody works.

      Nothing about sending means you are finished. The ways out are the ways
      out of everything else here: tap somewhere else, or press escape. Both
      already exist a few lines up.
    */
    // Belt and braces: nothing above blurs the field, but if anything ever
    // does, the cursor belongs back where you were typing.
    field.current?.focus()
  }

  const lines = useMemo(() => {
    const newest = messages.length - 1
    const low = Math.max(0, Math.floor(viewAge) - BELOW)
    const high = Math.min(messages.length - 1, Math.ceil(viewAge) + ABOVE)
    return messages
      .map((m, i) => ({
        m,
        age: newest - i,
        stamped: marksTime(m.at, i > 0 ? messages[i - 1].at : null),
        // Resolved against the same list it is drawn from, so a quote can
        // never show words that are not in this conversation.
        answering: messageById(messages, m.replyTo ?? null),
      }))
      .filter(({ age }) => age >= low && age <= high)
  }, [messages, viewAge])

  const openReply = (id: string) => {
    const index = messages.findIndex((message) => message.id === id)
    if (index < 0) return
    const age = messages.length - 1 - index
    const distance = age - walk.at
    walk.to = age
    // A distant quote crosses the sky in four visible rungs rather than
    // making somebody wait through hundreds of invisible messages.
    if (Math.abs(distance) > 5) walk.at = age - Math.sign(distance) * 4
    showAge(age)
    showAway(age > 1.1)
    wakeWorld()
  }

  const answeringNow = useMemo(
    () => messageById(messages, replyTo),
    [messages, replyTo],
  )

  /** Hers, said since the last time you were here. */
  const unread = useMemo(
    () => messages.filter((m) => m.by !== me && m.at > (lastReadAt?.[me] ?? 0)).length,
    [messages, me, lastReadAt],
  )

  if (!here) return null

  return (
    <div className="talking" ref={surface}>
      <div className="sky-column" ref={column}>
        {lines.map(({ m, age, stamped, answering }) => (
          <Said
            key={m.id}
            message={m}
            age={age}
            mine={m.by === me}
            answering={answering}
            when={stamped ? spoken(m.at) : null}
            me={me}
            delivery={failed[m.id] ? 'failed' : optimistic[m.id] ? 'sending' : null}
            onOpenReply={openReply}
          />
        ))}
      </div>

      {awayFromNewest && (
        <button
          type="button"
          className="talking-newest"
          onClick={goNewest}
          aria-label="return to the newest message"
        >
          <span aria-hidden="true" />
        </button>
      )}

      {messages.length === 0 && !loading && (
        <p className="sky-empty">
          Nothing here yet. Whatever you say first will be the lowest light in
          the sky.
        </p>
      )}

      {composing ? (
        <div ref={composer} className="saying">
          {/*
            What you are answering, over the field you are answering it in.

            Without this the reply target is invisible the moment the composer
            opens — you press "answer this" on a line eight messages up, the
            column scrolls to the newest, and there is nothing on screen saying
            which one you picked. A quote you cannot see is a quote you have to
            remember, and this is a place for saying things at two in the
            morning.
          */}
          {answeringNow && (
            <p className="saying-answering">
              <span className="saying-quote">{answeringNow.body}</span>
              <button
                type="button"
                className="saying-drop"
                onClick={() => answer(null)}
              >
                not that one
              </button>
            </p>
          )}
          {/*
            The field and the way out of it, side by side.

            No placeholder. It said "say something to Tife" in the middle of an
            otherwise empty sky, which is a label on a thing that is already
            obviously a place to type — you opened it on purpose — and it was
            the only sentence on screen while you were deciding what to say.
            The empty line is better company.

            The send is a light rather than a labelled button: dark while there
            is nothing to send, warm the moment there is, which is the same
            language the rest of the garden uses for "this is live now". It is
            beside the field for the ordinary reason — it is where a thumb
            already is at the end of a sentence.
          */}
          <div className="saying-row">
            <textarea
              ref={field}
              className="saying-field ink"
              value={draft}
              onChange={(e) => write(e.target.value)}
              rows={1}
              aria-label={`say something to ${them.name}`}
              /* Return belongs to the message now; the visible light is the
                  only send action. Plain text semantics also keep mobile
                  keyboards out of form-navigation and autofill modes. */
              inputMode="text"
              enterKeyHint="enter"
              autoComplete="off"
              autoCapitalize="sentences"
              autoCorrect="on"
              spellCheck
              data-form-type="other"
            />
            <button
              type="button"
              className="saying-send"
              disabled={draft.trim() === ''}
              aria-label={`send this to ${them.name}`}
              /*
                The field must not lose the cursor on the way to the button, or
                a phone puts the keyboard away between finishing a sentence and
                sending it — which is the exact thing that was just fixed.
              */
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => void say()}
            >
              <span aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="start-saying" onClick={startWriting}>
          {/*
            Only when there is something to say.

            The hint used to carry a standing line — "one light each, for as
            long as you like" — under the invitation at all times, which meant
            two rows of furniture permanently parked under the newest message
            in the emptiest, quietest place in the garden. It was a nice
            sentence about the place and it was in the way of the conversation
            the place is for. What is left is the one case where the line is
            *news*: how much of hers you have not read.
          */}
          {unread > 0 && (
            <span className="start-saying-hint">
              {unread} from {them.name}, since you were last here
            </span>
          )}
          <span className="start-saying-name">say something</span>
        </button>
      )}
    </div>
  )
}
