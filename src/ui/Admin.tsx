/**
 * The control room. `/dev7731`, and nothing links to it.
 *
 * ---------------------------------------------------------------------------
 * **Deliberately not a garden.** Every other screen in this world is text on a
 * landscape with no boxes, no borders and no forms, because the world is the
 * interface. This is the opposite by design: it is a plain, dense, legible
 * page of controls, and it should look like a machine. The moment it starts
 * being pretty is the moment somebody wonders whether it is part of the place.
 *
 * The garden does not render behind it. That is not only a rendering saving —
 * it is what makes this a *page you went to* rather than a panel floating over
 * the meadow, which is exactly what it used to be and exactly what was wrong
 * with it.
 * ---------------------------------------------------------------------------
 *
 * Everything the old dev panel did is here, plus the things that had nowhere
 * to live: whose hour the sky runs on, and the notification setting.
 */

import { BACKEND_LABEL, DATA_BACKEND } from '@/config'
import { SECTIONS } from '@/sections/registry'
import { useSections } from '@/systems/sections'
import { becomeUser, useData, useLocalLayer, useWorldSlice } from '@/data/provider'
import { USER_IDS, otherUser, type UserId } from '@/data/types'
import { isValidTimeZone, localTimeLabel } from '@/systems/time'
import { parseCoordinates } from '@/systems/geo'
import { useQuality } from '@/systems/quality'
import { useMemories } from '@/systems/memories'
import { backToTheGarden, useHourOverride } from '@/systems/dev'
import { WHOSE_WORDS, skyHour, useWhoseHour, type Whose } from '@/systems/whoseHour'
import { describeHour } from './Overlay'
import { useState } from 'react'
import { useEffect } from 'react'
import { attempt } from '@/systems/trouble'
import { useVoiceLights } from '@/systems/voiceLights'

/** Somewhere to start from. Any IANA name works — this is just convenience. */
const COMMON_ZONES = [
  'Africa/Lagos',
  'Asia/Shanghai',
  'Asia/Dubai',
  'Europe/London',
  'America/New_York',
  'UTC',
]

/**
 * Lines for the "she says" button.
 *
 * Scaffolding, and deliberately bland. They exist to put a second colour in
 * the sky while the place is being built and are never stored anywhere she
 * will see — the local layer's `sayAs` writes to this device only.
 */
const SHE_SAYS = [
  'awake, barely',
  'it is already tomorrow here',
  'the kettle is on',
  'tell me when you get in',
  'i am going to sleep. talk in your morning',
] as const

