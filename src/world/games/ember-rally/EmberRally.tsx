import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { GameProps } from '../types'
import { useGameStage } from '../stage'
import { makeTrack } from './track'
import { driveSpirit } from './spirit'
import { useRace } from './session'
import { usePublishedTuning } from './tuningSync'
import { raceKey, readSitting, stageOfKey } from '@/systems/lobby'
import { roadKey, useDoorman } from '@/systems/locks'
import { useMenuKeys } from '@/ui/useMenuKeys'
import { useChoiceSwipe } from '@/ui/useChoiceSwipe'
import { useLobby } from '@/systems/useLobby'
import { useSay } from '@/systems/useSay'
import { usePlaying } from '@/systems/playing'
import { useData, useWorldSlice } from '@/data/provider'
import { otherUser } from '@/data/types'
import { Wheel } from './Wheel'
import { TouchDriving } from './TouchDriving'
import { drivingWithThumbs } from './touch'
import { gapLabel, useBest } from './best'
import {
  moveRun,
  timeLabel,
  type RallyMove,
  type RallyRun,
  type RallySetup,
  type StageId,
} from './model'

/**
 * Ember Rally — everything that is words.
 *
 * The race itself is not here. It is a place, and places in this garden are
 * rendered by the world; this file opens the road, hands it a line to chase,
 * takes the run back when the car reaches the far fire, and says what
 * happened. See `Race.tsx` for the tunnel and `session.ts` for the handover.
 *
 * The shape of a round is the one thing worth reading twice, because it is
 * built entirely around the fact that the two of you are seven timezones apart
 * and will almost never be here at the same time:
 *
 *   1. **Set a line.** You both drive the same road alone, and neither run is
 *      readable until both exist. That is the seal, and it is enforced in
 *      `firestore.rules` rather than here.
 *   2. **The chase.** Once both first runs are in, hers becomes a car on your
 *      road — her steering, her braking, her mistakes, moving at the speed she
 *      actually moved — and you get one run to catch it.
 *
 * She gets the feeling of being passed without either of you having to be
 * awake for it. Nobody's name goes on a table at the end: the pollen is shared
 * and the road remembers both of you.
 */

type View = 'courses' | 'menu' | 'road' | 'replay'
type RaceKind = 'qualifying' | 'chase'
const STAGES: readonly StageId[] = ['rootway', 'moonbreak', 'stormcrown', 'harmattan']

/** Old saved rounds may still name a road that no longer exists. */
function availableStage(value: unknown): StageId {
  return STAGES.includes(value as StageId) ? (value as StageId) : 'rootway'
}

/**
 * `?stage=moonbreak` opens that road and drops you straight onto it.
 *
 * ---------------------------------------------------------------------------
 * The fourth of the racer's debug hooks, and it exists for the same reason as
 * the other three: there are now two roads, one of them is two minutes long,
 * and the interesting part of it is nine hundred metres in. Getting a picture
 * of that meant a course picker, a menu, a countdown and a minute of driving —
 * on a software renderer at two frames a second. Paired with `?rally=ride` and
 * `?from=`, this makes it one URL.
 *
 * Deliberately only skips the *menus*. It does not skip the countdown, or put
 * the car anywhere, or change how anything drives — a hook that quietly alters
 * what it is showing you is worse than no hook, because you cannot tell.
 * ---------------------------------------------------------------------------
 */
const OPEN_ON = (() => {
  if (typeof location === 'undefined') return null
  const asked = new URLSearchParams(location.search).get('stage')
  return STAGES.includes(asked as StageId) ? (asked as StageId) : null
})()

const COURSES: Record<StageId, {
  name: string
  place: string
  short: string
  soloTitle: string
  soloCopy: string
  spirit: string
  returnTo: string
  setTitle: string
  setCopy: string
  sealedTitle: string
  chaseHome: string
  resultKicker: string
  finishPlace: string
  /** How a spotless run through this one is described. */
  cleanWord: string
  /** What the card in the picker says on the way in. */
  enter: string
}> = {
  rootway: {
    name: 'The Rootway',
    place: 'fire and stone',
    short: 'A close, changing road beneath the garden. Learn it by the lanterns.',
    soloTitle: 'Something is already down there',
    soloCopy: 'A small fire knows this road and it is quicker than it looks. It leaves a pale line through the tunnel; follow that and you will not be far off. Brake into the bend, hold the slide, and let go at the apex.',
    spirit: 'the fire-spirit',
    returnTo: 'return to the fire',
    setTitle: 'Set a line {she} cannot see',
    setCopy: 'Learn the turns and leave your tyre marks in the dark. {Their} first run stays under the stone until yours is beside it — and yours stays under it until {hers} is.',
    sealedTitle: 'The stone stays closed.',
    chaseHome: 'home to the fire',
    resultKicker: 'two lines through one dark',
    finishPlace: 'the fire',
    cleanWord: 'through the Rootway',
    enter: 'go below',
  },
  moonbreak: {
    name: 'The Moonbreak',
    place: 'water and open sky',
    short: 'A long pale causeway over the drowned high garden. Fast, exposed, unforgiving.',
    soloTitle: 'A pale car is crossing the water',
    soloCopy: 'The road is visible here, but that does not make it kind. Carry speed across the Mirror Flats, give Tidecut one honest brake, then brake earlier than feels necessary when four amber pearls call the Moonhook.',
    spirit: 'the moon-spirit',
    returnTo: 'return to the moonwell',
    setTitle: 'Leave a wake {she} cannot see',
    setCopy: 'Learn the pale turns and leave your tyre marks above the water. {Their} first crossing stays under the moon until yours is beside it — and yours stays there until {hers} is.',
    sealedTitle: 'The water keeps it.',
    chaseHome: 'home across the water',
    resultKicker: 'two wakes under one moon',
    finishPlace: 'the moonwell',
    cleanWord: 'across the Moonbreak',
    enter: 'take the high road',
  },
  harmattan: {
    name: 'The Harmattan',
    place: 'dust and red earth',
    short: 'Laterite, sand and the dry wind. The hardest road, and the only one in daylight.',
    soloTitle: 'Something is running ahead of you in the dust',
    soloCopy: 'You cannot see far and neither can it. The indigo banners come in pairs — the second one is your brake. And watch the ground: where the road goes pale the sand is deep, and it will take the car somewhere you did not ask for.',
    spirit: 'the dust-spirit',
    returnTo: 'return to the brassfire',
    setTitle: 'Leave a line {she} cannot see',
    setCopy: 'Learn the plain, the mounds, the river and the town, and leave your tyre marks in the laterite. {Their} first crossing stays in the dust until yours is beside it — and the wind will have moved the sand by the time {she} drives it anyway.',
    sealedTitle: 'The dust keeps it.',
    chaseHome: 'home through the dust',
    resultKicker: 'two lines through one wind',
    finishPlace: 'the brassfire',
    cleanWord: 'across the Harmattan',
    enter: 'into the wind',
  },
  stormcrown: {
    name: 'The Stormcrown',
    place: 'rain and high stone',
    short: 'The longest road: cedar ascent, cloud ridge, three mountain hairpins, then Stormfall.',
    soloTitle: 'A white fire is climbing into weather',
    soloCopy: 'The mountain tells the truth in landmarks. Three amber cairns call Gale Bend; five call the Thunder Stair. Brake while the road is straight, turn once, and keep something for the wet descent.',
    spirit: 'the storm-spirit',
    returnTo: 'return to the stormfire',
    setTitle: 'Leave a line above the cloud',
    setCopy: 'Carry one private line from the cedars to the crown. {Their} climb stays inside the weather until yours is beside it — and neither of you sees the mountain give the other away.',
    sealedTitle: 'The storm keeps it.',
    chaseHome: 'home through the rain',
    resultKicker: 'two lights under one storm',
    finishPlace: 'the stormfire',
    cleanWord: 'over the Stormcrown',
    enter: 'climb into weather',
  },
}

