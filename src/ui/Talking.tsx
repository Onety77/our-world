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
import { useReportTyping, useTheyAreTyping } from '@/systems/useTyping'
import { writingLine } from '@/systems/typing'
import { useData, useWorldSlice } from '@/data/provider'
import type { Message, UserId } from '@/data/types'
import { useSections } from '@/systems/sections'
import { SECTIONS } from '@/sections/registry'
import { ambience } from '@/systems/ambience'
import { attempt } from '@/systems/trouble'
import { gaze } from '@/systems/pointerLook'
import { useTakenOver } from '@/systems/attention'
import { HEART, markBy, messageById, toNewest, useTalking, walk } from '@/systems/talking'
import { useSaidGestures } from './Said'
import { Ink } from './Ink'
import { shouldTell, tell } from '@/systems/notify'
import { useDismissOutside } from './useDismissOutside'
import { onActivity, useActivity, wakeWorld } from '@/systems/activity'

/** How many messages stay laid out around the one being read. */
const ABOVE = 12
const BELOW = 4

/** Sky between the bottom of one line and the top of the next, in pixels. */
const AIR = 24

/**
 * How far a line takes to disappear as it reaches the edge of the lane, in px.
 *
 * About one line of text, on purpose: less and it is a hard crop, more and a
 * whole paragraph is half-lit and none of it is properly readable. At this
 * width it reads as the words passing behind the controls.
 */
const LINE_FADE = 26

/**
 * The fastest a flick may leave the sky moving, in pixels a second, and how
 * quickly that dies away.
 *
 * The cap is about two screens a second — fast enough that a hard flick
 * genuinely covers ground, slow enough that the words never become a blur you
 * have to wait out. The decay is gentle: the complaint about the old scrolling
 * was that it arrived before you had finished asking, and a glide that stops
 * dead has the same problem at the other end.
 */
const MAX_GLIDE = 2600
const GLIDE_DECAY = 3.1

/**
 * How much smaller a line is drawn, given how far above the read head it is.
 *
 * One function because two places need the same answer *in the same frame* —
 * the spacing and the drawing. They used to disagree, and everything below is
 * about why that mattered.
 */
function shrinkOf(above: number): number {
  return Math.max(0.42, 1 - Math.max(0, above) * 0.055)
}

/**
 * Every line's position, rebuilt each frame from what is actually drawn.
 *
 * ---------------------------------------------------------------------------
 * **The spacing was measured once and the drawing was scaled every frame, and
 * those two facts never met.** The ladder put line centres `(h₁ + h₂)/2 + air`
 * apart using the heights the browser had laid out; the frame loop then drew
 * each line at `scale(shrink)` about its own centre. So the gap you could
 * actually see was `air + (h₁(1−s₁) + h₂(1−s₂))/2` — a number that grows with
 * the height of its neighbours and with how far back they are. Measured down
 * one real phone-width conversation, the gaps came out:
 *
 *     10 · 12 · 22 · 24 · 25 · 29 · 35 · 45 · 45 · 48 · 52 · 80 px
 *
 * — which is not a rhythm, it is noise, and it is what "the whole thing just
 * doesn't have order" means. A tall message got a big hole beside it and two
 * short ones ended up almost touching.
 *
 * It was also *stale*: the measurement was taken on one layout and reused
 * across others, so the numbers were not even consistently wrong.
 *
 * So the ladder is built here, per frame, from the heights the lines really
 * have and the scales they are really about to be drawn at — and it stacks
 * **edge to edge** rather than centre to centre. The gap between any two lines
 * is then exactly what this function put there, at every scale, always.
 *
 * `air` is scaled with the lines it sits between rather than held constant:
 * a fixed 18px between two lines drawn at 45% would be a bigger hole than the
 * text is tall. Proportional air is what makes a receding column read as one
 * thing seen from further away instead of a list that has been squashed.
 * ---------------------------------------------------------------------------
 */
