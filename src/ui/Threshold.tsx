/**
 * The threshold inside each place.
 *
 * Browsing chooses a world. Only after entering does this appear and name the
 * thing you can do there. It is intentionally text on the landscape, never a
 * dashboard laid over it. The Hollow maps every registered game, so adding a
 * game adds another invitation without rebuilding this shell.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type RefCallback } from 'react'
import { createPortal } from 'react-dom'
import { useData, useWorldSlice } from '@/data/provider'
import { otherUser } from '@/data/types'
import { SECTIONS } from '@/sections/registry'
import { useSections } from '@/systems/sections'
import { raceKey, readSitting, roundOfKey } from '@/systems/lobby'
import type { GameDefinition, LiveChoice } from '@/world/games/types'
import { useSay } from '@/systems/useSay'
import { useReading } from '@/systems/reading'
import { usePot } from '@/systems/pot'
import { potTotal } from '@/data/local'
import { format, progressToward } from '@/data/money'
import { useTakenOver } from '@/systems/attention'
import { standing, useMemories } from '@/systems/memories'
import { usePlaying } from '@/systems/playing'
import { GAMES } from '@/world/games/registry'
import { theRoom } from '@/systems/waiting'
import { useStandings, type Standing } from '@/world/games/useRound'
import { gameKey, roadKey, useDoorman } from '@/systems/locks'
import { useQuestions } from '@/systems/questions'
import { until } from '@/systems/time'
import { ambience } from '@/systems/ambience'
import { useChoiceSwipe } from './useChoiceSwipe'
import { useMenuKeys } from './useMenuKeys'

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
function LiveChoiceStage({
  prompt,
  options,
  onChoose,
  onBack,
}: {
  prompt: string
  options: readonly LiveChoice[]
  onChoose(id: string): void
  onBack(): void
}) {
  const [selected, setSelected] = useState(0)
  const stage = useRef<HTMLDivElement>(null)
  const browser = useRef<HTMLDivElement>(null)
  const last = options.length - 1
  const option = options[selected]
  const swipe = useCallback(
    (direction: -1 | 1) => {
      setSelected((at) => Math.max(0, Math.min(last, at + direction)))
    },
    [last],
  )
  useChoiceSwipe(browser, swipe)

  useEffect(() => {
    stage.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const focused = document.activeElement
      if (
        focused instanceof HTMLInputElement ||
        focused instanceof HTMLTextAreaElement ||
        focused instanceof HTMLSelectElement
      ) return
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault()
        if (focused instanceof HTMLElement) focused.blur()
        setSelected((at) => Math.min(last, at + 1))
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        if (focused instanceof HTMLElement) focused.blur()
        setSelected((at) => Math.max(0, at - 1))
      } else if (event.key === 'Enter' && !event.repeat && option) {
        if (focused instanceof HTMLButtonElement) return
        event.preventDefault()
        onChoose(option.id)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [last, onBack, onChoose, option])

  if (!option) return null

  return createPortal(
    <div
      ref={stage}
      className="live-choice-stage"
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-choice-title"
      tabIndex={-1}
    >
      <button type="button" className="live-choice-back" onClick={onBack}>
        ← ways to enter
      </button>

      <header className="live-choice-heading">
        <span>ember rally · wheel to wheel</span>
        <h2 id="live-choice-title">Choose the road first</h2>
        <p>{prompt.charAt(0).toUpperCase() + prompt.slice(1)}. Your invitation will open on this road.</p>
      </header>

      <div className="live-choice-browser" ref={browser}>
        <button
          type="button"
          className="live-choice-step previous"
          aria-label="show previous road"
          disabled={selected === 0}
          onClick={() => setSelected((at) => Math.max(0, at - 1))}
        >
          <span aria-hidden="true">‹</span>
        </button>

        <div className="live-choice-window">
          <div
            className="live-choice-track"
            style={{ transform: `translate3d(-${selected * 100}%, 0, 0)` }}
          >
            {options.map((road, index) => (
              <div
                key={road.id}
                className={`live-choice-road ${road.id}`}
                aria-hidden={selected !== index}
              >
                <span className="live-choice-scene" aria-hidden="true">
                  <i className="live-choice-horizon" />
                  <i className="live-choice-roadway" />
                  <i className="live-choice-lights"><b /><b /></i>
                </span>
                <span className="live-choice-count">
                  {String(index + 1).padStart(2, '0')} / {String(options.length).padStart(2, '0')}
                </span>
                <strong>{road.name}</strong>
                {road.note ? <small>{road.note}</small> : null}
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="live-choice-step next"
          aria-label="show next road"
          disabled={selected === last}
          onClick={() => setSelected((at) => Math.min(last, at + 1))}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div className="live-choice-marks" role="group" aria-label="choose a road">
        {options.map((road, index) => (
          <button
            type="button"
            key={road.id}
            className={selected === index ? 'on' : ''}
            aria-label={`show ${road.name}`}
            aria-pressed={selected === index}
            onClick={(event) => {
              setSelected(index)
              event.currentTarget.blur()
            }}
          />
        ))}
      </div>

      <button
        type="button"
        className="live-choice-confirm"
        onClick={() => onChoose(option.id)}
      >
        invite her to {option.name}
      </button>
      <p className="live-choice-keys">← → choose · enter invite · escape back</p>
    </div>,
    document.body,
  )
}

function LiveWayIn({
  game,
  them,
  live,
  selected,
  buttonRef,
  onFocus,
  onChoosing,
}: {
  game: string
  them: string
  live: NonNullable<GameDefinition['live']>
  selected: boolean
  buttonRef: RefCallback<HTMLButtonElement>
  onFocus?(): void
  onChoosing(choosing: boolean): void
}) {
  const data = useData()
  const say = useSay()
  const me = data.me
  const other = otherUser(me)
  const presence = useWorldSlice((s) => s.presence)
  const openRace = usePlaying((s) => s.openRace)

  const mine = presence[me]
  const hers = presence[other]
  const bothHere = Boolean(mine?.online && hers?.online)
  /*
    A key she is already sitting in, waiting.

    Read through `readSitting` rather than straight off the wire, because
    `Presence.racing` stops being a bare key the moment she taps ready — from
    then on it carries her readiness on the end of it, `key@1756…`. Joining
    that string verbatim opened a *different* round, with an `@` in its
    document id, and left the two of you holding keys that could never agree:
    she would sit ready in the room forever, while you waited for somebody who,
    as far as your phone could tell, had never arrived. It needed nothing
    unusual to trigger — only her being ready before you opened the door, which
    is exactly what the room is for.
  */
  const waiting = roundOfKey(readSitting(hers?.racing)?.key ?? '')

  /*
    Joining is never a choice.

    If she is already sitting in a round, that round has everything decided in
    it — including which road, for a game that needs one — so the only correct
    move is to take her key exactly as it is. Asking "which road" of somebody
    joining would be offering a choice that cannot be honoured.
  */
  const joining = Boolean(waiting)
  const [picking, setPicking] = useState(false)

  /*
    A road that is shut cannot be invited to either.

    The choice screen is the *other* door onto the racer's roads — the picker
    inside the game is not the only way to reach one — so a road taken off the
    wall has to come off here too, or the one way in that skipped the picker
    would still hand out invitations to it.
  */
  const shut = useDoorman()
  const choices = useMemo(
    () => live.choose?.options.filter((road) => !shut(roadKey(road.id))) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see `useDoorman`
    [live.choose, shut],
  )

  useEffect(() => () => onChoosing(false), [onChoosing])

  const enter = (choice?: string) => {
    if (!bothHere) return
    onChoosing(false)
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
    if (!joining && live.choose && choices.length > 0) {
      setPicking(true)
      onChoosing(true)
      return
    }
    enter()
  }

  if (picking && live.choose) {
    return (
      <LiveChoiceStage
        prompt={live.choose.prompt}
        options={choices}
        onChoose={enter}
        onBack={() => {
          setPicking(false)
          onChoosing(false)
        }}
      />
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
      title={bothHere ? say(live.tip) : them + ' is not here right now'}
    >
      {waiting ? `join ${them}` : say(live.name)}
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
  standing,
  them,
  onPlay,
  buttonRef,
  selected,
  onFocus,
}: {
  name: string
  standing: Standing
  them: string
  onPlay(): void
  buttonRef: RefCallback<HTMLButtonElement>
  selected: boolean
  onFocus(): void
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`standing standing-${standing.turn}${standing.done ? ' is-done' : ''}${selected ? ' is-selected' : ''}`}
      onFocus={onFocus}
      onClick={onPlay}
    >
      <span className="standing-game">{name}</span>
      <span className="standing-state">{words(standing, them)}</span>
    </button>
  )
}

