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
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        cache.addAll(SHELL.map((path) => new Request(path, { cache: freshness(path) }))),
      )
      /*
        ====================================================================
        **Take over as soon as the new shell is safely down, and this is the
        one lever that can un-break a device.**

        It was deliberately not here at first, on the rule that an update is
        offered and never taken. That rule is still kept — but it is kept by
        `systems/renewal`, which is the thing that decides whether the *page*
        reloads, and it will not reload one until somebody touches the line.
        This only decides which worker answers the *next* load.

        Leaving it out had a failure with no way out of it. If a cached shell
        is broken — which is exactly what a deploy used to do to it, see
        `gardenWorker` in `vite.config.ts` — then the page never mounts, so
        the renewal line never renders, so there is nothing to touch, so the
        replacement worker waits for every client to close and the person is
        looking at a garden that will not open and cannot be told to update.
        On a phone with the world on its home screen, "close every client"
        means force-quitting an app, which nobody is going to guess.

        A worker that steps up on its own costs a page nothing it was using.
        A worker that politely waits can strand somebody for good.
        ====================================================================
      */
      .then(() => self.skipWaiting()),
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

/*
  Which version was serving the garden before this one.

  One tiny cache holding one word. It exists because of the rule below, and
  there is nowhere else a worker can leave a note for its successor.
*/
const GENERATION = 'garden:generation'
const GENERATION_KEY = '/which-garden'

async function previousVersion() {
  try {
    const cache = await caches.open(GENERATION)
    const held = await cache.match(GENERATION_KEY)
    return held ? await held.text() : null
  } catch {
    return null
  }
}

async function recordThisVersion() {
  try {
    const cache = await caches.open(GENERATION)
    await cache.put(GENERATION_KEY, new Response(VERSION))
  } catch {
    /* Then the next worker keeps one generation more than it needed to. */
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      /*
        ====================================================================
        **Collect old caches, but never the one still being served from.**

        This is the rule that a blank screen after a deploy was hiding, and it
        only became reachable once `install` started calling `skipWaiting`.

        A replacement worker activates *while the previous one is still
        driving every page that is already open* — the spec keeps a page with
        the worker it started under until it navigates again. So the old
        worker is alive, answering fetches, and reading from a cache named
        after **its** version. Deleting that cache out from under it does not
        make it fall back to the network: `caches.match` with a `cacheName`
        that no longer exists fails, so the page it is halfway through booting
        simply stops, with an empty `#root` and nothing in the console.

        One generation back is therefore kept — that is the one that can still
        be in use — and everything older goes. Storage stays bounded at two
        builds, which for a garden this size is a few megabytes.
        ====================================================================
      */
      const before = await previousVersion()
      const keep = new Set([
        SHELL_CACHE,
        RUNTIME_CACHE,
        // A photograph mid-flight from the share sheet. See SHARE_CACHE.
        SHARE_CACHE,
        GENERATION,
        ...(before ? [`garden:shell:${before}`, `garden:runtime:${before}`] : []),
      ])

      const names = await caches.keys()
      const stale = names.filter((name) => name.startsWith(OURS) && !keep.has(name))
      await Promise.all(stale.map((name) => caches.delete(name)))

      /*
        **Claim the first install, and never claim a replacement.**

        On a first install the page that just fetched us came over the network
        and taking it over costs it nothing. On a replacement it is the same
        mistake as the deletion above from the other side: the open page is
        running the previous build's entry and asking for the previous build's
        chunks by name, and this worker holds neither. A page keeps the worker
        it started with; the next navigation gets this one, with a shell that
        matches it.
      */
      if (before === null) await self.clients.claim()
      await recordThisVersion()
    })(),
  )
})

/*
  There is deliberately no message channel here any more.

  The page used to ask this worker to step up, because it only stepped up when
  asked. It steps up on its own now — see `install` — so the ask had nothing
  left to do, and a listener that answers to a verb nobody says is a thing the
  next reader has to work out is dead.
*/

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

  /*
    ==========================================================================
    **Then every other cache we are still keeping, and this line is the whole
    reason a deploy used to blank the screen for one visit.**

    A page belongs to the build it was loaded from. When a new worker takes
    over — see `install` — the pages already open are still running the
    previous build's entry and asking for the previous build's chunks *by
    name*, and those names are not in this version's shell. Looking only in
    our own shell meant answering "no" to a file that was sitting in the cache
    next door, going to the network for it, and getting the front page back
    with a `200` on it because that is what the host does with a path it does
    not recognise. The module then failed to parse, silently, and the garden
    stopped at *opening…*.

    `caches.match` with no name searches all of them. `activate` keeps exactly
    one generation back, so what it can find is bounded and is precisely the
    set of builds that can still have a page open on them.
    ==========================================================================
  */
  const older = await caches.match(request)
  if (older) return older

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
      if (keepable(request, response)) cache.put(request, response.clone())
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
 * A page where a script should be.
 *
 * ---------------------------------------------------------------------------
 * **The single nastiest thing about hosting an app at one address: a missing
 * file does not come back missing.**
 *
 * Every path that is not a real file is rewritten to `index.html`, because
 * that is what makes `/dev7731` and a shared link work. So a build that asks
 * for a chunk which no longer exists is not told *no*: it is handed the front
 * page, with a cheerful `200` on it. The browser tries to run a document as a
 * module, fails without a word, and the garden stops at *opening…* — which is
 * exactly how a stale copy of this app died, and why it took a fetch of the
 * script's own URL to see it.
 *
 * `vercel.json` now leaves `/assets/` out of that rewrite, so the honest 404
 * comes back. This is the second line: a worker that cached the front page
 * *under the name of a script* would have made a bad deploy permanent, and no
 * amount of reloading would have shaken it out.
 * ---------------------------------------------------------------------------
 */
function pageInsteadOfCode(request, response) {
  const wanted = request.destination
  if (wanted !== 'script' && wanted !== 'style') return false
  const got = response.headers.get('content-type') ?? ''
  return got.includes('text/html')
}

/**
 * Only a real, whole, same-origin success of the right kind is worth keeping.
 *
 * `type === 'basic'` excludes opaque cross-origin responses, whose status is
 * always 0 and whose body cannot be inspected — storing one caches a failure
 * that is indistinguishable from a success on the way back out. A 206 is
 * refused for the reason in `notOurs`, and caught here too because a server
 * may answer with one whether or not it was asked.
 */
function keepable(request, response) {
  if (!response || !response.ok || response.status !== 200) return false
  if (response.type !== 'basic') return false
  return !pageInsteadOfCode(request, response)
}
