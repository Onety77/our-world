/**
 * The authored loudness of each place.
 *
 * This is not the device volume. `systems/volume` answers how loud this phone
 * wants the world, effects and music; these numbers answer how loud the Hollow
 * itself is compared with the Tree or the river. That makes them shared world
 * tuning, in exactly the same sense as the published Rally handling.
 *
 * There are three layers:
 *
 *   default    every place at the mix written in `ambience.ts`
 *   published  the levels saved for both people
 *   draft      what this device is trying in dev7731
 *
 * The draft wins locally until it is either published or dropped. It survives
 * the full-page trip from dev7731 back into the Garden so a change can actually
 * be heard before it is sent.
 */

import { create } from 'zustand'
import type { Place } from './ambience'

/** Every place you can enter. The open garden keeps the personal world level. */
export const INSIDES = ['tree', 'river', 'hollow', 'stars', 'glasshouse'] as const
export type InsidePlace = (typeof INSIDES)[number]

export type PlaceLevels = Record<Place, number>

/** Every place at the mix written in `ambience.ts`. The reset target. */
export const OPEN: PlaceLevels = {
  garden: 1,
  tree: 1,
  river: 1,
  hollow: 1,
  stars: 1,
  glasshouse: 1,
}

/*
  And where they start: nothing inside anything.

  This is the default because it was asked for, more than once, after five
  rounds of the same complaint — a sound present in every section that no
  change ever seemed to touch. Every one of those rounds moved a number that
  was already right and left the bed playing underneath, and the only honest
  way to end that is to begin from silence and let it be built back up one
  place at a time, by ear, with a slider.

  The open garden keeps its own voice. It is the one place that is *supposed*
  to sound like the garden.
*/
export const QUIET: PlaceLevels = {
  garden: 1,
  tree: 0,
  river: 0,
  hollow: 0,
  stars: 0,
  glasshouse: 0,
}

/** Kept at the old key so sliders already moved by the owner become a draft. */
const DRAFT_KEY = 'garden:outdoors:v1'

/*
  How much of the open garden reaches inside each place.

  Separate from the levels above, and the difference is the whole point. Those
  say *how loud the Hollow is*; this says *how much meadow is in it*. Zero
  everywhere is the honest default for an enclosed place — a cave with wind in
  it is a cave that is not real — and it is what the mix table already says for
  the Hollow, the Stars and the Glasshouse.

  It exists as a control because it kept being asked for and there was no way
  to check it. The garden's wind was reported inside the sections five separate
  times, fixed in the table each time, and reported again — with nothing in the
  interface able to say whether it was actually there. A number you can read
  and move settles that in one look.

  The Tree and the Wellspring start at zero too, which is a real change to how
  they sound: both are outdoors and both used the meadow's bed. One slider puts
  it back.
*/
const BLEED_KEY = 'garden:garden-bleed:v1'

/** No meadow inside anything, until somebody asks for some. */
export const NO_BLEED: PlaceLevels = {
  // The garden is the garden; its own wind is not a bleed into itself.
  garden: 1,
  tree: 0,
  river: 0,
  hollow: 0,
  stars: 0,
  glasshouse: 0,
}

function clean(raw: unknown): PlaceLevels {
  const out: PlaceLevels = { ...QUIET }
  if (raw === null || typeof raw !== 'object') return out
  const source = raw as Record<string, unknown>
  for (const place of INSIDES) {
    const value = source[place]
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[place] = Math.max(0, Math.min(1, value))
    }
  }
  return out
}

function readDraft(): PlaceLevels | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw === null ? null : clean(JSON.parse(raw))
  } catch {
    return null
  }
}

function writeDraft(value: PlaceLevels | null): void {
  if (typeof window === 'undefined') return
  try {
    if (value === null) localStorage.removeItem(DRAFT_KEY)
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(value))
  } catch {
    /* The live draft still works; this browser just cannot remember it. */
  }
}

export function samePlaceLevels(a: PlaceLevels, b: PlaceLevels): boolean {
  return INSIDES.every((place) => Math.abs(a[place] - b[place]) <= 1e-9)
}

function writeBleed(value: PlaceLevels): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(BLEED_KEY, JSON.stringify(value))
  } catch {
    /* it still works this session; this browser just cannot remember it */
  }
}

/** The keys these travel under, alongside the levels, in one document. */
export function bleedKeys(bleed: PlaceLevels): Record<string, number> {
  return Object.fromEntries(
    INSIDES.map((place) => [
      `bleed${place[0].toUpperCase()}${place.slice(1)}`,
      bleed[place],
    ]),
  )
}