export function Admin() {
  const data = useData()
  const local = useLocalLayer()
  const profiles = useWorldSlice((s) => s.profiles)
  const presence = useWorldSlice((s) => s.presence)
  const quality = useQuality()
  const go = useSections((s) => s.go)

  const me = data.me
  const them = otherUser(me)
  const theirPresence = presence[them]

  const override = useHourOverride((h) => h.override)
  const setOverride = useHourOverride((h) => h.set)
  const whose = useWhoseHour((w) => w.whose)
  const setWhose = useWhoseHour((w) => w.set)

  const memories = useMemories((s) => s.all)
  const questions = useWorldSlice((s) => s.questions)
  const [adminQuestion, setAdminQuestion] = useState('')
  const voiceLimit = useVoiceLights((state) => state.limit)
  const [voiceLimitDraft, setVoiceLimitDraft] = useState(voiceLimit)

  useEffect(() => {
    const off = data.watchVoiceLights((garden) => {
      useVoiceLights.getState().setGarden(garden.lights, garden.limit)
      setVoiceLimitDraft(garden.limit)
    })
    return off
  }, [data])

  async function addAdminQuestion() {
    const added = await attempt('that question did not enter the pool', () =>
      data.plantAdminQuestion(adminQuestion),
    )
    if (added) setAdminQuestion('')
  }

  function moveThem(dx: number, dz: number) {
    if (!local) return
    const [x, y, z] = theirPresence.position
    local.setPresenceFor(them, { position: [x + dx, y, z + dz] })
  }

  /** What the sky would be at right now, live, with the current setting. */
  const live = skyHour(profiles, me, whose, Date.now())

  return (
    <div className="admin">
      <header className="admin-head">
        <h1>dev7731</h1>
        <button type="button" onClick={backToTheGarden}>
          ← into the garden
        </button>
      </header>

      <section>
        <h2>where this is</h2>
        <p className="admin-note">
          backend <b>{DATA_BACKEND}</b> — {BACKEND_LABEL}
        </p>
        <p className="admin-note">
          you are <b>{profiles[me].name}</b> ({me}) · {memories.length} memories in
          the glass
        </p>
        <label>
          <span className="k">look at it as</span>
          <select value={me} onChange={(e) => becomeUser(e.target.value as UserId)}>
            {USER_IDS.map((id) => (
              <option key={id} value={id}>
                {profiles[id].name} ({id})
              </option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <h2>voice-lights in the Stars</h2>
        <p className="admin-note">
          Maximum standing recordings for each person. Existing lights beyond a
          reduced limit are left safe but hidden until the limit rises again.
        </p>
        <label>
          <span className="k">places per person · {voiceLimitDraft}</span>
          <input
            type="range"
            min={1}
            max={12}
            step={1}
            value={voiceLimitDraft}
            disabled={me !== 'warm'}
            onChange={(event) => setVoiceLimitDraft(Number(event.target.value))}
          />
        </label>
        <div className="row">
          <button
            type="button"
            disabled={me !== 'warm' || voiceLimitDraft === voiceLimit}
            onClick={() => void attempt('that limit did not change', () => data.setVoiceLightLimit(voiceLimitDraft))}
          >
            keep this limit
          </button>
        </div>
        {me !== 'warm' ? <p className="admin-note">Only the warm account owns this hidden setting.</p> : null}
      </section>

      <section>
        <h2>the Tree's question pool</h2>
        <p className="admin-note">
          {questions.history.length} completed · {questions.queued} of your private prompts
          waiting · {questions.availableSeeds} saving-earned seeds unspent.
        </p>
        <p className="admin-note">
          Adds without spending a saving seed. It still rests for at least a day,
          enters the pool later, and the garden never labels who wrote it.
        </p>
        <label>
          <span className="k">question to place in the pool</span>
          <textarea
            value={adminQuestion}
            onChange={(event) => setAdminQuestion(event.target.value)}
            maxLength={600}
            placeholder="What should the Tree ask both of you?"
            disabled={me !== 'warm'}
          />
        </label>
        <div className="row">
          <button
            type="button"
            onClick={() => void addAdminQuestion()}
            disabled={me !== 'warm' || adminQuestion.trim() === ''}
          >
            add anonymously
          </button>
        </div>
        {me !== 'warm' ? (
          <p className="admin-note">Only the warm account owns this hidden pool.</p>
        ) : null}
      </section>

      {/*
        The one setting here that is a real design decision rather than
        scaffolding — see systems/whoseHour. It stays on this page because it
        changes what the whole world looks like and should be set once, not
        fiddled with; and because there is nowhere in the garden to put a
        control without the garden having a control in it.
      */}
      <section>
        <h2>whose day the world is having</h2>
        <p className="admin-note">
          By default you get <b>hers</b> and she gets yours — so neither of you
          is looking at your own weather. The far horizon in the Stars always
          shows the other one, whichever way this is set.
        </p>
        <div className="row">
          {(Object.keys(WHOSE_WORDS) as Whose[]).map((key) => (
            <button
              key={key}
              type="button"
              className={whose === key ? 'on' : ''}
              onClick={() => setWhose(key)}
            >
              {WHOSE_WORDS[key]}
            </button>
          ))}
        </div>
        <p className="admin-note">
          right now that is <b>{describeHour(live)}</b> ({live.toFixed(1)})
          {override !== null && ' — but an hour is pinned below, so this is not what is on screen'}
        </p>
      </section>

      <section>
        <h2>the hour</h2>
        <label>
          <span className="k">
            {override === null ? 'live' : `pinned — ${describeHour(override)}`}
          </span>
          <input
            type="range"
            min={0}
            max={23.9}
            step={0.1}
            value={override ?? live}
            onChange={(e) => setOverride(Number(e.target.value))}
          />
        </label>
        <div className="row">
          <button type="button" className={override === null ? 'on' : ''} onClick={() => setOverride(null)}>
            live
          </button>
          <button type="button" onClick={() => setOverride(6.4)}>dawn</button>
          <button type="button" onClick={() => setOverride(13)}>midday</button>
          <button type="button" onClick={() => setOverride(18.6)}>dusk</button>
          <button type="button" onClick={() => setOverride(1)}>night</button>
        </div>
        <p className="admin-note">
          A pinned hour survives leaving this page, which is the only reason to
          pin one. Set it back to live before you hand anything over.
        </p>
      </section>

      <section>
        <h2>the two of you</h2>
        {USER_IDS.map((id) => (
          <label key={id}>
            <span className="k">
              {id} — {localTimeLabel(profiles[id].timeZone)} local
            </span>
            <input
              type="text"
              value={profiles[id].name}
              onChange={(e) => void data.setProfile(id, { name: e.target.value })}
              aria-label={`${id} name`}
            />
            <input
              type="text"
              value={profiles[id].city}
              onChange={(e) => void data.setProfile(id, { city: e.target.value })}
              aria-label={`${id} city`}
            />
            <select
              value={
                COMMON_ZONES.includes(profiles[id].timeZone) ? profiles[id].timeZone : 'custom'
              }
              onChange={(e) => {
                const tz = e.target.value
                if (tz !== 'custom' && isValidTimeZone(tz)) {
                  void data.setProfile(id, { timeZone: tz })
                }
              }}
            >
              {COMMON_ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
              <option value="custom">{profiles[id].timeZone} (current)</option>
            </select>
            <input
              type="text"
              defaultValue={
                profiles[id].lat === null || profiles[id].lon === null
                  ? ''
                  : `${profiles[id].lat}, ${profiles[id].lon}`
              }
              placeholder="lat, lon"
              aria-label={`${id} coordinates`}
              onBlur={(e) => {
                const parsed = parseCoordinates(e.target.value)
                // Blank clears them, which hides the distance rather than
                // showing a wrong one. Unparseable input is left alone.
                if (e.target.value.trim() === '') {
                  void data.setProfile(id, { lat: null, lon: null })
                } else if (parsed) {
                  void data.setProfile(id, parsed)
                }
              }}
            />
          </label>
        ))}
      </section>

      <section>
        <h2>how hard to push this device</h2>
        <div className="row">
          {(['low', 'medium', 'high'] as const).map((tier) => (
            <button
              key={tier}
              type="button"
              className={quality.tier === tier ? 'on' : ''}
              onClick={() => quality.setTier(tier)}
            >
              {tier}
            </button>
          ))}
        </div>
        <p className="admin-note">
          grass {quality.grassCount} · flowers {quality.flowerCount} · dpr{' '}
          {quality.dpr}
        </p>
      </section>

      <section>
        <h2>go straight to</h2>
        <div className="row">
          {SECTIONS.map((section, i) => (
            <button
              key={section.id}
              type="button"
              onClick={() => {
                go(i)
                useSections.getState().enter()
                backToTheGarden()
              }}
            >
              {section.id}
            </button>
          ))}
        </div>
      </section>

      {local ? (
        <section>
          <h2>pretending there are two of you</h2>
          <p className="admin-note">
            Local mode only. None of this touches anything she will ever see —
            it writes to this device and nowhere else.
          </p>
          <div className="row">
            <button
              type="button"
              onClick={() => local.setPresenceFor(them, { online: !theirPresence.online })}
            >
              {theirPresence.online ? `send ${profiles[them].name} away` : `bring ${profiles[them].name} here`}
            </button>
            <button
              type="button"
              onClick={() =>
                local.sayAs(them, SHE_SAYS[Math.floor(Math.random() * SHE_SAYS.length)])
              }
            >
              she says something
            </button>
          </div>
          <div className="row">
            <button type="button" onClick={() => moveThem(0, -3)}>move away</button>
            <button type="button" onClick={() => moveThem(0, 3)}>move closer</button>
            <button type="button" onClick={() => moveThem(-3, 0)}>move left</button>
            <button type="button" onClick={() => moveThem(3, 0)}>move right</button>
          </div>
        </section>
      ) : (
        <section>
          <h2>pretending there are two of you</h2>
          <p className="admin-note">
            Not available against the real backend — puppeting her would mean
            writing as her, and the rules refuse it. Which is correct.
          </p>
        </section>
      )}

      {local && (
        <section className="admin-danger">
          <h2>start again</h2>
          <p className="admin-note">
            Wipes this device: every thought, message, round, memory and
            photograph in local mode. Not reversible, and not a button to lean
            on.
          </p>
          <button
            type="button"
            onClick={() => {
              if (confirm('Wipe everything stored on this device?')) local.reset()
            }}
          >
            wipe this device
          </button>
        </section>
      )}
    </div>
  )
}
