/**
 * A photograph that arrived from the phone's own share sheet.
 *
 * ---------------------------------------------------------------------------
 * The other end of `takeTheShare` in `sw/worker.js`. She is in her camera roll,
 * presses share, picks the Glasshouse — and the world opens with the picture
 * already in hand, instead of opening, finding the aisle, and going looking for
 * the same photograph through a second picker.
 *
 * **The file is taken, not read.** Deleting it in the same breath is what makes
 * `/?shared=1` safe to reload, to bookmark, or to sit in a phone's history: the
 * photograph is hung exactly once, and every later visit to that address is an
 * ordinary opening of the garden. A picture that could be hung twice by
 * pressing back is worse than one that was never shared.
 *
 * **Installed gardens only**, because a share target is a thing the operating
 * system offers on behalf of an installed app. In a browser tab none of this is
 * ever reached, and nothing anywhere mentions it — see `systems/badge` for the
 * same rule.
 * ---------------------------------------------------------------------------
 */

const SHARE_CACHE = 'garden:shared'
const SHARE_KEY = '/a-shared-photograph'

/** Whether this opening of the world is one the share sheet caused. */
export function cameFromASharedPicture(): boolean {
  if (typeof location === 'undefined') return false
  return new URLSearchParams(location.search).get('shared') === '1'
}

/**
 * Collect it, and leave nothing behind.
 *
 * Null when there is nothing waiting — which is the ordinary case and not a
 * fault: the worker redirects here before the page exists, and a share that
 * failed on the way through deliberately lands at the front door instead.
 */
export async function takeTheSharedPicture(): Promise<Blob | null> {
  if (typeof caches === 'undefined') return null
  try {
    const cache = await caches.open(SHARE_CACHE)
    const held = await cache.match(SHARE_KEY)
    if (!held) return null
    const picture = await held.blob()
    await cache.delete(SHARE_KEY)
    return picture.size > 0 ? picture : null
  } catch {
    // A browser with no Cache API, or storage that has been cleared under us.
    return null
  }
}

/**
 * Take `?shared=1` back out of the address.
 *
 * Not cosmetic. The parameter is how the world knows to look, and leaving it
 * in place means a reload looks like a fresh share — which finds nothing, and
 * so opens the Glasshouse's hanging screen with no photograph in it. Replacing
 * rather than pushing, so the back gesture is not spent on the garden's own
 * bookkeeping (`systems/backstop` owns that stack).
 */
export function forgetTheShareAddress(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return
  try {
    const here = new URL(window.location.href)
    here.searchParams.delete('shared')
    window.history.replaceState(window.history.state, '', here.pathname + here.search)
  } catch {
    /* An address that cannot be tidied still works. */
  }
}
