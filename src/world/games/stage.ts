/**
 * When a game takes the world.
 *
 * Most games are a board drawn over the Hollow: the cave keeps rendering
 * behind them and the game itself is DOM. Ember Rally is not — the race *is*
 * a place, and it needs the camera, the whole frame, and the garden's own
 * renderer with its one tone-mapping pipeline.
 *
 * The alternative was a second `<Canvas>` for the racer, and it is worth
 * writing down why that was refused: a second canvas is a second WebGL context
 * (phones ration those, and losing one silently blanks a scene), a second
 * shader pipeline that will drift out of agreement with the garden's about
 * what "lit" means, and a second copy of three.js's render loop competing for
 * the same frame. The last racer here had exactly that problem in 2D and it is
 * most of why it read as a different program bolted onto this one.
 *
 * So instead: a game may export a `Stage`, and while this flag is set the
 * world renders that instead of the section. One boolean, because the question
 * is genuinely binary — either the world is the game or it is behind it.
 */

import { create } from 'zustand'

interface GameStageState {
  /** True while a game's Stage owns the Canvas. */
  taken: boolean
  take(taken: boolean): void
}

export const useGameStage = create<GameStageState>((set) => ({
  taken: false,
  take: (taken) => set({ taken }),
}))
