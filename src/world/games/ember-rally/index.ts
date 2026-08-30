import { later } from '@/systems/later'
import type { GameDefinition } from '../types'
import EmberRallyEmblem from './emblem'
import type { RallyMove, RallySetup } from './model'

export default {
  id: 'ember-rally',
  name: 'Ember Rally',
  blurb: 'Choose a road, set a line, then chase {hers} through fire, moonlight, storm or first light.',
  mode: 'async',
  cadence: 'daily',
  duration: 'one long road, twice',
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
    tip: '{She} chases it whenever {she} next comes down here',
  },
  live: {
    name: 'wheel to wheel',
    tip: 'The same road, at the same moment',
    /*
      Which road, before she is invited.

      The key *is* the invitation, so a key without a road in it is an
      invitation to somewhere neither of you has chosen — and re-keying after
      she has joined would leave her sitting in a round that no longer exists.
      Asking first costs one tap and makes the invitation complete.
    */
    choose: {
      prompt: 'which road',
      options: [
        { id: 'rootway', name: 'The Rootway', note: 'fire and stone · close, changing, lantern-lit' },
        { id: 'moonbreak', name: 'The Moonbreak', note: 'water and open sky · fast and exposed' },
        { id: 'stormcrown', name: 'The Stormcrown', note: 'rain and high stone · longest and hardest' },
        { id: 'firstlight', name: 'The Firstlight', note: 'sun and cut stone · steep, narrow descent' },
      ],
    },
  },

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
    const on = (moves: RallyMove[], stage: RallySetup['stage'], kind: RallyMove['kind']) =>
      moves.some((move) => move?.kind === kind && (move.stage ?? 'rootway') === stage)

    /*
      A road is finished when somebody has chased somebody's line.

      It used to require *both* of you to have chased, which was right while
      every round was two sealed laps followed by two chases. It is wrong now:
      one of you leaves a line and the other chases it, and in that shape the
      person who left the line never chases anything — so a round that had
      genuinely been raced would sit unsettled for ever and never pay out.

      So: a line and a chase on the same road, from the two of you in either
      direction. Still both people, still a real race, and it no longer insists
      on a symmetry the game no longer has.
    */
    return (['rootway', 'moonbreak', 'stormcrown', 'firstlight'] as const).some((stage) => {
      if (solo) return on(mine, stage, 'chase')
      const raced = (a: RallyMove[], b: RallyMove[]) =>
        on(a, stage, 'qualifying') && on(b, stage, 'chase')
      return raced(mine, theirs) || raced(theirs, mine) ||
        (on(mine, stage, 'chase') && on(theirs, stage, 'chase'))
    })
  },

  Emblem: EmberRallyEmblem,
  /*
    Both halves fetched, and this is the folder that most needed it: the road
    itself, the tyre model, the two courses, the car, the materials and the
    sound are a quarter of the garden's own code, and none of it has anything
    to say to somebody who never comes down here.
  */
  Component: later(() => import('./EmberRally')),
  Stage: later(() => import('./Race').then((m) => ({ default: m.RootwayStage }))),
} satisfies GameDefinition<RallySetup, RallyMove>
