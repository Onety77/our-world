/*
 * The garden, kept on the device.
 *
 * ---------------------------------------------------------------------------
 * **This is not a plugin's output and it is not generated code.** The two
 * placeholders below are filled in at build time by `gardenWorker()` in
 * `vite.config.ts` — everything else is written here, on purpose, because a
 * cache that goes wrong does not throw. It serves last week's garden, forever,
 * to somebody who cannot see that it is doing it and has no way to tell you.
 * Every rule in this file is a rule about not being able to be told.
 *
 * **What it is for.** Two people, seven timezones apart, on the two networks
 * this world actually runs on. Before this, every launch fetched the shell
 * from Vercel first: the door, the meadow and the sky waited on a round trip
 * to a server on another continent before a single frame existed. Now they
 * come off the disk, and the network's job on opening is nothing at all.
 *
 * **The three rules it is built on:**
 *
 * 1. *Only the shell is precached.* The places, the games, the Firebase SDK
 *    and the admin page are already deliberately lazy — see the note in
 *    `PLAN.md` about 696 KB before first paint becoming 404 KB. Precaching all
 *    of it would put every one of those kilobytes back in front of the first
 *    frame and undo that work exactly. They are cached the first time they are
 *    *used* instead, so the garden becomes more offline the more of it you
 *    have walked through, which is the right shape.
 *
 * 2. *Nothing with sound in it is touched.* Media is played through `<audio>`
 *    and through ranged requests, and a cache that answers a Range request
 *    with a whole file is a bug that shows up as silence on one browser and a
 *    stall on another. The four road beds are twelve of the twenty megabytes
 *    in `dist` and none of it belongs here. Racing offline is a race with no
 *    music; that is a degradation, and the alternative is a defect.
 *
 * 3. *An update is offered, never taken.* `skipWaiting` is not called on
 *    install. A new worker sits waiting until the person says yes, because the
 *    alternative is the world reloading underneath somebody in the last corner
 *    of a qualifying lap. `systems/renewal` is the other half of this.
 * ---------------------------------------------------------------------------
 */

/* Filled in by the build. VERSION changes whenever SHELL does, which is what
   makes this file's bytes differ and the browser notice there is a new one. */
const VERSION = '__VERSION__'
const SHELL = __SHELL__

const SHELL_CACHE = `garden:shell:${VERSION}`
const RUNTIME_CACHE = `garden:runtime:${VERSION}`
const INDEX = '/index.html'

/*
  Where a photograph waits between the phone's share sheet and the Glasshouse.

  Not versioned, and deliberately outside the two above: it holds one file for
  the couple of seconds between the operating system handing it over and the
  garden picking it up, and a new deploy landing in that gap must not be able
  to throw it away. `activate` keeps this one for the same reason.
*/
const SHARE_CACHE = 'garden:shared'
const SHARE_KEY = '/a-shared-photograph'

/*
  Every cache this worker has ever made starts with this. `activate` deletes
  anything carrying the prefix that is not one of the two names above, so a
  version left behind by an older garden is collected rather than accumulating
  on a phone forever.
*/
const OURS = 'garden:'

// ---------------------------------------------------------------------------
// Installing
// ---------------------------------------------------------------------------

/*
  `addAll` is atomic, and that is the reason to use it rather than a loop of
  `put`s that tolerates a failure.

  If one file of the shell cannot be fetched, the whole install fails, this
  worker never activates, and whatever was there before carries on serving. A
  garden that is still on last week's shell is a small problem. A garden whose
  shell is cached with one script missing is a white screen, and it is a white
  screen that survives a reload, which is the worst outcome this file can
  produce. Failing loudly at install is how that stays impossible.
*/
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL.map((path) => new Request(path, { cache: freshness(path) }))),
    ),
  )
})

/**
 * Whether to let the browser's own HTTP cache answer while we fill ours.
 *
 * Anything under `/assets/` carries a content hash in its name, so a copy the
 * browser already holds is *definitionally* the right bytes and re-fetching it
 * is a download for nothing — which on her connection is not nothing.
 *
 * `index.html`, the icons and the manifest keep their names across deploys, so
 * a cached copy of one of those may be the previous garden's. Those are pulled
 * with `reload`, which bypasses the HTTP cache and goes to the network.
 */
function freshness(path) {
  return path.startsWith('/assets/') ? 'default' : 'reload'
}

// ---------------------------------------------------------------------------
// Activating
// ---------------------------------------------------------------------------

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter(
            (name) =>
              name.startsWith(OURS) &&
              name !== SHELL_CACHE &&
              name !== RUNTIME_CACHE &&
              // A photograph mid-flight from the share sheet. See SHARE_CACHE.
              name !== SHARE_CACHE,
          )
          .map((name) => caches.delete(name)),
      )
      /*
        Claim, so the very first visit is controlled without needing a second
        one. Every later activation is already downstream of a person tapping
        the renewal line, and `systems/renewal` reloads the page itself when
        the controller changes — so this never pulls the rug out from under
        anybody who did not ask for it.
      */
      await self.clients.claim()
    })(),
  )
})

/*
  The only thing the page can ask this worker to do.

  Named rather than a bare 'skip-waiting' because a service worker receives
  messages from anything on the origin, and a message channel with one verb on
  it should say whose verb it is.
*/
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'garden:take-the-new-one') self.skipWaiting()
})

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

