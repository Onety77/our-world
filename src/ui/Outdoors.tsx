/** Shared ambience tuning: one complete room-level fader per place. */

import { useState } from 'react'
import { useData } from '@/data/provider'
import { attempt } from '@/systems/trouble'
import {
  INSIDES,
  OPEN,
  samePlaceLevels,
  useOutdoors,
  type InsidePlace,
} from '@/systems/outdoors'
import { usePublishedOutdoors } from '@/systems/outdoorsSync'

const NAMES: Record<InsidePlace, string> = {
  tree: 'the Tree',
  river: 'the Wellspring',
  hollow: 'the Hollow',
  stars: 'the Stars',
  glasshouse: 'the Glasshouse',
}

const HEARD: Record<InsidePlace, string> = {
  tree: 'wind, leaves and the low woodland room beneath them',
  river: 'water, air, leaves and the valley underneath the river',
  hollow: 'the cave fire, its crackles, the rock rumble and the small air leak',
  stars: 'the thin night air, distant room and rare glass-like tones',
  glasshouse: 'roof wind, wet floor, glass resonance and the room around it',
}

export function Outdoors() {
  const data = useData()
  usePublishedOutdoors()

  const levels = useOutdoors((state) => state.howMuch)
  const published = useOutdoors((state) => state.published)
  const draft = useOutdoors((state) => state.draft)
  const store = useOutdoors.getState()
  const [sending, setSending] = useState(false)

  const unsent = draft !== null && !samePlaceLevels(levels, published)
  const nonstandard = !samePlaceLevels(levels, OPEN)

  async function save() {
    setSending(true)
    const saved = await attempt('those sound levels did not reach the garden', () =>
      data.setAmbienceTuning(
        Object.fromEntries(INSIDES.map((place) => [place, levels[place]])),
      ),
    )
    setSending(false)
    if (saved) store.markPublished(levels)
  }

  return (
    <section>
      <h3>how loud each place is</h3>
      <p className="admin-note">
        The complete ambient room, not only the wind. Move a fader to make a
        draft on this device, listen to it in the Garden, then save it when it
        feels right. Saving changes the authored mix for <b>both of you</b>.
        Your personal world/effects/music faders above remain device-only.
      </p>

      <p className="admin-note">
        {unsent ? (
          <>
            You are listening to a <b>local draft</b>. The other device still
            has the last saved mix.
          </>
        ) : (
          <>
            These are the <b>saved levels</b> both devices receive.
          </>
        )}
      </p>

      {INSIDES.map((place) => (
        <label key={place}>
          <span className="k">
            {NAMES[place]} · {Math.round(levels[place] * 100)}%
            {levels[place] === 0 ? ' — silent' : ''}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={levels[place]}
            aria-label={`complete ambience in ${NAMES[place]}`}
            onChange={(event) => store.set(place, Number(event.target.value))}
          />
          <span className="admin-note">{HEARD[place]}</span>
        </label>
      ))}

      <div className="row">
        <button
          type="button"
          className={unsent ? 'on' : ''}
          disabled={data.me !== 'warm' || !unsent || sending}
          onClick={() => void save()}
        >
          {sending ? 'saving…' : 'save these levels for both of you'}
        </button>
        <button type="button" disabled={draft === null} onClick={store.dropDraft}>
          drop my changes
        </button>
        <button
          type="button"
          disabled={!nonstandard}
          onClick={store.toDefaults}
        >
          every place back to full
        </button>
      </div>

      {data.me !== 'warm' ? (
        <p className="admin-note">
          Only the warm account can publish the world mix. This device can
          still draft and audition any level.
        </p>
      ) : null}

      <p className="admin-note">
        There is no live sound behind dev7731 because the 3D world is not
        mounted here. Return to the Garden to audition the draft; it has
        already been remembered on this device.
      </p>
    </section>
  )
}
