/**
 * Coming back to where you were standing.
 *
 * ---------------------------------------------------------------------------
 * **This exists because of what a phone does to a web app that is not on the
 * screen.** iOS in particular discards an installed one quickly and without
 * warning: you glance at a message, answer it, come back forty seconds later,
 * and the world you were standing in the middle of has been replaced by the
 * front door. Nothing crashed and nothing was lost — but the garden asked you
 * to walk back in, and it asked every single time.
 *
 * So the place is written down as you move, and read back on the way in.
 *
 * **The door still opens.** It is tempting to remember that too and land
 * somebody straight in the Hollow, and it would be wrong twice: the browser
 * will not make a sound until a gesture has been made, and `ui/Arrival` *is*
 * that gesture — a garden restored past the door is a garden with no wind in
 * it. It is also the one moment this world has that says *you are arriving*.
 * What changes is where the door opens onto.
 *
 * **And it forgets after an hour.** A garden that always resumes is not a
 * garden you can leave. Coming back the next morning should be coming back to
 * the meadow, with the five places laid out in front of you, because that is
 * what opening the world means when you have actually been away — the resume
 * is for the interruption, not for the visit. An hour is long enough for a
 * phone call, a train, or a night screen someone else was driving, and short
 * enough that it never eats the arrival.
 * ---------------------------------------------------------------------------
 */

import { SECTIONS, sectionIndexById } from '@/sections/registry'
import { useSections } from './sections'

const KEY = 'garden:where:v1'

/** How long a place is still the place you were in. */
const STILL_THERE_MS = 60 * 60 * 1000

interface Standing {
  /** The section's id, not its index — the registry may be reordered. */
  id: string
  /** Inside it, or browsing the garden with it selected. */
  entered: boolean
  at: number
}

function read(): Standing | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const held = JSON.parse(raw) as Partial<Standing>
    if (typeof held.id !== 'string' || typeof held.at !== 'number') return null
    return { id: held.id, entered: held.entered === true, at: held.at }
  } catch {
    // A blocked or corrupt store is a garden that opens at the front door,
    // which is exactly what it did before this file existed.
    return null
  }
}

/**
 * Where to open, or null for the garden.
 *
 * **The id is checked against the registry rather than trusted.** A place can
 * be renamed or removed between one visit and the next — that is the whole
 * point of the registry being a folder — and a remembered id that no longer
 * exists would resolve to index -1 and open onto nothing at all.
 */
export function whereYouWere(): { index: number; entered: boolean } | null {
  const held = read()
  if (!held) return null
  if (Date.now() - held.at > STILL_THERE_MS) return null

  const index = sectionIndexById(held.id)
  if (index < 0 || index >= SECTIONS.length) return null
  return { index, entered: held.entered }
}

function write(index: number, entered: boolean): void {
  const id = SECTIONS[index]?.id
  if (!id) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ id, entered, at: Date.now() } satisfies Standing))
  } catch {
    /* Nothing is lost by not remembering. */
  }
}

/**
 * Start writing it down. Called once, from `App`.
 *
 * Subscribed to the store rather than driven from an effect, because the thing
 * being recorded is a fact about the world and not about any component — and
 * because `index` and `entered` are the two fields that move on a decision
 * rather than on a frame. `shown` and the slide position change constantly and
 * are deliberately not read here; they are the animation, not the place.
 */
export function rememberWhereYouWere(): () => void {
  // The current standing is written once at the start, so that the timestamp
  // reflects *this* visit even for somebody who opens the world and reads.
  const first = useSections.getState()
  write(first.index, first.entered)

  let lastIndex = first.index
  let lastEntered = first.entered

  return useSections.subscribe((state) => {
    if (state.index === lastIndex && state.entered === lastEntered) return
    lastIndex = state.index
    lastEntered = state.entered
    write(state.index, state.entered)
  })
}
