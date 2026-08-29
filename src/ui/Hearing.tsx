/**
 * What the garden is playing, right now.
 *
 * ---------------------------------------------------------------------------
 * One question this could not answer before: *"I am standing in the Hollow and
 * I can still hear the garden."*
 *
 * The mix is a table of numbers in `ambience.ts`, the crossfade is a variable
 * nothing exposes, and the only instrument anybody had was their own ears on a
 * phone several timezones away. So the conversation had nowhere to go — the
 * code says the Hollow is a low rumble and a fire with the air turned down to
 * a fiftieth, and if that is not what it sounds like, neither of us can tell
 * whether the bed is on the wrong place or the right place simply sounds
 * wrong.
 *
 * Those are completely different bugs and they have completely different
 * fixes, so the first thing worth building is the thing that tells them apart.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from 'react'
import { ambience, type Place } from '@/systems/ambience'

interface Heard {
  place: Place
  from: Place
  blend: number
  levels: Record<string, number>
}

export function Hearing() {
  const [heard, setHeard] = useState<Heard | null>(null)

  useEffect(() => {
    // Twice a second. This is a diagnostic, not a meter — a number that moves
    // sixty times a second is harder to read than one that moves twice.
    const read = () => setHeard(ambience.running ? ambience.hearing() : null)
    read()
    const timer = window.setInterval(read, 500)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <section>
      <h3>what you are hearing</h3>
      {heard === null ? (
        <p className="admin-note">
          The bed is not running. It starts on the first touch of the way in —
          browsers will not begin audio before that.
        </p>
      ) : (
        <>
          <p className="admin-note">
            playing <b>{heard.place}</b>
            {heard.blend < 1 ? (
              <>
                {' '}
                — still {Math.round((1 - heard.blend) * 100)}% of{' '}
                <b>{heard.from}</b>, crossfading
              </>
            ) : null}
          </p>
          <div className="hearing-bars">
            {Object.entries(heard.levels).map(([name, level]) => (
              <span key={name} className={level > 0.02 ? 'on' : ''}>
                <i style={{ width: `${Math.min(100, level * 100)}%` }} />
                {name}
                <b>{level.toFixed(2)}</b>
              </span>
            ))}
          </div>
          <p className="admin-note">
            These are the live mix weights after the section fader. A layer at
            zero is silent; putting the current place at 0% makes every bar
            reach zero after its crossfade. If the place named above is where
            you are standing, this is the sound that room is actually asking
            the audio graph to make.
          </p>
        </>
      )}
    </section>
  )
}
