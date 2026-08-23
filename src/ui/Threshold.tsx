/**
 * The threshold inside each place.
 *
 * Browsing chooses a world. Only after entering does this appear and name the
 * thing you can do there. It is intentionally text on the landscape, never a
 * dashboard laid over it. The Hollow maps every registered game, so adding a
 * game adds another invitation without rebuilding this shell.
 */

import { useEffect, useRef, useState } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import { otherUser } from '@/data/types'
import { SECTIONS } from '@/sections/registry'
import { useSections } from '@/systems/sections'
import { useReading } from '@/systems/reading'
import { usePot } from '@/systems/pot'
import { useTakenOver } from '@/systems/attention'
import { usePlaying } from '@/systems/playing'
import { GAMES } from '@/world/games/registry'

/**
 * What there is to play, one at a time.
 *
 * A row you move along rather than a list you read down. There is one game so
 * far and there will be four or five, and a list of one looks like an
 * oversight where a row of one looks like the first of several — which is the
 * truth. The last position is always the honest one: more are coming, and
 * nothing pretends otherwise.
 *
 * Two ways in, and the second is the one that will actually get used. Seven
 * timezones apart, most evenings only one of you is here; a game you can only
 * start when she is available is a game you mostly cannot start.
 */
/**
 * The one way in that needs both of you here at once.
 *
 * ---------------------------------------------------------------------------
 * Everything else in the garden is asynchronous on purpose — Lagos and
 * Shanghai share a sliver of evening, and a game you can only start when she is
 * available is a game you mostly cannot start. So this is deliberately *not*
 * the default: it is dark until the two of you happen to be here together, and
 * then it lights up. That is the whole appeal. It is the treat for the evenings
 * that line up.
 *
 * **How the two phones end up in the same round.** An asynchronous round names
 * itself — the id is the date, so both devices arrive at it independently. A
 * live one cannot: it starts at a moment somebody chose. So whoever taps first
 * puts the key in their presence, which the other sees within the second, and
 * the second person joins *that* key rather than inventing one.
 *
 * If you both tap in the same instant you would each start your own, so the tie
 * is broken by name: the one who sorts second gives way. Deterministic, needs
 * no agreement, and settles in one frame.
 * ---------------------------------------------------------------------------
 */
function TimeChallenge({ game, them }: { game: string; them: string }) {
  const data = useData()
  const me = data.me
  const other = otherUser(me)
  const presence = useWorldSlice((s) => s.presence)
  const openRace = usePlaying((s) => s.openRace)

  const mine = presence[me]
  const hers = presence[other]
  const bothHere = Boolean(mine?.online && hers?.online)
  // A key she is already sitting in, waiting.
  const waiting = hers?.racing ?? ''

  const start = () => {
    if (!bothHere) return
    /*
      Join hers if there is one, otherwise open your own.

      The tie-break only matters in the instant where you have both tapped and
      neither has seen the other's key yet: `me > other` compares 'warm' and
      'cool' as strings, so exactly one of you yields, always the same one.
    */
    const key = waiting && (waiting < String(data.now()) || me > other)
      ? waiting
      : String(data.now())
    data.publishPresence({ racing: key })
    openRace(game, key)
  }

  return (
    <button
      type="button"
      className="quiet game-live"
      onClick={start}
      disabled={!bothHere}
      title={
        bothHere
          ? 'Five minutes each, same word'
          : them + ' is not here right now'
      }
    >
      {waiting ? `join ${them}` : 'time challenge'}
      {!bothHere && <small>only when you are both here</small>}
    </button>
  )
}

function TheHollow() {
  const play = usePlaying((s) => s.open)
  const me = useData().me
  const profiles = useWorldSlice((s) => s.profiles)
  const them = profiles[me === 'warm' ? 'cool' : 'warm']

  // One past the end is the "more coming" card, which is always there.
  const [at, setAt] = useState(0)
  const last = GAMES.length
  const go = (by: 1 | -1) => setAt((n) => Math.max(0, Math.min(last, n + by)))

  const track = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = track.current
    if (!el) return
    const swipe = alongTheRow(el, go)
    return swipe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last])

  const game = GAMES[at]

  return (
    <div className="threshold hollow-threshold" ref={track}>
      <span className="threshold-whisper">something to play, whenever you are here</span>

      <div className="game-row" style={{ '--at': at } as React.CSSProperties}>
        {GAMES.map((g) => (
          <div className="game-card" key={g.id} aria-hidden={g.id !== game?.id}>
            <strong>{g.name}</strong>
            <small>{g.blurb}</small>
            <span className="game-length">{g.duration}</span>
          </div>
        ))}
        <div className="game-card" aria-hidden={game !== undefined}>
          <strong>more, in time</strong>
          <small>
            Ultimate noughts and crosses, hidden fleet, dots and boxes. One
            folder each — the fire has room.
          </small>
          <span className="game-length">not yet</span>
        </div>
      </div>

      {game ? (
        <div className="game-ways">
          <button type="button" onClick={() => play(game.id, false)}>
            vs {them.name}
          </button>
          <button type="button" className="quiet" onClick={() => play(game.id, true)}>
            one player
          </button>
          <TimeChallenge game={game.id} them={them.name} />
        </div>
      ) : (
        <p className="game-soon">nothing to open here yet</p>
      )}

      <div className="game-marks" role="presentation">
        {Array.from({ length: last + 1 }, (_, i) => (
          <button
            type="button"
            key={i}
            className={i === at ? 'on' : ''}
            aria-label={`game ${i + 1}`}
            onClick={() => setAt(i)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Dragging along the row.
 *
 * Its own small recogniser rather than the garden's: `systems/swipe` browses
 * *places* and refuses to run once you are inside one, which is exactly where
 * this lives.
 */
function alongTheRow(el: HTMLElement, go: (by: 1 | -1) => void): () => void {
  let from: number | null = null
  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement)?.closest('button')) return
    from = e.clientX
  }
  const up = (e: PointerEvent) => {
    if (from === null) return
    const dx = e.clientX - from
    from = null
    if (Math.abs(dx) > 44) go(dx < 0 ? 1 : -1)
  }
  el.addEventListener('pointerdown', down)
  window.addEventListener('pointerup', up)
  return () => {
    el.removeEventListener('pointerdown', down)
    window.removeEventListener('pointerup', up)
  }
}

export function Threshold() {
  const index = useSections((s) => s.index)
  const entered = useSections((s) => s.entered)
  const write = useReading((s) => s.startWriting)
  const tend = usePot((s) => s.show)
  const takenOver = useTakenOver()

  if (!entered || takenOver) return null

  const id = SECTIONS[index].id

  if (id === 'tree') {
    return (
      <div className="threshold tree-threshold">
        <span className="threshold-whisper">one thought, one flower</span>
        <button type="button" onClick={write}>plant a thought</button>
      </div>
    )
  }

  if (id === 'river') {
    return (
      <div className="threshold river-threshold">
        <span className="threshold-whisper">make the water rise</span>
        <button type="button" onClick={tend}>add to ours</button>
      </div>
    )
  }

  if (id === 'hollow') return <TheHollow />

  /*
    The Stars has no threshold any more.

    It used to carry "the two of you will talk here — for now, just stay a
    while", which was the honest thing to say while the place was an
    environment with nothing in it. There is a conversation in it now, and it
    brings its own way in: see ui/Talking. A second invitation floating over
    the first would be one line of furniture too many in the emptiest, quietest
    place in the garden.
  */
  return null
}
