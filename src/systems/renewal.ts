/**
 * The worker that keeps the garden on the device, and the one moment it needs
 * to ask permission.
 *
 * ---------------------------------------------------------------------------
 * `sw/worker.js` is the other half of this and carries the reasoning for what
 * is cached. This half exists for one thing only: **a new garden must never
 * arrive underneath somebody.**
 *
 * The default behaviour of a service worker that calls `skipWaiting` on
 * install is that the next navigation is silently the new version. For most
 * sites that is fine. Here it would mean the world reloading in the last
 * corner of a qualifying lap, or halfway through a letter, because somebody
 * else pushed a commit — and the person it happened to would have no way of
 * knowing what they had just done wrong.
 *
 * So the new worker installs, fills its cache, and waits. One line appears on
 * the world. Nothing happens until it is touched.
 * ---------------------------------------------------------------------------
 */

import { create } from 'zustand'

interface RenewalState {
  /** A newer garden is downloaded, waiting, and one tap from being live. */
  ready: boolean
  /** Take it. The page reloads into the new one; nothing is saved by this. */
  take(): void
}

/*
  Held outside the store because the reload must happen exactly once.

  `controllerchange` fires when the new worker takes over — but it also fires
  the first time any worker claims a page that loaded without one, which is
  every first visit. Reloading on that would turn every first open of the
  garden into two, and on a slow connection two is very visible.
*/
let asked = false
let waiting: ServiceWorker | null = null

export const useRenewal = create<RenewalState>((set) => ({
  ready: false,
  take: () => {
    if (!waiting) return
    asked = true
    set({ ready: false })
    waiting.postMessage({ type: 'garden:take-the-new-one' })
  },
}))

function offer(worker: ServiceWorker | null): void {
  if (!worker) return
  waiting = worker
  useRenewal.setState({ ready: true })
}

/**
 * Start the worker, and watch for its replacement.
 *
 * Called once, from `main.tsx`, before React. It never throws and never
 * blocks: a browser that refuses the registration, a private window with no
 * storage, an insecure origin — every one of those is a garden that works
 * exactly as it did before this file existed, which is the only acceptable
 * failure for something whose whole purpose is to make opening more reliable.
 */
export function keepTheGarden(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  /*
    Development gets no worker, and any worker it finds is removed.

    A cached shell in front of Vite's dev server is a morning lost to editing a
    file and watching nothing change. The unregister matters as much as the
    guard: `npm run preview` serves a real build on localhost, so a preview and
    a dev server share an origin, and a worker installed by the first one would
    otherwise sit in front of the second.
  */
  if (!import.meta.env.PROD) {
    navigator.serviceWorker
      .getRegistrations()
      .then((all) => all.forEach((one) => void one.unregister()))
      .catch(() => {})
    return
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!asked) return
    window.location.reload()
  })

  /*
    After `load`, deliberately.

    Registering during startup puts the shell's own download in competition
    with the scripts and the first frame — on a phone on a bad connection that
    is the one moment where a background task is most expensive and least
    wanted. It costs nothing to wait: this visit is already being served from
    whatever the last visit cached.
  */
  const start = () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Left waiting by an earlier visit that never answered the offer.
        if (registration.waiting && navigator.serviceWorker.controller) {
          offer(registration.waiting)
        }

        registration.addEventListener('updatefound', () => {
          const arriving = registration.installing
          if (!arriving) return
          arriving.addEventListener('statechange', () => {
            /*
              `controller` is the test for *replacement* rather than *arrival*.

              With no controller this is the very first install on this device:
              there is no old garden to protect, nothing to interrupt, and the
              worker is already serving the page the person is looking at.
              Offering a renewal there would be asking somebody to upgrade to
              what they already have.
            */
            if (arriving.state !== 'installed') return
            if (!navigator.serviceWorker.controller) return
            offer(arriving)
          })
        })
      })
      .catch(() => {
        /* No worker. The garden falls back to being an ordinary website. */
      })
  }

  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
}
