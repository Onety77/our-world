/**
 * Being told when she says something.
 *
 * ---------------------------------------------------------------------------
 * **What this can honestly do, and what it cannot.**
 *
 * It fires a real system notification when a message of hers arrives and you
 * are not looking at the conversation. That covers the case that actually
 * happens: the garden open in a tab behind something else, or on a phone with
 * the screen locked and the page still alive. You get the notification, you
 * tap it, you are in the Stars.
 *
 * It does **not** work when the page is closed. Nothing in a web page can —
 * that needs a service worker holding a push subscription and a server pushing
 * to it, which is the PWA work in the plan and is not this. So the setting
 * says *while the garden is open*, in those words, because the design law here
 * is honest states and a toggle that quietly promises more than it delivers is
 * the worst kind of lie: it fails silently, at night, for somebody waiting.
 * ---------------------------------------------------------------------------
 *
 * **The setting is per device, not per person**, and that is why it lives in
 * localStorage rather than in the shared world. Whether you want your laptop
 * to make a noise is not a fact about you that belongs in a document she can
 * read; it is a fact about this browser. It also means turning it on here
 * never touches the database, and the two of you can have different answers on
 * four different devices without any of them disagreeing.
 */

import { create } from 'zustand'

const KEY = 'garden:notify:v1'

/** What the browser will let us do, right now. */
export type Standing = 'unsupported' | 'default' | 'granted' | 'denied'

function standingNow(): Standing {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission as Standing
}

function wantedAtStart(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    // A browser with site data blocked. Off is the right default for something
    // that makes a noise.
    return false
  }
}

interface NotifyState {
  /** Whether you have asked for them on this device. */
  wanted: boolean
  standing: Standing
  /** True when a notification would actually appear. */
  readonly live: boolean
  /** Turn them on — asking the browser if it has not been asked. */
  want(on: boolean): Promise<void>
  refresh(): void
}

export const useNotify = create<NotifyState>((set, get) => ({
  wanted: wantedAtStart(),
  standing: standingNow(),
  get live() {
    return get().wanted && get().standing === 'granted'
  },

  async want(on) {
    if (!on) {
      try {
        localStorage.setItem(KEY, 'off')
      } catch {
        /* nothing to do: the toggle still works for this session */
      }
      set({ wanted: false })
      return
    }

    let standing = standingNow()
    /*
      Asked only when you turn it on, never on load.

      A permission prompt that appears because a page opened is a prompt
      everybody refuses, and a refusal is permanent — `denied` cannot be asked
      again from script. So the one chance we get is spent on a deliberate act.
    */
    if (standing === 'default') {
      try {
        standing = (await Notification.requestPermission()) as Standing
      } catch {
        standing = standingNow()
      }
    }

    const wanted = standing === 'granted'
    try {
      localStorage.setItem(KEY, wanted ? 'on' : 'off')
    } catch {
      /* as above */
    }
    set({ wanted, standing })
  },

  refresh: () => set({ standing: standingNow() }),
}))

/**
 * Whether a notification is worth firing at all.
 *
 * Being on the page and looking at the conversation is the one case where a
 * system notification is pure noise — you are reading the thing it is telling
 * you about. Anything else counts: another tab, another window, minimised, or
 * the garden open at the Tree.
 */
export function shouldTell(inTheStars: boolean): boolean {
  if (!useNotify.getState().live) return false
  if (typeof document === 'undefined') return false
  return document.visibilityState !== 'visible' || !inTheStars
}

/**
 * Say it.
 *
 * One notification, replacing any previous one — `tag` is what does that, and
 * it matters more than it looks: somebody who has been away for an hour should
 * come back to *one* notification saying she said something, not to eleven
 * stacked up saying it eleven times.
 */
export function tell(from: string, body: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    const note = new Notification(from, {
      body,
      tag: 'garden:said',
      silent: false,
    })
    note.onclick = () => {
      window.focus()
      note.close()
    }
  } catch {
    /*
      Some browsers refuse the constructor outright and require a service
      worker registration instead. Nothing to recover here — the message is
      already in the conversation, which is the part that matters.
    */
  }
}
