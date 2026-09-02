/**
 * What you can do to something either of you said, and how you reach it.
 *
 * ---------------------------------------------------------------------------
 * **Nothing is drawn until you reach for it.**
 *
 * The first version put a heart and the words "answer this" under every
 * message. That is how you would build it if you had never used a chat: two
 * controls under every line, permanently, in a place whose whole design is
 * words hanging in a sky with nothing else in them. It also does not survive
 * contact with the thing it is for — a conversation of forty messages had
 * eighty buttons in it.
 *
 * Every chat anybody actually uses solves this the same way, and it is worth
 * saying why it works: **the message itself is the control**. There is nothing
 * to draw, nothing to lay out, nothing to hide on small screens, and no
 * decision about which of two hundred lines gets the buttons.
 *
 *   right-click        a small menu: answer it, or one of six marks
 *   double-click       a heart, straight away
 *   double-tap         the same, for a screen with no mouse on it
 *   press and hold     the menu, for a screen with no right button on it
 *   swipe it left      answer it — the touch gesture for reply, everywhere
 *
 * The touch gestures are the ones a phone has instead of a right button, and
 * they are the ones everybody already knows.
 *
 * **Press and hold is ours, not the platform's.** iOS does not fire
 * `contextmenu` on a long press — it raises its own selection callout — so
 * on a phone the menu here was simply unreachable, and holding a message
 * selected it instead. The recogniser below is the fix, and `.said` opts out
 * of native selection so the two stop competing for the same touch. Nothing here has to be
 * discovered by reading a label, because there is no label.
 *
 * **What stays visible is state, not controls.** A heart that has been put on
 * something is a fact about it now — it shows, in the colour of whoever left
 * it, and in the sky the light for that message burns brighter for good.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useLayoutEffect, useRef } from 'react'
import { create } from 'zustand'
import { useData } from '@/data/provider'
import { HEART, MARKS, heartedBy, markBy, useTalking } from '@/systems/talking'
import type { Message } from '@/data/types'
import { useMenuKeys } from './useMenuKeys'

/** Two taps closer together than this, and nearer than `NEAR`, are one act. */
const DOUBLE_MS = 340
const NEAR = 22
/** How far left a message has to travel before letting go answers it. */
const SWIPE = 46
/** And how straight that has to be, so a drag through the sky is not a reply. */
const STRAIGHT = 38
/**
 * How long a finger has to stay still before it means "give me the menu".
 *
 * Long enough not to fire during the first moments of a swipe or a scroll,
 * short enough that it does not feel like waiting. This is roughly what every
 * phone uses for the same gesture, and matching it is the point — a hold that
 * takes noticeably longer than the ones you are used to reads as broken.
 */
const HOLD_MS = 420
/** A finger that travels further than this was going somewhere, not holding. */
const STILL = 12

interface MenuState {
  /** Which message, and where the pointer was. */
  at: { id: string; x: number; y: number } | null
  open(id: string, x: number, y: number): void
  close(): void
}

export const useSaidMenu = create<MenuState>((set) => ({
  at: null,
  open: (id, x, y) => set({ at: { id, x, y } }),
  close: () => set({ at: null }),
}))

/**
 * The handlers a message needs, for either surface.
 *
 * Returned as props to spread rather than done inside a component, because the
 * Stars draws its lines as absolutely positioned paragraphs it writes
 * transforms into every frame and the corner draws them as an ordinary column.
 * The gestures are the same; nothing else about the two is.
 */