/**
 * What each state is called, in the second person.
 *
 * -----------------------------------------------------------------------------
 * Not a lookup for its own sake — these strings are the whole honesty surface of
 * the feature and they belong somewhere they can be read together and checked
 * against `standingOf`.
 *
 * **Being finished is a state, and it was missing.** The list was built out of
 * whose move it is, so the most it could ever say about a game you had played
 * to the end was "Onety has been" — which is the *nice* line, the one this
 * whole screen exists for, and reading it above a round where you have already
 * spent all six guesses turns it into a summons. You go in to see what is
 * wanted and find your own finished board.
 *
 * So when your side is over the line says so first, and then still says the
 * good part. "Onety has been" is worth knowing whether or not you are done with
 * the game; it is only wrong as the *whole* sentence.
 * -----------------------------------------------------------------------------
 */
function words({ turn, done }: Standing, them: string): string {
  if (done) {
    // Deliberately not "you both are" — her being here is not her being
    // finished, and nothing on this screen may claim more than it knows.
    return turn === 'both' ? `done · ${them} has been` : `done · waiting for ${them}`
  }
  if (turn === 'nothing') return 'nothing opened today'
  if (turn === 'yours') return 'your move'
  if (turn === 'hers') return `waiting for ${them}`
  return `${them} has been`
}

