/**
 * What she has left in a place since the last time you stood in it.
 *
 * ---------------------------------------------------------------------------
 * The garden is for two people who are almost never awake at the same time.
 * Nearly everything either of you does is found by the other one *later* — and
 * until now the only thing that said so was a number in a corner: "2 from
 * Cool", "2 for you". Those are staying, because knowing exactly what is
 * waiting is worth having and a glow cannot count.
 *
 * But a number tells you *how many*. It cannot tell you **which one**, or where,
 * and it certainly cannot make you feel that somebody was here while you were
 * asleep. So the world says the second half: the thing she left is lit, in her
 * own colour, brighter than it will ever be again — one thought under the Tree,
 * one pane in the Glasshouse, one light low on the Stars' horizon. You look
 * around and see where she has been.
 *
 * **The rule is per place, and it is the whole design.**
 *
 * A single "last seen" for the whole garden fails in the way that matters: you
 * open the world, glance at the Tree, and everything she left in the other four
 * places is silently marked as seen. You would never find it. So each place
 * remembers when you last stood in *it*, and standing there is the only thing
 * that clears it.
 *
 * **And the mark is frozen while you are in the room.** If entering wrote the
 * new timestamp immediately, the lights would go out on the frame you arrived —
 * you would clear the very thing you came to see, and never once see it lit.
 * So the mark is read on the way in, held for the whole visit, and only written
 * on the way out. You get one visit with it lit, which is exactly one more than
 * you need.
 *
 * **Kept on the device rather than in the world.** Everything else here is
 * shared, and this deliberately is not: "have I seen this" is a fact about a
 * person looking at a screen, not about the garden. Keeping it local also means
 * no new collection, no rule change and nothing to deploy — and the failure
 * mode of a cleared browser is that one visit's worth of things look new again,
 * which is a very forgiving way to be wrong.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useRef } from 'react'

const KEY = 'garden:stood:v1'

type Marks = Record<string, number>

function read(): Marks {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return parsed && typeof parsed === 'object' ? (parsed as Marks) : {}
  } catch {
    return {}
  }
}

function write(marks: Marks): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(marks))
  } catch {
    /* a private window, a full disk. Everything just looks new. */
  }
}

/** When you last stood in a place, in epoch milliseconds. */
export function lastStoodIn(place: string): number {
  const at = read()[place]
  return typeof at === 'number' && Number.isFinite(at) ? at : 0
}

/** Remember that you have now been. Called on the way *out* — see above. */
export function stoodIn(place: string, at: number = Date.now()): void {
  const marks = read()
  // Never travels backwards: two tabs closing out of order should not reopen
  // something you have already looked at.
  if ((marks[place] ?? 0) >= at) return
  marks[place] = at
  write(marks)
}

/**
 * The mark for this place, frozen for as long as you are standing in it.
 *
 * Returns a *stable* number: the same value for the whole visit, whatever
 * arrives while you are there. Something she posts while you are both in the
 * room is a different feeling and the room has its own way of saying so —
 * `together` in the Glasshouse, her light appearing in the Stars — and dressing
 * it up as "you missed this" would be a lie told about the one moment you did
 * not miss anything.
 */
export function useStoodIn(place: string): number {
  const since = useRef<number | null>(null)
  if (since.current === null) since.current = lastStoodIn(place)

  useEffect(() => {
    /*
      Written on the way out, and also if the tab is closed while you are still
      in the room — otherwise leaving by shutting the lid means the place never
      counts as visited, and the same lights greet you forever.
    */
    const done = () => stoodIn(place)
    window.addEventListener('pagehide', done)
    return () => {
      window.removeEventListener('pagehide', done)
      done()
    }
  }, [place])

  return since.current
}

/**
 * Whether one thing is something she left while you were away.
 *
 * Hers, and newer than the mark. Both halves matter: your own last thought is
 * not news, and neither is hers from a fortnight ago that you have walked past
 * six times.
 */
export function isHersAndNew(
  item: { at: number; by: string } | null | undefined,
  them: string,
  since: number,
): boolean {
  return Boolean(item && item.by === them && item.at > since)
}
