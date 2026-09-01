/**
 * Notifications on one device.
 *
 * `wanted` is local intent, `standing` is the browser's permission, and
 * `push` says whether this device also has a server-reachable address. The
 * distinction matters: ordinary `new Notification()` only works while this
 * page is alive; Web Push wakes the service worker after it has been closed.
 */

import { create } from 'zustand'
import { DATA_BACKEND } from '@/config'
import type { UserId } from '@/data/types'

const KEY = 'garden:notify:v1'

export type Standing = 'unsupported' | 'default' | 'granted' | 'denied'
export type PushStanding = 'idle' | 'syncing' | 'active' | 'unavailable' | 'failed'

function standingNow(): Standing {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission as Standing
}

function wantedAtStart(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

function remember(wanted: boolean): void {
  try {
    localStorage.setItem(KEY, wanted ? 'on' : 'off')
  } catch {
    /* The choice still lasts for this session. */
  }
}

function pushWords(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'This device could not finish registering for notifications.'
}

interface NotifyState {
  wanted: boolean
  standing: Standing
  push: PushStanding
  issue: string
  /** True when an open-page notification can at least be shown. */
  live(): boolean
  want(on: boolean, me?: UserId): Promise<void>
  sync(me: UserId): Promise<void>
  refresh(): void
}

export const useNotify = create<NotifyState>((set, get) => ({
  wanted: wantedAtStart(),
  standing: standingNow(),
  push: 'idle',
  issue: '',
  live: () => get().wanted && get().standing === 'granted',

  async want(on, me) {
    if (!on) {
      remember(false)
      set({ wanted: false, push: 'idle', issue: '' })
      if (DATA_BACKEND === 'firebase' && me) {
        try {
          const { unregisterPushDevice } = await import('@/data/push')
          await unregisterPushDevice(me)
        } catch (error) {
          set({ issue: pushWords(error), push: 'failed' })
        }
      }
      return
    }

    let standing = standingNow()
    // Permission is spent only on the deliberate tap of this switch. On iOS,
    // direct user interaction is also a platform requirement.
    if (standing === 'default') {
      try {
        standing = (await Notification.requestPermission()) as Standing
      } catch {
        standing = standingNow()
      }
    }

    const wanted = standing === 'granted'
    remember(wanted)
    set({ wanted, standing, issue: '', push: wanted ? 'idle' : 'unavailable' })
    if (wanted && me) await get().sync(me)
  },

  async sync(me) {
    const standing = standingNow()
    set({ standing })
    if (!get().wanted || standing !== 'granted') return

    // The local story has no server and keeps the original open-page
    // notification. This also keeps screenshots and the offline mock honest.
    if (DATA_BACKEND !== 'firebase') {
      set({ push: 'unavailable', issue: '' })
      return
    }

    set({ push: 'syncing', issue: '' })
    try {
      const { registerPushDevice } = await import('@/data/push')
      await registerPushDevice(me)
      set({ push: 'active', issue: '' })
    } catch (error) {
      set({
        push: error instanceof Error && error.name === 'PushUnavailable' ? 'unavailable' : 'failed',
        issue: pushWords(error),
      })
    }
  },

  refresh: () => set({ standing: standingNow() }),
}))

/**
 * Do not let the live Firestore listener duplicate a notification the push
 * worker is already responsible for. In a visible non-Stars section, push is
 * delivered to the page without being displayed, so the local path still has
 * one useful job there.
 */
export function shouldTell(inTheStars: boolean): boolean {
  const state = useNotify.getState()
  if (!state.live() || typeof document === 'undefined') return false
  if (state.push === 'active' && document.visibilityState !== 'visible') return false
  return document.visibilityState !== 'visible' || !inTheStars
}

/** Show the open-page fallback and take a tap directly to the Stars. */
export function tell(from: string, body: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    const note = new Notification(from, {
      body,
      icon: '/icons/icon-192.png',
      tag: 'garden:said',
      silent: false,
    })
    note.onclick = () => {
      window.focus()
      note.close()
      window.location.assign('/?section=stars')
    }
  } catch {
    // Browsers which require the worker are covered by the push path.
  }
}