interface Ladder {
  /** The smallest age present; `up[0]` belongs to it. */
  first: number
  /** How far above the anchor each line's *drawn top* sits, in pixels. */
  up: number[]
}

const FALLBACK_RUNG = AIR + 44

/**
 * Stacked by drawn edges, which makes the arithmetic trivial and exact.
 *
 * Every line is absolutely positioned at the same anchor and moved by its own
 * transform, so what `up` holds is simply "how far above the anchor this line's
 * top is". Line *i* has to end one `air` above line *i−1* begins, so its top is
 * its own drawn height further up again — and that is the whole rule:
 *
 *     up[i] = up[i − 1] + air + drawn height of i
 *
 * The gap between any two neighbours is then `air` by construction, whatever
 * they are made of and however far back they have receded. Nothing to tune, and
 * nothing that can drift apart from the drawing, because the drawing reads the
 * same two numbers.
 */
function buildLadder(ages: number[], heights: number[], head: number, air: number): Ladder {
  const count = ages.length
  if (count === 0) return { first: 0, up: [] }
  const up = new Array<number>(count)
  up[0] = 0
  for (let i = 1; i < count; i++) {
    const scale = shrinkOf(ages[i] - head)
    // Air recedes with the line above it, so a column seen from further away
    // is the same column, not a squashed one.
    up[i] = up[i - 1] + air * Math.max(0.6, scale) + heights[i] * scale
  }
  return { first: ages[0], up }
}

/** The ladder read at a fractional age, because the walk eases between rungs. */
function rung(ladder: Ladder, age: number): number {
  const { first, up } = ladder
  const local = age - first
  if (up.length === 0) return local * FALLBACK_RUNG
  const last = up.length - 1
  if (local <= 0) return up[0] + local * (up.length > 1 ? up[1] - up[0] : FALLBACK_RUNG)
  if (local >= last) {
    return up[last] + (local - last) * (last > 0 ? up[last] - up[last - 1] : FALLBACK_RUNG)
  }
  const low = Math.floor(local)
  return up[low] + (up[low + 1] - up[low]) * (local - low)
}

/** A line's mask, and whether anything of it is left to draw. */
interface LaneMask {
  image: string
  visibility: number
}

/**
 * Clip a line at the reading lane, by the line rather than by the message.
 *
 * ---------------------------------------------------------------------------
 * A message is not an atom. The rule this replaced faded a whole paragraph by
 * how much of its *full box* had reached the controls, so anything taller than
 * the lane could never be shown at all — which is the hole that used to sit at
 * the bottom of the sky where the longest thing either of you had said should
 * have been.
 *
 * So the boundary is a mask in the element's own coordinates: what is inside
 * the lane is drawn at full strength, and the part that has reached the edge
 * fades over about a line of text and is gone. The words slide *under* the
 * controls instead of blinking out beside them.
 *
 * **The fade starts before the crossing, not after it.** The band is placed
 * inside the lane rather than at its edge, so a line is already going as it
 * arrives rather than being whole in one frame and cut in the next.
 *
 * Returns null when no mask is needed — a mask on every line all the time is a
 * compositing layer per line for nothing.
 * ---------------------------------------------------------------------------
 */
