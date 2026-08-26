/**
 * When something the garden tried to do didn't work.
 *
 * **Why this exists.** Every write in the app — planting a thought, putting
 * something in the pot, saying something in the Stars — is an async call whose
 * rejection nothing was catching. So when `crypto.randomUUID` turned out to be
 * missing on a phone (see `data/ids`), all three of them threw and the buttons
 * simply did nothing at all. No message, no console error anyone would see on
 * a phone, nothing. It read exactly like a database being down.
 *
 * A thing that fails must say it failed. That is the honesty law, and it
 * applies hardest to the case nobody wrote a message for.
 *
 * Deliberately blunt: one line, the truth, and it goes away by itself. It is
 * not an error dialog and it never blocks anything — you should be able to try
 * again immediately, and on a bad connection that is usually all it takes.
 */

import { create } from 'zustand'

interface TroubleState {
  /** What went wrong, in a sentence, or null. */
  what: string | null
  say(what: string): void
  clear(): void
}

export const useTrouble = create<TroubleState>((set) => ({
  what: null,
  say: (what) => set({ what }),
  clear: () => set({ what: null }),
}))

/**
 * Run a write, and say so if it fails.
 *
 * Wrap anything that changes stored state. The message is written for the
 * person holding the phone, not for whoever wrote the code: it says what did
 * not happen, never what threw.
 */
export async function attempt(what: string, run: () => Promise<void>): Promise<boolean> {
  try {
    await run()
    return true
  } catch (error) {
    // The detail still goes to the console for whoever is debugging, but the
    // person is told the only thing they can act on.
    console.error(`[garden] ${what} failed`, error)
    useTrouble.getState().say(what)
    return false
  }
}

/** The same failure boundary for operations whose successful value is needed next. */
export async function attemptValue<T>(what: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run()
  } catch (error) {
    console.error(`[garden] ${what} failed`, error)
    useTrouble.getState().say(what)
    return null
  }
}

/**
 * Catch anything that got away.
 *
 * A backstop for writes nobody remembered to wrap, and for failures that
 * happen inside listeners where there is no call to wrap. Installed once, from
 * App.
 */
export function watchForTrouble(): () => void {
  const onRejection = (e: PromiseRejectionEvent) => {
    console.error('[garden] something failed', e.reason)
    useTrouble.getState().say('that didn’t go through')
  }
  window.addEventListener('unhandledrejection', onRejection)
  return () => window.removeEventListener('unhandledrejection', onRejection)
}