/**
 * The little landscape on each road's card in the picker.
 *
 * Pure decoration, made of the same handful of gradients the emblems are — a
 * vault and two lamps for the tunnel, a moon over water for the causeway, three
 * peaks and rain for the mountain. Kept beside `COURSES` rather than inline in
 * the picker so that a road is one entry in two tables and nothing else.
 */
const SCENES: Record<StageId, ReactNode> = {
  rootway: (
    <>
      <i className="course-vault one" />
      <i className="course-vault two" />
      <i className="course-road" />
      <i className="course-lamps"><b /><b /></i>
    </>
  ),
  moonbreak: (
    <>
      <i className="course-moon" />
      <i className="course-arch one" />
      <i className="course-arch two" />
      <i className="course-water" />
      <i className="course-road" />
    </>
  ),
  /*
    A low sun in a sky with no blue in it, a baobab, and the road going into
    the haze. The sun is the tell: it is the only one of these cards with a
    *day* on it, and that is the whole difference between this road and the
    other three.
  */
  harmattan: (
    <>
      <i className="course-sun" />
      <i className="course-haze" />
      <i className="course-baobab" />
      <i className="course-dune" />
      <i className="course-road" />
    </>
  ),
  stormcrown: (
    <>
      <i className="course-lightning" />
      <i className="course-peak one" />
      <i className="course-peak two" />
      <i className="course-peak three" />
      <i className="course-rain" />
      <i className="course-road" />
    </>
  ),
}

/**
 * The only instruction in the whole game, in whichever language this machine
 * speaks.
 *
 * Read once, at module load, because a phone does not turn into a laptop
 * halfway through a corner — and because the garden's law is that everything
 * touchable announces itself. A screen with no controls drawn anywhere owes
 * you one sentence saying where they are, and then owes you nothing else.
 */
/**
 * The one sentence of instruction in the whole race.
 *
 * It has to be *true*, which it stopped being when the car got a throttle:
 * it went on telling people that down was the slide and space was the ember,
 * which are now the brake and the handbrake. A hint that is wrong is worse
 * than none — it teaches the wrong thing once and is then gone.
 */
const CONTROLS = 'up to go · down to brake · arrows to steer · space to slide · shift for the ember'

interface RallyAction {
  label: string
  onChoose(): void
  quiet?: boolean
  disabled?: boolean
}

/** Every choice shown after a run obeys the same arrows-and-Enter contract. */
function RallyActions({ actions }: { actions: RallyAction[] }) {
  const keys = useMenuKeys(actions.length)

  return (
    <>
      <div className="rally-actions">
        {actions.map((action, index) => (
          <button
            ref={keys.ref(index)}
            type="button"
            className={`${action.quiet ? 'quiet' : ''}${keys.selected === index ? ' is-selected' : ''}`.trim()}
            disabled={action.disabled}
            key={action.label}
            onFocus={() => keys.choose(index)}
            onClick={action.onChoose}
          >
            {action.label}
          </button>
        ))}
      </div>
      <p className="rally-menu-keys">↑ ↓ choose · enter confirm</p>
    </>
  )
}

/**
 * Half the gap between the two of you on the start line, in metres.
 *
 * A car is about two metres wide, so this is most of a metre of clear road
 * between the doors: enough that neither of you is inside the other, little
 * enough that you are plainly on the same start line.
 *
 * It was 1.9 — the number the chase draws its ghost at — and that is too wide
 * for two cars that are both really there, because the camera sits behind
 * yours rather than over the middle of the road. At 1.9 each, she was a third
 * off the left of the screen at the one moment whose entire purpose is being
 * able to look across at her.
 */
const GRID_SLOT = 1.35

