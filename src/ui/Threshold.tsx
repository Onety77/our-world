/**
 * The threshold inside each place.
 *
 * Browsing chooses a world. Only after entering does this appear and name the
 * thing you can do there. It is intentionally text on the landscape, never a
 * dashboard laid over it. The Hollow maps every registered game, so adding a
 * game adds another invitation without rebuilding this shell.
 */

import { useCallback, useEffect, useRef, useState, type RefCallback } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import { otherUser } from '@/data/types'
import { SECTIONS } from '@/sections/registry'
import { useSections } from '@/systems/sections'
import { raceKey } from '@/systems/lobby'
import type { GameDefinition } from '@/world/games/types'
import { useReading } from '@/systems/reading'
import { usePot } from '@/systems/pot'
import { useTakenOver } from '@/systems/attention'
import { standing, useMemories } from '@/systems/memories'
import { usePlaying } from '@/systems/playing'
import { GAMES } from '@/world/games/registry'
import { theRoom } from '@/systems/waiting'
import { useStandings, type Turn } from '@/world/games/useRound'
import { useQuestions } from '@/systems/questions'
import { ambience } from '@/systems/ambience'

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
  selected,
  buttonRef,
  onFocus,
}: {
  game: string
  them: string
  live: NonNullable<GameDefinition['live']>
  selected: boolean
  buttonRef: RefCallback<HTMLButtonElement>
  onFocus?(): void
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

  /*
    Joining is never a choice.

    If she is already sitting in a round, that round has everything decided in
    it — including which road, for a game that needs one — so the only correct
    move is to take her key exactly as it is. Asking "which road" of somebody
    joining would be offering a choice that cannot be honoured.
  */
  const joining = Boolean(waiting)
  const [picking, setPicking] = useState(false)

  const enter = (choice?: string) => {
    if (!bothHere) return
    /*
      Join hers if there is one, otherwise open your own.

      The tie-break only matters in the instant where you have both tapped and
      neither has seen the other's key yet: `me > other` compares 'warm' and
      'cool' as strings, so exactly one of you yields, always the same one.
    */
    const own = choice ? raceKey(data.now(), choice) : String(data.now())
    const key = waiting && (waiting < String(data.now()) || me > other) ? waiting : own
    ambience.cue('ember', 0.8)
    data.publishPresence({ racing: key })
    openRace(game, key)
  }

  const start = () => {
    if (!bothHere) return
    /*
      Ask first, if the game needs something settled.

      The key *is* the invitation, so anything that has to be true of the round
      must be in the key before it is published — see `LiveChoice`. One extra
      tap, and she is never invited to a round that does not know where it is.
    */
    if (!joining && live.choose && live.choose.options.length > 0) {
      setPicking(true)
      return
    }
    enter()
  }

  if (picking && live.choose) {
    return (
      <div className="game-live-choose">
        <span className="game-way-label">{live.choose.prompt}</span>
        {live.choose.options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="quiet"
            onClick={() => enter(option.id)}
          >
            {option.name}
          </button>
        ))}
        <button type="button" className="quiet" onClick={() => setPicking(false)}>
          not now
        </button>
      </div>
    )
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`quiet game-live${selected ? ' is-selected' : ''}`}
      onFocus={onFocus}
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
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const focused = document.activeElement
      if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) return
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault()
        setSelected((at) => Math.min(GAMES.length - 1, at + 1))
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault()
        setSelected((at) => Math.max(0, at - 1))
      } else if (event.key === 'Enter' && !event.repeat) {
        event.preventDefault()
        const game = GAMES[selected]
        if (game) onPlay(game.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPlay, selected])

  return (
    <div className="challenges">
      <span className="threshold-whisper">where everything stands, today</span>
      <div className="challenges-list">
        {GAMES.map((game, index) => (
          <span key={game.id} className={index === selected ? 'is-selected' : ''}>
            <Waiting
              name={game.name}
              turn={turns[game.id] ?? 'nothing'}
              them={them}
              onPlay={() => onPlay(game.id)}
            />
          </span>
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
  const [showing, setShowing] = useState<'games' | 'waiting' | 'ways'>('games')

  /*
    Watched from here rather than from the rows, so the way in can say what is
    waiting before you have opened it. Read-only: looking must never open a
    round. See `useStandings`.
  */
  const turns = useStandings(GAMES)

  /*
    Tell the room, so the fire can say it too.

    The words stay — "2 for you", on the way in — because a number is the only
    thing that can say *how many*. What a number cannot do is make the cave feel
    any different, and a room with a turn waiting in it should. So the fire
    throws a few more embers, and nothing anywhere says why.

    Written rather than watched. These three listeners are already open here,
    and a three-dimensional room subscribing to the same three rounds a second
    time so it can decide how many sparks to draw is a real cost on somebody's
    phone for a decorative one. See `theRoom`.
  */
  const yours = Object.values(turns).filter((turn) => turn === 'yours').length
  useEffect(() => {
    theRoom.waitingForYou = yours
    // Quiet again on the way out, or the fire stays awake in an empty room.
    return () => {
      theRoom.waitingForYou = 0
    }
  }, [yours])

  // One past the end is the "more coming" card, which is always there.
  const [at, setAt] = useState(0)
  const [way, setWay] = useState(0)
  const last = GAMES.length
  const game = GAMES[at]
  const begin = useCallback((gameId: string, solo: boolean) => {
    ambience.cue('ember', 0.78)
    play(gameId, solo)
  }, [play])
  const go = useCallback(
    (by: 1 | -1) => setAt((n) => Math.max(0, Math.min(last, n + by))),
    [last],
  )
  const chooseGame = useCallback((index: number) => {
    if (!GAMES[index]) return
    ambience.cue('ember', 0.38)
    setAt(index)
    setWay(0)
    setShowing('ways')
  }, [])

  const track = useRef<HTMLDivElement>(null)
  const cards = useRef<(HTMLButtonElement | null)[]>([])
  const ways = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => {
    if (showing !== 'games') return
    const el = track.current
    if (!el) return
    const swipe = alongTheRow(el, go)
    return swipe
  }, [go, showing])

  useEffect(() => {
    setWay(0)
    cards.current[at]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })

    /*
      And fetch the game you are looking at, before you ask for it.

      Games are deferred — see `later` — and this is the hint that makes the
      deferral free. Arriving at a card is not the same as choosing it: it is a
      press away at the very least, and usually a good deal more, because the
      three ways in are still to be read. That is the whole gap the fetch needs.

      The one either side, too. A row you can swipe is a row where the next
      thing is one flick away, and the flick is faster than a network.
    */
    for (const near of [at, at - 1, at + 1]) {
      const game = GAMES[near]
      if (!game) continue
      game.Component.warm()
      game.Stage?.warm()
    }
  }, [at])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const focused = document.activeElement
      if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) return
      if (showing === 'games' && e.key === 'ArrowRight') {
        e.preventDefault()
        go(1)
      } else if (showing === 'games' && e.key === 'ArrowLeft') {
        e.preventDefault()
        go(-1)
      } else if (
        showing === 'ways' &&
        (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') &&
        game
      ) {
        e.preventDefault()
        const count = game.live ? 3 : 2
        setWay((current) =>
          e.key === 'ArrowDown' || e.key === 'ArrowRight'
            ? (current + 1) % count
            : (current - 1 + count) % count,
        )
      } else if (e.key === 'Enter' && !e.repeat) {
        if (focused instanceof HTMLButtonElement) return
        e.preventDefault()
        if (showing === 'games' && game) chooseGame(at)
        else if (showing === 'ways') ways.current[way]?.click()
      } else if (showing === 'ways' && e.key === 'Escape') {
        e.preventDefault()
        setShowing('games')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [at, chooseGame, game, go, showing, way])

  if (showing === 'waiting') {
    return (
      <div className="threshold hollow-threshold">
        <Challenges
          turns={turns}
          them={them.name}
          onPlay={(id) => {
            /*
              A challenge with something in it opens the round, not a menu.

              ------------------------------------------------------------------
              This screen exists to say *"she has left you a word"*. Tapping it
              then asked "how would you like to enter?" and offered leaving her
              a word, playing on your own, or going wheel to wheel — none of
              which is the thing that was just announced, and one of which
              starts an entirely separate solo round. There was no way to get
              from the announcement to the game it was announcing.

              So when the standing says there is a move to make — yours, or
              hers already made — this goes straight into the shared round. The
              menu is still there for the two states where a choice is
              genuinely open: nothing today, and waiting on her.
              ------------------------------------------------------------------
            */
            const standing = turns[id] ?? 'nothing'
            if (standing === 'yours' || standing === 'both') {
              ambience.cue('ember', 0.38)
              begin(id, false)
              return
            }
            const index = GAMES.findIndex((candidate) => candidate.id === id)
            if (index >= 0) chooseGame(index)
          }}
          onBack={() => setShowing('games')}
        />
      </div>
    )
  }

  if (showing === 'ways' && game) {
    return (
      <div className="threshold hollow-threshold hollow-selector hollow-way-threshold">
        <button
          type="button"
          className="hollow-way-back"
          onClick={() => setShowing('games')}
        >
          ‹ choose another game
        </button>

        <header className="hollow-way-heading">
          <span className="threshold-whisper">the game is chosen</span>
          <span className="hollow-way-emblem" aria-hidden="true">
            {game.Emblem ? <game.Emblem /> : null}
          </span>
          <h2>{game.name}</h2>
          <p>{game.blurb}</p>
          <small>{game.duration}</small>
        </header>

        <div className="game-ways" role="group" aria-label={`ways to enter ${game.name}`}>
          <span className="game-way-label">now choose how you enter</span>
          <button
            ref={(node) => { ways.current[0] = node }}
            type="button"
            className={`game-go${way === 0 ? ' is-selected' : ''}`}
            onFocus={() => setWay(0)}
            onClick={() => begin(game.id, false)}
            title={game.invite?.tip}
          >
            {game.invite
              ? game.invite.name.replace('{them}', them.name)
              : `play with ${them.name}`}
          </button>
          <div className="game-else">
            <button
              ref={(node) => { ways.current[1] = node }}
              type="button"
              className={`quiet${way === 1 ? ' is-selected' : ''}`}
              onFocus={() => setWay(1)}
              onClick={() => begin(game.id, true)}
            >
              on your own
            </button>
            {game.live ? (
              <LiveWayIn
                game={game.id}
                them={them.name}
                live={game.live}
                selected={way === 2}
                buttonRef={(node) => { ways.current[2] = node }}
                onFocus={() => setWay(2)}
              />
            ) : null}
          </div>
        </div>
        <p className="game-key-guide">↑ ↓ choose · enter confirm · escape back</p>
      </div>
    )
  }

  return (
    <div className="threshold hollow-threshold hollow-selector" ref={track}>
      <header className="hollow-game-heading">
        <span className="threshold-whisper">the fire is lit · choose what happens here</span>
        <h2>Choose your game</h2>
        <span className="hollow-game-count">
          {String(at + 1).padStart(2, '0')} / {String(last + 1).padStart(2, '0')}
        </span>
      </header>

      <div className="game-showcase">
        <button
          type="button"
          className="game-step previous"
          aria-label="previous game"
          disabled={at === 0}
          onClick={() => go(-1)}
        >
          ‹
        </button>
        <div className="game-row" role="group" aria-label="games in the Hallow">
        {GAMES.map((g, index) => (
          <button
            ref={(node) => { cards.current[index] = node }}
            type="button"
            className={`game-card${index === at ? ' is-selected' : ''}`}
            key={g.id}
            aria-current={index === at ? 'true' : undefined}
            onClick={() => {
              if (index === at) chooseGame(index)
              else setAt(index)
            }}
          >
            <span className="game-card-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="game-card-object">{g.Emblem ? <g.Emblem /> : null}</span>
            <strong>{g.name}</strong>
            <span className="game-length">{g.duration}</span>
            <small>{g.blurb}</small>
            <span className="game-card-command">
              {index === at ? 'enter to choose' : 'bring to the fire'}
            </span>
          </button>
        ))}
        <button
          ref={(node) => { cards.current[last] = node }}
          type="button"
          className={`game-card game-card-coming${at === last ? ' is-selected' : ''}`}
          aria-current={at === last ? 'true' : undefined}
          onClick={() => setAt(last)}
        >
          <span className="game-card-number">{String(last + 1).padStart(2, '0')}</span>
          {/* Five stones with nothing on them. The row's own language for
              "there is a place for this and it is empty". */}
          <span className="emblem emblem-stones waiting" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <strong>the next fire</strong>
          <span className="game-length">still being made</span>
          <small>
            Ultimate noughts and crosses, hidden fleet, dots and boxes. One
            folder each — the fire has room.
          </small>
          <span className="game-card-command">the Hallow has space</span>
        </button>
        </div>
        <button
          type="button"
          className="game-step next"
          aria-label="next game"
          disabled={at === last}
          onClick={() => go(1)}
        >
          ›
        </button>
      </div>

      {/*
        The peeking card says there is another one; this says which. The two
        do different jobs — the sliver is what makes you reach for the arrow,
        the name is what tells you whether to bother — and the row reads as a
        place with more in it rather than as a list you have reached the end of.
      */}
      <p className="game-next" aria-hidden="true">
        {at < last ? (
          <>
            next · <em>{at + 1 === last ? 'the next fire' : GAMES[at + 1].name}</em>
          </>
        ) : null}
      </p>

      <div className="game-marks" aria-label="choose a game">
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

      <p className="game-key-guide">← → choose a game · enter open</p>

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
  const start = useMemories((s) => s.leaveOne)
  // What is still in the glass. A memory taken out keeps its document, and
  // therefore its place in the building, but it is not a pane any more.
  const count = useMemories((s) => standing(s.all).length)
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
      {/*
        Straight to the picker, from the tap itself.

        Not through an effect: a file input only opens reliably when it is
        clicked synchronously inside a user gesture, and iOS Safari refuses one
        that arrives a tick later. See the note on the picked picture in
        systems/memories.
      */}
      <button type="button" onClick={() => void start()}>
        leave a memory here
      </button>
    </div>
  )
}

