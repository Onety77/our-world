/**
 * Everything readable, sitting directly on the world.
 *
 * No panels and no cards — a card would put a rectangle between you and the
 * place, which is the one thing this is supposed to not have.
 *
 * With the walking gone this is small on purpose: who is here, what time it is
 * where each of you are, how far apart you are, and — on the river — what the
 * two of you have. Everything else belongs to whichever place you're in.
 */

import { useEffect, useState } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import { USER_IDS } from '@/data/types'
import { LIGHT_COLORS } from '@/systems/palette'
import { formatDistance, greatCircleKm } from '@/systems/geo'
import { potTotal } from '@/data/local'
import { format, progressToward } from '@/data/money'
import { likelyAsleep, localHourIn, localTimeLabel, partOfDay } from '@/systems/time'
import { useProfileSheet } from '@/systems/profileSheet'
import { useTakenOver } from '@/systems/attention'
import { useSections } from '@/systems/sections'
import { SECTIONS } from '@/sections/registry'

export function Overlay() {
  const takenOver = useTakenOver()
  const entered = useSections((s) => s.entered)
  const me = useData().me
  const profiles = useWorldSlice((s) => s.profiles)
  const presence = useWorldSlice((s) => s.presence)
  const world = useWorldSlice((s) => s)
  const showProfile = useProfileSheet((s) => s.show)

  const index = useSections((s) => s.index)
  const here = SECTIONS[index]

  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 20_000)
    return () => clearInterval(id)
  }, [])

  const total = potTotal(world)
  const goal = world.pot.goal
  const potProgress = progressToward(total, goal?.amount ?? null)

  const [warm, cool] = USER_IDS
  const apartKm =
    profiles[warm].lat !== null &&
    profiles[warm].lon !== null &&
    profiles[cool].lat !== null &&
    profiles[cool].lon !== null
      ? greatCircleKm(
          { lat: profiles[warm].lat, lon: profiles[warm].lon },
          { lat: profiles[cool].lat, lon: profiles[cool].lon },
        )
      : null

  const person = (id: (typeof USER_IDS)[number]) => {
    const p = profiles[id]
    const online = presence[id]?.online
    /*
      Away, or asleep — and the difference is the whole reason for this line.

      See `likelyAsleep`. One is worth waiting up for and the other is worth
      going to bed yourself, and today they are the same dark dot.
    */
    const asleep = !online && likelyAsleep(localHourIn(p.timeZone, tick))
    const inside = (
      <>
        <span className="clock">
          {localTimeLabel(p.timeZone, tick)} · {p.city}
        </span>
        <span
          className="name"
          style={id === me ? { color: LIGHT_COLORS[id] } : undefined}
        >
          {p.name}
        </span>
        <span className="spark" style={{ background: LIGHT_COLORS[id] }} />
      </>
    )

    // Your own row opens your profile. It already shows the two things that
    // change when you move — your clock and your city — so it is where you'd
    // reach to correct them. Hers is not a button: hers is hers to write.
    if (id === me) {
      return (
        <button
          type="button"
          className={online ? 'person mine' : 'person mine away'}
          onClick={showProfile}
          title="where you are"
          aria-label={`${p.name}, you, ${online ? 'online' : asleep ? 'asleep' : 'away'}`}
        >
          {inside}
        </button>
      )
    }
    return (
      <div
        className={online ? 'person' : asleep ? 'person away asleep' : 'person away'}
        title={asleep ? `${p.name} is probably asleep` : undefined}
      >
        {inside}
      </div>
    )
  }

  /*
    Only in the open.

    The clocks, the distance between you and how much is in the pot belong to
    the garden — they are what you glance at while choosing where to go. Inside
    a place they are somebody else's text over the thing you came for, and in
    the Stars, where a conversation is written across the sky, two more names
    in the corner are the last thing that view needs.
  */
  if (takenOver || entered) return null

  return (
    <div className="overlay">
      <div className="people">
        {person(warm)}
        {/* the two of you, joined, with the actual distance on the join */}
        <div className="between" aria-label="distance between you">
          <span className="gap">{apartKm === null ? '—' : formatDistance(apartKm)}</span>
          <span className="thread" />
        </div>
        {person(cool)}

        {/*
          Only at the river, where it is the subject. Elsewhere a running total
          of money is just noise over somebody's thought.

          Never the word "saved" — it is not a piggy bank, it is the two of
          you having something. So: ours.
        */}
        {entered && here.id === 'river' && (
          <div className="saved">
            <span className="saved-amount">{format(total)}</span>
            <span className="saved-label">
              {goal && potProgress !== null
                ? `${Math.round(potProgress * 100)}% of ${goal.label || 'it'}`
                : 'ours'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/** Small helper the dev panel shows, so the clock is never a mystery. */
export function describeHour(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.floor((hour - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${partOfDay(hour)}`
}
