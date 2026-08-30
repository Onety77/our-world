/**
 * Three faders, for whoever is holding the phone.
 *
 * ---------------------------------------------------------------------------
 * The mix in `dev7731` is the authored world: one set of numbers, published
 * once, the same in both hands. This is not that. How loud a garden should be
 * is partly a fact about the room you are sitting in, the speaker you are
 * using and whether anybody else is asleep — and none of that is knowable from
 * the other side of seven timezones.
 *
 * So: the garden, the places, and the music, on this device, saved the moment
 * you move them and sent nowhere. It lives in the profile sheet rather than in
 * the control room because it is not a developer's tool; it is the same kind
 * of thing as your own name and your own city.
 * ---------------------------------------------------------------------------
 */

import { useMyAmbience } from '@/systems/outdoors'
import { useVolume } from '@/systems/volume'

export function MySound() {
  const mine = useMyAmbience((s) => s.mine)
  const setMine = useMyAmbience((s) => s.setMine)
  const levels = useVolume((s) => s.levels)
  const setVolume = useVolume((s) => s.set)

  const faders = [
    {
      key: 'garden',
      name: 'the garden',
      value: mine.garden,
      move: (v: number) => setMine('garden', v),
    },
    {
      key: 'sections',
      name: 'inside the places',
      value: mine.sections,
      move: (v: number) => setMine('sections', v),
    },
    {
      key: 'music',
      name: 'music',
      value: levels.music,
      move: (v: number) => setVolume('music', v),
    },
  ]

  return (
    <div className="my-sound">
      <p className="profile-field">how loud, for you</p>
      {faders.map((fader) => (
        <label key={fader.key}>
          <span className="my-sound-name">
            {fader.name}
            <b>{fader.value === 0 ? 'off' : `${Math.round(fader.value * 100)}%`}</b>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={fader.value}
            aria-label={`how loud ${fader.name} is`}
            onChange={(event) => fader.move(Number(event.target.value))}
          />
        </label>
      ))}
      <span className="pot-why">This phone only. Hers is her own.</span>
    </div>
  )
}
