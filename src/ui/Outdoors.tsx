/** Shared ambience tuning: one complete room-level fader per place. */

import { useState } from 'react'
import { useData } from '@/data/provider'
import { attempt } from '@/systems/trouble'
import {
  EVERYWHERE,
  OPEN,
  bleedKeys,
  samePlaceLevels,
  useOutdoors,
  type AnyPlace,
} from '@/systems/outdoors'
import { usePublishedOutdoors } from '@/systems/outdoorsSync'

const NAMES: Record<AnyPlace, string> = {
  garden: 'the open garden',
  tree: 'the Tree',
  river: 'the Wellspring',
  hollow: 'the Hollow',
  stars: 'the Stars',
  glasshouse: 'the Glasshouse',
}

const HEARD: Record<AnyPlace, string> = {
  garden: 'the meadow — wind and the leaf bed under it, everywhere outside a place',
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
  const bleed = useOutdoors((state) => state.bleed)
  const publishedBleed = useOutdoors((state) => state.publishedBleed)
  const draft = useOutdoors((state) => state.draft)
  const store = useOutdoors.getState()
  const [sending, setSending] = useState(false)

  const unsent =
    (draft !== null && !samePlaceLevels(levels, published)) ||
    !samePlaceLevels(bleed, publishedBleed)
  const nonstandard = !samePlaceLevels(levels, OPEN)

  const [oldRules, setOldRules] = useState(false)

  async function save() {
    setSending(true)
    setOldRules(false)
    const asked = Object.fromEntries(EVERYWHERE.map((place) => [place, levels[place]]))

    /*
      The full write first, and the old one if the rules refuse it.

      `bleedTree` and its four siblings are new keys, and the rule that guards
      this document lists the keys it will accept — so until those rules are
      republished the whole write is rejected, *including the levels*, which
      have worked for months. Adding a feature must not break the thing beside
      it because a file somewhere else has not been pasted yet.

      So: try both, and on a refusal fall back to the five numbers that were
      always allowed, and say plainly which half did not land.
    */
    try {
      await data.setAmbienceTuning({ ...asked, ...bleedKeys(bleed) })
      setSending(false)
      store.markPublished(levels)
      return
    } catch {
      /* almost certainly the rules; the fallback below finds out */
    }

    const saved = await attempt('those sound levels did not reach the garden', () =>
      /*
        Both numbers for every place, in one write.

        How loud a place is and how much meadow is allowed into it are two
        answers about the same room, and saving one without the other would
        leave the two of you standing in different ones. See `bleedKeys`.
      */
      data.setAmbienceTuning(asked),
    )
    setSending(false)
    if (saved) {
      // The levels are hers; the bleed is not, and it must not claim to be.
      setOldRules(true)
      store.markPublished(levels)
    }
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

{EVERYWHERE.map((place) => (
        <div className="admin-place" key={place}>
          <b>{NAMES[place]}</b>
          <span className="admin-note admin-sub">{HEARD[place]}</span>

          <label>
            <span className="k">
              this place itself · {Math.round(levels[place] * 100)}%
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
          </label>

          {/*
            Nothing reaches into the garden — it is the thing everything else
            is measured against, so it has no bleed of its own.
          */}
          {place === 'garden' ? null : (
          <>
          {/*
            The one that kept being asked for.

            The meadow's wind was reported inside the sections five times over;
            each time the mix table was changed and each time it came back,
            because nothing here could say whether the wind was actually
            present. It is not — this reading zero is the proof — and what is
            left in an enclosed place is that place's own bed, which is the
            slider above.
          */}
          <label>
            <span className="k">
              garden reaching in · {Math.round(bleed[place] * 100)}%
              {bleed[place] === 0 ? ' — none' : ''}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={bleed[place]}
              aria-label={`how much garden reaches ${NAMES[place]}`}
              onChange={(event) => store.setBleed(place, Number(event.target.value))}
            />
          </label>
          </>
          )}
        </div>
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

      {oldRules ? (
        <p className="admin-note">
          The <b>levels</b> were saved, but <b>garden reaching in</b> was not:
          this project&rsquo;s Firestore rules do not accept it yet. Run{' '}
          <b>npm run rules</b> and publish <b>rules-out/firestore.rules</b>,
          then save again.
        </p>
      ) : null}

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
