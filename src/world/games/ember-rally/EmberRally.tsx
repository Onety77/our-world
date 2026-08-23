import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameProps } from '../types'
import { useGameStage } from '../stage'
import { makeTrack } from './track'
import { driveSpirit } from './spirit'
import { useRace } from './session'
import { moveRun, timeLabel, type RallyMove, type RallyRun, type RallySetup } from './model'

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

type View = 'menu' | 'road' | 'replay'
type RaceKind = 'qualifying' | 'chase'

/**
 * The only instruction in the whole game, in whichever language this machine
 * speaks.
 *
 * Read once, at module load, because a phone does not turn into a laptop
 * halfway through a corner — and because the garden's law is that everything
 * touchable announces itself. A screen with no controls drawn anywhere owes
 * you one sentence saying where they are, and then owes you nothing else.
 */
const CONTROLS =
  typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
    ? 'drag to steer · hold to slide · tap to spend the ember'
    : 'arrows to steer · down to slide · space to spend the ember'

export default function EmberRally({
  theirName,
  solo,
  setup,
  mine,
  theirs,
  play,
  onLeave,
}: GameProps<RallySetup, RallyMove>) {
  /*
    On the seed, never on the setup object.

    `setup` is derived locally and then replaced by whatever the round document
    turns out to hold, so its identity changes the moment the round arrives —
    and a new `track` object means a new tunnel: a kilometre and a half of
    geometry rebuilt from scratch, potentially in the middle of a corner. The
    seed and the stage are the only things the road actually depends on.
  */
  const seed = setup?.seed ?? 1
  const stage = setup?.stage ?? 'rootway'
  const track = useMemo(() => makeTrack(seed, stage), [seed, stage])
  // Only when there is nobody to race. Driving a whole lap costs about a tenth
  // of a second, and in a two-player round nothing ever looks at it.
  const spirit = useMemo(() => (solo ? driveSpirit(track, track.seed) : null), [track, solo])

  const myLine = moveRun(mine, 'qualifying')
  const theirLine = moveRun(theirs, 'qualifying')
  const myChase = moveRun(mine, 'chase', true)
  const theirChase = moveRun(theirs, 'chase', true)

  const [view, setView] = useState<View>('menu')
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

  const backToFire = () => {
    setLastRun(null)
    setView('menu')
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
      await play({ kind, run })
    } catch {
      setFault('The Hollow could not keep that run. Your time is still here until you leave.')
    } finally {
      setSaving(false)
    }
  }

  if (!setup) {
    return (
      <div className="rally rally-centre">
        <p className="rally-kicker">the rootway</p>
        <p className="rally-copy">The road is opening.</p>
      </div>
    )
  }

  // --- on the road ---------------------------------------------------------

  if (view === 'road') {
    const ghost = (solo ? spirit : kind === 'chase' ? theirLine : null) ?? null
    const ghostName = solo ? 'the fire-spirit' : theirName
    return (
      <Road
        attempt={attempt}
        track={track}
        ghost={ghost}
        ghostName={ghostName}
        onFinish={(run) => keep.current(run)}
        onLeave={backToFire}
      >
        {lastRun ? (
          <RunOver
            run={lastRun}
            sealed={!solo && kind === 'qualifying'}
            saving={saving}
            fault={fault}
            onDone={backToFire}
            onAgain={!solo && kind === 'qualifying' ? null : () => start(kind)}
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
        kicker="the rootway · alone"
        title={myChase ? 'Again, then' : 'Something is already down there'}
        copy="A small fire knows this road and it is quicker than it looks. It leaves a pale line through the tunnel; follow that and you will not be far off. Brake into the bend, hold the slide, and let go at the apex."
        primary={myChase ? 'run it again' : 'start the engine'}
        onPrimary={() => start('chase')}
        onLeave={onLeave}
        foot={
          myChase && spirit
            ? `your last run · ${timeLabel(myChase.timeMs)} · the spirit · ${timeLabel(spirit.timeMs)}`
            : 'one road · one fire-spirit · no waiting for anybody'
        }
      />
    )
  }

  if (!myLine) {
    return (
      <Briefing
        kicker="the rootway · first passage"
        title="Set a line she cannot see"
        copy="Learn the turns and leave your tyre marks in the dark. Her first run stays under the stone until yours is beside it — and yours stays under it until hers is."
        primary="set my line"
        onPrimary={() => start('qualifying')}
        onLeave={onLeave}
        foot={CONTROLS}
      />
    )
  }

  if (!theirLine) {
    return (
      <div className="rally rally-centre">
        <p className="rally-kicker">your line is in</p>
        <h1>The stone stays closed.</h1>
        <p className="rally-copy">
          Nobody sees anybody&rsquo;s road until both first runs are here. There is nothing to
          wait beside — come back when the fire has been sat at twice.
        </p>
        <div className="rally-actions">
          <button type="button" onClick={onLeave}>
            back to the games
          </button>
        </div>
        <p className="rally-note">your line · {timeLabel(myLine.timeMs)}</p>
      </div>
    )
  }

  if (!myChase) {
    return (
      <Briefing
        kicker={`${theirName.toLowerCase()} has been down there`}
        title="Her light is on the road"
        copy="This time the pale car is real: her steering, her braking, every place she got it wrong. She sets off when you do. Catch her, pass her, and bring both lines home to the fire."
        primary="begin the chase"
        onPrimary={() => start('chase')}
        onLeave={onLeave}
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
        <div className="rally-actions">
          <button type="button" onClick={() => start('chase')}>
            run it again
          </button>
          <button type="button" className="quiet" onClick={onLeave}>
            back to the games
          </button>
        </div>
      </div>
    )
  }

  const gap = Math.abs(myChase.timeMs - theirChase.timeMs)
  const mineFirst = myChase.timeMs < theirChase.timeMs
  const together = gap < 120

  return (
    <div className="rally rally-centre">
      <p className="rally-kicker">two lines through one dark</p>
      <h1>
        {together
          ? 'Side by side.'
          : mineFirst
            ? 'You reached the fire first.'
            : `${theirName} reached the fire first.`}
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
      <p className="rally-copy">The pollen is shared. The road remembers both of you.</p>
      <div className="rally-actions">
        <button type="button" onClick={() => setView('replay')}>
          watch the two runs
        </button>
        <button type="button" className="quiet" onClick={() => start('chase')}>
          race it again
        </button>
        <button type="button" className="quiet" onClick={onLeave}>
          back to the games
        </button>
      </div>
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
  onFinish,
  onLeave,
  children,
}: {
  attempt: number
  track: ReturnType<typeof makeTrack>
  ghost: RallyRun | null
  ghostName: string
  onFinish(run: RallyRun): void
  onLeave(): void
  children?: React.ReactNode
}) {
  const surface = useRef<HTMLDivElement>(null)
  const finish = useRef(onFinish)
  finish.current = onFinish

  useEffect(() => {
    useGameStage.getState().take(true)
    useRace.getState().open({
      track,
      ghost,
      ghostName,
      onFinish: (run) => finish.current(run),
    })
    useRace.getState().setSurface(surface.current)
    return () => {
      useRace.getState().close()
      useGameStage.getState().take(false)
    }
  }, [attempt, track, ghost, ghostName])

  return (
    <div className="rally rally-running">
      <div ref={surface} className="rally-input" />
      <button type="button" className="rally-leave" onClick={onLeave}>
        leave the road
      </button>
      <p className="rally-hint" aria-hidden="true">
        {CONTROLS}
      </p>
      {children}
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
}: {
  run: RallyRun
  sealed: boolean
  saving: boolean
  fault: string
  onDone(): void
  onAgain: (() => void) | null
}) {
  return (
    <div className="rally-over">
      <p className="rally-kicker">{sealed ? 'your line is under the stone' : 'back at the fire'}</p>
      <h1>{timeLabel(run.timeMs)}</h1>
      <p className="rally-copy">
        {run.strikes > 0
          ? `${run.strikes} ${run.strikes === 1 ? 'time' : 'times'} the rock had you.`
          : 'Clean through the Rootway.'}
        {run.driftMs > 2500 ? ` ${(run.driftMs / 1000).toFixed(1)} seconds sideways.` : ''}
      </p>
      {saving ? <p className="rally-note">keeping the tyre marks…</p> : null}
      {fault ? <p className="rally-fault">{fault}</p> : null}
      <div className="rally-actions">
        <button type="button" onClick={onDone} disabled={saving}>
          return to the fire
        </button>
        {onAgain ? (
          <button type="button" className="quiet" onClick={onAgain} disabled={saving}>
            run it again
          </button>
        ) : null}
      </div>
    </div>
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
}: {
  kicker: string
  title: string
  copy: string
  primary: string
  foot: string
  onPrimary(): void
  onLeave(): void
}) {
  return (
    <div className="rally rally-centre">
      <p className="rally-kicker">{kicker}</p>
      <h1>{title}</h1>
      <p className="rally-copy">{copy}</p>
      <div className="rally-actions">
        <button type="button" onClick={onPrimary}>
          {primary}
        </button>
        <button type="button" className="quiet" onClick={onLeave}>
          back to the games
        </button>
      </div>
      <p className="rally-note">{foot}</p>
    </div>
  )
}
