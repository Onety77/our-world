/**
 * One fader per place: how much of the garden reaches into it.
 *
 * The mix gives the Tree more wind and leaves than the meadow does, and the
 * Glasshouse and the Wellspring over half — which is defensible on paper and
 * means, on a phone speaker, that four of the five places sound like the
 * meadow with something quiet added. Whether that is right is a matter of
 * taste and of what your speaker does with a broad band of noise, so it gets a
 * fader rather than an argument. See `systems/outdoors`.
 */

import { ambience, type Place } from '@/systems/ambience'
import { INSIDES, OPEN, useOutdoors } from '@/systems/outdoors'

const NAMES: Record<Place, string> = {
  garden: 'the garden',
  tree: 'the Tree',
  river: 'the Wellspring',
  hollow: 'the Hollow',
  stars: 'the Stars',
  glasshouse: 'the Glasshouse',
}

/**
 * What the mix asks for before this fader touches it.
 *
 * Shown because a fader at 100% on the Tree and a fader at 100% on the Hollow
 * are doing very different things, and without the starting point the two look
 * identical.
 */
const ASKS: Record<Place, string> = {
  garden: '',
  tree: 'the loudest of the five — more wind and leaves than the meadow',
  river: 'half the wind, a quarter of the leaves, under the water',
  hollow: 'almost none already — what you hear in here is the fire and the rock',
  stars: 'thin, high air',
  glasshouse: 'over half, through the broken roof',
}

export function Outdoors() {
  const howMuch = useOutdoors((s) => s.howMuch)
  const set = useOutdoors((s) => s.set)
  const reset = useOutdoors((s) => s.reset)
  const moved = INSIDES.some((place) => Math.abs(howMuch[place] - OPEN[place]) > 1e-9)

  return (
    <section>
      <h3>how much of the garden reaches inside</h3>
      <p className="admin-note">
        The wind and the leaves only — not the water, the fire, the rock or the
        Stars&rsquo; tones, because those are what each place is <i>made of</i>{' '}
        and turning them down would empty the room rather than quieten the
        garden. Takes effect while you listen. <b>This device only.</b>
      </p>

      {INSIDES.map((place) => (
        <label key={place}>
          <span className="k">
            {NAMES[place]} · {Math.round(howMuch[place] * 100)}%
            {howMuch[place] === 0 ? ' — sealed' : ''}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={howMuch[place]}
            aria-label={`garden sound inside ${NAMES[place]}`}
            onChange={(event) => {
              set(place, Number(event.target.value))
              // The tick reads the store directly, so nothing has to be pushed
              // into the graph — but a place you are not standing in will not
              // be heard changing, which is worth knowing while dragging.
            }}
          />
          <span className="admin-note">{ASKS[place]}</span>
        </label>
      ))}

      <div className="row">
        <button type="button" className={moved ? '' : 'on'} disabled={!moved} onClick={reset}>
          leave every door open
        </button>
      </div>

      <p className="admin-note">
        You will only hear a fader move while you are standing in that place.
        The panel below says which one the bed thinks you are in
        {ambience.running ? '' : ' — once the sound has started'}.
      </p>
    </section>
  )
}
