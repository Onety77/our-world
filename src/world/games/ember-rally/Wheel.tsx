/**
 * Wheel to wheel: the room before the road.
 *
 * ---------------------------------------------------------------------------
 * Every other way into this game is asynchronous, and that is deliberate —
 * Lagos and Shanghai share a sliver of evening, so a game that needs two
 * people awake at once is a game that gets played four times. This is the
 * exception, and the whole of it is one promise: **the flag drops once, for
 * both of you.**
 *
 * Which is exactly what the old live round did not do. Tapping "wheel to
 * wheel" opened the racer immediately, on whatever road you happened to pick,
 * with no idea whether she had arrived — so the second person to press began
 * several seconds down on a road the first had already chosen. It was two solo
 * races wearing the same name.
 *
 * **The road is already decided by the time anybody gets here.** It is in the
 * round key, chosen before the invitation went out, because a key without a
 * road in it is an invitation to somewhere neither of you has agreed on.
 *
 * The lamps, the countdown and the ready button are `ui/RaceRoom`, shared with
 * the word game's time challenge — both of them need exactly the same three
 * facts, and neither of them owns them. What stays here is the road's name and
 * the racer's own frame around it.
 * ---------------------------------------------------------------------------
 */

import { RaceRoom } from '@/ui/RaceRoom'
import type { Lobby } from '@/systems/useLobby'

export function Wheel({
  lobby,
  roadName,
  theirName,
  onLeave,
}: {
  lobby: Lobby
  roadName: string
  theirName: string
  onLeave(): void
}) {
  return (
    <div className="rally rally-centre wheel">
      <p className="rally-kicker">wheel to wheel · {roadName.toLowerCase()}</p>
      <RaceRoom
        lobby={lobby}
        theirName={theirName}
        waitingFor={`${theirName} has been asked. The road is already chosen — nothing starts until you are both ready.`}
        onLeave={onLeave}
        leaveLabel="leave the room"
      />
    </div>
  )
}
