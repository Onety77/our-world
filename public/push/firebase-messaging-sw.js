/*
 * The Garden's background ear.
 *
 * This file deliberately has no private configuration. Firebase's web config
 * is public and arrives in the registration URL; the only authority lives in
 * Firestore rules and in the server function's Admin credentials.
 *
 * ---------------------------------------------------------------------------
 * **It lives in `/push/` rather than at the root, and that is the whole reason
 * this folder exists.**
 *
 * A scope can be held by exactly one service worker. This one used to claim
 * `/` — which was free while it was the only worker in the garden, and became
 * a collision the moment the world got one that caches (`sw.js`). Registering
 * a second script for the same scope does not run both: it *replaces* the
 * first. Whichever registered last would have won, the other would have gone
 * silently dark, and the two candidates for going dark were "the garden opens
 * offline" and "she is told at all".
 *
 * So the caching worker takes `/`, because it must — only the worker
 * controlling a page's scope can answer that page's fetches. This one needs no
 * scope at all: it never intercepts a request. A worker is handed its push
 * events because `getToken` was given *its* registration, not because of where
 * it sits, and `showNotification`, `notificationclick`, `clients.matchAll`
 * with `includeUncontrolled` and `openWindow` all reach the whole origin from
 * anywhere. Sitting in a folder nothing navigates to costs it nothing.
 *
 * Being served from `/push/` is what makes `/push/` its default scope, so no
 * `Service-Worker-Allowed` header is needed and there is nothing for a host to
 * get wrong. Moving this file back to the root would silently disable the
 * cache. See `systems/serviceWorker.ts` for the other half.
 * ---------------------------------------------------------------------------
 */

/* global firebase */
importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js')

const params = new URL(self.location.href).searchParams
firebase.initializeApp({
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
})

const messaging = firebase.messaging()

/* This worker caches nothing, so an update has no old app shell to protect.
 * Take over immediately; otherwise iOS may keep the previous notification
 * behaviour alive until every installed-app window has been closed. */
self.skipWaiting()
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

/*
 * Data-only messages give this worker one display path on every platform.
 * Sending a Firebase `notification` payload as well would make some browsers
 * display it automatically and then this callback would create a duplicate.
 */
messaging.onBackgroundMessage(async (payload) => {
  const data = payload.data || {}

  /*
   * iOS can hand a push to the worker even while an installed PWA is visibly
   * open. The page already receives the Firestore message and responds with
   * its own tone and unread light, so system chrome here would be a duplicate.
   * Check the actual windows at delivery time; this is more precise than a
   * server-side heartbeat and remains a final guard if those two events race.
   */
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const visibleGarden = windows.some((client) =>
    client.visibilityState === 'visible' || client.focused === true,
  )
  if (visibleGarden) return

  return self.registration.showNotification(data.title || 'The Garden Between Us', {
    body: data.body || 'Something is waiting in the Stars.',
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-32.png',
    /*
      The tag comes from the message now, and it matters more than it looks.

      A tag makes a notification *replace* the one before it. One fixed tag was
      right while the Stars was the only thing that ever sent anything: four
      messages in a row should be one line on a lock screen, not four.

      It became wrong the moment a thought, a picture, a game move and an
      answer to the question started arriving here too — they would have taken
      it in turns to erase each other, and whichever came last would be the
      only thing you ever saw. Each kind carries its own now, so they collapse
      within themselves and never across. Older senders that name none still
      land on the Stars' tag, which is exactly where they came from.
    */
    tag: data.tag || 'garden:said',
    renotify: true,
    data: { url: data.url || '/?section=stars' },
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destination = event.notification.data?.url || '/?section=stars'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const existing = windows.find((client) => {
        const url = new URL(client.url)
        return url.pathname !== '/dev7731'
          && !url.pathname.startsWith('/dev7731/')
          && !url.searchParams.has('dev7731')
      }) || windows[0]
      if (existing) {
        await existing.focus()
        // The control room does not mount the garden listener. Replace that
        // window outright; an ordinary garden can make its authored transition.
        const existingUrl = new URL(existing.url)
        if (existingUrl.pathname.startsWith('/dev7731') || existingUrl.searchParams.has('dev7731')) {
          await existing.navigate(destination)
          return
        }
        existing.postMessage({ type: 'garden:open-stars' })
        return
      }
      await self.clients.openWindow(destination)
    }),
  )
})
