/**
 * The shell a game runs inside.
 *
 * It owns everything a game shouldn't have to: which round is today's, opening
 * it, handing over the three separate facts (the setup, your move, hers), and
 * paying pollen once when it settles. The game itself only plays.
 */

import { useCallback, useEffect } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import { otherUser } from '@/data/types'
import { usePlaying } from '@/systems/playing'
import { GAMES } from '@/world/games/registry'
import type { GameDefinition } from '@/world/games/types'
import { localDateKey, useRound, useSettlement } from '@/world/games/useRound'

export function Playing() {
  const gameId = usePlaying((s) => s.gameId)
  const solo = usePlaying((s) => s.solo)
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
  return <Runner game={game} solo={solo} onClose={close} />
}

/**
 * Split out so the hooks below only ever run while a game is actually open —
 * a round subscription for a game nobody is looking at is a listener and a
 * read for nothing.
 */
function Runner({
  game,
  solo,
  onClose,
}: {
  game: GameDefinition<any, any>
  solo: boolean
  onClose: () => void
}) {
  const gameId = game.id
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
  const key = solo ? `solo:${today}` : today

  const handle = useRound(game, key)

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
      <Component
        me={me}
        theirName={profiles[them].name}
        solo={solo}
        round={handle.round}
        setup={handle.setup}
        mine={handle.mine}
        theirs={handle.theirs}
        play={handle.play}
        award={award}
        onLeave={onClose}
      />
    </div>
  )
}
