import type { GameDefinition } from '../types'
import EmberRally from './EmberRally'
import { RootwayStage } from './Race'
import type { RallyMove, RallySetup } from './model'

export default {
  id: 'ember-rally',
  name: 'Ember Rally',
  blurb: 'Set a line through the Rootway, then chase hers through fire and stone.',
  mode: 'async',
  cadence: 'daily',
  duration: 'under a minute, twice',
  order: 1,

  /*
    The road is the seed and nothing else.

    Both phones build the same tunnel, the same lanterns, the same loose stone
    and the same racing line out of this one number — so a run recorded on a
    phone in Lagos replays correctly on a phone in Shanghai without a single
    metre of road ever crossing the wire. See `track.ts`.
  */
  makeSetup(seed) {
    return { seed, stage: 'rootway' }
  },

  /**
   * A round is over when you have both *chased*.
   *
   * Not when you have both driven: the first run each is a sealed qualifying
   * lap that neither of you can see, and settling there would pay out the
   * pollen before the race had happened.
   */
  isSettled({ mine, theirs, solo }) {
    const chased = (moves: RallyMove[]) => moves.some((move) => move?.kind === 'chase')
    return chased(mine) && (solo || chased(theirs))
  },

  Component: EmberRally,
  Stage: RootwayStage,
} satisfies GameDefinition<RallySetup, RallyMove>
