/*
 * The Garden's background ear.
 *
 * This file deliberately has no private configuration. Firebase's web config
 * is public and arrives in the registration URL; the only authority lives in
 * Firestore rules and in the server function's Admin credentials.
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
    tag: 'garden:said',
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