function Challenges({
  games,
  turns,
  them,
  onPlay,
  onBack,
}: {
  games: readonly { id: string; name: string }[]
  turns: Record<string, Standing>
  them: string
  onPlay(id: string): void
  onBack(): void
}) {
  const keys = useMenuKeys(games.length, false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  return (
    <div className="challenges">
      <span className="threshold-whisper">where everything stands, today</span>
      <div className="challenges-list">
        {games.map((game, index) => (
          <span key={game.id}>
            <Waiting
              name={game.name}
              standing={turns[game.id] ?? NOTHING}
              them={them}
              buttonRef={keys.ref(index)}
              selected={index === keys.selected}
              onFocus={() => keys.choose(index)}
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
function summary(turns: Record<string, Standing>, them: string): string {
  const all = Object.values(turns)
  const yours = all.filter((s) => s.turn === 'yours').length
  if (yours > 0) return `${yours} for you`

  // A game you have finished is not news about that game any more, so it does
  // not get to speak for the label — otherwise the way in goes on advertising
  // rounds you closed hours ago and the whole line stops being worth reading.
  const open = all.filter((s) => !s.done)
  if (open.some((s) => s.turn === 'both')) return `${them} has been`
  if (open.some((s) => s.turn === 'hers')) return `waiting for ${them}`
  if (all.some((s) => s.done)) return 'all done today'
  return 'nothing yet'
}

/** The standing of a game whose round nobody has opened. */
const NOTHING: Standing = { turn: 'nothing', done: false }

function TheHollow() {
  const play = usePlaying((s) => s.open)
  const say = useSay()
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
  /*
    Only the games that have an asynchronous round to stand in.

    A live game's rounds are named for the moment the two of you agreed on one,
    not for the day, so there is no `scattergories:2026-08-30` for this list to
    look at and there never will be. Watching for it anyway meant one permanent
    "nothing opened today" in a list whose entire job is to be worth glancing
    at — plus a listener on a document that cannot exist.
  */
  /*
    Which doors are shut for you right now. See `systems/locks`.
  */
  const shut = useDoorman()
  /*
    Every game stays in the row, and a closed one wears a lock.

    The first version of this took a locked game out of the row altogether, on
    the reasoning that a door you can see and cannot open is the interface
    talking about work in progress. That was the wrong call, and it read as the
    game having been deleted: the Hollow simply had two cards in it where there
    had been three, with nothing anywhere saying why.

    A lock says what a gap cannot. It is still your game, it is still there, and
    it is shut for a reason — which is the whole message.
  */
  const open = GAMES

  /*
    A shut game is not waiting for anybody, so it is not in the list of what is.
    That list is a to-do, and a door you cannot open has nothing to do.
  */
  const listed = useMemo(
    () => GAMES.filter((g) => g.mode !== 'live' && !shut(gameKey(g.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the doorman is rebuilt
    // every render by design; the locks themselves are the dependency.
    [shut],
  )
  const turns = useStandings(listed)

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
  const yours = Object.values(turns).filter((s) => s.turn === 'yours').length
  useEffect(() => {
    theRoom.waitingForYou = yours
    // Quiet again on the way out, or the fire stays awake in an empty room.
    return () => {
      theRoom.waitingForYou = 0
    }
  }, [yours])

  /*
    If something is actually waiting for you, that is the screen you land on.

    =======================================================================
    The row of games is the right first screen when there is nothing to do —
    you are choosing something to start. It is the wrong one when a word has
    been left for you: then the answer to 'what am I doing here' already
    exists, and making somebody find a link under the carousel to be told it
    is asking them to go looking for their own notification.

    Once, and only once. It fires the first time the standings resolve, so
    pressing *back to the games* stays pressed rather than being overruled a
    frame later — and it never fires at all on a quiet day, which is most of
    them.
    =======================================================================
  */
  const settled = Object.keys(turns).length > 0
  const landed = useRef(false)
  useEffect(() => {
    if (landed.current || !settled) return
    landed.current = true
    if (yours > 0) setShowing('waiting')
  }, [settled, yours])

  /*
    Where the row starts: the last game you were in, not the first one.

    One past the end is the "more coming" card, which is always there.
  */
  const [at, setAt] = useState(() => {
    const last = usePlaying.getState().lastPlayed
    const where = last === null ? -1 : open.findIndex((g) => g.id === last)
    return where < 0 ? 0 : where
  })
  const [way, setWay] = useState(0)
  const [choosingLiveRoad, setChoosingLiveRoad] = useState(false)
  const last = open.length
  const game = open[at]
  const begin = useCallback((gameId: string, solo: boolean) => {
    ambience.cue('ember', 0.78)
    play(gameId, solo)
  }, [play])
  const go = useCallback(
    (by: 1 | -1) => setAt((n) => Math.max(0, Math.min(last, n + by))),
    [last],
  )
  const chooseGame = useCallback(
    (index: number) => {
      const game = open[index]
      // Shut is shut whichever way you reached for it — a tap, Enter, or the
      // list of what is waiting. One guard, at the one door they all go through.
      if (!game || shut(gameKey(game.id))) return
      ambience.cue('ember', 0.38)
      setAt(index)
      setWay(0)
      setShowing('ways')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as above
    [shut],
  )

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

  /*
    ---------------------------------------------------------------------------
    Swiping the row *is* choosing.

    The row is a real scroll container with `scroll-snap-type: x mandatory` on
    it, so a thumb-flick slides it and the browser lands it dead centre on the
    next card — and nothing told React any of that had happened. `at` still
    pointed at the card you swiped away from. So the game now filling the
    screen was drawn as a neighbour: dimmed, no glow, and labelled "bring to
    the fire" rather than "enter to choose". Tapping it selected it, and only a
    second tap opened it.

    Two taps, and the first one appeared to do nothing except brighten a card
    that was already the only one you could see.

    Reading the scroll position back fixes it at the source, rather than by
    adding another gesture: whatever card the row has settled on is the card
    you have chosen, however it got there — thumb, trackpad, arrow key or the
    two chevrons. One tap enters, because by then it is already selected.
    ---------------------------------------------------------------------------
  */
  /** `at` readable from a listener without re-subscribing it on every card. */
  const atNow = useRef(at)
  atNow.current = at
  /** The move came from the row itself, so it is already where it belongs. */
  const fromScroll = useRef(false)
  /** A scroll we started. Its own events must not be read back as a swipe. */
  const gliding = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (showing !== 'games') return
    const row = track.current?.querySelector('.game-row')
    if (!(row instanceof HTMLElement)) return

    let frame = 0
    const settle = () => {
      frame = 0
      // Ignore the scrolling we asked for ourselves. A smooth `scrollIntoView`
      // passes over every card between here and where it is going, and reading
      // those would drag `at` through them on the way.
      if (gliding.current !== null) return
      const middle = row.scrollLeft + row.clientWidth / 2
      let nearest = 0
      let best = Infinity
      cards.current.forEach((card, index) => {
        if (!card) return
        const from = Math.abs(card.offsetLeft + card.offsetWidth / 2 - middle)
        if (from < best) {
          best = from
          nearest = index
        }
      })
      if (nearest === atNow.current) return
      fromScroll.current = true
      setAt(nearest)
    }
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(settle)
    }

    row.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      row.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [showing])

  useEffect(() => () => { if (gliding.current !== null) clearTimeout(gliding.current) }, [])

  useEffect(() => {
    setWay(0)

    /*
      Only drive the row when something other than the row moved it.

      An arrow key or a chevron has to be carried over to the scroll position.
      A swipe must not be: the browser is already snapping the card into place,
      and scrolling it again from here would fight that animation and, worse,
      hold the listener shut for the length of it — so a second quick flick
      would go unread.
    */
    if (fromScroll.current) {
      fromScroll.current = false
    } else {
      // Held a little past the animation, so its tail is not mistaken for a
      // swipe. Reset on every move, so flicking through never sticks it shut.
      if (gliding.current !== null) clearTimeout(gliding.current)
      gliding.current = setTimeout(() => { gliding.current = null }, 620)
      cards.current[at]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }

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
      const game = open[near]
      if (!game) continue
      game.Component.warm()
      game.Stage?.warm()
    }
  }, [at])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The road carousel owns the keyboard while it is open. Without this,
      // one arrow press moves both the road and the mode hidden underneath it.
      if (choosingLiveRoad) return
      const focused = document.activeElement
      if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) return
      if (showing === 'games' && e.key === 'ArrowRight') {
        e.preventDefault()
        if (focused instanceof HTMLElement) focused.blur()
        go(1)
      } else if (showing === 'games' && e.key === 'ArrowLeft') {
        e.preventDefault()
        if (focused instanceof HTMLElement) focused.blur()
        go(-1)
      } else if (
        showing === 'ways' &&
        (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') &&
        game
      ) {
        e.preventDefault()
        if (focused instanceof HTMLElement) focused.blur()
        // A live-only game has exactly one way in, so there is nothing to
        // move between and the arrows must not park the cursor on a button
        // that was never rendered.
        const count = game.mode === 'live' ? 1 : game.live ? 3 : 2
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
  }, [at, chooseGame, choosingLiveRoad, game, go, showing, way])

  if (showing === 'waiting') {
    return (
      <div className="threshold hollow-threshold">
        <Challenges
          games={listed}
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
            const standing = (turns[id] ?? NOTHING).turn
            if (standing === 'yours' || standing === 'both') {
              ambience.cue('ember', 0.38)
              begin(id, false)
              return
            }
            const index = open.findIndex((candidate) => candidate.id === id)
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
          <p>{say(game.blurb)}</p>
          <small>{game.duration}</small>
        </header>

        {/*
          A live-only game gets one door, and it is the one that waits.

          Not three doors with two of them greyed out: an option you can see
          and cannot take is a question the interface is asking and refusing to
          answer. There is nothing to choose between here, so the screen stops
          pretending there is and says the one true thing instead — this is
          played together, and it opens when you are both here. `LiveWayIn`
          already knows how to say that and how to stay shut until it is true.
        */}
        {game.mode === 'live' && game.live ? (
          <div className="game-ways-one" role="group" aria-label={`enter ${game.name}`}>
            <span className="game-way-label">this one is played together</span>
            <LiveWayIn
              game={game.id}
              them={them.name}
              live={game.live}
              selected={way === 0}
              buttonRef={(node) => { ways.current[0] = node }}
              onFocus={() => setWay(0)}
              onChoosing={setChoosingLiveRoad}
            />
          </div>
        ) : (
          <div className="game-ways" role="group" aria-label={`ways to enter ${game.name}`}>
            <span className="game-way-label">now choose how you enter</span>
            <button
              ref={(node) => { ways.current[0] = node }}
              type="button"
              className={`game-go${way === 0 ? ' is-selected' : ''}`}
              onFocus={() => setWay(0)}
              onClick={() => begin(game.id, false)}
              title={game.invite ? say(game.invite.tip) : undefined}
            >
              {game.invite ? say(game.invite.name) : `play with ${them.name}`}
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
                  onChoosing={setChoosingLiveRoad}
                />
              ) : null}
            </div>
          </div>
        )}
        <p className="game-key-guide">
          {game.mode === 'live' ? 'enter confirm · escape back' : '↑ ↓ choose · enter confirm · escape back'}
        </p>
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
        {open.map((g, index) => {
          const locked = shut(gameKey(g.id))
          return (
          <button
            ref={(node) => { cards.current[index] = node }}
            type="button"
            className={`game-card${index === at ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`}
            key={g.id}
            aria-current={index === at ? 'true' : undefined}
            aria-disabled={locked || undefined}
            tabIndex={index === at ? 0 : -1}
            onFocus={() => setAt(index)}
            onClick={() => {
              // A shut card still takes a tap — it just brings itself to the
              // middle so you can read why. What it will not do is open.
              if (index === at) { if (!locked) chooseGame(index) }
              else setAt(index)
            }}
          >
            <span className="game-card-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="game-card-object">{g.Emblem ? <g.Emblem /> : null}</span>
            <strong>{g.name}</strong>
            <span className="game-length">{g.duration}</span>
            <small>{say(g.blurb)}</small>
            {/*
              The lock, and it says what kind of shut this is.

              Not "unavailable" and not an error: this is a thing that is being
              worked on and will come back, and the line is the only place that
              can say so. It sits where the invitation would have been, because
              it is standing in for exactly that.
            */}
            <span className="game-card-command">
              {locked ? (
                <span className="game-card-locked">
                  <i aria-hidden="true" /> being worked on
                </span>
              ) : index === at ? (
                'enter to choose'
              ) : (
                'bring to the fire'
              )}
            </span>
          </button>
          )
        })}
        <button
          ref={(node) => { cards.current[last] = node }}
          type="button"
          className={`game-card game-card-coming${at === last ? ' is-selected' : ''}`}
          aria-current={at === last ? 'true' : undefined}
          tabIndex={at === last ? 0 : -1}
          onFocus={() => setAt(last)}
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
            next · <em>{at + 1 === last ? 'the next fire' : open[at + 1].name}</em>
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
            onClick={(event) => {
              setAt(i)
              event.currentTarget.blur()
            }}
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
    const target = e.target as HTMLElement | null
    if (target?.closest('button')) return
    /*
      Not on the row itself — the row scrolls, and reports where it landed.

      This recogniser is for the rest of the screen: the heading, the space
      around the cards, anywhere a drag has nothing else to mean. Letting it
      fire over the row as well moved the carousel twice for one gesture, once
      by scrolling and once by counting.
    */
    if (target?.closest('.game-row')) return
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
  const keys = useMenuKeys(1)
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
      <button ref={keys.ref(0)} type="button" onClick={() => void start()}>
        leave a memory here
      </button>
      {count > 0 && (
        <span className="glasshouse-walk-guide">
          <span className="glasshouse-walk-touch">swipe up or down</span>
          <span className="glasshouse-walk-pointer">scroll or use the arrow keys</span>
          {' '}to walk backward through what we kept
        </span>
      )}
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
  const world = useWorldSlice((state) => state)
  const id = SECTIONS[index].id
  const treeCount = 1 + (questions.current ? 1 : 0) +
    (questions.availableSeeds > 0 ? 1 : 0) + (questions.history.length > 1 ? 1 : 0)
  const thresholdKeys = useMenuKeys(
    id === 'tree' ? treeCount : id === 'river' ? 1 : 0,
    true,
    entered && !takenOver && (id === 'tree' || id === 'river'),
    id === 'tree' ? 'vertical' : 'both',
  )

  if (!entered || takenOver) return null

  if (id === 'tree') {
    const current = questions.current
    const mine = current?.answered[data.me] ?? false
    const both = Boolean(current?.answered.warm && current?.answered.cool)
    return (
      <div className="threshold tree-threshold">
        <button
          ref={thresholdKeys.ref(0)}
          type="button"
          className={thresholdKeys.selected === 0 ? 'is-selected' : undefined}
          onFocus={() => thresholdKeys.choose(0)}
          onClick={write}
        >
          plant a thought
        </button>
        <div className="tree-rituals">
          {current ? (
            <button
              ref={thresholdKeys.ref(1)}
              type="button"
              className={thresholdKeys.selected === 1 ? 'is-selected' : undefined}
              onFocus={() => thresholdKeys.choose(1)}
              onClick={useQuestions.getState().openCurrent}
            >
              <span aria-hidden="true">✦</span>{' '}
              {both ? 'read the newest bloom' : mine ? 'your answer is waiting' : 'the Tree is asking'}
            </button>
          ) : null}
          {questions.availableSeeds > 0 ? (
            <button
              ref={thresholdKeys.ref(1 + (current ? 1 : 0))}
              type="button"
              className={thresholdKeys.selected === 1 + (current ? 1 : 0) ? 'is-selected' : undefined}
              onFocus={() => thresholdKeys.choose(1 + (current ? 1 : 0))}
              onClick={useQuestions.getState().openPlanting}
            >
              <span aria-hidden="true">◇</span>{' '}
              plant a question · {questions.availableSeeds}
            </button>
          ) : null}
          {questions.history.length > 1 ? (
            <button
              ref={thresholdKeys.ref(1 + (current ? 1 : 0) + (questions.availableSeeds > 0 ? 1 : 0))}
              type="button"
              className={thresholdKeys.selected === 1 + (current ? 1 : 0) + (questions.availableSeeds > 0 ? 1 : 0) ? 'is-selected' : undefined}
              onFocus={() => thresholdKeys.choose(1 + (current ? 1 : 0) + (questions.availableSeeds > 0 ? 1 : 0))}
              onClick={() => useQuestions.getState().openArchive(questions.history.at(-1)!.id)}
            >
              all answered questions · {questions.history.length}
            </button>
          ) : null}
        </div>
        {/*
          Why there is no new question, when there is no new question.

          Without this the Tree simply goes quiet after a bloom, and quiet is
          indistinguishable from broken — especially now the wait is measured
          from the moment you both finished, so it begins exactly when you are
          standing there having just finished. Saying it is growing turns an
          absence into a thing that is happening.

          Deliberately not a countdown to the minute. See `until`.
        */}
        {both && questions.nextAt !== null && questions.nextAt > data.now() ? (
          <p className="tree-growing">
            <span aria-hidden="true">❁</span> the next question is growing ·{' '}
            {until(questions.nextAt, data.now())}
          </p>
        ) : null}
        <span className="tree-turn-guide">
          <span className="tree-turn-pointer">drag / scroll to turn · home resets</span>
          <span className="tree-turn-touch">drag sideways to turn · pinch to zoom</span>
        </span>
      </div>
    )
  }

  if (id === 'river') {
    /*
      What is actually in it, on the way in.

      =====================================================================
      The Wellspring is where the two of them keep real money they have
      really set aside, and standing in it told you nothing whatever about
      how much. The only figure anywhere was at the foot of the form for
      *adding* to it — so the answer to "how are we doing" sat behind the act
      of putting more in, which is the one moment you are least likely to be
      asking it, and the rest of the time the place was a river with a button.

      It leads with the number now and invites second. Somewhere whose whole
      pleasure is watching a figure grow should show you the figure.
      =====================================================================
    */
    const total = potTotal(world)
    const goal = world.pot.goal
    const progress = progressToward(total, goal?.amount ?? null)
    return (
      <div className="threshold river-threshold">
        <p className="river-total">
          <b>{format(total)}</b>
          <span>
            between you
            {goal && progress !== null
              ? ` \u00b7 ${Math.round(progress * 100)}% of ${goal.label || 'the goal'}`
              : null}
          </span>
        </p>
        <span className="threshold-whisper">make the water rise</span>
        <button ref={thresholdKeys.ref(0)} type="button" onClick={tend}>add to ours</button>
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