/**
 * What this worker refuses to have an opinion about.
 *
 * Returning nothing from a fetch handler is not a failure — it hands the
 * request back to the browser untouched, which for all of these is the only
 * correct answer:
 *
 * - **Anything but GET.** A write is not a thing to serve from a cache.
 * - **Another origin.** Firestore, Storage, YouTube, the fonts on gstatic and
 *   the Firebase SDK the push worker imports. Every one of them has its own
 *   freshness rules and none of them is ours to guess at.
 * - **Sound and video, by destination or by extension.** Rule 2 at the top.
 * - **A ranged request.** The same rule, caught a second way: `<audio>` is not
 *   the only thing that asks for part of a file, and a partial request
 *   answered from a whole cached body is a stall with no error attached.
 */
function notOurs(request, url) {
  if (request.method !== 'GET') return true
  if (url.origin !== self.location.origin) return true
  if (request.headers.has('range')) return true
  if (request.destination === 'audio' || request.destination === 'video') return true
  return /\.(mp3|m4a|aac|mp4|webm|ogg|wav|flac)$/i.test(url.pathname)
}

/**
 * A photograph arriving from the phone's own share sheet.
 *
 * ---------------------------------------------------------------------------
 * The manifest declares the garden as somewhere a picture can be *sent*, so
 * she can be in her camera roll, press share, and pick the Glasshouse — and
 * the world opens with the photograph already in her hands. No opening the
 * garden first, no finding the aisle, no picker on top of a picker.
 *
 * The operating system delivers it as a **POST**, which is the one thing a
 * page cannot be opened with. So it lands here instead: the file is put
 * somewhere the page can reach, and the POST is answered with a redirect to an
 * ordinary address the world knows how to open. `systems/shared` is the other
 * end, and it takes the file *and deletes it*, so a photograph is hung once
 * however many times the address is reloaded.
 *
 * Every failure ends at the front door rather than at an error: a share that
 * did not survive the trip should look like somebody opening the garden, which
 * is the thing they were about to do anyway.
 * ---------------------------------------------------------------------------
 */
async function takeTheShare(request) {
  try {
    const form = await request.formData()
    const file = form.get('photograph')
    if (file && typeof file !== 'string' && file.size > 0) {
      const cache = await caches.open(SHARE_CACHE)
      await cache.put(
        SHARE_KEY,
        new Response(file, {
          headers: { 'content-type': file.type || 'application/octet-stream' },
        }),
      )
      return Response.redirect('/?shared=1', 303)
    }
  } catch {
    /* Nothing usable came through. */
  }
  return Response.redirect('/', 303)
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  // Before `notOurs`, which refuses every POST — this is the one POST in the
  // world, and it never reaches a network at all.
  if (request.method === 'POST' && url.pathname === '/share') {
    event.respondWith(takeTheShare(request))
    return
  }

  if (notOurs(request, url)) return

  /*
    Every navigation in this world is the same document.

    The garden has no URLs — `systems/backstop` says why — so `/`, `/dev7731`
    and anything either of you has bookmarked all resolve to one shell, which
    is exactly what `vercel.json` rewrites to on the server. Answering from the
    cache is what makes the world open with no signal, and it is also what
    makes it open *instantly* with a good one.
  */
  if (request.mode === 'navigate') {
    event.respondWith(theShell(request))
    return
  }

  event.respondWith(theRest(request, url))
})

async function theShell(request) {
  const cached = await caches.match(INDEX, { cacheName: SHELL_CACHE })
  if (cached) return cached
  /*
    Only reachable before the first install has finished — the shell is
    precached, so after that this line is unreachable by construction. If the
    network is also gone at that exact moment there is genuinely nothing to
    serve, and the browser's own offline page is a better answer than one this
    file could invent.
  */
  return fetch(request)
}

async function theRest(request, url) {
  const shell = await caches.match(request, { cacheName: SHELL_CACHE })
  if (shell) return shell

  const cache = await caches.open(RUNTIME_CACHE)
  const held = await cache.match(request)

  /*
    Content-hashed, therefore immutable, therefore never revalidated.

    A file under `/assets/` cannot change without changing its name, so a copy
    in hand is the right copy for as long as it is wanted. This is the line
    that makes the Hollow work offline after you have been to the Hollow once.
  */
  if (held && url.pathname.startsWith('/assets/')) return held

  const fromNetwork = fetch(request)
    .then((response) => {
      if (keepable(response)) cache.put(request, response.clone())
      return response
    })
    .catch(() => null)

  /*
    Everything else — the icons, the logos, the manifest — keeps its name
    across deploys, so it is served from the cache at once and replaced in the
    background. One garden behind on an icon is not a thing anybody can see;
    waiting on the network for one is.
  */
  if (held) return held

  const response = await fromNetwork
  if (response) return response
  return new Response('', { status: 504, statusText: 'The garden is offline.' })
}

/**
 * Only a real, whole, same-origin success is worth keeping.
 *
 * `type === 'basic'` excludes opaque cross-origin responses, whose status is
 * always 0 and whose body cannot be inspected — storing one caches a failure
 * that is indistinguishable from a success on the way back out. A 206 is
 * refused for the reason in `notOurs`, and caught here too because a server
 * may answer with one whether or not it was asked.
 */
function keepable(response) {
  return Boolean(response) && response.ok && response.status === 200 && response.type === 'basic'
}
