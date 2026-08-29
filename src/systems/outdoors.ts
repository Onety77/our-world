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

export const OPEN: PlaceLevels = {
  garden: 1,
  tree: 1,
  river: 1,
  hollow: 1,
  stars: 1,
  glasshouse: 1,
}

/** Kept at the old key so sliders already moved by the owner become a draft. */
const DRAFT_KEY = 'garden:outdoors:v1'

function clean(raw: unknown): PlaceLevels {
  const out: PlaceLevels = { ...OPEN }
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

interface PlaceVolumeState {
  published: PlaceLevels
  draft: PlaceLevels | null
  /** Effective values: the local draft when one exists, otherwise published. */
  howMuch: PlaceLevels
  set(place: InsidePlace, value: number): void
  toDefaults(): void
  dropDraft(): void
  receivePublished(values: Record<string, number>): void
  markPublished(values: PlaceLevels): void
}

const firstDraft = readDraft()

export const useOutdoors = create<PlaceVolumeState>((set, get) => ({
  published: { ...OPEN },
  draft: firstDraft,
  howMuch: firstDraft ?? { ...OPEN },

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
    set({ published, draft: null, howMuch: published })
  },
}))

/** Read on the ambience animation loop without causing React frame updates. */
export function placeLevelsNow(): PlaceLevels {
  return useOutdoors.getState().howMuch
}