export function Threshold() {
  const data = useData()
  /*
    The place that is *on screen*, not the one being travelled to.

    This read `index` and `entered` directly, which move the moment you press
    the way in — so the Hollow's whole chooser appeared over the garden while
    the fade was still going down, and the world it belongs to arrived half a
    fade afterwards. Two arrivals, and the second one made the first look like
    a glitch. See the note on `shown` in `systems/sections`.
  */
  const { entered, section: index } = useSections((s) => s.shown)
  const write = useReading((s) => s.startWriting)
  const tend = usePot((s) => s.show)
  const takenOver = useTakenOver()
  const questions = useWorldSlice((state) => state.questions)

  if (!entered || takenOver) return null

  const id = SECTIONS[index].id

  if (id === 'tree') {
    const current = questions.current
    const mine = current?.answered[data.me] ?? false
    const both = Boolean(current?.answered.warm && current?.answered.cool)
    return (
      <div className="threshold tree-threshold">
        <button type="button" onClick={write}>plant a thought</button>
        <div className="tree-rituals">
          {current ? (
            <button type="button" onClick={useQuestions.getState().openCurrent}>
              <span aria-hidden="true">✦</span>{' '}
              {both ? 'read the newest bloom' : mine ? 'your answer is waiting' : 'the Tree is asking'}
            </button>
          ) : null}
          {questions.availableSeeds > 0 ? (
            <button type="button" onClick={useQuestions.getState().openPlanting}>
              <span aria-hidden="true">◇</span>{' '}
              plant a question · {questions.availableSeeds}
            </button>
          ) : null}
          {questions.history.length > 1 ? (
            <button
              type="button"
              onClick={() => useQuestions.getState().openArchive(questions.history.at(-1)!.id)}
            >
              all answered questions · {questions.history.length}
            </button>
          ) : null}
        </div>
        <span className="tree-turn-guide">
          <span className="tree-turn-pointer">drag / scroll to turn · home resets</span>
          <span className="tree-turn-touch">drag sideways to turn · pinch to zoom</span>
        </span>
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