export default function EmberRally({
  me,
  theirName,
  solo,
  variant,
  setup,
  mine,
  theirs,
  play,
  onLeave,
}: GameProps<RallySetup, RallyMove>) {
  /*
    Wheel to wheel is a different shape of round and it starts here.

    The road is already settled — it is in the key, chosen before the
    invitation went out — so there is no picker, no sealed qualifying lap and
    no chase. There is a room, a flag that drops for both of you at once, and
    one run each. See `Wheel` and `systems/lobby`.
  */
  const say = useSay()
  const data = useData()
  const live = variant === 'race'
  const liveKey = usePlaying((s) => s.race)
  const lobby = useLobby(live ? liveKey : null)
  /*
    Whatever the control room has sent, before anybody drives.

    Here rather than anywhere higher up because this whole folder is fetched on
    demand — somebody who never comes down here should not be holding a
    listener open for a document about a car they have never seen.
  */
  usePublishedTuning()

  /*
    On the seed, never on the setup object.

    `setup` is derived locally and then replaced by whatever the round document
    turns out to hold, so its identity changes the moment the round arrives —
    and a new `track` object means a new tunnel: a kilometre and a half of
    geometry rebuilt from scratch, potentially in the middle of a corner. The
    seed and the stage are the only things the road actually depends on.
  */
  const seed = setup?.seed ?? 1
  const [stage, setStage] = useState<StageId | null>(OPEN_ON)

  /*
    ==========================================================================
    **Which road is waiting for you**, and why this had to exist.

    A round is not one road. It is all three, each with its own pair of runs,
    and which one you are looking at was decided entirely by the course picker
    — a local piece of state that was never written down anywhere.

    So the two of you could not find each other. She set a line on the
    Moonbreak; you opened the round, got the picker with nothing on it to say
    so, chose the Rootway, and drove. `moveRun` filters by stage, so from
    there each of you was looking for the other on a road they had never been
    on: no ghost, no time, no comparison, and both of you sitting on "nobody
    sees anybody's road until both first runs are here" — which was true, and
    was never going to stop being true.

    That is the whole of "she doesn't see my score and I don't see hers". Not
    the seal, not the rules, not the ghost: two people on different roads.

    So the round now *tells* you. If there is a road she has driven and you
    have not, that is the road this opens on, and the picker is skipped
    entirely — she has chosen, and being asked to choose again is being asked
    to guess.
    ==========================================================================
  */
  const challenged = useMemo(() => {
    if (solo) return null
    for (const road of STAGES) {
      if (moveRun(theirs, 'qualifying', road) && !moveRun(mine, 'qualifying', road)) {
        return road
      }
    }
    return null
  }, [solo, theirs, mine])

  /*
    A live round's road is in its key and nothing may override it.

    Not `setup.stage` — a round document is written once, before anybody has
    chosen anything, so its stage is whatever the default was. Not the local
    picker either: the two of you have to be on the same road and the key is
    the only thing you both hold.
  */
  const liveStage = live && liveKey ? stageOfKey(liveKey, 'rootway') : null
  const activeStage = availableStage(
    liveStage ?? stage ?? challenged ?? setup?.stage,
  )
  const track = useMemo(() => makeTrack(seed, activeStage), [seed, activeStage])
  // Only when there is nobody to race. Driving a whole lap costs about a tenth
  // of a second, and in a two-player round nothing ever looks at it.
  const spirit = useMemo(() => (solo ? driveSpirit(track, track.seed) : null), [track, solo])

  const myLine = moveRun(mine, 'qualifying', activeStage)
  const theirLine = moveRun(theirs, 'qualifying', activeStage)
  const myChase = moveRun(mine, 'chase', activeStage, true)
  const theirChase = moveRun(theirs, 'chase', activeStage, true)

  const [view, setView] = useState<View>(OPEN_ON ? 'road' : 'courses')
  /*
    Once, and only before anybody has touched anything.

    The moves arrive a moment after this component does, so the road she is
    waiting on cannot be known at first render — but hijacking the view later
    would also mean yanking somebody out of the picker they had deliberately
    opened. So it fires on the first arrival and never again.
  */
  const settled = useRef(false)
  useEffect(() => {
    if (settled.current || OPEN_ON) return
    if (challenged) {
      settled.current = true
      setView('menu')
    }
  }, [challenged])
  /**
   * Which go this is.
   *
   * Counted here rather than inferred, because "run it again" after a finished
   * run changes nothing else at all — same view, same road, same ghost — and
   * without a number that moves, the effect that opens the road never re-runs
   * and you sit looking at a car already parked on the finish line.
   */
  const [attempt, setAttempt] = useState(0)
  const [kind, setKind] = useState<RaceKind>('qualifying')
  const [lastRun, setLastRun] = useState<RallyRun | null>(null)
  const [saving, setSaving] = useState(false)
  const [fault, setFault] = useState('')

  const start = (next: RaceKind) => {
    setKind(next)
    setLastRun(null)
    setFault('')
    setAttempt((n) => n + 1)
    setView('road')
  }

  /*
    The flag, once.

    Both devices reach `lobby.go` at the same instant — it is a comparison
    against one agreed timestamp, not a message either of them sent — so this
    puts both cars on the road together without anything being coordinated
    here. The guard is a ref rather than a piece of state because it must not
    be able to fire twice: `go` stays true for the whole race, and a second
    firing would restart the road under somebody mid-corner.

    Written out rather than calling `start`, which is rebuilt every render and
    would either loop as a dependency or go stale without one.
  */
  const flagDropped = useRef(false)
  useEffect(() => {
    if (!live || !lobby.go || flagDropped.current) return
    flagDropped.current = true
    setKind('chase')
    setLastRun(null)
    setFault('')
    setAttempt((n) => n + 1)
    setView('road')
  }, [live, lobby.go])

  const backToFire = () => {
    setLastRun(null)
    setView('menu')
  }

  /*
    ===========================================================================
    Going again, without going back to the fire.

    A wheel-to-wheel round is one key, one flag, one run each — `lobby.go`
    latches true and stays true, which is what stops the road restarting under
    somebody mid-corner. It also meant a race was over for good: the only way
    to have another was for both of you to walk out to the Hollow, find each
    other's invitation again, and agree a road you had both just driven.

    A new key is a new room. `useLobby` announces you into whichever one you
    are holding, so publishing a fresh key puts you back on the ready screen
    with the lamps and the countdown, exactly as if you had just been invited —
    and the road comes along with it, because the road is *in* the key.

    Both halves of it are here. If she has already asked for another, her key
    is sitting in her presence and the only correct move is to take it as it
    is; inventing a second one would leave the two of you in separate rooms
    each waiting for somebody who is not coming. That is the same rule, and the
    same reason, as joining her from the Hollow — see `LiveWayIn`.
    ===========================================================================
  */
  const openRace = usePlaying((s) => s.openRace)
  const presence = useWorldSlice((s) => s.presence)
  /** A room she is holding that is not the one this race was run in. */
  const herNextRoom = useMemo(() => {
    if (!live) return null
    const hers = readSitting(presence[otherUser(me)]?.racing)?.key ?? null
    return hers && hers !== liveKey ? hers : null
  }, [live, presence, me, liveKey])

  const raceAgain = () => {
    const next = herNextRoom ?? raceKey(data.now(), activeStage)
    // The flag has already dropped once this round. Let the next one drop.
    flagDropped.current = false
    setLastRun(null)
    setFault('')
    // Anything but the road, or the room has nowhere to appear — see the
    // `live && !lobby.go` branch below.
    setView('menu')
    openRace('ember-rally', next)
  }

  const choose = (next: StageId) => {
    setStage(next)
    setLastRun(null)
    setFault('')
    setView('menu')
  }

  const backToCourses = () => {
    setLastRun(null)
    setView('courses')
  }

  // Kept in a ref so the road can call it without being rebuilt every render —
  // a race that remounted whenever a piece of React state moved would restart
  // the tunnel mid-corner.
  const keep = useRef<(run: RallyRun) => void>(() => {})
  keep.current = async (run: RallyRun) => {
    setLastRun(run)
    setSaving(true)
    setFault('')
    try {
      await play({ kind, stage: activeStage, run })
    } catch {
      setFault('The Hollow could not keep that run. Your time is still here until you leave.')
    } finally {
      setSaving(false)
    }
  }

  if (!setup) {
    /*
      A way out of the one screen that had none.

      If the round document is slow, or never arrives at all, this is where you
      sit — and with no control on it and no Escape key, a phone had no way
      back to the fire short of reloading the site. A screen that can be
      reached and not left is a trap whatever else it says.
    */
    return (
      <div className="rally rally-centre">
        <p className="rally-kicker">ember rally</p>
        <p className="rally-copy">The road is opening.</p>
        <RallyActions actions={[{ label: 'back to the fire', onChoose: onLeave, quiet: true }]} />
      </div>
    )
  }

  const course = COURSES[activeStage]

  /*
    The room, until the flag drops.

    Held ahead of every other screen because a live round has no menu: there is
    nothing to choose and nothing to read. Once `go` is true this falls through
    to the road below with `kind` already set to a chase, which is the run
    shape that carries a time and no seal.
  */
  if (live && !lobby.go && view !== 'road') {
    return (
      <Wheel
        lobby={lobby}
        roadName={COURSES[activeStage].name}
        theirName={theirName}
        onLeave={onLeave}
      />
    )
  }

  if (view === 'courses' && !live) {
    return (
      <CoursePicker
        onChoose={choose}
        onLeave={onLeave}
        mine={mine}
        theirs={theirs}
        theirName={theirName}
        solo={solo}
      />
    )
  }

  // --- on the road ---------------------------------------------------------

  if (view === 'road') {
    /*
      Nothing to chase in a live round.

      `theirLine` is a *recording* of an earlier run, and in a round that
      started ninety seconds ago there is not one — she is driving it now. So
      in a live round there is no ghost at all, and the second car on the road
      comes from presence instead: `wheelToWheel` below, and `wire.ts`.
    */
    const ghost = (live ? null : solo ? spirit : kind === 'chase' ? theirLine : null) ?? null
    const ghostName = solo ? course.spirit : theirName
    return (
      <Road
        attempt={attempt}
        track={track}
        ghost={ghost}
        ghostName={ghostName}
        wheelToWheel={live}
        /*
          Your side of the grid, and it has to be decided by *who you are*.

          Both phones run this same line, so anything local — who opened the
          round, who pressed ready first, `Math.random` — would put each
          driver on their own right and leave the two of you disagreeing about
          where the other one was standing. Comparing the two user ids is the
          one thing both devices already agree on, and it never changes.
        */
        grid={live ? (me === 'warm' ? GRID_SLOT : -GRID_SLOT) : 0}
        onFinish={(run) => keep.current(run)}
        onLeave={backToFire}
        onRestart={() => start(kind)}
      >
        {lastRun ? (
          <RunOver
            run={lastRun}
            sealed={!solo && kind === 'qualifying'}
            saving={saving}
            fault={fault}
            onDone={backToFire}
            /*
              Wheel to wheel goes back to the room, not straight back onto the
              road. The two of you have to agree on another one — the flag drops
              once, for both, and that is the whole promise of the mode. See
              `raceAgain`.
            */
            onAgain={
              live
                ? raceAgain
                : !solo && kind === 'qualifying'
                  ? null
                  : () => start(kind)
            }
            againLabel={
              live ? (herNextRoom ? `join ${theirName}` : 'race again') : 'run it again'
            }
            returnLabel={course.returnTo}
            cleanWord={course.cleanWord}
            /*
              Who you were racing, and what they did.

              Wheel to wheel: her run on the same road, which lands whenever
              she crosses the line — before you, or a minute after. Until it
              does there is no result, only your own time and a note saying so.

              A chase: the line you were chasing, which has been there all
              along. Either way it is the same question — first or second —
              and the screen at the end of a race was answering neither.
            */
            against={
              solo
                ? null
                : live
                  ? { name: theirName, run: moveRun(theirs, 'chase', activeStage, true) }
                  : kind === 'chase'
                    ? { name: theirName, run: moveRun(theirs, 'qualifying', activeStage) }
                    : null
            }
          />
        ) : null}
      </Road>
    )
  }

  if (view === 'replay' && myChase && theirChase) {
    return (
      <Replay
        track={track}
        runs={{ mine: myChase, theirs: theirChase }}
        theirName={theirName}
        onLeave={backToFire}
      />
    )
  }

  // --- at the fire ---------------------------------------------------------

  if (solo) {
    return (
      <Briefing
        kicker={`${course.name.toLowerCase()} · alone`}
        title={myChase ? 'Again, then' : course.soloTitle}
        copy={course.soloCopy}
        primary={myChase ? 'run it again' : 'start the engine'}
        onPrimary={() => start('chase')}
        onLeave={backToCourses}
        leaveLabel="choose another road"
        foot={
          myChase && spirit
            ? `your last run · ${timeLabel(myChase.timeMs)} · ${course.spirit} · ${timeLabel(spirit.timeMs)}`
            : `${course.place} · one spirit · no waiting for anybody`
        }
      />
    )
  }

  /*
    ==========================================================================
    **Her line is there to be chased, not to be matched first.**

    This used to open with "set my line" whatever the state of the road, and
    the two runs were sealed against each other until both existed. That is
    the right shape for Word Duel — seeing her word before choosing yours ends
    the game — and it is the wrong shape for a lap time. A time nobody may look
    at is not a challenge, and "she left you a line" followed by a screen
    asking you to drive alone against nothing is the announcement and the game
    disagreeing with each other.

    So if she has been down this road and you have not, you chase her. Her time
    is on the screen before you start, her car is on the road with you, and you
    may keep going until you beat it — a chase is not a single sealed attempt,
    it is a thing you have another go at.

    The seal itself lived in `firestore.rules`, not here; the racer is now
    exempt from it by `gameId`. Until those rules are republished her line
    cannot be read at all and this branch will simply never be reached, which
    is worth knowing before wondering why nothing changed.
    ==========================================================================
  */
  if (!myLine && theirLine && !solo) {
    return (
      <Briefing
        kicker={`${course.name.toLowerCase()} · ${theirName.toLowerCase()} has been down here`}
        title={say('{Their} line is on the road')}
        copy={say(
          'The pale car is {their} real run — {their} steering, {their} braking, every place {she} got it wrong. {She} sets off when you do. Beat the time and the road is yours; miss it and you can go again.',
        )}
        primary={myChase ? 'go again' : say('chase {their} line')}
        onPrimary={() => start('chase')}
        onLeave={backToCourses}
        leaveLabel="choose another road"
        /*
          Once you have had a go, the number that matters is the gap. Before
          that it is simply the target — there is nothing to be behind by yet.
        */
        foot={
          myChase
            ? myChase.timeMs <= theirLine.timeMs
              ? `you have it by ${timeLabel(theirLine.timeMs - myChase.timeMs)} · ${timeLabel(myChase.timeMs)}`
              : `${timeLabel(myChase.timeMs - theirLine.timeMs)} off ${say('{her}')} · your best ${timeLabel(myChase.timeMs)}`
            : `${timeLabel(theirLine.timeMs)} to beat`
        }
      />
    )
  }

  if (!myLine) {
    return (
      <Briefing
        kicker={`${course.name.toLowerCase()} · first passage`}
        title={say(course.setTitle)}
        copy={say(course.setCopy)}
        primary="set my line"
        onPrimary={() => start('qualifying')}
        onLeave={backToCourses}
        leaveLabel="choose another road"
        foot={CONTROLS}
      />
    )
  }

  if (!theirLine) {
    /*
      She has not set a line of her own — because she does not have to any
      more. She chases yours. So the honest thing to report here is whether
      she has *been down it*, and how she got on.
    */
    const herTry = theirChase
    const beat = herTry ? herTry.timeMs < myLine.timeMs : false
    return (
      <div className="rally rally-centre">
        <p className="rally-kicker">your line is in · {course.name.toLowerCase()}</p>
        <h1>
          {herTry
            ? beat
              ? `${theirName} beat it.`
              : `${theirName} has not caught you.`
            : course.sealedTitle}
        </h1>
        <p className="rally-copy">
          {herTry
            ? beat
              ? say(
                  `{She} came home ${timeLabel(myLine.timeMs - herTry.timeMs)} up on you. The road is {hers} until you go again.`,
                )
              : say(
                  `{She} is ${timeLabel(herTry.timeMs - myLine.timeMs)} off your line so far, and {she} can keep trying.`,
                )
            : say(`Your tyre marks are down. ${theirName} chases them whenever {she} next comes below.`)}
        </p>
        <RallyActions actions={[
          { label: 'run it again', onChoose: () => start('qualifying') },
          { label: 'choose another road', onChoose: backToCourses, quiet: true },
        ]} />
        <p className="rally-note">
          your line · {timeLabel(myLine.timeMs)}
          {herTry ? ` · ${theirName.toLowerCase()} · ${timeLabel(herTry.timeMs)}` : ''}
        </p>
      </div>
    )
  }

  if (!myChase) {
    return (
      <Briefing
        kicker={`${theirName.toLowerCase()} has been down there`}
        title={say('{Their} light is on the road')}
        copy={`${say(
          'This time the pale car is real: {their} steering, {their} braking, every place {she} got it wrong. {She} sets off when you do. Catch {her}, pass {her}, and bring both lines',
        )} ${course.chaseHome}.`}
        primary="begin the chase"
        onPrimary={() => start('chase')}
        onLeave={backToCourses}
        leaveLabel="choose another road"
        foot={`${timeLabel(theirLine.timeMs)} of road ahead of you`}
      />
    )
  }

  if (!theirChase) {
    return (
      <div className="rally rally-centre">
        <p className="rally-kicker">your chase is in</p>
        <h1>{timeLabel(myChase.timeMs)}</h1>
        <p className="rally-copy">
          Your headlights have gone quiet. The second set of tyre marks appears whenever the
          road is travelled again.
        </p>
        <RallyActions actions={[
          { label: 'run it again', onChoose: () => start('chase') },
          { label: 'choose another road', onChoose: backToCourses, quiet: true },
        ]} />
      </div>
    )
  }

  const gap = Math.abs(myChase.timeMs - theirChase.timeMs)
  const mineFirst = myChase.timeMs < theirChase.timeMs
  const together = gap < 120

  return (
    <div className="rally rally-centre">
      <p className="rally-kicker">
        {course.resultKicker}
      </p>
      <h1>
        {together
          ? 'Side by side.'
          : mineFirst
            ? `You reached ${course.finishPlace} first.`
            : `${theirName} reached ${course.finishPlace} first.`}
      </h1>
      <div className="rally-times">
        <span>
          <small>you</small>
          {timeLabel(myChase.timeMs)}
        </span>
        <i>{together ? 'together' : `${(gap / 1000).toFixed(2)} apart`}</i>
        <span>
          <small>{theirName}</small>
          {timeLabel(theirChase.timeMs)}
        </span>
      </div>
      <p className="rally-copy">The pollen is shared. {course.name} remembers both of you.</p>
      <RallyActions actions={[
        { label: 'watch the two runs', onChoose: () => setView('replay') },
        { label: 'race it again', onChoose: () => start('chase'), quiet: true },
        { label: 'choose another road', onChoose: backToCourses, quiet: true },
      ]} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// The three roads
// ---------------------------------------------------------------------------

/**
 * A place chosen by looking into it.
 *
 * These are not menu cards and deliberately have no metadata furniture. Each
 * button is a small threshold made from the course's own visual grammar: the
 * Rootway closes around two warm lamps; the Moonbreak opens onto water and a
 * broken white arch. The words only say the difference the pictures cannot.
 */
/**
 * What each road is holding, in one word.
 *
 * The three doors used to be identical whatever had happened on them, which is
 * how the two of you ended up on different roads without either of you being
 * able to tell. Now a door says whether somebody is waiting behind it.
 */
function CourseState({
  stage,
  mine,
  theirs,
  theirName,
  solo,
}: {
  stage: StageId
  mine: RallyMove[]
  theirs: RallyMove[]
  theirName: string
  solo: boolean
}) {
  if (solo) return null
  const myLine = moveRun(mine, 'qualifying', stage)
  const theirLine = moveRun(theirs, 'qualifying', stage)
  if (theirLine && !myLine) {
    return (
      <span className="rally-course-state waiting">
        {theirName.toLowerCase()} has driven this · {timeLabel(theirLine.timeMs)}
      </span>
    )
  }
  if (myLine && !theirLine) {
    return (
      <span className="rally-course-state">
        your line is down · waiting for {theirName.toLowerCase()}
      </span>
    )
  }
  if (myLine && theirLine) {
    return <span className="rally-course-state open">both lines are in · chase it</span>
  }
  return null
}

function CoursePicker({
  onChoose,
  onLeave,
  mine,
  theirs,
  theirName,
  solo,
}: {
  onChoose(stage: StageId): void
  onLeave(): void
  mine: RallyMove[]
  theirs: RallyMove[]
  theirName: string
  solo: boolean
}) {
  /*
    Only the roads that are open to you.

    A road being rebuilt comes off the wall rather than being shipped
    half-finished — see `systems/locks`. Everything below counts off this list,
    so the heading, the arrows, the marks underneath and the keyboard all agree
    without any of them knowing that locking exists.
  */
  /*
    Every road stays on the wall, and a closed one wears a lock.

    Taking it out of the row was the first attempt and it read as the road
    having been deleted — three cards where there had been four, and nothing
    anywhere saying why. A lock says the thing a gap cannot: it is still here,
    and it is shut for a reason.
  */
  const shut = useDoorman()
  const roads = STAGES

  const keys = useMenuKeys(roads.length, false)
  const selected = keys.selected
  const setSelected = keys.choose

  const showPrevious = () => setSelected(Math.max(0, selected - 1))
  const showNext = () => setSelected(Math.min(roads.length - 1, selected + 1))
  const browser = useRef<HTMLDivElement>(null)
  const swipe = useCallback(
    (direction: -1 | 1) => {
      setSelected(Math.max(0, Math.min(roads.length - 1, selected + direction)))
    },
    [roads.length, selected, setSelected],
  )
  useChoiceSwipe(browser, swipe)

  return (
    <div className="rally rally-courses">
      <div className="rally-course-heading">
        {/* Counted from the actual road list so this cannot become stale. */}
        <p className="rally-kicker">ember rally · {roads.length} roads</p>
        <h1>Where do you want the engine?</h1>
      </div>

      <div className="rally-course-browser" ref={browser}>
        <button
          type="button"
          className="rally-course-step previous"
          aria-label="show previous road"
          disabled={selected === 0}
          onClick={showPrevious}
        >
          <span aria-hidden="true">‹</span>
        </button>

        <div className="rally-course-window">
          <div
            className="rally-course-doors"
            style={{ transform: `translate3d(-${selected * 100}%, 0, 0)` }}
          >
        {/*
          One card per open road, rather than one block of markup per road.

          These were three hand-written buttons carrying the positions 0, 1 and
          2 in eight places each. That was survivable while every road was
          always shown and stopped being so the moment one could be taken off
          the wall: with the Rootway locked, position 0 is the Moonbreak, and
          every one of those literals is describing a different road from the
          one the arrows and the marks are on.

          Mapped, the index is wherever the road actually is, and adding a
          fourth road is a line in `SCENES` rather than a fourth copy of this.
        */}
        {roads.map((stage, index) => {
          const locked = shut(roadKey(stage))
          return (
          <button
            key={stage}
            type="button"
            className={`rally-course ${stage}${selected === index ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`}
            aria-current={selected === index ? 'true' : undefined}
            aria-hidden={selected !== index}
            aria-disabled={locked || undefined}
            ref={keys.ref(index)}
            tabIndex={selected === index ? 0 : -1}
            onFocus={() => setSelected(index)}
            onClick={() => { if (!locked) onChoose(stage) }}
          >
            <span className="rally-course-scene" aria-hidden="true">
              {SCENES[stage]}
            </span>
            <span className="rally-course-name">{COURSES[stage].name}</span>
            <CourseState stage={stage} mine={mine} theirs={theirs} theirName={theirName} solo={solo} />
            <CourseBest stage={stage} />
            <span className="rally-course-copy">{COURSES[stage].short}</span>
            {/* The lock stands where the way in would have been, because that
                is exactly what it is standing in for. */}
            <span className="rally-course-enter">
              {locked ? (
                <span className="rally-course-locked">
                  <i aria-hidden="true" /> being worked on
                </span>
              ) : (
                COURSES[stage].enter
              )}
            </span>
          </button>
          )
        })}

          </div>
        </div>

        <button
          type="button"
          className="rally-course-step next"
          aria-label="show next road"
          disabled={selected === roads.length - 1}
          onClick={showNext}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <p className="rally-course-position" aria-live="polite">
        {String(selected + 1).padStart(2, '0')} / {String(roads.length).padStart(2, '0')}
        <span> · {COURSES[roads[selected] ?? 'rootway'].name}</span>
      </p>

      <div className="rally-course-marks" role="group" aria-label="choose a road">
        {roads.map((stage, index) => (
          <button
            type="button"
            key={stage}
            className={selected === index ? 'on' : ''}
            aria-label={`show ${COURSES[stage].name}`}
            aria-pressed={selected === index}
            onClick={(event) => {
              setSelected(index)
              // The mark changes the view; the road itself remains the thing
              // Enter opens. Do not leave keyboard focus claiming an old dot
              // after ArrowRight has moved the selected landscape onward.
              event.currentTarget.blur()
            }}
          />
        ))}
      </div>

      <button type="button" className="rally-course-leave" onClick={onLeave}>
        back to the games
      </button>
      <p className="rally-menu-keys">arrows choose · enter opens the road</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The road
// ---------------------------------------------------------------------------

/**
 * Opens the tunnel and gets out of the way.
 *
 * Everything here is either a surface for a thumb to land on or a word that
 * has to be said. There is no time, no speed, no meter and no map: the ember
 * you have left is the three lamps on the back of your own car, whether you
 * are ahead is whether you can see her, and where the corner goes is where the
 * lanterns are. That is the whole interface.
 */
function Road({
  attempt,
  track,
  ghost,
  ghostName,
  wheelToWheel,
  grid,
  onFinish,
  onLeave,
  onRestart,
  children,
}: {
  attempt: number
  track: ReturnType<typeof makeTrack>
  ghost: RallyRun | null
  ghostName: string
  wheelToWheel: boolean
  grid: number
  onFinish(run: RallyRun): void
  onLeave(): void
  onRestart(): void
  children?: React.ReactNode
}) {
  const surface = useRef<HTMLDivElement>(null)
  const finish = useRef(onFinish)
  finish.current = onFinish
  /*
    Decided when the road opens, then left alone.

    Not reactive on purpose: this decides whether there is a throttle at all,
    and `attachControls` asks the same question separately for the same
    reason. Two answers that could drift apart mid-race would be a car whose
    accelerator came and went.
  */
  const phone = useRef(drivingWithThumbs()).current

  /*
    ===========================================================================
    The road opens because you asked for it, never because the ghost moved.

    `open()` counts a new attempt and puts the lights back to red, so anything
    that runs it puts both cars on the start line. It used to run whenever any
    of its arguments changed by identity — including `ghost`, which is her
    recorded lap read straight off her move.

    Two ways that goes wrong, and one of them was happening every single time.
    Finishing a chase writes your own move, and the snapshot that comes back
    used to rebuild *her* move object as well; a new object for a lap she drove
    last week counted as a new ghost, the road re-opened, and the lights went
    green under the result screen that was already up. That half is fixed at
    the source — see the note in `watchRound`.

    The other way is rarer and worse: she posts a new qualifying lap while you
    are half way down the road chasing her old one, and your run restarts. That
    is a real thing that can happen to two people in different timezones, and no
    amount of care about object identity would prevent it.

    So the road is identified by *the road*: which go this is, which stage, and
    how it is being driven. The ghost is cargo, read when the road opens, and a
    ghost arriving later is for the next run down.
    ===========================================================================
  */
  const cargo = useRef({ ghost, ghostName })
  cargo.current = { ghost, ghostName }
  const road = `${attempt}:${track.stage}:${wheelToWheel}:${grid}`

  useEffect(() => {
    useGameStage.getState().take(true)
    useRace.getState().open({
      track,
      ghost: cargo.current.ghost,
      ghostName: cargo.current.ghostName,
      wheelToWheel,
      grid,
      onFinish: (run) => {
        /*
          Offered to the board before it is handed on.

          Here rather than in the screen that reports it, because a run is
          finished whether or not anybody stays to look at the result — and a
          best time that only counted if you did not press "again" straight
          away is a best time nobody would trust.
        */
        useBest.getState().offer(track.stage, {
          timeMs: run.timeMs,
          strikes: run.strikes,
          driftMs: run.driftMs,
          at: Date.now(),
        })
        finish.current(run)
      },
    })
    useRace.getState().setSurface(surface.current)
    return () => {
      useRace.getState().close()
      // The one node this component registers, and therefore the one it clears.
      // See the note on `close` — it deliberately no longer does this for us.
      useRace.getState().setSurface(null)
      useGameStage.getState().take(false)
    }
    // `road` carries the attempt, the stage and how it is driven. `track` is
    // memoised on the stage, so it moves with it and is here to be used, not
    // to be watched.
  }, [road, track])

  return (
    <div
      className="rally rally-running"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div ref={surface} className="rally-input" />
      <Rush />
      <StartLights key={attempt} />
      <EmberBar />
      <Speed />
      <Pause onLeave={onLeave} onRestart={onRestart} hasResult={Boolean(children)} />
      {phone ? (
        <TouchDriving />
      ) : (
        <p className="rally-hint" aria-hidden="true">
          {CONTROLS}
        </p>
      )}
      {children}
    </div>
  )
}

/**
 * A start gantry that cannot be mistaken for scenery.
 *
 * Three amber lenses arm in the same three seconds as `COUNTDOWN` in the 3D
 * machine. React only sees the two meaningful phases — ready and go — while
 * CSS carries the three fixed beats, so no per-frame state enters the UI.
 */
function StartLights() {
  const phase = useRace((state) => state.phase)
  const paused = useRace((state) => state.paused)
  if (phase !== 'ready' && phase !== 'running') return null

  const touch =
    typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

  return (
    <div
      className={`rally-start ${phase}${paused ? ' paused' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={phase === 'running' ? 'Go' : 'Race starts in three lights'}
    >
      <span className="rally-start-rail" aria-hidden="true">
        <i className="amber one" />
        <i className="amber two" />
        <i className="amber three" />
        <b />
        <i className="green" />
      </span>
      <span className="rally-start-cue">
        {phase === 'running'
          ? 'go'
          : touch
            ? 'it drives itself — you steer'
            : 'hold ↑ to raise the engine'}
      </span>
    </div>
  )
}

/**
 * How much ember you are carrying.
 *
 * ---------------------------------------------------------------------------
 * The racer's rule has always been that there is no interface — no clock, no
 * speedometer, no map — and that how much boost you had was the three lamps on
 * the back of your own car. That was a nice idea and it did not work, for one
 * reason: **nothing said where the ember came from.** It filled from three
 * different things at once, none of them named, and three lamps on a car
 * forty metres a second away in the dark is not a gauge you can read while
 * doing anything else.
 *
 * So there is one meter now, and it earns its place by making one rule
 * legible: *seconds spent drifting*. The tail lamps stay — they still show the
 * same value, and from directly behind they are the prettier version.
 *
 * It is a line of light rather than a box. No border, no track behind it, no
 * rounded rectangle: an ember-coloured line that grows.
 *
 * **And it runs both ways now.** It used to be a permission slip — full or
 * useless, and pressing it spent the lot for a fixed one and a half seconds.
 * Any amount is spendable, a full bar burns for nearly five seconds, and the
 * bar *drains as it burns*, because it is not a gauge showing the boost, it is
 * the boost. Which makes it ambiguous on its own — a bar at a third could be
 * half spent or half earned — so it says which: `.full` breathes when there is
 * a whole one waiting, `.burning` goes white and stops breathing while it is
 * going down. See `BOOST_SECONDS` in `physics.ts`.
 * ---------------------------------------------------------------------------
 */
function EmberBar() {
  const fill = useRef<HTMLElement>(null)
  useEffect(() => {
    useRace.getState().setEmberBar(fill.current)
    return () => useRace.getState().setEmberBar(null)
  }, [])
  return (
    <div className="rally-ember" aria-hidden="true">
      <i ref={fill} />
    </div>
  )
}

/**
 * How fast you are going.
 *
 * ---------------------------------------------------------------------------
 * **The third exception to "no interface", and it had to earn it like the
 * other two.**
 *
 * The racer deliberately had no speedometer for a long time and the argument
 * was good: the wind, the field of view opening, the walls closing in and the
 * engine climbing through its gears all say how fast you are going, and they
 * say it *while you are looking at the road* rather than at a corner of the
 * screen. A number would be the arcade thing.
 *
 * What that argument missed is that all four of those cues are **relative**.
 * They tell you faster and slower. Not one of them tells you *this is as fast
 * as it goes* — and without that the car reads as having no maximum, which is
 * a real problem and not a cosmetic one: if you cannot tell you are at the top,
 * you cannot tell whether the corner ahead is one you are going to make. The
 * number is the only cue that is absolute.
 *
 * **Where it goes was decided by the thumbs, not by convention.** Racing games
 * put this bottom-right, and bottom-right is the single worst place here: on a
 * phone the right half of the screen *is* the pedal, so the number would spend
 * the whole race under a thumb. Both bottom corners are hands. The top of the
 * frame is receding tunnel roof — dark, empty, and on a phone the camera is
 * already aimed high so there is more of it. So: top right, opposite the pause
 * at top left, balancing the ember bar at bottom centre.
 *
 * **And it is drawn in the garden's language, not a car's.** No dial, no
 * needle, no bezel — a dial is a rounded rectangle with a pointer in it and
 * the design law has no room for one. What is there is the number itself, in
 * the same serif everything else is set in, over a hairline that fills toward
 * the top speed. The hairline is the *same* vocabulary as the ember bar: a
 * line of light, no track, no border. Two lines, two corners, two things worth
 * knowing.
 *
 * Tabular figures, or the number jitters as the digits change width and the
 * one thing on screen that should be still is dancing.
 * ---------------------------------------------------------------------------
 */
/**
 * The frame closing in, as the road speeds up.
 *
 * ---------------------------------------------------------------------------
 * The camera already does most of the work of speed — the field of view opens
 * from 60 to 82 degrees, the eye drops toward the road and the whole thing
 * starts to shake. On a laptop that is plenty. On a phone it is not, and the
 * reason is size: at arm's length there is very little periphery for a widening
 * lens to reveal, and on the Moonbreak in particular there is nothing close to
 * the camera to rush past — flat causeway, still water, a tree every hundred
 * metres. Turn the engine off and a car at two hundred looks parked.
 *
 * This is the cheapest honest cue there is: the edges darken as you go faster,
 * the way your own vision narrows. One CSS variable written once a frame, no
 * geometry, no shader, nothing for a phone to render but a gradient that was
 * already composited.
 *
 * **Deliberately small.** It is at nothing below a third of top speed and only
 * reaches its full strength flat out, where it is still a suggestion rather
 * than a tunnel. If it is ever noticed *as* an effect it has been overdone.
 * ---------------------------------------------------------------------------
 */
function Rush() {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    useRace.getState().setRush(el.current)
    return () => useRace.getState().setRush(null)
  }, [])
  return <div ref={el} className="rally-rush" aria-hidden="true" />
}

function Speed() {
  const value = useRef<HTMLElement>(null)
  const line = useRef<HTMLElement>(null)
  useEffect(() => {
    const nodes =
      value.current && line.current
        ? { value: value.current, line: line.current }
        : null
    useRace.getState().setSpeedo(nodes)
    return () => useRace.getState().setSpeedo(null)
  }, [])
  return (
    <div className="rally-speed" aria-hidden="true">
      <b ref={value}>0</b>
      <span className="rally-speed-unit">km/h</span>
      <i ref={line} />
    </div>
  )
}

/**
 * Putting the road down for a minute.
 *
 * Escape used to fall through to the garden's own key handling and take you
 * all the way out to the meadow, abandoning the run — no warning, no way back.
 * Now it stops the world where it is and offers the two things you could
 * possibly want, and "leaving" means back to the Hollow's own fire rather than
 * out into the grass.
 *
 * The button in the corner is the same thing for a thumb. It used to say
 * "leave the road" and do it immediately, which is a destructive action one
 * mis-tap away from your only run of the day.
 *
 * **Three ways out, and starting again is one of them.** It offered exactly
 * two — carry on, or give up and walk back to the fire — which quietly made
 * "I got that corner wrong and want another go" into a four-step manoeuvre:
 * leave the road, read the briefing, press start, sit through the countdown.
 * It turns out that is most of what pausing is *for*. A run you have already
 * decided against is not worth finishing, and the game should not make you
 * finish it.
 */
function Pause({
  onLeave,
  onRestart,
  hasResult,
}: {
  onLeave(): void
  onRestart(): void
  hasResult: boolean
}) {
  const paused = useRace((s) => s.paused)

  /*
    There is no pausing a race she is in.

    A live round is the one place in the garden where time is not yours. Press
    this and your car stops while hers does not, your clock stops while the
    round's does not, and — because a stopped frame publishes nothing — your
    car goes quiet and drops off her road two and a half seconds later. From
    her side you would disappear mid-corner and come back somewhere impossible.
    Escape is a key people press by accident, so this is not something to warn
    about; it is something not to have.

    Leaving is still there. Getting out of a race you are losing is allowed;
    stopping one she is still driving is not.
  */
  const wheelToWheel = useRace((s) => s.wheelToWheel)

  useEffect(() => {
    if (wheelToWheel) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // The result is already up and has its own way onward; pausing over the
      // top of it would be pausing a car that has finished.
      if (hasResult) return
      event.preventDefault()
      event.stopPropagation()
      const race = useRace.getState()
      if (race.paused) race.resume()
      else race.pause()
    }
    // Captured, so it is handled before the garden's own Escape sees it.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [hasResult, wheelToWheel])

  if (hasResult) return null

  /*
    A way out, but not a way to stop.

    Returning nothing at all here would leave a live race with no exit — the
    only control on the road is this one, and a race you cannot walk out of is
    worse than one you can pause. So: the same corner, the same button, and it
    leaves instead of holding the world still. No confirmation, because the
    thing being abandoned is a race, and because a menu is a pause.
  */
  if (wheelToWheel) {
    return (
      <button type="button" className="rally-leave" onClick={onLeave}>
        leave the race
      </button>
    )
  }

  if (!paused) {
    return (
      <button
        type="button"
        className="rally-leave"
        onClick={() => useRace.getState().pause()}
      >
        pause
      </button>
    )
  }

  return (
    <div className="rally-paused">
      <div className="inner">
        <p className="rally-kicker">the road is holding still</p>
        <h1>Paused</h1>
        <RallyActions actions={[
          {
            label: 'back to it',
            onChoose: () => useRace.getState().resume(),
          },
          {
            label: 'from the top',
            quiet: true,
            onChoose: () => {
              /*
                The pause flag lives in the session and the road reads it every
                frame; a new attempt begun while the world was still held would
                come up stopped, with a countdown that never counts.
              */
              useRace.getState().resume()
              onRestart()
            },
          },
          {
            label: 'leave the road',
            quiet: true,
            onChoose: onLeave,
          },
        ]} />
        {/*
          Only worth saying to somebody who has the key.

          On a phone this line was advice about a button that does not exist,
          printed underneath three that do. The back gesture is the phone's
          version and it works now — see `systems/backstop` — so the honest
          thing is to say nothing rather than name the wrong control.
        */}
        {typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? null : (
          <p className="rally-note">escape puts you back on it</p>
        )}
      </div>
    </div>
  )
}

function Replay({
  track,
  runs,
  theirName,
  onLeave,
}: {
  track: ReturnType<typeof makeTrack>
  runs: { mine: RallyRun; theirs: RallyRun }
  theirName: string
  onLeave(): void
}) {
  useEffect(() => {
    useGameStage.getState().take(true)
    useRace.getState().watch({ track, replay: runs })
    return () => {
      useRace.getState().close()
      useGameStage.getState().take(false)
    }
  }, [track, runs])

  return (
    <div className="rally rally-running">
      <button type="button" className="rally-leave" onClick={onLeave}>
        leave the replay
      </button>
      <div className="rally-replay-names" aria-hidden="true">
        <span>you</span>
        <span>{theirName}</span>
      </div>
    </div>
  )
}

/**
 * The result, over the top of the car still rolling in.
 *
 * Deliberately not a separate screen. The road is still there, the engine is
 * off, the car is coasting back toward the fire and the embers are settling —
 * cutting away from that to a page with a number on it is the arcade ending
 * this game is specifically trying not to have.
 */
function RunOver({
  run,
  sealed,
  saving,
  fault,
  onDone,
  onAgain,
  againLabel,
  returnLabel,
  cleanWord,
  against,
}: {
  run: RallyRun
  sealed: boolean
  saving: boolean
  fault: string
  onDone(): void
  onAgain: (() => void) | null
  /** What going again is called here — a solo lap and a rematch are not it. */
  againLabel: string
  returnLabel: string
  /** "through the Rootway", "across the Moonbreak" — the road, in words. */
  cleanWord: string
  /** Who you were racing, and their run — null while it is still being driven. */
  against: { name: string; run: RallyRun | null } | null
}) {
  /*
    First or second, which is the only thing a race is actually asking.

    The end of a run showed your time and nothing else — no gap, no placing,
    no sign of the person you had just spent two minutes racing. Wheel to wheel
    especially: you would cross the line, see a number, and have no way of
    knowing whether you had won until you went back to the fire and worked it
    out from two screens.

    `null` means there is nobody to compare to — a solo lap, or a qualifying
    run that nobody is allowed to see yet. A present `against` with a null run
    means she is still out there, which is its own thing worth saying.
  */
  const hers = against?.run ?? null
  const won = hers !== null && run.timeMs <= hers.timeMs
  const gap = hers === null ? 0 : Math.abs(run.timeMs - hers.timeMs)

  return (
    <div className="rally-over">
      <p className="rally-kicker">{sealed ? 'your line is under the stone' : 'back at the fire'}</p>

      {hers !== null ? (
        <p className={`rally-placing ${won ? 'first' : 'second'}`}>
          {won ? 'first' : 'second'}
        </p>
      ) : null}

      <h1>{timeLabel(run.timeMs)}</h1>

      {against !== null ? (
        <p className="rally-against">
          {hers === null ? (
            <>{against.name} is still on the road.</>
          ) : (
            <>
              {against.name} · {timeLabel(hers.timeMs)}
              <b>
                {gap === 0 ? 'dead level' : `${won ? '−' : '+'}${timeLabel(gap)}`}
              </b>
            </>
          )}
        </p>
      ) : null}
      <p className="rally-copy">
        {/*
          Named, rather than guessed at from the label on a button.

          This read the *return* label and looked for the word "moonwell" in it
          to decide between two sentences — so every road that was not the
          Moonbreak was congratulated on a clean run through the Rootway,
          including the Stormcrown, which has been wrong for as long as there
          have been three roads.
        */}
        {run.strikes > 0
          ? `${run.strikes} ${run.strikes === 1 ? 'time' : 'times'} the rock had you.`
          : `Clean ${cleanWord}.`}
        {run.driftMs > 2500 ? ` ${(run.driftMs / 1000).toFixed(1)} seconds sideways.` : ''}
      </p>
      <BestLine />
      {saving ? <p className="rally-note">keeping the tyre marks…</p> : null}
      {fault ? <p className="rally-fault">{fault}</p> : null}
      <RallyActions actions={[
        { label: returnLabel, onChoose: onDone, disabled: saving },
        ...(onAgain
          ? [{ label: againLabel, onChoose: onAgain, disabled: saving, quiet: true }]
          : []),
      ]} />
    </div>
  )
}

/**
 * The time this road is holding, on the door to it.
 *
 * On the chooser rather than only on the result, because the moment you decide
 * which road to drive is the moment the number is worth knowing — a road you
 * have never finished and a road you were 0.3 off last time are two different
 * invitations, and the doors used to look identical.
 *
 * A road never finished says nothing at all. An empty slot with a dash in it
 * would be three rows of punctuation on the one screen that is supposed to
 * look like a way in.
 */
function CourseBest({ stage }: { stage: StageId }) {
  const best = useBest((s) => s.bests[stage])
  if (!best) return null
  return <span className="rally-course-best">best {timeLabel(best.timeMs)}</span>
}

/**
 * The one line this game never had: what you were trying to beat.
 *
 * Under the time rather than over it — the run you just did is the headline
 * and the board is the context. Three things it can say, and each of them is a
 * different moment: the first time you get down a road at all, the run that
 * finally beats it, and every run in between, where the number to chase is
 * still sitting there.
 */
function BestLine() {
  const offer = useBest((s) => s.lastOffer)
  if (!offer) return null
  if (offer.beatMs === null) {
    return <p className="rally-best first">your first time down this road</p>
  }
  if (offer.improved) {
    return (
      <p className="rally-best won">
        a new best — <b>{gapLabel(offer.byMs)}</b> on {timeLabel(offer.beatMs)}
      </p>
    )
  }
  return (
    <p className="rally-best">
      <b>{gapLabel(offer.byMs)}</b> — your best here is {timeLabel(offer.beatMs)}
    </p>
  )
}

function Briefing({
  kicker,
  title,
  copy,
  primary,
  foot,
  onPrimary,
  onLeave,
  leaveLabel = 'back to the games',
}: {
  kicker: string
  title: string
  copy: string
  primary: string
  foot: string
  onPrimary(): void
  onLeave(): void
  leaveLabel?: string
}) {
  const keys = useMenuKeys(2)
  const selected = keys.selected
  const setSelected = keys.choose

  return (
    <div className="rally rally-centre">
      <p className="rally-kicker">{kicker}</p>
      <h1>{title}</h1>
      <p className="rally-copy">{copy}</p>
      <div className="rally-actions">
        <button
          ref={keys.ref(0)}
          type="button"
          className={selected === 0 ? 'is-selected' : ''}
          onFocus={() => setSelected(0)}
          onClick={onPrimary}
        >
          {primary}
        </button>
        <button
          ref={keys.ref(1)}
          type="button"
          className={`quiet${selected === 1 ? ' is-selected' : ''}`}
          onFocus={() => setSelected(1)}
          onClick={onLeave}
        >
          {leaveLabel}
        </button>
      </div>
      <p className="rally-note">{foot}</p>
      <p className="rally-menu-keys">↑ ↓ choose · enter confirm</p>
    </div>
  )
}
