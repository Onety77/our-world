import type { GameDefinition } from '../types'
import EmberRally from './EmberRally'
import EmberRallyEmblem from './emblem'
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
    Not a "time challenge", which is what the Hollow used to call every live
    round because Word Duel's was the first one built. There is no clock on
    this road and never has been — what a live round here means is that you are
    both on it at the same moment, with her car really there rather than
    recorded. Naming it after somebody else's mechanic told the player
    something untrue about their own game.
  */
  invite: {
    name: 'set a line for {them}',
    tip: 'She chases it whenever she next comes down here',
  },
  live: { name: 'wheel to wheel', tip: 'The same road, at the same moment' },

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

  Emblem: EmberRallyEmblem,
  Component: EmberRally,
  Stage: RootwayStage,
} satisfies GameDefinition<RallySetup, RallyMove>