export function useSaidGestures(message: Message) {
  const data = useData()
  const answer = useTalking((s) => s.answer)
  const startWriting = useTalking((s) => s.startWriting)
  const open = useSaidMenu((s) => s.open)

  const lastTap = useRef(0)
  const from = useRef<{ x: number; y: number; id: number } | null>(null)
  /** The pending press-and-hold, cancelled by anything that is not a hold. */
  const holding = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Set when a hold fired, so the release that follows is not read as a tap. */
  const held = useRef(false)

  const dropHold = () => {
    if (holding.current !== null) {
      clearTimeout(holding.current)
      holding.current = null
    }
  }

  // A message can be unmounted mid-press — the Stars recycles them as the sky
  // moves — and a timer that outlives its message opens a menu onto nothing.
  useEffect(() => dropHold, [])

  const heart = () => {
    void data.heartMessage(message.id, !heartedBy(message, data.me))
  }

  const reply = () => {
    answer(message.id)
    startWriting()
  }

  return {
    onContextMenu(event: React.MouseEvent) {
      event.preventDefault()
      event.stopPropagation()
      open(message.id, event.clientX, event.clientY)
    },

    onPointerDown(event: React.PointerEvent) {
      from.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
      held.current = false
      dropHold()
      /*
        Only a finger. A mouse already has a right button, and starting a
        timer under every click would open the menu on anyone who paused
        mid-drag with the button down.
      */
      if (event.pointerType === 'mouse') return
      /*
        This surface has its own tap, swipe and hold language. Cancelling the
        touch default at its beginning prevents iOS from starting selection or
        the copy loupe while leaving the textarea elsewhere completely normal.
        Clearing an old range also removes a selection left behind by WebKit
        before this build reached the device.
      */
      event.preventDefault()
      window.getSelection()?.removeAllRanges()
      /*
        The *message's* box, not the finger's position.

        The bar is placed above whatever it is given, and given a fingertip it
        opened above the fingertip — which is inside the message, so it sat
        across the top line of the thing you had just pressed. Reported as "in
        between the messages", and it was: it was on one.

        Handed the message's own top edge and centre, it clears the message
        completely and reads as belonging to it. Read at press time rather than
        when the hold fires, because `currentTarget` is gone by then.
      */
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
      const x = box.left + box.width / 2
      const y = box.top
      holding.current = setTimeout(() => {
        holding.current = null
        held.current = true
        // The press is over as far as the other gestures are concerned: a
        // release from here must not also count as the first of a double tap.
        from.current = null
        open(message.id, x, y)
      }, HOLD_MS)
    },

    onPointerMove(event: React.PointerEvent) {
      const start = from.current
      if (!start || start.id !== event.pointerId) return
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      // A finger that is travelling is not a finger that is holding.
      if (Math.abs(dx) > STILL || Math.abs(dy) > STILL) dropHold()
      // Leftward only, and only while it is still a horizontal gesture. A
      // downward drag in the Stars is walking back through the conversation
      // and must not drag the line along with it.
      if (dx > 0 || Math.abs(dy) > STRAIGHT) return
      const el = event.currentTarget as HTMLElement
      /*
        `translate` and not `transform`.

        The Stars writes a transform into every one of these every frame — the
        lift, the lean, the scale, the parallax — so a transform here would be
        gone by the next tick. The independent `translate` property composes
        with it instead of replacing it, which is the same reason the garden's
        drift-in animation uses it. See the note in PLAN.
      */
      el.style.translate = `${Math.max(dx, -110)}px 0`
      el.toggleAttribute('data-answering', dx < -SWIPE)
    },

    onPointerUp(event: React.PointerEvent) {
      dropHold()
      const start = from.current
      from.current = null
      // The menu is already open; letting go of it is not a tap on anything.
      if (held.current) {
        held.current = false
        const el = event.currentTarget as HTMLElement
        el.style.translate = ''
        el.removeAttribute('data-answering')
        return
      }
      const el = event.currentTarget as HTMLElement
      el.style.translate = ''
      el.removeAttribute('data-answering')
      if (!start || start.id !== event.pointerId) return

      const dx = event.clientX - start.x
      const dy = event.clientY - start.y

      if (dx < -SWIPE && Math.abs(dy) < STRAIGHT) {
        reply()
        return
      }

      // A tap, and possibly the second of two.
      if (Math.abs(dx) < NEAR && Math.abs(dy) < NEAR) {
        const now = performance.now()
        if (now - lastTap.current < DOUBLE_MS) {
          lastTap.current = 0
          heart()
        } else {
          lastTap.current = now
        }
      }
    },

    onPointerCancel(event: React.PointerEvent) {
      dropHold()
      held.current = false
      from.current = null
      const el = event.currentTarget as HTMLElement
      el.style.translate = ''
      el.removeAttribute('data-answering')
    },
  }
}

/**
 * The menu, once, for whichever message asked for it.
 *
 * One instance at the top of the app rather than one per message: two hundred
 * hidden menus in the document is two hundred things to lay out, and only ever
 * one of them can be open.
 */
