/**
 * What is off the wall while it is being worked on.
 *
 * ---------------------------------------------------------------------------
 * **The garden is lived in while it is being built.** She has the app on her
 * phone, and there is no staging copy — there is one garden and both of you are
 * in it. So when a road is half rebuilt, the honest move is not to ship it
 * broken and hope she does not open it that evening. It is to take the thing
 * down until it is ready, and put it back when it is.
 *
 * Two answers per door, and only two are worth having:
 *
 *   for {her}   shut for her, still open here — the ordinary case, because the
 *               person doing the work is the one who needs to get in
 *   for both    shut for everybody, for when it is broken enough that opening
 *               it at all is a mistake
 *
 * There is deliberately no "just me". A door only you cannot open is not a
 * door, it is a preference, and preferences belong on the device tab.
 *
 * **It drafts, like the car does.** Nothing reaches her phone until save is
 * pressed — so you can shut three roads, change your mind about one, and only
 * then commit. Every other panel that changes what *she* sees works this way
 * and this is the one with the sharpest consequence for getting it wrong.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import { otherUser, type LockedTo, type Locks } from '@/data/types'
import { useSay } from '@/systems/useSay'
import { gameKey, roadKey, useLocks } from '@/systems/locks'
import { GAMES } from '@/world/games/registry'

/**
 * The racer's roads.
 *
 * Named here rather than imported, because `EmberRally` is fetched on demand —
 * see `later` — and the control room must not drag a kilometre and a half of
 * tunnel geometry into its own bundle to draw three checkboxes. Three strings
 * that change roughly never against a quarter of the app's weight is not a
 * close call. If a road is added and not listed here, the only cost is that it
 * cannot be locked from this screen.
 */
const ROADS: readonly { id: string; name: string }[] = [
  { id: 'rootway', name: 'The Rootway' },
  { id: 'moonbreak', name: 'The Moonbreak' },
  { id: 'stormcrown', name: 'The Stormcrown' },
]

/** Every door this screen can shut, in the order they are worth reading. */
function doors(): { key: string; name: string; kind: string }[] {
  return [
    ...GAMES.map((game) => ({
      key: gameKey(game.id),
      name: game.name,
      kind: 'the whole game',
    })),
    ...ROADS.map((road) => ({
      key: roadKey(road.id),
      name: road.name,
      kind: 'ember rally',
    })),
  ]
}

export function LockedDoors() {
  const data = useData()
  const say = useSay()
  const me = data.me
  const profiles = useWorldSlice((s) => s.profiles)
  const them = profiles[otherUser(me)]
  const published = useLocks()

  const [draft, setDraft] = useState<Locks>(published)
  const [saving, setSaving] = useState(false)
  const [fault, setFault] = useState('')
  const [saved, setSaved] = useState(false)

  /*
    Follow what is published until you start editing.

    The first read arrives a moment after this mounts, so a draft seeded once at
    mount would be empty for ever and pressing save would silently unlock
    everything. Once the draft differs from what is published, it is yours and
    is left alone — see `dirty`.
  */
  const dirty = JSON.stringify(draft) !== JSON.stringify(published)
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (!touched) setDraft(published)
  }, [published, touched])

  const set = (key: string, to: LockedTo | null) => {
    setTouched(true)
    setSaved(false)
    setDraft((was) => {
      const next = { ...was }
      // Unlocked is the *absence* of a key, so there is never a second way to
      // say "open" that could disagree with the first.
      if (to === null) delete next[key]
      else next[key] = to
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    setFault('')
    try {
      await data.setLocks(draft)
      setTouched(false)
      setSaved(true)
    } catch {
      setFault(
        'That did not reach the garden. Check the rules are published, then try again — nothing has changed for ' +
          them.name +
          ' either way.',
      )
    } finally {
      setSaving(false)
    }
  }

  const shut = Object.keys(draft).length

  return (
    <section className="admin-locks">
      <h2>what is closed</h2>
      <p className="admin-note">
        {say(
          'Take something off the wall while you are working on it. Nothing here reaches {her} phone until you save.',
        )}
      </p>

      <ul className="lock-list">
        {doors().map((door) => {
          const to = draft[door.key] ?? null
          return (
            <li key={door.key} className={to ? 'is-shut' : ''}>
              <span className="lock-what">
                <b>{door.name}</b>
                <small>{door.kind}</small>
              </span>
              <span className="lock-choices" role="group" aria-label={`close ${door.name}`}>
                <button
                  type="button"
                  className={to === null ? 'on' : ''}
                  onClick={() => set(door.key, null)}
                >
                  open
                </button>
                <button
                  type="button"
                  className={to === 'them' ? 'on' : ''}
                  onClick={() => set(door.key, 'them')}
                >
                  {say('for {her}')}
                </button>
                <button
                  type="button"
                  className={to === 'both' ? 'on' : ''}
                  onClick={() => set(door.key, 'both')}
                >
                  for both
                </button>
              </span>
            </li>
          )
        })}
      </ul>

      <p className="admin-note">
        {shut === 0
          ? 'Everything is open.'
          : `${shut} ${shut === 1 ? 'door is' : 'doors are'} closed in this draft.`}
      </p>

      <div className="row">
        <button
          type="button"
          className={dirty ? 'on' : ''}
          onClick={save}
          disabled={me !== 'warm' || saving || !dirty}
        >
          {saving ? 'sending…' : dirty ? 'save' : saved ? 'saved' : 'nothing to save'}
        </button>
        {dirty && (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              setTouched(false)
              setDraft(published)
              setSaved(false)
            }}
          >
            put it back
          </button>
        )}
      </div>

      {fault && <p className="admin-note lock-fault">{fault}</p>}

      {/*
        The one thing this cannot do, said plainly.

        Locking hides a door; it does not reach into a game somebody is already
        inside. If she is half way down a road when you shut it, she finishes
        that run — which is the kinder behaviour anyway, and the alternative is
        an app that closes itself mid-corner.
      */}
      <p className="admin-note">
        {say(
          'A closed door disappears rather than greying out. If {she} is already inside something when you close it, {she} stays until {she} leaves.',
        )}
      </p>
    </section>
  )
}
