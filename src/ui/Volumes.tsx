/**
 * Three faders, in the control room.
 *
 * The mix has always been a set of numbers scattered across four files and
 * chosen by whoever wrote each sound — which is fine until two of them are
 * heard together on a phone speaker and one of them is plainly too loud. This
 * is the one place the balance can be reached without editing anything.
 *
 * **This device only**, like the driving buttons. How loud a phone should be
 * is a fact about the phone and the room it is in; hers is not on a desk here.
 */

import { useEffect } from 'react'
import { ambience } from '@/systems/ambience'
import { FULL, gainOf, useVolume, type Levels } from '@/systems/volume'

const FADERS: { key: keyof Levels; name: string; what: string }[] = [
  {
    key: 'world',
    name: 'the world',
    what:
      'Wind, leaves, water, the fire in the cave, the room tone under stone — ' +
      'and each road’s own weather, because rain on the Stormcrown is the ' +
      'world doing something rather than the car.',
  },
  {
    key: 'effects',
    name: 'things you do',
    what:
      'The car and everything on it, a stone landing on a stone in Word Duel, ' +
      'the pen on paper at the Tree, and the two notes a message makes.',
  },
  {
    key: 'music',
    name: 'music',
    what:
      'The player in the corner. Separate from the rest because it is the one ' +
      'sound in here somebody chose on purpose.',
  },
]

/**
 * Keeps the audio graph in step with the store.
 *
 * Mounted here rather than at the top of the app because the graph reads the
 * stored levels when it is built — so the only case this has to cover is
 * somebody moving a fader while listening, which can only happen on this page.
 */
function useLiveFaders(levels: Levels) {
  useEffect(() => {
    ambience.setLevels({ world: levels.world, effects: levels.effects, music: levels.music })
    // Music is in the dependencies now: a road's soundtrack goes through the
    // graph's own music bus, so dragging that fader has to reach in here too.
  }, [levels.world, levels.effects, levels.music])
}

export function Volumes() {
  const levels = useVolume((s) => s.levels)
  const set = useVolume((s) => s.set)
  const reset = useVolume((s) => s.reset)
  useLiveFaders(levels)

  const moved =
    Math.abs(levels.world - FULL.world) > 1e-9 ||
    Math.abs(levels.effects - FULL.effects) > 1e-9 ||
    Math.abs(levels.music - FULL.music) > 1e-9

  return (
    <section>
      <h3>how loud each thing is</h3>
      <p className="admin-note">
        Three faders rather than one, so &ldquo;quieter car, same garden&rdquo;
        is a thing you can ask for. <b>This device only</b> — never sent.
        Everything starts at full, and moving one changes what you hear
        immediately.
      </p>

      {FADERS.map((fader) => (
        <label key={fader.key}>
          <span className="k">
            {fader.name} · {Math.round(levels[fader.key] * 100)}%
            {levels[fader.key] === 0 ? ' — off' : ''}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={levels[fader.key]}
            aria-label={fader.name}
            onChange={(event) => set(fader.key, Number(event.target.value))}
          />
          <span className="admin-note">{fader.what}</span>
        </label>
      ))}

      <div className="row">
        <button type="button" className={moved ? '' : 'on'} disabled={!moved} onClick={reset}>
          all the way back up
        </button>
      </div>

      <p className="admin-note">
        The fader is not a straight multiplier — it is squared, because
        loudness is not linear and a straight one spends its top half doing
        almost nothing and its bottom half falling off a cliff. Half way is
        about a quarter of the power, which is roughly what half as loud means.
      </p>
      <p className="admin-note admin-sub">
        for reference · world {gainOf(levels.world).toFixed(2)} · effects{' '}
        {gainOf(levels.effects).toFixed(2)} · music {gainOf(levels.music).toFixed(2)}
      </p>
    </section>
  )
}