export function SaidMenu() {
  const at = useSaidMenu((s) => s.at)
  const close = useSaidMenu((s) => s.close)
  const data = useData()
  const messages = useTalking((s) => s.messages)
  const answer = useTalking((s) => s.answer)
  const startWriting = useTalking((s) => s.startWriting)
  // One arrow stop: the row of marks is reached by tab, not by walking six
  // glyphs with the down key.
  const keys = useMenuKeys(at ? 1 : 0, true, Boolean(at))

  /*
    Anything at all closes it: a click, a key, a scroll, the sky moving.

    A menu that outlives the moment it was opened in is the classic bug here —
    it ends up floating over a different message, or over the garden after you
    have left the conversation entirely.
  */
  useEffect(() => {
    if (!at) return
    const shut = () => close()
    /*
      Escape is taken in the *capture* phase, and stopped.

      `ui/Places` has its own window listener on Escape, and in the Stars that
      one means "leave the place". Without capturing this first, dismissing a
      two-item menu also walks you out of the conversation and back into the
      meadow — which is the same bug Ember Rally's pause had, and it is fixed
      the same way. A key belongs to the topmost thing that wants it.
    */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      close()
    }
    window.addEventListener('pointerdown', shut)
    window.addEventListener('wheel', shut, { passive: true })
    window.addEventListener('blur', shut)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', shut)
      window.removeEventListener('wheel', shut)
      window.removeEventListener('blur', shut)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [at, close])

  const box = useRef<HTMLDivElement>(null)

  /*
    Put where the finger was, then measured and pulled back into the window.

    The clamp used to be two constants — 170 and 96 — chosen for a menu with
    two words in it. A row of six marks is nearly three hundred pixels wide,
    and on a message near the right edge of a phone the last two fell off the
    screen entirely. Numbers that describe a layout stop being true the moment
    the layout changes, so this reads the box it actually has.
  */
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !at) return
    const settle = () => {
      const b = el.getBoundingClientRect()
      const edge = 10
      /*
        Above the finger, and centred on it.

        It used to open down and to the right of where you pressed, which put
        it directly under your own thumb and directly on top of the message you
        had just pressed — so the thing you summoned was hidden by the hand
        that summoned it, and what you *could* see was interleaved with the
        words behind it.

        Every phone puts a reaction bar above the thing it belongs to for this
        reason. Centred horizontally because it is a bar rather than a menu
        hanging off a corner, and it should read as belonging to the message
        underneath it rather than pointing away from it.
      */
      const wantX = at.x - b.width / 2
      // Twelve pixels of air above the message's top edge — close enough to
      // belong to it, clear enough that neither is sitting on the other.
      const above = at.y - b.height - 12
      // No room above — near the top of the sky — so it goes below instead,
      // which is still clear of the thumb.
      // No room above — the message is near the top of the sky — so it drops
      // below it instead. `at.y` is the message's top, so this has to clear
      // the message's height as well, which the bar does not know; a fixed
      // drop that clears two lines of the serif is close enough and is only
      // ever used within a few dozen pixels of the ceiling.
      const y = above < edge ? at.y + 84 : above
      el.style.left = `${Math.max(edge, Math.min(wantX, window.innerWidth - b.width - edge))}px`
      el.style.top = `${Math.max(edge, Math.min(y, window.innerHeight - b.height - edge))}px`
    }
    settle()
    window.addEventListener('resize', settle)
    window.addEventListener('orientationchange', settle)
    return () => {
      window.removeEventListener('resize', settle)
      window.removeEventListener('orientationchange', settle)
    }
  }, [at])

  if (!at) return null
  const message = messages.find((m) => m.id === at.id)
  if (!message) return null

  const mine = markBy(message, data.me)

  /** Leaving the mark you already left takes it back — the same tap, both ways. */
  const leave = (mark: string) => {
    void data.heartMessage(message.id, mine !== mark, mark)
    close()
  }

  return (
    <div
      ref={box}
      className="said-menu"
      style={{
        /*
          Down and to the right of the pointer, not *at* it.

          A menu whose corner is exactly where you clicked lands on top of the
          words you clicked — and in the Stars those words are centred, wide,
          and the only thing on the screen. Clear of the line by a little more
          than its own leading and it opens onto empty sky.

          These are the first guess only; the layout effect above measures the
          box and pulls it back inside the window, on both axes.
        */
        left: at.x + 12,
        top: at.y + 34,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/*
        The marks come first, and reply is a glyph on the end.

        Ordered by what you actually reach for: nine times out of ten this
        menu is opened to put a face on something, and the tenth is a reply.
        It used to be a *column* with the words "answer this" above the row —
        which put a line of text across whatever message you had just pressed,
        and made a two-item stack out of something that is one gesture.

        The return arrow says reply everywhere on earth and takes a fifth of
        the room the words did.
      */}
      <div className="said-marks" role="group" aria-label="leave a mark">
        {MARKS.map((mark) => (
          <button
            key={mark}
            type="button"
            className={mine === mark ? 'on' : undefined}
            aria-pressed={mine === mark}
            aria-label={
              mine === mark
                ? `take back ${mark === HEART ? 'the heart' : mark}`
                : `leave ${mark === HEART ? 'a heart' : mark}`
            }
            onClick={() => leave(mark)}
          >
            {mark}
          </button>
        ))}
      </div>
      <i className="said-menu-split" aria-hidden="true" />
      <button
        ref={keys.ref(0)}
        type="button"
        /*
          No pre-lit state. `useMenuKeys` starts its ring on the first item,
          which is right for a keyboard and wrong on a phone: it drew a warm
          ring round *reply* the instant the bar opened, pointing at the one
          thing on it you are least likely to want. Real focus still shows,
          through `:focus-visible`, which is the only time it means anything.
        */
        className="said-answer"
        onFocus={() => keys.choose(0)}
        aria-label="answer this"
        onClick={() => {
          answer(message.id)
          startWriting()
          close()
        }}
      >
        <span aria-hidden="true">↩</span>
      </button>
    </div>
  )
}