function maskForLane(
  top: number,
  drawn: number,
  laneTop: number,
  laneBottom: number,
): LaneMask | null {
  if (!Number.isFinite(laneTop) || !Number.isFinite(laneBottom) || drawn <= 0) return null

  const bottom = top + drawn
  const alphaAt = (y: number) => Math.max(
    0,
    Math.min(
      1,
      (y - laneTop) / LINE_FADE,
      (laneBottom - y) / LINE_FADE,
    ),
  )
  const points = [top, bottom]
  for (const edge of [
    laneTop,
    laneTop + LINE_FADE,
    laneBottom - LINE_FADE,
    laneBottom,
  ]) {
    if (edge > top && edge < bottom) points.push(edge)
  }
  points.sort((a, b) => a - b)

  const stops = points.map((y) => ({
    at: ((y - top) / drawn) * 100,
    alpha: alphaAt(y),
  }))
  const visibility = stops.reduce((highest, stop) => Math.max(highest, stop.alpha), 0)
  if (stops.every((stop) => stop.alpha > 0.999)) return null
  if (visibility < 0.001) return { image: '', visibility: 0 }

  return {
    image: `linear-gradient(to bottom, ${stops
      .map((stop) => `rgba(0, 0, 0, ${stop.alpha.toFixed(4)}) ${stop.at.toFixed(3)}%`)
      .join(', ')})`,
    visibility,
  }
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
  const yours = markBy(message, me)
  const hers = markBy(message, me === 'warm' ? 'cool' : 'warm')

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
        <span className="said-hearts" aria-label="reacted to">
          {/*
            The colour is only worth spending on the heart. It says *who* left
            it, which is the whole job when both of you leave the same glyph —
            and an emoji tinted by a colour that is not its own just looks
            broken. So a heart is coloured and everything else is itself.
          */}
          {yours && <i className={`mine${yours === HEART ? '' : ' glyph'}`} aria-hidden="true">{yours}</i>}
          {hers && <i className={`hers${hers === HEART ? '' : ' glyph'}`} aria-hidden="true">{hers}</i>}
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
  /*
    Declared up here because the sky's frame-loop effect lists it as a
    dependency, and a dependency array is evaluated during *render* — so
    leaving it beside the composer, three hundred lines down, put a
    block-scoped read before its own declaration and threw on the first paint.
    The whole conversation went blank and every check went quietly green,
    because an empty document has no indicator in it either.
  */
  const writing = useTheyAreTyping()
  const startWriting = useTalking((s) => s.startWriting)
  const stopWriting = useTalking((s) => s.stopWriting)
  const replyTo = useTalking((s) => s.replyTo)
  const answer = useTalking((s) => s.answer)
  const profiles = useWorldSlice((s) => s.profiles)
  const presence = useWorldSlice((s) => s.presence)
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

  /*
    How many pixels one message is worth, right where the reading is.

    ---------------------------------------------------------------------------
    **This is the whole reason the scrolling felt wrong.** Dragging used to
    convert the finger straight into *messages* — `dy × 0.027`, so 37 px of
    thumb was always one message, whether that message was the word "k" at
    twenty pixels tall or a paragraph at a hundred and seventy. So the sky moved
    at a completely different speed depending on what happened to be under your
    hand, and on a normal run of short lines it moved about twice as fast as the
    finger did. That is what "going past your fingers" is: the content is not
    attached to the hand at all, it is being *driven* by it at a made-up gain.
    Making the easing quicker cannot fix that; it makes it worse, because the
    thing arriving faster is still the wrong distance.

    So the drag is measured in pixels and divided by what a message is actually
    worth in pixels here. Move the thumb one centimetre and the sky moves one
    centimetre — always, at every point in the conversation, through paragraphs
    and one-word answers alike. There is nothing to tune and nothing to get used
    to, which is what "adaptive" really means.

    Read off the same ladder that draws the column, at the read head, so it
    already accounts for how much things have shrunk back there.
    ---------------------------------------------------------------------------
  */
  const pixelsPerMessage = useRef(64)
  const dragBy = (pixels: number) => moveWalk(pixels / Math.max(18, pixelsPerMessage.current))

  /** Pixels a second still to be travelled after the finger has left. */
  const glide = useRef(0)

  useEffect(() => {
    if (!here) return
    const root = surface.current
    if (!root) return

    const onWheel = (e: WheelEvent) => {
      // Down through the wheel is back through time, the way a scrollback goes.
      e.preventDefault()
      glide.current = 0
      dragBy(e.deltaY)
    }

    let dragging = false
    let lastY = 0
    let lastAt = 0
    /*
      A short history rather than the last frame alone.

      One frame's delta is mostly noise — a finger resting still for a moment at
      the end of a flick would otherwise throw the whole gesture away, and a
      single jittery sample can launch a glide nobody asked for. Averaging the
      last few tens of milliseconds is what makes a release feel like it
      continues the movement your hand was making.
    */
    const recent: { at: number; y: number }[] = []

    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement)?.closest('button, input, textarea, a')) return
      dragging = true
      lastY = e.clientY
      lastAt = performance.now()
      recent.length = 0
      recent.push({ at: lastAt, y: e.clientY })
      // Catching a moving sky stops it, the way catching a spinning globe does.
      glide.current = 0
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      const dy = e.clientY - lastY
      lastY = e.clientY
      lastAt = performance.now()
      recent.push({ at: lastAt, y: e.clientY })
      while (recent.length > 2 && lastAt - recent[0].at > 110) recent.shift()
      /*
        Dragging down pulls the older messages toward you, the way dragging a
        sheet of paper moves the paper — and `walk.at` is moved with `walk.to`
        rather than left to ease toward it. While a finger is down there is
        nothing to ease *to*: the hand knows where the sky should be, and any
        lag between the two is the sky sliding under the thumb.
      */
      dragBy(dy)
      walk.at = walk.to
    }
    const up = () => {
      if (!dragging) return
      dragging = false
      /*
        And then it keeps going, and stops the way a heavy thing stops.

        Velocity from the last ninety milliseconds, decayed exponentially in the
        frame loop. Not a snap to the nearest message: this is a sky, and a
        conversation you are reading back through should come to rest wherever
        you left it rather than clicking into a slot.
      */
      /*
        Over a real stretch of time, or not at all.

        Dividing by however long the last two events happened to be apart is how
        a flick gets invented out of nothing: browsers coalesce moves, and two
        samples eight milliseconds and ten pixels apart read as more than a
        thousand pixels a second from a hand that was barely moving. So the
        oldest sample at least this far back is the one used, and if the gesture
        has no such sample — a slow drag, or a tap — it simply stops where it
        was put, which is the honest answer.
      */
      const oldest = recent.find((sample) => lastAt - sample.at >= 30)
      if (!oldest) return
      const span = (lastAt - oldest.at) / 1000
      const speed = (lastY - oldest.y) / span
      glide.current = Math.max(-MAX_GLIDE, Math.min(MAX_GLIDE, speed))
      if (Math.abs(glide.current) < 60) glide.current = 0
      wakeWorld()
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
    let columnTop = 0
    let surfaceTop = 0
    let air = AIR
    /*
      Everything in age order, because that is the order the ladder stacks in
      and the DOM's order is whatever React happened to render. These used to
      disagree — `heights[i]` was read in document order against a ladder built
      in age order — so a message could be clipped against another one's height.

      Measured once a layout, not once a frame: reading `offsetHeight` sixty
      times a second for every line is a forced reflow per line per frame. The
      *scales* change every frame; the heights do not, because a transform
      never affects layout.
    */
    let lines: HTMLElement[] = []
    let ages: number[] = []
    let heights: number[] = []
    let start = () => {}
    const remeasure = () => {
      surfaceTop = surface.current?.getBoundingClientRect().top ?? 0
      if (column.current) {
        lines = (Array.from(column.current.children) as HTMLElement[]).sort(
          (a, b) => Number(a.dataset.age ?? '0') - Number(b.dataset.age ?? '0'),
        )
        ages = lines.map((el) => Number(el.dataset.age ?? '0'))
        heights = lines.map((el) => el.offsetHeight)
        air = window.innerWidth <= 544 ? 18 : AIR
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
          /*
            The head's height, but never more than the lane can hold.

            A very long message used to push the whole column down by its own
            full height, which is how the sky ended up with a hole in it: the
            column dropped far enough that everything above the newest line was
            shoved off the top, and the newest line itself was then too tall to
            pass the old all-or-nothing lane test, so it vanished too. Clamping
            here keeps the read head where a read head belongs — just above the
            writing — and lets the mask show as much of a long message as there
            is room for. See the note on `maskFor`.
          */
          // The height-sensitive anchor is placed continuously in `tick`.
          // Doing it here chose one rounded message at a time and stepped the
          // whole column whenever a differently sized neighbour took over.
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
      // Kept before `lastFrame` moves, because the glide below needs the gap
      // between this frame and the last one, not zero.
      const step = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000))
      lastFrame = now
      const root = column.current
      if (!root) return

      /*
        Keep the read head beside the composer without choosing a new anchor
        one message at a time. Interpolating neighbouring message heights
        removes the small vertical step that used to happen at half-rungs.
      */
      if (window.innerWidth <= 544 && Number.isFinite(laneTop) && Number.isFinite(laneBottom)) {
        const first = ages[0] ?? 0
        const local = Math.max(0, Math.min(Math.max(0, ages.length - 1), walk.at - first))
        const low = Math.floor(local)
        const high = Math.min(heights.length - 1, low + 1)
        const blend = local - low
        const lowHeight = heights[low] ?? 54
        const headHeight = lowHeight + ((heights[high] ?? lowHeight) - lowHeight) * blend
        const room = Math.max(120, laneBottom - laneTop - 96)
        const wanted = laneBottom - surfaceTop - Math.min(headHeight, room) - 28
        const top = Math.max(laneTop - surfaceTop + 18, wanted)
        root.style.top = `${top}px`
        columnTop = surfaceTop + top
      }

      // Rebuilt every frame from the scales that are about to be drawn, so the
      // gap between two lines is the same gap at every point in the walk.
      const up = buildLadder(ages, heights, walk.at, air)
      const head = rung(up, walk.at)

      /*
        What a message is worth in pixels, here — *measured*, not estimated.

        The obvious answer is the distance between two rungs, and it is wrong,
        because walking also changes the ladder: every line comes forward a
        little as it approaches the head, so the rungs themselves spread out
        underneath the movement and quietly cancel part of it. Taking the rung
        spacing as the answer moved the sky about two thirds as far as the
        finger — better than the fixed gain it replaced, and still not the hand.

        So it is differenced properly: build the ladder half a step either side
        of where the walk is, ask how far one piece of content actually travels
        between the two, and divide by the step. Two extra passes over a dozen
        numbers, once a frame, for a drag that is exactly the hand.
      */
      const seen = walk.at + 3
      const back = buildLadder(ages, heights, walk.at - 0.5, air)
      const forth = buildLadder(ages, heights, walk.at + 0.5, air)
      pixelsPerMessage.current = Math.max(
        18,
        Math.abs(
          (rung(forth, walk.at + 0.5) - rung(forth, seen)) -
            (rung(back, walk.at - 0.5) - rung(back, seen)),
        ),
      )

      /*
        The glide, if a finger let go of it moving.

        Exponential decay rather than a fixed deceleration, because a flick
        should carry a long way and then ease off rather than travel at speed
        and stop dead. It is cut the moment the walk reaches either end — the
        sky does not bounce, it simply arrives.
      */
      if (glide.current !== 0) {
        dragBy(glide.current * step)
        glide.current *= Math.exp(-GLIDE_DECAY * step)
        walk.at = walk.to
        const furthest = Math.max(0, ages.length > 0 ? walk.count - 1 : 0)
        if (Math.abs(glide.current) < 24 || walk.to <= 0 || walk.to >= furthest) {
          glide.current = 0
        }
      }
      /*
        Where the newest message ends, so the writing light can sit under it.

        Taken from the ladder as it runs rather than measured afterwards: the
        sky moves every frame, and a second pass reading `getBoundingClientRect`
        on the bottom line sixty times a second is a layout flush sixty times a
        second. This is the number the ladder already computed.
      */
      let footOfSky: number | null = null
      for (let i = 0; i < lines.length; i++) {
        const el = lines[i]
        const own = ages[i]
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
        const shrink = shrinkOf(age)
        /*
          The ladder places drawn *tops*; a transform moves an element's box and
          scales it about its own middle. So the box has to be pushed up by the
          half-height the scaling took off the top, or every line would sit
          lower than its rung by a distance that grows with its own height —
          which is precisely how a paragraph used to open a hole beside itself.
        */
        const height = heights[i] ?? 0
        const lift = -(rung(up, own) - head) - (height - height * shrink) / 2
        let fade =
          age < -0.9
            ? // Below the read head is the future you have scrolled away from.
              // It has to be gone before it reaches the composer, or a ghost
              // line sits on top of the invitation to write the next one.
              Math.max(0, 1 + (age + 0.9) * 2.2)
            : Math.max(0, 1 - Math.max(0, age - 4.5) / 4)

        /*
          ----------------------------------------------------------------
          **Clipped at the lane by the line, not by the message.**

          The old rule faded a whole message by how much of its *full box* had
          reached the controls, so a message taller than the lane could never
          be more than partly faded and, past a certain height, was simply
          never shown at all. That is the hole at the bottom of the sky: the
          longest thing either of you had said was the one thing you could not
          read, and a blank half-screen sat where it should have been.

          A message is not an atom. It is lines, and a line that fits should be
          on screen whether or not its neighbours in the same paragraph do. So
          the boundary is a mask in the element's own coordinates: everything
          inside the lane is drawn at full strength, and the part that has
          reached the edge fades over about one line of text and is gone. Text
          slides *under* the controls instead of blinking out beside them.

          The mask is only attached when a cut is actually needed — a mask on
          every line all the time is a compositing layer per line for nothing.
          ----------------------------------------------------------------
        */
        const drawn = height * shrink
        // `lift` already cancels the scaling inset, so the drawn top is where
        // the ladder put it. The stationary lane mask begins fading *before*
        // the crossing, rather than appearing after it in a single frame.
        const top = columnTop + lift + gaze.pitch * 90 + (height - drawn) / 2
        const laneMask = maskForLane(top, drawn, laneTop, laneBottom)
        if (laneMask?.image) {
          el.style.webkitMaskImage = el.style.maskImage = laneMask.image
        } else if (el.style.maskImage !== '') {
          el.style.webkitMaskImage = el.style.maskImage = ''
        }
        if (laneMask?.visibility === 0) fade = 0

        el.style.transform =
          `translate3d(${side + gaze.yaw * -150 + Math.sin(own * 1.7) * 6}px,` +
          ` ${lift + gaze.pitch * 90}px, 0) scale(${shrink})`
        el.style.opacity = String(fade)
        // Index nought is the newest — the ladder stacks upward from it.
        if (i === 0) footOfSky = lift + gaze.pitch * 90 + drawn
        // Once a line is faint enough to be unreadable it must also stop
        // catching the pointer, or the newest message sits under a stack of
        // invisible ones.
        const visible = fade * (laneMask?.visibility ?? 1)
        el.style.pointerEvents = visible > 0.5 ? 'auto' : 'none'
      }

      /*
        The writing light rides the sky with everything else.

        A fixed offset was tried first and was wrong for the obvious reason:
        the newest message is one line or four, so a constant gap either
        overlapped it or floated a long way under it. Measured, it sat across
        the last two words of "It is nearly morning here and I am still awake
        looking at this."
      */
      const foot = writingRow.current
      if (foot) {
        if (footOfSky === null) foot.style.opacity = '0'
        else {
          foot.style.transform =
            `translate3d(${gaze.yaw * -150}px, ${columnTop + footOfSky + 14}px, 0)`
          foot.style.opacity = '1'
        }
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
    /*
      `writing` is a dependency because the sky's frame loop *parks*.

      It settles after four still frames and stops, which is the whole reason
      a conversation costs nothing to sit in front of. Her starting to write
      adds an element that only this loop can position, so without waking it
      the light was mounted, correct, and left at the opacity it starts at —
      in the DOM, passing its test, and invisible on the screen.
    */
  }, [here, messages, composing, idle, viewAge, writing])

  // --- writing --------------------------------------------------------------
  const [draft, setDraft] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const composer = useRef<HTMLDivElement>(null)
  /** The "she is writing" light, positioned by the same frame loop as the sky. */
  const writingRow = useRef<HTMLParagraphElement>(null)

  /*
    And she is told, while there is anything in it.

    Only while the composer is actually open: the draft deliberately outlives
    a fold so an unfinished message is not thrown away, and reporting from a
    folded composer would mean the sky said you were writing for as long as
    that draft sat there — which could be days.
  */
  useReportTyping(draft, composing)

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

  const warmHere = presence.warm?.online === true
  const coolHere = presence.cool?.online === true
  const presenceState = warmHere && coolHere ? 'together' : warmHere || coolHere ? 'one' : 'away'
  const presenceWords = [
    `${profiles.warm.name} is ${warmHere ? 'online' : 'away'}`,
    `${profiles.cool.name} is ${coolHere ? 'online' : 'away'}`,
  ].join('; ')

  return (
    <div className="talking" ref={surface}>
      <div
        className={`stars-presence ${presenceState}`}
        role="status"
        aria-live="polite"
        aria-label={presenceWords}
      >
        <span className={`stars-presence-light warm ${warmHere ? 'here' : 'away'}`} aria-hidden="true" />
        <span className="stars-presence-thread" aria-hidden="true" />
        <span className={`stars-presence-light cool ${coolHere ? 'here' : 'away'}`} aria-hidden="true" />
      </div>
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

      {/*
        Her next message, before it exists.

        ==================================================================
        This lived on the "say something" button at the bottom of the sky,
        and that was wrong twice over. It was nowhere near the conversation
        — a notice at the foot of the screen about something happening in
        the sky above it. And **the moment you started writing, the button
        was replaced by the composer**, so the one time you most want to
        know she is answering you is the one time you could not see it.

        It belongs where her next line will actually land: under the newest
        message, on her side of the sky. Which makes it the same object as
        the thing it is announcing — a light that has not finished forming,
        in the place the finished one will appear.

        Outside the ladder on purpose. The messages are laid out by a
        per-frame walk that stacks measured heights, and putting a phantom
        row into it would mean the whole sky shifted every time she picked
        up her phone.
        ==================================================================
      */}
      {writing && (
        <div className="sky-writing-lane">
          <p ref={writingRow} className="sky-writing" role="status">
            <i aria-hidden="true" />
            {writingLine(them.name)}
          </p>
        </div>
      )}

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
            {/* Return belongs to the message; the visible light sends it. */}
            <Ink
              innerRef={field}
              className="saying-field ink"
              value={draft}
              onChange={write}
              label={`say something to ${them.name}`}
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
        <button
          type="button"
  className="start-saying"
          aria-label={`say something to ${them.name}`}
          onClick={startWriting}
        >
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
          {/*
            No standing invitation.

            "say something" sat under the newest message at all times, in the
            emptiest and quietest place in the garden, telling two people who
            open this place to talk to each other that they could talk to each
            other. It was the last piece of furniture left down here and it was
            doing the same job the hint above it had already been cut for.

            What is left is the line it was written on — one hairline, which is
            what you tap, and which reads as somewhere to write rather than as
            a sentence about writing. The label lives on the button instead, so
            anything reading this aloud still says what it is.
          */}
          <span className="start-saying-line" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
