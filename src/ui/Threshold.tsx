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
import { useMemories } from '@/systems/memories'
import { usePlaying } from '@/systems/playing'
import { GAMES } from '@/world/games/registry'
import { useStandings, type Turn } from '@/world/games/useRound'

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
function LiveWayIn({
  game,
  them,
  live,
}: {
  game: string
  them: string
  live: { name: string; tip: string }
}) {
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
      title={bothHere ? live.tip : them + ' is not here right now'}
    >
      {waiting ? `join ${them}` : live.name}
      {!bothHere && <small>only when you are both here</small>}
    </button>
  )
}


/**
 * What is waiting, across every game at once.
 *
 * ---------------------------------------------------------------------------
 * **The Hollow could not answer the one question it exists to answer.**
 *
 * The note on `Round` says it plainly: in an asynchronous game the good
 * feeling is not winning, it is opening the Hollow and seeing that she has
 * been. But finding that out meant opening each game, waiting for its round,
 * and reading whatever briefing it happened to show — one game at a time. With
 * two games that is tedious. With the five the plan is heading for it is the
 * reason nobody checks.
 *
 * So: one line per game, all of them at once, and a way straight in.
 *
 * **Every state here is one you are allowed to know**, which is the whole
 * design constraint and the reason the wording is careful. Her opening move is
 * sealed until yours exists, so before you have played, "has she been?" has no
 * answer on your device — and "your move" is true whether or not she has, which
 * is why that is what it says. Nothing on this screen ever claims something
 * about her that the rules have not actually told us. See `useStanding`.
 * ---------------------------------------------------------------------------
 */
function Waiting({
  name,
  turn,
  them,
  onPlay,
}: {
  name: string
  turn: Turn
  them: string
  onPlay(): void
}) {
  return (
    <button type="button" className={`standing standing-${turn}`} onClick={onPlay}>
      <span className="standing-game">{name}</span>
      <span className="standing-state">{WORDS[turn](them)}</span>
    </button>
  )
}

/**
 * What each state is called, in the second person.
 *
 * Not a lookup for its own sake — these four strings are the whole honesty
 * surface of the feature and they belong somewhere they can be read together
 * and checked against `useStanding`.
 */
const WORDS: Record<Turn, (them: string) => string> = {
  nothing: () => 'nothing opened today',
  yours: () => 'your move',
  hers: (them) => `waiting for ${them}`,
  both: (them) => `${them} has been`,
}

function Challenges({
  turns,
  them,
  onPlay,
  onBack,
}: {
  turns: Record<string, Turn>
  them: string
  onPlay(id: string): void
  onBack(): void
}) {
  return (
    <div className="challenges">
      <span className="threshold-whisper">where everything stands, today</span>
      <div className="challenges-list">
        {GAMES.map((game) => (
          <Waiting
            key={game.id}
            name={game.name}
            turn={turns[game.id] ?? 'nothing'}
            them={them}
            onPlay={() => onPlay(game.id)}
          />
        ))}
      </div>
      <button type="button" className="challenges-back" onClick={onBack}>
        back to the games
      </button>
    </div>
  )
}

/**
 * What the way in says when there is something to say.
 *
 * The point of the whole feature is that you should not have to open anything
 * to find out — so the label itself carries the answer, and opening the list is
 * only for *which* game. Priority is what you can act on: anything of yours
 * outranks the news that she has been, because one is a thing to do and the
 * other is a thing to enjoy.
 */
function summary(turns: Record<string, Turn>, them: string): string {
  const all = Object.values(turns)
  const yours = all.filter((t) => t === 'yours').length
  if (yours > 0) return `${yours} for you`
  if (all.includes('both')) return `${them} has been`
  if (all.includes('hers')) return `waiting for ${them}`
  return 'nothing yet'
}

