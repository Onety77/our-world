/**
 * Who you are, and where.
 *
 * Only ever your own — hers is hers to write. It exists because one of you is
 * moving to China, and the two things that move with you are not decoration:
 * the timezone is the only input to where the sun and moon sit for you, and
 * the coordinates are the only input to the distance shown between you. Both
 * were previously editable only from the dev panel, which is to say: not.
 *
 * Written on the same paper as a letter, because it is the same act — putting
 * something down that the other person will read.
 */

import { useEffect, useState } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import { parseCoordinates } from '@/systems/geo'
import { isValidTimeZone, localTimeLabel } from '@/systems/time'
import { useProfileSheet } from '@/systems/profileSheet'
import { useNotify } from '@/systems/notify'

/**
 * Somewhere to start. Not a complete list — anything IANA is accepted below,
 * and the current value is always offered even when it isn't here.
 */
const ZONES = [
  'Africa/Lagos',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Dubai',
  'Europe/London',
  'America/New_York',
  'UTC',
]

/**
 * Whether this device should say something when she does.
 *
 * Here rather than in the Stars because it is a setting and this is where the
 * settings are — but also because it is *about this device*, and so is
 * everything else on this sheet.
 *
 * **The words have to be exact.** A web page cannot notify you once it is
 * closed; that needs a service worker holding a push subscription, which is
 * the PWA work in the plan and is not built. So it says "while the garden is
 * open" and means it. The honesty law is not a style — a toggle that implies
 * more than it does fails silently, at night, for somebody who was waiting.
 */
function Telling() {
  const wanted = useNotify((s) => s.wanted)
  const standing = useNotify((s) => s.standing)
  const want = useNotify((s) => s.want)
  const refresh = useNotify((s) => s.refresh)

  useEffect(() => refresh(), [refresh])

  if (standing === 'unsupported') return null

  const blocked = standing === 'denied'

  return (
    <p className="pot-rate">
      <label className="profile-toggle">
        <input
          type="checkbox"
          checked={wanted && !blocked}
          disabled={blocked}
          onChange={(e) => void want(e.target.checked)}
        />
        <span className="profile-field">tell me when she says something</span>
      </label>
      <span className="pot-why">
        {blocked
          ? 'This browser is refusing notifications for the garden. It has to be turned back on in the browser’s own settings for this site — a page cannot ask twice.'
          : 'While the garden is open, on this device — in another tab, or with the screen off. It cannot reach you once the page is closed.'}
      </span>
    </p>
  )
}

export function ProfileSheet() {
  const data = useData()
  const me = data.me
  const profile = useWorldSlice((s) => s.profiles[me])
  const open = useProfileSheet((s) => s.open)
  const close = useProfileSheet((s) => s.close)

  const [name, setName] = useState(profile.name)
  const [city, setCity] = useState(profile.city)
  const [zone, setZone] = useState(profile.timeZone)
  const [where, setWhere] = useState('')
  const [trouble, setTrouble] = useState<string | null>(null)

  // Refill from the world each time it opens, so an abandoned edit doesn't
  // come back later looking like it was saved.
  useEffect(() => {
    if (!open) return
    setName(profile.name)
    setCity(profile.city)
    setZone(profile.timeZone)
    setWhere(
      profile.lat === null || profile.lon === null
        ? ''
        : `${profile.lat}, ${profile.lon}`,
    )
    setTrouble(null)
  }, [open, profile])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  const zoneOptions = ZONES.includes(zone) ? ZONES : [zone, ...ZONES]

  async function save() {
    const trimmedName = name.trim()
    if (trimmedName === '') {
      setTrouble('You need a name.')
      return
    }
    if (!isValidTimeZone(zone)) {
      setTrouble(`This device doesn’t know the zone “${zone}”.`)
      return
    }

    // Blank clears the coordinates, which hides the distance. That is the
    // right outcome — better than showing a confident wrong number.
    let coords: { lat: number | null; lon: number | null }
    if (where.trim() === '') {
      coords = { lat: null, lon: null }
    } else {
      const parsed = parseCoordinates(where)
      if (!parsed) {
        setTrouble('Coordinates should look like 31.2304, 121.4737.')
        return
      }
      coords = parsed
    }

    await data.setProfile(me, {
      name: trimmedName,
      city: city.trim(),
      timeZone: zone,
      ...coords,
    })
    close()
  }

  return (
    <div className="reader composing">
      <div className="sheet" role="presentation">
        <div className="sheet-scroll">
          <div className="sheet-body">
            <p className="addressed">who you are</p>

            <input
              className="ink pot-note"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="your name"
              aria-label="your name"
            />

            <input
              className="ink pot-note"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="where you are — Kano, Shanghai"
              aria-label="your city"
            />

            <p className="pot-rate">
              <label>
                <span className="profile-field">the clock you live on</span>
                <select
                  className="ink pot-inline profile-zone"
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  aria-label="your timezone"
                >
                  {zoneOptions.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </label>
              <span className="pot-why">
                {isValidTimeZone(zone)
                  ? `It’s ${localTimeLabel(zone)} there. This is what moves your sun and moon.`
                  : 'Unknown zone.'}
              </span>
            </p>

            <p className="pot-rate">
              <label>
                <span className="profile-field">and roughly where that is</span>
                <input
                  className="ink pot-inline profile-coords"
                  value={where}
                  onChange={(e) => setWhere(e.target.value)}
                  placeholder="12.0022, 8.5920"
                  inputMode="decimal"
                  aria-label="your coordinates"
                />
              </label>
              <span className="pot-why">
                The only thing the distance between you is measured from. Leave
                it empty and no distance is shown, rather than a wrong one.
              </span>
            </p>

            <Telling />

            <p className="door-trouble" role="status" aria-live="polite">
              {trouble ?? ''}
            </p>
          </div>
        </div>
      </div>

      <div className="sheet-actions">
        <button type="button" className="put-back" onClick={() => void save()}>
          that’s me
        </button>
        <button type="button" className="put-back quiet" onClick={close}>
          leave it
        </button>
      </div>
    </div>
  )
}
