/**
 * Something that is fetched when it is wanted, and fetched *before* that if we
 * can see it coming.
 *
 * ---------------------------------------------------------------------------
 * The garden used to hand you all of itself at once. Every place, both games,
 * the racer's physics and both of its roads, the admin page — all of it
 * downloaded and parsed before the first blade of grass, because the two
 * registries collect their folders with `import.meta.glob(..., { eager: true })`
 * and each folder's `index.ts` reached straight into the thing it describes.
 * That is a lovely way to write a registry and a poor way to start a website
 * over a phone connection in Lagos.
 *
 * **The load is deferred. The wait is not.** Those are separate problems and it
 * is the second one that would be felt: a place that has to be fetched at the
 * moment you swipe to it is a place that shows you an empty world for a beat,
 * which is worse than the thing it fixed. So everything here comes with
 * `warm()`, and the rule for using it is:
 *
 *   **warm on the first hint, never on the click.**
 *
 * The hint is always there and it is always early. You look at the row of games
 * before you press one. The slide toward a place takes most of a second and
 * announces where it is going before it starts. And when there is no hint at
 * all, there is still the best moment of the lot — the seconds you spend
 * standing in the garden when the world has finished loading and nothing is
 * happening. Everything is warmed then, quietly, so that by the time you reach
 * for any of it, it is already here.
 *
 * `import()` caches, so warming twice is free and warming something already
 * loaded costs a resolved promise. Call it as often as you like.
 * ---------------------------------------------------------------------------
 */

import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export type Later<P = object> = LazyExoticComponent<ComponentType<P>> & {
  /** Fetch the code now, without rendering anything. Cheap, and idempotent. */
  warm(): void
  /** Resolve once React can mount this component without a network wait. */
  whenReady(): Promise<void>
}

export function later<P = object>(
  load: () => Promise<{ default: ComponentType<P> }>,
): Later<P> {
  /*
    React.lazy and our warm-up must share the exact promise. Dynamic import
    caches the module, but two separate calls can still leave React observing
    a different promise for a frame. One flight also gives navigation a real
    readiness signal instead of guessing from a timeout.
  */
  let flight: ReturnType<typeof load> | null = null
  const loadOnce = () => {
    flight ??= load()
    return flight
  }

  const Loaded = lazy(loadOnce) as Later<P>
  /*
    Hung on the component rather than kept beside it.

    Everything downstream already passes these around as one thing — a section
    definition holds a `Scene`, a game holds a `Component` and a `Stage` — and
    a second field to carry alongside each of them is a second field for every
    call site to remember. Something that knows how to be rendered should know
    how to arrive.
  */
  Loaded.warm = () => {
    void loadOnce()
  }
  Loaded.whenReady = async () => {
    await loadOnce()
  }
  return Loaded
}

/**
 * Warm a pile of things when the browser has nothing better to do.
 *
 * `requestIdleCallback` where it exists, which is everywhere except Safari, and
 * a timeout where it does not. The timeout is long on purpose: this competes
 * with the first frames of a 3D world for the same main thread, and a garden
 * that stutters on arrival to prefetch a place you have not asked for has
 * spent its saving in the worst possible place.
 */
export function warmWhenIdle(things: { warm(): void }[], after = 2500): () => void {
  let cancelled = false
  const run = () => {
    if (cancelled) return
    for (const thing of things) thing.warm()
  }

  const idle = (window as unknown as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback
  const timer = window.setTimeout(() => {
    if (idle) idle(run, { timeout: 4000 })
    else run()
  }, after)

  return () => {
    cancelled = true
    window.clearTimeout(timer)
  }
}
