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
 *   right-click        a small menu: answer it, or a heart
 *   double-click       a heart, straight away
 *   double-tap         the same, for a screen with no mouse on it
 *   swipe it left      answer it — the touch gesture for reply, everywhere
 *
 * The two touch gestures are the ones a phone has instead of a right button,
 * and they are the two everybody already knows. Nothing here has to be
 * discovered by reading a label, because there is no label.
 *
 * **What stays visible is state, not controls.** A heart that has been put on
 * something is a fact about it now — it shows, in the colour of whoever left
 * it, and in the sky the light for that message burns brighter for good.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { useData } from '@/data/provider'
import { heartedBy, useTalking } from '@/systems/talking'
import type { Message } from '@/data/types'
import { useMenuKeys } from './useMenuKeys'

/** Two taps closer together than this, and nearer than `NEAR`, are one act. */
const DOUBLE_MS = 340
const NEAR = 22
/** How far left a message has to travel before letting go answers it. */
const SWIPE = 46
/** And how straight that has to be, so a drag through the sky is not a reply. */
const STRAIGHT = 38

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
    },

    onPointerMove(event: React.PointerEvent) {
      const start = from.current
      if (!start || start.id !== event.pointerId) return
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
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
      const start = from.current
      from.current = null
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
  const keys = useMenuKeys(at ? 2 : 0, true, Boolean(at))

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

  if (!at) return null
  const message = messages.find((m) => m.id === at.id)
  if (!message) return null

  const yours = heartedBy(message, data.me)

  return (
    <div
      className="said-menu"
      style={{
        /*
          Down and to the right of the pointer, not *at* it.

          A menu whose corner is exactly where you clicked lands on top of the
          words you clicked — and in the Stars those words are centred, wide,
          and the only thing on the screen. Clear of the line by a little more
          than its own leading and it opens onto empty sky.

          Both axes are clamped to the window, because a right-click near an
          edge would otherwise put half of it outside.
        */
        left: Math.min(at.x + 12, window.innerWidth - 170),
        top: Math.min(at.y + 34, window.innerHeight - 96),
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        ref={keys.ref(0)}
        type="button"
        className={keys.selected === 0 ? 'is-selected' : undefined}
        onFocus={() => keys.choose(0)}
        onClick={() => {
          answer(message.id)
          startWriting()
          close()
        }}
      >
        answer this
      </button>
      <button
        ref={keys.ref(1)}
        type="button"
        className={keys.selected === 1 ? 'is-selected' : undefined}
        onFocus={() => keys.choose(1)}
        onClick={() => {
          void data.heartMessage(message.id, !yours)
          close()
        }}
      >
        {yours ? 'take the heart back' : 'a heart'}
      </button>
    </div>
  )
}
