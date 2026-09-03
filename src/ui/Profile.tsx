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

import { useEffect, useRef, useState } from 'react'
import { useConnection, useData, useWorldSlice } from '@/data/provider'
import { parseCoordinates } from '@/systems/geo'
import { findPlace, type Place } from '@/systems/places'
import { isValidTimeZone, localTimeLabel } from '@/systems/time'
import { useProfileSheet } from '@/systems/profileSheet'
import { useDismissOutside } from './useDismissOutside'
import { useNotify } from '@/systems/notify'
import { useSay } from '@/systems/useSay'
import { MySound } from './MySound'

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
 * The switch now owns both halves: permission in this browser and its private
 * push address in Firestore. Its short status line says when the second half
 * has actually completed, rather than treating a granted permission as proof
 * that a closed phone can already be reached.
 */
function Telling() {
  const data = useData()
  const say = useSay()
  const wanted = useNotify((s) => s.wanted)
  const standing = useNotify((s) => s.standing)
  const push = useNotify((s) => s.push)
  const issue = useNotify((s) => s.issue)
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
          disabled={blocked || push === 'syncing'}
          onChange={(e) => void want(e.target.checked, data.me)}
        />
        <span className="profile-field">{say('tell me when {she} says something')}</span>
      </label>
      {blocked ? (
        <span className="pot-why">
          This browser is refusing notifications for the garden. It has to be
          turned back on in the browser&rsquo;s own settings for this site — a
          page cannot ask twice.
        </span>
      ) : null}
      {!blocked && push === 'syncing' ? (
        <span className="pot-why">Connecting this device…</span>
      ) : null}
      {!blocked && push === 'active' ? (
        <span className="pot-why">This device can hear the garden even after it is closed.</span>
      ) : null}
      {!blocked && issue ? <span className="pot-why">{issue}</span> : null}
    </p>
  )
}

/**
 * The way out of the garden on this machine.
 *
 * ===========================================================================
 * **There was no way to sign out.** `signOutOfGarden` has existed in
 * `data/firebase` since the door was built and nothing has ever called it, so
 * the only way to end a session was the Firebase console or clearing the
 * browser's site data by hand. That is fine right up until the evening you sign
 * in somewhere you should not have — a friend's laptop, a machine at work — and
 * then it is the one control the app is missing.
 *
 * **It is per device, and that is the point.** Signing out here ends the session
 * in *this* browser and touches nothing else: the phone in your pocket stays
 * signed in, and so does {her} everything. There is no limit on how many places
 * one account may be open at once, and no reason there should be — most of them
 * are you.
 *
 * **It asks once.** Not because it is dangerous — you sign in again and
 * everything is exactly where you left it — but because the cost of an
 * accidental press is finding your password on a phone at midnight, and the
 * cost of the extra tap is nothing.
 *
 * Real backend only. There is nothing to sign out of on the mock, and a button
 * that did nothing would be worse than no button.
 * ===========================================================================
 */
function TheWayOut() {
  const data = useData()
  const connection = useConnection()
  const [asking, setAsking] = useState(false)
  const [going, setGoing] = useState(false)
  const [fault, setFault] = useState('')

  if (connection.status === 'local') return null

  const leave = async () => {
    setGoing(true)
    setFault('')
    try {
      // Once this browser has no signed-in owner, it must not keep receiving
      // private message previews addressed to the account that just left.
      await useNotify.getState().want(false, data.me)
      const { signOutOfGarden } = await import('@/data/firebase')
      await signOutOfGarden()
      // Nothing after this: the provider is watching, sees the session end and
      // puts the door back up by itself.
    } catch {
      setFault('That did not take. You are still signed in here.')
      setGoing(false)
      setAsking(false)
    }
  }

  return (
    <p className="profile-way-out">
      {asking ? (
        <>
          <span className="profile-field">sign out of this device?</span>
          <span className="profile-way-out-pair">
            <button type="button" className="put-back" disabled={going} onClick={() => void leave()}>
              {going ? 'going…' : 'yes, sign out'}
            </button>
            <button type="button" className="put-back quiet" onClick={() => setAsking(false)}>
              stay
            </button>
          </span>
        </>
      ) : (
        <button type="button" className="profile-leave" onClick={() => setAsking(true)}>
          sign out of this device
        </button>
      )}
      <span className="pot-why">
        {fault ||
          'Only this browser. Anywhere else you are signed in stays signed in, and nothing you have written goes anywhere.'}
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
  /** What the city name resolved to, once it has. */
  const [found, setFound] = useState<Place | null>(null)
  const [looking, setLooking] = useState(false)
  const [trouble, setTrouble] = useState<string | null>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const actions = useRef<HTMLDivElement>(null)
  const savedWhere =
    profile.lat === null || profile.lon === null ? '' : `${profile.lat}, ${profile.lon}`
  const untouched =
    name === profile.name &&
    city === profile.city &&
    zone === profile.timeZone &&
    where === savedWhere

  /*
    ==========================================================================
    **The city you already typed knows where it is.**

    Coordinates were the only thing this form asked for that you had to go and
    look up somewhere else, and the only one where a typo — one degree, a
    hundred and eleven kilometres — produces no error, just a quietly wrong
    distance and, now, somebody else's weather.

    So the name does the work. Debounced rather than done on every keystroke,
    because "Kano" passes through K, Ka and Kan on the way and two of those are
    real places somewhere.

    It fills the coordinates in rather than replacing them: what it found is
    still shown, still editable, and still clearable. A lookup that silently
    overwrote a number somebody had deliberately typed would be worse than the
    problem it solves.
    ==========================================================================
  */
  useEffect(() => {
    const asked = city.trim()
    if (!open || asked.length < 2) return
    let live = true
    const wait = window.setTimeout(() => {
      setLooking(true)
      void findPlace(asked).then((place) => {
        if (!live) return
        setLooking(false)
        setFound(place)
        /*
          Only fills what is empty or was itself found. Typing a city must not
          throw away coordinates somebody put in by hand — see the note above.
        */
        if (place && (where.trim() === '' || where === savedWhere)) {
          setWhere(`${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`)
          // The zone almost always is the thing you meant, and getting it from
          // the same answer means the clock and the distance cannot disagree.
          if (place.timeZone && isValidTimeZone(place.timeZone)) setZone(place.timeZone)
        }
      })
    }, 600)
    return () => {
      live = false
      window.clearTimeout(wait)
      setLooking(false)
    }
    // `where` is read as a guard, not a trigger: re-running on every keystroke
    // in the coordinates field would fight whoever is typing in it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, open])

  useDismissOutside(open && untouched, close, [sheet, actions])

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
    // A found place belongs to the name that was in the box; reopening the
    // sheet starts again rather than showing what the last edit resolved to.
    setFound(null)
    setLooking(false)
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
      <div ref={sheet} className="sheet" role="presentation">
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
                  placeholder="found from the city above"
                  inputMode="decimal"
                  aria-label="your coordinates"
                />
              </label>
              <span className="pot-why">
                {looking
                  ? 'Looking that up…'
                  : found
                    ? `Found ${found.label}. The distance between you is measured from here, and the weather comes from it.`
                    : city.trim().length > 1
                      ? 'That name was not found — you can put the numbers in yourself, or try adding the country.'
                      : 'The only thing the distance between you is measured from. Leave it empty and no distance is shown, rather than a wrong one.'}
              </span>
            </p>

            <Telling />
            <MySound />
            <TheWayOut />

            <p className="door-trouble" role="status" aria-live="polite">
              {trouble ?? ''}
            </p>
          </div>
        </div>
      </div>

      <div ref={actions} className="sheet-actions">
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
