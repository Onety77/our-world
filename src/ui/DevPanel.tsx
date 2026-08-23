/**
 * Scaffolding, not garden.
 *
 * Deliberately plain and boxy so it never gets confused for part of the world.
 * It exists so the whole thing can be exercised alone: be either person, move
 * the other one around, push the clock to any hour, and edit the profiles —
 * including the timezone, which is the thing that's about to change.
 */

import { useState } from 'react'
import { BACKEND_LABEL, DATA_BACKEND } from '@/config'
import { SECTIONS } from '@/sections/registry'
import { slidePosition, useSections } from '@/systems/sections'
import { becomeUser, useData, useLocalLayer, useWorldSlice } from '@/data/provider'
import { USER_IDS, otherUser, type UserId } from '@/data/types'
import { isValidTimeZone, localTimeLabel } from '@/systems/time'
import { parseCoordinates } from '@/systems/geo'
import { useQuality } from '@/systems/quality'
import { describeHour } from './Overlay'

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

export function DevPanel({
  hourOverride,
  setHourOverride,
}: {
  hourOverride: number | null
  setHourOverride: (h: number | null) => void
}) {
  const data = useData()
  const local = useLocalLayer()
  const profiles = useWorldSlice((s) => s.profiles)
  const presence = useWorldSlice((s) => s.presence)
  const quality = useQuality()
  const go = useSections((s) => s.go)

  const me = data.me
  const them = otherUser(me)
  const [open, setOpen] = useState(false)

  const theirPresence = presence[them]

  function moveThem(dx: number, dz: number) {
    if (!local) return
    const [x, y, z] = theirPresence.position
    local.setPresenceFor(them, { position: [x + dx, y, z + dz] })
  }

  return (
    <details className="dev" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>dev</summary>
      <div className="body">
        <div className="note">
          backend: <span className="backend">{DATA_BACKEND}</span> — {BACKEND_LABEL}
        </div>

        <label>
          <span className="k">you are</span>
          <select value={me} onChange={(e) => becomeUser(e.target.value as UserId)}>
            {USER_IDS.map((id) => (
              <option key={id} value={id}>
                {profiles[id].name} ({id})
              </option>
            ))}
          </select>
        </label>

        {/*
          Buttons live outside the <label>, not inside it. A <label> labels the
          control it wraps, and <button> is labelable — so a button nested in
          here reports the label's text as its own accessible name, and every
          one of these announces itself as "hour".
        */}
        <div className="group">
          <label>
            <span className="k">
              hour — {hourOverride === null ? 'live' : describeHour(hourOverride)}
            </span>
            <input
              type="range"
              min={0}
              max={23.9}
              step={0.1}
              value={hourOverride ?? 12}
              onChange={(e) => setHourOverride(Number(e.target.value))}
            />
          </label>
          <div className="row">
            <button type="button" onClick={() => setHourOverride(null)}>
              live
            </button>
            <button type="button" onClick={() => setHourOverride(6.4)}>
              dawn
            </button>
            <button type="button" onClick={() => setHourOverride(18.6)}>
              dusk
            </button>
            <button type="button" onClick={() => setHourOverride(1)}>
              night
            </button>
          </div>
        </div>

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
                COMMON_ZONES.includes(profiles[id].timeZone)
                  ? profiles[id].timeZone
                  : 'custom'
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

        {local && (
          <>
            <div className="group">
              <span className="k">{profiles[them].name}&rsquo;s light</span>
              <div className="row">
                <button
                  type="button"
                  onClick={() =>
                    local.setPresenceFor(them, { online: !theirPresence.online })
                  }
                >
                  {theirPresence.online ? 'send away' : 'bring here'}
                </button>
                {/* The Stars is a conversation, and a conversation with one
                    voice in it cannot be judged. This is the only way to see
                    both colours of light in the sky before she has ever
                    opened it. */}
                <button
                  type="button"
                  onClick={() => local.sayAs(them, SHE_SAYS[Math.floor(Math.random() * SHE_SAYS.length)])}
                >
                  she says
                </button>
              </div>
              <div className="row">
                <button type="button" aria-label="move them away" onClick={() => moveThem(0, -3)}>
                  ↑
                </button>
                <button type="button" aria-label="move them closer" onClick={() => moveThem(0, 3)}>
                  ↓
                </button>
                <button type="button" aria-label="move them left" onClick={() => moveThem(-3, 0)}>
                  ←
                </button>
                <button type="button" aria-label="move them right" onClick={() => moveThem(3, 0)}>
                  →
                </button>
              </div>
            </div>

            <div className="group">
              <span className="k">go</span>
              <div className="row">
                {SECTIONS.map((section, i) => (
                  <button key={section.id} type="button" onClick={() => go(i)}>
                    {section.id}
                  </button>
                ))}
              </div>
            </div>

            <div className="row">
              <button type="button" onClick={() => local.reset()}>
                reset world
              </button>
            </div>
          </>
        )}

        {/* Which place, and how far through a slide. The only way to tell a
            stuck transition from a slow one. */}
        <div className="note" data-where>
          place: {SECTIONS[Math.round(slidePosition())]?.id ?? '?'} ·{' '}
          {slidePosition().toFixed(2)}
        </div>

        <div className="note">
          quality: {quality.tier}
          {quality.degraded ? ' (stepped down)' : ''} · {quality.grassCount.toLocaleString()}{' '}
          blades · dpr {quality.dpr}
        </div>
      </div>
    </details>
  )
}