function readBleed(): PlaceLevels {
  if (typeof window === 'undefined') return { ...NO_BLEED }
  try {
    const raw = localStorage.getItem(BLEED_KEY)
    if (raw === null) return { ...NO_BLEED }
    const parsed = JSON.parse(raw) as unknown
    const out = { ...NO_BLEED }
    if (parsed && typeof parsed === 'object') {
      const source = parsed as Record<string, unknown>
      for (const place of INSIDES) {
        const value = source[place]
        if (typeof value === 'number' && Number.isFinite(value)) {
          out[place] = Math.max(0, Math.min(1, value))
        }
      }
    }
    return out
  } catch {
    return { ...NO_BLEED }
  }
}

interface PlaceVolumeState {
  published: PlaceLevels
  draft: PlaceLevels | null
  /** Effective values: the local draft when one exists, otherwise published. */
  howMuch: PlaceLevels
  /** How much of the open garden reaches inside each place. See `BLEED_KEY`. */
  bleed: PlaceLevels
  /** The last of those that both of you have. */
  publishedBleed: PlaceLevels
  setBleed(place: InsidePlace, value: number): void
  set(place: InsidePlace, value: number): void
  toDefaults(): void
  dropDraft(): void
  receivePublished(values: Record<string, number>): void
  markPublished(values: PlaceLevels): void
}

const firstDraft = readDraft()

export const useOutdoors = create<PlaceVolumeState>((set, get) => ({
  published: { ...QUIET },
  draft: firstDraft,
  howMuch: firstDraft ?? { ...QUIET },
  bleed: readBleed(),
  publishedBleed: { ...NO_BLEED },

  setBleed(place, value) {
    const bleed = { ...get().bleed, [place]: Math.max(0, Math.min(1, value)) }
    writeBleed(bleed)
    set({ bleed })
  },

  set(place, value) {
    const draft = {
      ...(get().draft ?? get().published),
      [place]: Math.max(0, Math.min(1, value)),
    }
    writeDraft(draft)
    set({ draft, howMuch: draft })
  },

  toDefaults() {
    const draft = { ...OPEN }
    writeDraft(draft)
    set({ draft, howMuch: draft })
  },

  dropDraft() {
    writeDraft(null)
    set((state) => ({ draft: null, howMuch: state.published }))
  },

  receivePublished(values) {
    /*
      The same document carries both numbers for each place.

      `hollow` is how loud the Hollow is; `bleedHollow` is how much meadow is
      allowed into it. One write, one save button, because they are two answers
      about the same place and saving one without the other would leave the two
      of you hearing different rooms.

      A device that has never been sent any bleed keys — an older document —
      reads them as absent and keeps its own, rather than being reset to zero
      by a document that simply does not mention them.
    */
    const bleedIn: Record<string, unknown> = {}
    let sentAny = false
    for (const place of INSIDES) {
      const value = values[`bleed${place[0].toUpperCase()}${place.slice(1)}`]
      if (typeof value === 'number' && Number.isFinite(value)) {
        bleedIn[place] = value
        sentAny = true
      }
    }
    if (sentAny) {
      const bleed = { ...NO_BLEED }
      for (const place of INSIDES) {
        const value = bleedIn[place]
        if (typeof value === 'number') bleed[place] = Math.max(0, Math.min(1, value))
      }
      set({ bleed, publishedBleed: bleed })
      writeBleed(bleed)
    }

    const published = clean(values)
    set((state) => {
      if (state.draft && samePlaceLevels(state.draft, published)) {
        writeDraft(null)
        return { published, draft: null, howMuch: published }
      }
      return { published, howMuch: state.draft ?? published }
    })
  },

  markPublished(values) {
    const published = clean(values)
    writeDraft(null)
    set((state) => ({
      published,
      draft: null,
      howMuch: published,
      publishedBleed: { ...state.bleed },
    }))
  },
}))

/*
  A handle on the place levels, in development, beside `window.__ambience`.

  Five rounds of "the sound is still there" were argued from the mix table
  rather than from the speaker, and a checker that can move a fader and then
  measure what came out is the difference between believing that and knowing
  it. See `scripts/places.mjs`.
*/
if (import.meta.env.DEV) {
  const host = globalThis as typeof globalThis & { __outdoors?: typeof useOutdoors }
  host.__outdoors = useOutdoors
}

/** Read on the ambience animation loop without causing React frame updates. */
export function placeLevelsNow(): PlaceLevels {
  return useOutdoors.getState().howMuch
}

/** The same, for how much meadow is allowed inside. */
export function gardenBleedNow(): PlaceLevels {
  return useOutdoors.getState().bleed
}
