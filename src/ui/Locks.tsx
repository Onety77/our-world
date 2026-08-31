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

import { useState } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import { otherUser, type LockedTo, type Locks } from '@/data/types'
import { useSay } from '@/systems/useSay'
import { gameKey, roadKey, useLocks, useWatchLocks } from '@/systems/locks'
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
  { id: 'rootway-test', name: 'The Switchback' },
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
  /*
    ===========================================================================
    The control room has to open its own listener, and this is why saving
    looked broken.

    `useWatchLocks` is mounted in `Garden` — and `App` renders the control room
    *instead of* the garden, never alongside it. So on this screen nothing was
    ever watching `locks/ours`: what is published read as `{}` for ever, no
    matter what was in the database or what had just been written to it.

    Which produced exactly the symptom. You closed two doors, pressed save, the
    write went through — and the panel, still believing nothing was published,
    put every row back to open in front of you. The save had worked. The screen
    had simply never looked.

    One listener either way: this component and the garden are never on screen
    at the same time.
    ===========================================================================
  */
  useWatchLocks()
  const { locks: published, known } = useLocks()

  /*
    ===========================================================================
    The draft is null until you touch something, and then it is yours to keep.

    **This is what made saving look broken.** It used to clear a `touched` flag
    the instant the write resolved, and an effect underneath then reset the
    draft back to whatever was last *published* — which, a few milliseconds
    after saving, is still the old value, because the snapshot has not come
    back round yet. So every save flashed the whole list back to open, and if
    the read listener was not alive to correct it a moment later, it stayed
    that way. Which looks exactly like nothing having been saved at all.

    Now nothing ever resets the draft. `null` means "show me what is
    published"; anything else is yours, and it is still yours after a save.
    `dirty` then tells the truth by itself: it goes quiet when the published
    value catches up with what you asked for, and stays lit if it never does.
    A write that vanished is a button that is still offering to save.
    ===========================================================================
  */
  const [draft, setDraft] = useState<Locks | null>(null)
  const [saving, setSaving] = useState(false)
  const [fault, setFault] = useState('')
  /** For the button only: whether anything has actually gone through here. */
  const [went, setWent] = useState(false)

  const shown = draft ?? published
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(published)

  const set = (key: string, to: LockedTo | null) => {
    setFault('')
    setWent(false)
    setDraft((was) => {
      const next = { ...(was ?? published) }
      // Unlocked is the *absence* of a key, so there is never a second way to
      // say "open" that could disagree with the first.
      if (to === null) delete next[key]
      else next[key] = to
      return next
    })
  }

  const save = async () => {
    if (draft === null) return
    setSaving(true)
    setFault('')
    try {
      await data.setLocks(draft)
      setWent(true)
    } catch (error) {
      /*
        The actual reason, not a guess at it.

        "That did not work" is the least useful thing an error can say, and
        this one has exactly two likely causes with completely different fixes:
        the rules are not published, or you are not signed in as the account
        allowed to write them. Firebase says which in one word, so it is shown.
      */
      const why = (error as { code?: string; message?: string })
      setFault(
        (why?.code ?? why?.message ?? 'it did not go') +
          ' — nothing has changed for ' +
          them.name +
          '. If that says permission-denied, publish rules-out/firestore.rules.',
      )
    } finally {
      setSaving(false)
    }
  }

  const shut = Object.keys(shown).length

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
          const to = shown[door.key] ?? null
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
          : `${shut} ${shut === 1 ? 'door is' : 'doors are'} closed${dirty ? ' in this draft' : ''}.`}
      </p>

      {/*
        Whether this screen has actually managed to look.

        Without it, "everything is open" is the same sentence whether nothing is
        locked or nothing could be read — and those need completely different
        things from you. It is the difference between a save that worked and a
        rules file that was never published, and it was invisible.
      */}
      {!known && (
        <p className="admin-note lock-fault">
          These locks have not been read yet. Either this has not reached the
          database, or <b>locks/ours</b> is not readable — publish
          rules-out/firestore.rules. Until it can be read, nothing is hidden
          from anybody.
        </p>
      )}

      <div className="row">
        <button
          type="button"
          className={dirty ? 'on' : ''}
          onClick={save}
          disabled={me !== 'warm' || saving || !dirty}
        >
          {saving ? 'sending…' : dirty ? 'save' : went ? 'saved' : 'nothing to save'}
        </button>
        {dirty && (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              setDraft(null)
              setFault('')
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
