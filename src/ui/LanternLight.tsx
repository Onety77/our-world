/**
 * How dark the Lantern Walk is, in the control room.
 *
 * Two sliders and a way back, because "dark enough" is the one thing about that
 * place that cannot be settled from a screenshot — see `systems/lanternLight`.
 * There is nothing to press: this device only, saved as it moves, so you can
 * stand on the lane in one window and drag it until it looks right.
 */

import { DEFAULTS, useLanternLight } from '@/systems/lanternLight'

/** A percentage, for people, from a 0..1 the shaders use. */
const asPercent = (n: number) => `${Math.round(n * 100)}%`

export function LanternLight() {
  const dark = useLanternLight((s) => s.dark)
  const lamps = useLanternLight((s) => s.lamps)
  const set = useLanternLight((s) => s.set)
  const reset = useLanternLight((s) => s.reset)
  const moved = dark !== DEFAULTS.dark || lamps !== DEFAULTS.lamps

  return (
    <section>
      <h2>the Lantern Walk</h2>
      <p className="admin-note">
        How much daylight the trees keep out, and how brightly the lamps burn
        under them. The walk is the one place whose whole point is contrast, so
        it is worth setting from the lane itself: open it in another window and
        drag these until it looks right. This phone only — neither of you can
        make the other&rsquo;s walk too dark to see.
      </p>

      <label>
        <span className="k">under the trees · {asPercent(dark)}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={dark}
          onChange={(event) => set({ dark: Number(event.target.value) })}
        />
      </label>
      <p className="admin-note">
        At nothing the lane is lit like the meadow outside it and the lanterns
        are decoration. At everything they are the only light there is.
      </p>

      <label>
        <span className="k">how bright the lamps burn · {asPercent(lamps)}</span>
        <input
          type="range"
          min={0.2}
          max={2.5}
          step={0.05}
          value={lamps}
          onChange={(event) => set({ lamps: Number(event.target.value) })}
        />
      </label>
      <p className="admin-note">
        The light they throw — the halo, the pool on the path, the flame on the
        post head, and the grass around them. The photograph itself keeps its
        own brightness, so turning this up lights the lane without washing out
        what is in the picture.
      </p>

      <div className="row">
        <button type="button" disabled={!moved} onClick={reset}>
          back to how it was built
        </button>
      </div>
    </section>
  )
}
