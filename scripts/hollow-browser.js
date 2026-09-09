// Browser-only test access. Import through Vite so HMR resolves the active stores.
import { usePlaying } from '../src/systems/playing'
import { useRace } from '../src/world/games/ember-rally/session'

export function inspectRace() {
  if (new URLSearchParams(location.search).get('mock') !== '1') throw Error('Mock mode required')
  const playing = usePlaying.getState(),
    race = useRace.getState()
  return {
    game: playing.gameId,
    solo: playing.solo,
    room: playing.race,
    stage: race.track?.stage,
    phase: race.phase,
    ghost: !!race.ghost,
    paused: race.paused,
    wheel: race.wheelToWheel,
  }
}
export function leaveGame() {
  if (new URLSearchParams(location.search).get('mock') !== '1') throw Error('Mock mode required')
  usePlaying.getState().close()
}