function TheHollow() {
  const play = usePlaying((s) => s.open)
  const me = useData().me
  const profiles = useWorldSlice((s) => s.profiles)
  const them = profiles[me === 'warm' ? 'cool' : 'warm']

  /**
   * The row of games, or what is waiting across all of them.
   *
   * Two views of the same place rather than a card in the row: a challenges
   * *card* would be a game you cannot play, sitting between two you can, and
   * the marks underneath would count it as a fourth thing to swipe to.
   */
  const [showing, setShowing] = useState<'games' | 'waiting'>('games')

  /*
    Watched from here rather than from the rows, so the way in can say what is
    waiting before you have opened it. Read-only: looking must never open a
    round. See `useStandings`.
  */
  const turns = useStandings(GAMES)

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

  if (showing === 'waiting') {
    return (
      <div className="threshold hollow-threshold">
        <Challenges
          turns={turns}
          them={them.name}
          onPlay={(id) => play(id, false)}
          onBack={() => setShowing('games')}
        />
      </div>
    )
  }

  return (
    <div className="threshold hollow-threshold" ref={track}>
      <span className="threshold-whisper">something to play, whenever you are here</span>

      <div className="game-row" style={{ '--at': at } as React.CSSProperties}>
        {GAMES.map((g) => (
          <div className="game-card" key={g.id} aria-hidden={g.id !== game?.id}>
            {g.Emblem ? <g.Emblem /> : null}
            <strong>{g.name}</strong>
            <span className="game-length">{g.duration}</span>
            <small>{g.blurb}</small>
          </div>
        ))}
        <div className="game-card" aria-hidden={game !== undefined}>
          {/* Five stones with nothing on them. The row's own language for
              "there is a place for this and it is empty". */}
          <span className="emblem emblem-stones waiting" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <strong>more, in time</strong>
          <span className="game-length">not yet</span>
          <small>
            Ultimate noughts and crosses, hidden fleet, dots and boxes. One
            folder each — the fire has room.
          </small>
        </div>
      </div>

      {game ? (
        <div className="game-ways">
          {/*
            The one you will actually press, set like the rest of the garden's
            invitations — a serif verb, not a word in small capitals. The other
            two are alternatives to it and are quieter, which is what a row of
            three identical labels could never say.
          */}
          <button
            type="button"
            className="game-go"
            onClick={() => play(game.id, false)}
            title={game.invite?.tip}
          >
            {game.invite
              ? game.invite.name.replace('{them}', them.name)
              : `play with ${them.name}`}
          </button>
          <div className="game-else">
            <button type="button" className="quiet" onClick={() => play(game.id, true)}>
              on your own
            </button>
            {game.live ? (
              <LiveWayIn game={game.id} them={them.name} live={game.live} />
            ) : null}
          </div>
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

      {/*
        Set apart, under the marks and below a rule.

        It is not one of the games and must not read as one: the row above is
        things you play, this is a report on all of them. The hairline is the
        only divider in the whole interface, and it earns it here — without it
        this is a fourth item in a list of three.
      */}
      <button type="button" className="to-waiting" onClick={() => setShowing('waiting')}>
        what is waiting
        <span className="to-waiting-now">{summary(turns, them.name)}</span>
      </button>
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

/**
 * The Glasshouse's way in.
 *
 * One line and one invitation, the same shape as the Tree's and the
 * Wellspring's — because this is the same kind of place as those: somewhere
 * you leave one thing, and the building keeps it.
 *
 * The count is here and nowhere else. "Eleven panes" is the only number in the
 * whole section and it is worth saying, because the size of what the two of
 * you have built is the point of the place; nothing else about a memory is
 * counted, rated or totalled anywhere.
 */
function TheGlasshouse() {
  const start = useMemories((s) => s.setHanging)
  const count = useMemories((s) => s.all.length)
  const loaded = useMemories((s) => s.loaded)

  return (
    <div className="threshold glass-threshold">
      <span className="threshold-whisper">
        {/*
          Honest about the difference between empty and not-answered-yet. A
          first visit should read as an invitation; the same words shown to
          somebody with two years in here and a slow connection would be a lie.
        */}
        {!loaded
          ? 'one picture, one line'
          : count === 0
            ? 'nothing in the glass yet — the first one builds the first pane'
            : count === 1
              ? 'one pane, so far'
              : `${count} panes, so far`}
      </span>
      <button type="button" onClick={() => start(true)}>
        leave a memory here
      </button>
    </div>
  )
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

  if (id === 'glasshouse') return <TheGlasshouse />

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
