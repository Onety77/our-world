/**
 * How much of the garden you can hear from inside each place.
 *
 * ---------------------------------------------------------------------------
 * **This is a real dial, not a workaround.** The mix table in `ambience.ts`
 * gives every place a weight for every layer, and the two outdoor layers — the
 * air and the leaves on it — were set generously nearly everywhere:
 *
 *     garden  air 1.00   leaves 1.00
 *     tree    air 1.00   leaves 1.30   ← more of both than the garden itself
 *     glass   air 0.55   leaves 0.72
 *     river   air 0.50   leaves 0.28
 *     stars   air 0.42   leaves 0.10
 *     hollow  air 0.05   leaves 0.00
 *
 * Read on its own that is defensible: the Tree *is* outdoors, and standing
 * under it should not sound like standing indoors. Heard on a phone speaker
 * with everything else competing, it means four of the five places sound like
 * the meadow with something quiet added, and each one stops having a sound of
 * its own.
 *
 * Which of those two is right is a matter of taste and of what the speaker in
 * your hand does with a broad band of noise, so it is not a thing to settle by
 * argument. It is a thing to put a fader on.
 *
 * **One number per place, multiplying the two outdoor layers only.** Not the
 * water, the fire, the room tone or the Stars' tones — those are what each
 * place is *made of*, and turning them down would not quieten the garden, it
 * would empty the room.
 * ---------------------------------------------------------------------------
 */

import { create } from 'zustand'
import type { Place } from './ambience'

/** Every place you can be inside. The garden is not one — it is the outside. */
export const INSIDES: readonly Place[] = ['tree', 'river', 'hollow', 'stars', 'glasshouse']

export type Outdoors = Record<Place, number>

/**
 * Everything as it has always been, so nothing changes until you move one.
 *
 * The garden is pinned at 1 and has no fader: turning the garden down *in the
 * garden* is what the world fader is for.
 */
export const OPEN: Outdoors = {
  garden: 1,
  tree: 1,
  river: 1,
  hollow: 1,
  stars: 1,
  glasshouse: 1,
}

const KEY = 'garden:outdoors:v1'

function clean(raw: unknown): Outdoors {
  const out: Outdoors = { ...OPEN }
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

function read(): Outdoors {
  if (typeof window === 'undefined') return { ...OPEN }
  try {
    const raw = localStorage.getItem(KEY)
    return raw === null ? { ...OPEN } : clean(JSON.parse(raw))
  } catch {
    return { ...OPEN }
  }
}

function write(value: Outdoors): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    /* storage blocked; the faders still work, the device just forgets */
  }
}

interface OutdoorsState {
  howMuch: Outdoors
  set(place: Place, value: number): void
  reset(): void
}

export const useOutdoors = create<OutdoorsState>((set, get) => ({
  howMuch: read(),
  set(place, value) {
    const howMuch = { ...get().howMuch, [place]: Math.max(0, Math.min(1, value)) }
    write(howMuch)
    set({ howMuch })
  },
  reset() {
    write(OPEN)
    set({ howMuch: { ...OPEN } })
  },
}))

/**
 * Read it without subscribing — the ambience tick runs sixty times a second.
 *
 * Returns the whole record rather than one place, because the tick is in the
 * middle of a crossfade between two of them and needs both.
 */
export function outdoorsNow(): Outdoors {
  return useOutdoors.getState().howMuch
}
