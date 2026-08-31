/**
 * The room two people wait in before something starts at once.
 *
 * ---------------------------------------------------------------------------
 * Built for the racer and immediately wanted by the word game, which is the
 * usual sign that it belongs to neither of them. Both need exactly the same
 * three things — is she here, are you both ready, how long now — and both had
 * the same bug before it existed: joining opened the game, so the second
 * person to press began behind.
 *
 * What is *not* here is anything about roads, or words, or what happens when
 * the flag drops. Each game keeps its own shell around this, says its own
 * sentence, and decides for itself what "go" means. This owns the two lamps
 * and the number.
 *
 * The protocol underneath — how two phones reach the same instant with no
 * server and no message — is `systems/lobby`, and the arithmetic is checked by
 * `npm run lobby`.
 * ---------------------------------------------------------------------------
 */

import { LOBBY_COUNTDOWN_MS } from '@/systems/lobby'
import { useSay } from '@/systems/useSay'
import type { Lobby } from '@/systems/useLobby'
import { useMenuKeys } from './useMenuKeys'

/** The one number, big, in the middle. Three, two, one, and the flag. */
function Flag({ countdown }: { countdown: number }) {
  const seconds = Math.ceil(countdown / 1000)
  return (
    <div className="wheel-flag" role="status" aria-live="assertive">
      {/* Re-keyed each second so the animation replays on every number. */}
      <span className="wheel-count" key={seconds}>
        {seconds > 0 ? seconds : 'go'}
      </span>
      <span className="wheel-track" aria-hidden="true">
        <span
          className="wheel-bar"
          style={{ transform: `scaleX(${1 - countdown / LOBBY_COUNTDOWN_MS})` }}
        />
      </span>
    </div>
  )
}

/**
 * One person's state in the room.
 *
 * Three states rather than two, deliberately. "Not here" and "here but not
 * ready" look identical from the outside — nothing is happening either way —
 * and they are completely different situations: one you wait out, and the
 * other you send her a message about.
 */
function Standing({ name, here, ready }: { name: string; here: boolean; ready: boolean }) {
  return (
    <span className={`wheel-who ${!here ? 'away' : ready ? 'ready' : 'here'}`}>
      <i aria-hidden="true" />
      <b>{name}</b>
      <small>{!here ? 'not here yet' : ready ? 'ready' : 'waiting'}</small>
    </span>
  )
}

export function RaceRoom({
  lobby,
  theirName,
  waitingFor,
  onLeave,
  leaveLabel = 'leave the room',
}: {
  lobby: Lobby
  theirName: string
  /** One line under the lamps, in the game's own voice. */
  waitingFor: string
  onLeave(): void
  leaveLabel?: string
}) {
  const say = useSay()
  const counting = lobby.countdown !== null && lobby.countdown > 0
  const keys = useMenuKeys(2, true, !counting)

  return (
    <>
      {counting ? (
        <Flag countdown={lobby.countdown ?? 0} />
      ) : (
        <h1>{lobby.sheIsHere ? say('{She} is here.') : `Waiting for ${theirName}.`}</h1>
      )}

      <div className="wheel-grid">
        <Standing name="you" here ready={lobby.youAreReady} />
        <Standing name={theirName} here={lobby.sheIsHere} ready={lobby.sheIsReady} />
      </div>

      {!counting && (
        <>
          <p className="rally-copy">
            {!lobby.sheIsHere
              ? waitingFor
              : lobby.youAreReady
                ? `Waiting for ${theirName} to be ready.`
                : 'Both of you say ready, and it starts together.'}
          </p>
          <div className="rally-actions">
            {lobby.youAreReady ? (
              <button
                ref={keys.ref(0)}
                type="button"
                className={`quiet${keys.selected === 0 ? ' is-selected' : ''}`}
                onFocus={() => keys.choose(0)}
                onClick={lobby.wait}
              >
                not yet
              </button>
            ) : (
              <button
                ref={keys.ref(0)}
                type="button"
                className={keys.selected === 0 ? 'is-selected' : undefined}
                onFocus={() => keys.choose(0)}
                onClick={lobby.ready}
              >
                ready
              </button>
            )}
            <button
              ref={keys.ref(1)}
              type="button"
              className={`quiet${keys.selected === 1 ? ' is-selected' : ''}`}
              onFocus={() => keys.choose(1)}
              onClick={onLeave}
            >
              {leaveLabel}
            </button>
          </div>
        </>
      )}
    </>
  )
}
