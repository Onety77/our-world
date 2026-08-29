/**
 * Three faders, because the garden is three different kinds of sound.
 *
 * ---------------------------------------------------------------------------
 * Everything used to be summed straight into one master gain, which meant
 * there was exactly one thing anybody could do about the mix: turn the whole
 * world up or down together. That is not a control, it is a switch — if the
 * car is too loud against the wind, the only available move makes the wind
 * quieter too.
 *
 * So the sum happens in three places instead of one, and they are chosen by
 * *where the sound comes from* rather than by which file made it:
 *
 *   world     the place you are standing in. The wind, the leaves, the water,
 *             the fire, the room tone under a cave — and the roads' own
 *             weather, because rain on the Stormcrown is the world doing
 *             something, not the car
 *   effects   things that happen *because of you*. The car, a stone landing
 *             on a stone, a pen on paper, the note a message makes
 *   music     the player in the corner, which is the one sound in here that
 *             somebody chose on purpose
 *
 * **Per device, and never sent.** How loud a phone wants to be is a fact about
 * the phone and the room it is in — hers is not on a desk in Kano. Same reason
 * the driving buttons' positions are local: see `ember-rally/touch`.
 * ---------------------------------------------------------------------------
 */

import { create } from 'zustand'

export interface Levels {
  world: number
  effects: number
  music: number
}

/**
 * Everything at full, which is what it has always been.
 *
 * The point of this is not to change how the garden sounds by default — it is
 * to make the balance something you can reach. A default that quietly moved
 * the mix would be a change nobody asked for hiding inside a control.
 */
export const FULL: Levels = { world: 1, effects: 1, music: 1 }

const KEY = 'garden:volume:v1'

function clean(raw: unknown): Levels {
  if (raw === null || typeof raw !== 'object') return { ...FULL }
  const source = raw as Record<string, unknown>
  const one = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.min(1, value))
      : fallback
  return {
    world: one(source.world, FULL.world),
    effects: one(source.effects, FULL.effects),
    music: one(source.music, FULL.music),
  }
}

function read(): Levels {
  if (typeof window === 'undefined') return { ...FULL }
  try {
    const raw = localStorage.getItem(KEY)
    return raw === null ? { ...FULL } : clean(JSON.parse(raw))
  } catch {
    return { ...FULL }
  }
}

function write(levels: Levels): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(levels))
  } catch {
    /* storage blocked; the faders still work, the device just forgets */
  }
}

interface VolumeState {
  levels: Levels
  set(which: keyof Levels, value: number): void
  reset(): void
}

export const useVolume = create<VolumeState>((set, get) => ({
  levels: read(),
  set(which, value) {
    const levels = { ...get().levels, [which]: Math.max(0, Math.min(1, value)) }
    write(levels)
    set({ levels })
  },
  reset() {
    write(FULL)
    set({ levels: { ...FULL } })
  },
}))

/**
 * Read it without subscribing.
 *
 * For the places that are not React — the `<audio>` element the player drives,
 * and the ambience graph, both of which want the number at the moment they act
 * rather than a re-render when it changes.
 */
export function levelsNow(): Levels {
  return useVolume.getState().levels
}

/**
 * A fader position turned into a gain.
 *
 * Squared, because loudness is not linear and a linear fader spends its top
 * half doing almost nothing audible and its bottom half falling off a cliff.
 * Squaring puts the useful range in the middle of the travel, which is where
 * a hand naturally lands.
 */
export function gainOf(level: number): number {
  const clamped = Math.max(0, Math.min(1, level))
  return clamped * clamped
}
