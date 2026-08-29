/**
 * The shell a game runs inside.
 *
 * It owns everything a game shouldn't have to: which round is today's, opening
 * it, handing over the three separate facts (the setup, your move, hers), and
 * paying pollen once when it settles. The game itself only plays.
 */

import { useCallback, useEffect, Suspense } from 'react'
import { useBackCloses } from '@/systems/backstop'
import { useData, useWorldSlice } from '@/data/provider'
import { otherUser } from '@/data/types'
import { WhenItBreaks } from './WhenItBreaks'
import { usePlaying } from '@/systems/playing'
import { GAMES } from '@/world/games/registry'
import type { GameDefinition } from '@/world/games/types'
import { localDateKey, useRound, useSettlement } from '@/world/games/useRound'

export function Playing() {
  const gameId = usePlaying((s) => s.gameId)
  const solo = usePlaying((s) => s.solo)
  const race = usePlaying((s) => s.race)
  const close = usePlaying((s) => s.close)
  if (!gameId) return null
  const game = GAMES.find((candidate) => candidate.id === gameId)
  if (!game) {
    return (
      <div className="reader">
        <p className="door-waiting">That game isn&rsquo;t here any more.</p>
        <div className="sheet-actions">
          <button type="button" className="put-back quiet" onClick={close}>
            back
          </button>
        </div>
      </div>
    )
  }
  return <Runner game={game} solo={solo} race={race} onClose={close} />
}

/**
 * Split out so the hooks below only ever run while a game is actually open —
 * a round subscription for a game nobody is looking at is a listener and a
 * read for nothing.
 */
function Runner({
  game,
  solo,
  race,
  onClose,
}: {
  game: GameDefinition<any, any>
  solo: boolean
  race: string | null
  onClose: () => void
}) {
  const gameId = game.id
  /*
    Escape closes a game, and a phone has no Escape.

    So the system back gesture closes it too — see `systems/backstop`. Without
    this there were screens inside the rally with no way out at all on a phone:
    no drawn control, and a back press that left the garden entirely because
    nothing in this app had ever touched the history stack.
  */
  useBackCloses(true, onClose)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const data = useData()
  const me = data.me
  const them = otherUser(me)
  const profiles = useWorldSlice((s) => s.profiles)

  // Today, on *your* clock. She is seven hours ahead and will sometimes be on
  // tomorrow's round while you finish today's; that's correct, and the round
  // waits for her. Picking one timezone as the real one would quietly make the
  // garden belong to whoever's it was.
  const today =
    game.cadence === 'daily' ? localDateKey(profiles[me].timeZone) : 'current'

  /*
    A solo round is its own round.

    Prefixed rather than flagged, so it can never be confused with the one the
    two of you are playing — and so a game you played by yourself on a Tuesday
    does not turn up in her Hollow as a round she is somehow already losing.
  */
  /*
    A live round brings its own key.

    It has to: the two of you agreed on it a second ago through presence, and
    it names a *moment* rather than a day. Everything else here is unchanged —
    the round is opened, watched and settled by exactly the same machinery.
  */
  const key = race ? `race:${race}` : solo ? `solo:${today}` : today

  const handle = useRound(game, key)

  /*
    Take the invitation down on the way out.

    `Presence.racing` is how she finds the round you are sitting in, and an
    invitation that outlives the game is worse than none: her button would go
    on saying "join him" and would drop her into a round you left ten minutes
    ago. Cleared on unmount, which covers backing out, closing the game and
    walking out of the Hollow alike.
  */
  useEffect(() => {
    if (!race) return
    return () => data.publishPresence({ racing: '' })
  }, [race, data])

  const award = useCallback(
    async (amount: number, reason: string) => {
      await data.addPollen(amount, reason)
    },
    [data],
  )

  /**
   * Whether the round is over for both of you.
   *
   * Deliberately the game's business, not this file's — only the game knows
   * what "over" means. Until a second game exists to compare against, the rule
   * is the simplest honest one: nobody has moved in a while and both of you
   * have moved at least once.
   */
  // Nobody else is coming in a solo round, so it settles on your own moves.
  const settled = game.isSettled
    ? game.isSettled({ mine: handle.mine, theirs: handle.theirs, solo })
    : solo
      ? handle.mine.length > 0
      : handle.mine.length > 0 && handle.theirs.length > 0

  useSettlement(`${gameId}:${key}`, settled, award, () => {
    // Generic for now: every settled round is worth the same. When a second
    // game exists with a real notion of "how well did that go", this moves
    // into the definition rather than growing a switch here.
    return { pollen: 5, reason: `${game.name}, together` }
  })

  const Component = game.Component

  return (
    // Going in is going somewhere else — see the cave in styles.css.
    <div className="playing underground">
      {/*
        A game is fetched rather than shipped — see `later` — and this is the
        one moment it could be felt.

        In practice it never is: the Hollow warms a game the moment its card
        becomes the selected one, which is at least a press and usually several
        seconds before anybody enters it, and the whole lot is warmed anyway a
        couple of seconds after the garden settles. This is for the cold
        morning where neither of those has happened yet.

        It says the same thing the room already says while a round is being
        opened, in the same words, because from where you are standing there is
        no difference between waiting for a game's code and waiting for its
        round — and the interface should not invent one.
      */}
      <Suspense
        fallback={
          <div className="reader">
            <p className="door-waiting">Lighting it.</p>
          </div>
        }
      >
        {/*
          A game falling over should not take the garden with it.

          The whole world is inside one of these too, in `main`, but the outer
          one can only offer the front door. This one keeps the Hollow, the
          fire and everything else on screen and standing — and, more to the
          point, keeps the thing that broke named next to the game it broke in.
        */}
        <WhenItBreaks place={game.name}>
        <Component
          me={me}
          theirName={profiles[them].name}
          variant={race ? 'race' : null}
          solo={solo}
          round={handle.round}
          setup={handle.setup}
          mine={handle.mine}
          theirs={handle.theirs}
          play={handle.play}
          award={award}
          onLeave={onClose}
        />
        </WhenItBreaks>
      </Suspense>
    </div>
  )
}
