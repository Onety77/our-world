import { useData, useWorldSlice } from '@/data/provider'
import { SECTIONS } from '@/sections/registry'
import { useSections } from '@/systems/sections'
import { useReading } from '@/systems/reading'
import { usePot } from '@/systems/pot'
import { potTotal } from '@/data/local'
import { format, progressToward } from '@/data/money'
import { useTakenOver } from '@/systems/attention'
import { standing, useMemories } from '@/systems/memories'
import { useQuestions } from '@/systems/questions'
import { until } from '@/systems/time'
import { useMenuKeys } from './useMenuKeys'
import { HollowLobby } from './HollowLobby'

function TheLanternWalk() {
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
            ? 'nobody has walked here yet — the first one lights the first lantern'
            : count === 1
              ? 'one lantern, so far'
              : `${count} lanterns, so far`}
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
        <span className="lantern-walk-guide">
          <span className="lantern-walk-touch">swipe up or down</span>
          <span className="lantern-walk-pointer">scroll or use the arrow keys</span> to walk
          backward through what we kept
          <span className="memory-walk-open-hint">tap to look closer · hold for the full photograph · tap away to step back</span>
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
  const treeCount =
    1 +
    (questions.current ? 1 : 0) +
    (questions.availableSeeds > 0 ? 1 : 0) +
    (questions.history.length > 1 ? 1 : 0)
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
              {both
                ? 'read the newest bloom'
                : mine
                  ? 'your answer is waiting'
                  : 'the Tree is asking'}
            </button>
          ) : null}
          {questions.availableSeeds > 0 ? (
            <button
              ref={thresholdKeys.ref(1 + (current ? 1 : 0))}
              type="button"
              className={
                thresholdKeys.selected === 1 + (current ? 1 : 0) ? 'is-selected' : undefined
              }
              onFocus={() => thresholdKeys.choose(1 + (current ? 1 : 0))}
              onClick={useQuestions.getState().openPlanting}
            >
              <span aria-hidden="true">◇</span> plant a question · {questions.availableSeeds}
            </button>
          ) : null}
          {questions.history.length > 1 ? (
            <button
              ref={thresholdKeys.ref(
                1 + (current ? 1 : 0) + (questions.availableSeeds > 0 ? 1 : 0),
              )}
              type="button"
              className={
                thresholdKeys.selected ===
                1 + (current ? 1 : 0) + (questions.availableSeeds > 0 ? 1 : 0)
                  ? 'is-selected'
                  : undefined
              }
              onFocus={() =>
                thresholdKeys.choose(1 + (current ? 1 : 0) + (questions.availableSeeds > 0 ? 1 : 0))
              }
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
        <button ref={thresholdKeys.ref(0)} type="button" onClick={tend}>
          add to ours
        </button>
      </div>
    )
  }

  if (id === 'hollow') return <HollowLobby />

  if (id === 'lanterns') return <TheLanternWalk />

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
