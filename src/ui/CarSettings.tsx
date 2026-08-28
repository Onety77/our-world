/**
 * Every dial that decides how the rally car drives, on one page.
 *
 * ---------------------------------------------------------------------------
 * **Why this is a slider and not a number.**
 *
 * The car is judged by driving it, and the thing being judged is a feeling.
 * Feelings do not survive a round trip through an editor and a rebuild — by
 * the time the car is back on the road you are no longer comparing it against
 * what you felt, you are comparing it against your memory of what you felt,
 * and that memory has already started agreeing with whatever you just did.
 *
 * So: move it, drive it, move it back. The only thing that makes that loop
 * work is that every step of it is seconds long, which is why nothing here
 * asks for confirmation, nothing needs saving, and the *one* button that is
 * slow and deliberate — the one that changes the car on her phone — is set
 * apart from everything else at the top.
 *
 * The second reason for sliders is subtler and matters more. A number field
 * invites you to think about the number. A slider with a word at each end
 * invites you to think about the car. Every dial here states what its two ends
 * *feel* like rather than what they are worth, because "ice ←→ glue" is a
 * question somebody can answer from the driving seat and "1.78" is not.
 * ---------------------------------------------------------------------------
 *
 * The three-layer story — code, published, draft — lives in `tuning.ts`. This
 * file's job is to make which layer you are looking at impossible to mistake,
 * because the failure that actually costs something is thinking you have sent
 * a car you have not.
 */

import { useMemo, useState } from 'react'
import { SECTIONS } from '@/sections/registry'
import { useSections } from '@/systems/sections'
import { backToTheGarden } from '@/systems/dev'
import { useData } from '@/data/provider'
import { attempt } from '@/systems/trouble'
import {
  DEFAULTS,
  DIALS,
  GROUPS,
  type GroupId,
  PRESETS,
  TUNE,
  changedOnly,
  useRallyTuning,
  type Dial,
  type RallyTuning,
} from '@/world/games/ember-rally/tuning'
import { usePublishedTuning } from '@/world/games/ember-rally/tuningSync'
import { useRemembered } from './remember'

/** Whether two sets of dials say the same thing. */
function same(a: Partial<RallyTuning>, b: Partial<RallyTuning>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    const left = a[key as keyof RallyTuning] ?? DEFAULTS[key as keyof RallyTuning]
    const right = b[key as keyof RallyTuning] ?? DEFAULTS[key as keyof RallyTuning]
    if (Math.abs(left - right) > 1e-9) return false
  }
  return true
}

/**
 * The handful of combinations that make a car that cannot be driven.
 *
 * Not validation — every one of these is a legal thing to ask for, and two of
 * them are interesting on purpose. They are here because each produces a car
 * whose *symptom* points at the wrong dial: a car whose back grips less than
 * its front does not feel like a grip problem, it feels like the steering is
 * broken, and somebody who does not know that can spend an hour in the wrong
 * section of this page.
 */
function troubles(t: RallyTuning): string[] {
  const out: string[] = []
  if (t.rearBite <= t.frontBite) {
    out.push(
      'The back grips less than the front, so the car is unstable above a certain speed — it will spin rather than run wide, and no amount of steering will save it. Raise rear tyre bite above front.',
    )
  }
  if (t.driftAngle >= t.spinProtection) {
    out.push(
      'The drift wants to hang further out than spin protection allows, so the two are pulling against each other and a drift will feel like it is hitting a rail. Keep drift angle below spin protection.',
    )
  }
  if (t.driftHelper < 0.15 && t.autoCountersteer < 0.15) {
    out.push(
      'Both the drift helper and slide catching are near zero. That is a real car and it is very hard on two arrow keys — worth knowing before deciding the tyres are wrong.',
    )
  }
  if (t.grip > 2.6 && t.steerSpeed > 1.8) {
    out.push(
      'Very high grip with very quick steering makes the car change direction faster than the camera can follow. If it feels sickening rather than sharp, this pair is why.',
    )
  }
  return out
}

export function CarSettings() {
  const data = useData()
  usePublishedTuning()
  const go = useSections((s) => s.go)

  const published = useRallyTuning((s) => s.published)
  const draft = useRallyTuning((s) => s.draft)
  /*
    `TUNE` is mutated in place, so nothing about the object itself can tell
    React that a slider moved. The stamp is the whole subscription: it changes
    on every write, and every value read below comes from the live object.
  */
  const stamp = useRallyTuning((s) => s.stamp)
  const store = useRallyTuning.getState()

  const [filter, setFilter] = useState('')
  const [onlyChanged, setOnlyChanged] = useState(false)
  /*
    Which group of dials is open, and it survives the page load that "drive it
    now" causes — see `useRemembered`. Without that, tuning the camera would
    mean re-finding the camera after every single lap.
  */
  const [rememberedGroup, setGroup] = useRemembered('garden:car-group:v1', 'grip')
  const group: GroupId = GROUPS.some((entry) => entry.id === rememberedGroup)
    ? (rememberedGroup as GroupId)
    : 'grip'
  const [snippet, setSnippet] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const me = data.me
  const mine = changedOnly()
  const unsent = !same(mine, published)
  const publishedCount = Object.keys(published).length
  const changedCount = Object.keys(mine).length
  const warnings = troubles(TUNE)

  /*
    A search is not a group.

    The filter and "only what I have changed" are the two questions that are
    *about the whole car* rather than about one part of it — "where is the
    brake balance", "what have I actually touched tonight" — so while either is
    on, the chosen group is ignored and every group with a match is shown. A
    filter that only searched the tab you happened to be looking at would be a
    filter that lies.
  */
  const searching = filter.trim() !== '' || onlyChanged

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return DIALS.filter((dial) => {
      if (onlyChanged && Math.abs(TUNE[dial.key] - DEFAULTS[dial.key]) <= 1e-9) return false
      if (needle === '') return true
      return (
        dial.name.toLowerCase().includes(needle) ||
        dial.note.toLowerCase().includes(needle) ||
        dial.low.includes(needle) ||
        dial.high.includes(needle)
      )
    })
    // `stamp` is why this recomputes when a dial moves — see the note above.
  }, [filter, onlyChanged, stamp])

  async function send() {
    setSending(true)
    const sent = await attempt('that car did not reach the other phone', () =>
      data.setRallyTuning(mine as Record<string, number>),
    )
    setSending(false)
    // Only on a real success. Marking it published after a failed write would
    // leave the page insisting she is driving a car she has never received.
    if (sent) store.markPublished(mine)
  }

  /** Straight to the Hollow, where the rally is, without going through the garden. */
  function driveIt() {
    const hollow = SECTIONS.findIndex((section) => section.id === 'hollow')
    if (hollow >= 0) {
      go(hollow)
      useSections.getState().enter()
    }
    backToTheGarden()
  }

  function makeSnippet() {
    const lines = DIALS.filter(
      (dial) => Math.abs(TUNE[dial.key] - DEFAULTS[dial.key]) > 1e-9,
    ).map((dial) => `  ${dial.key}: ${Number(TUNE[dial.key].toFixed(4))},`)
    setSnippet(
      lines.length === 0
        ? '// Nothing is moved — the car is exactly what the code says.'
        : `// Into DEFAULTS in src/world/games/ember-rally/tuning.ts\n${lines.join('\n')}`,
    )
  }

  return (
    <section>
      <h2>how the car drives</h2>

      <p className="admin-note">
        Move one and the very next frame is different — nothing to save, nothing
        to reload. <b>These sliders are this device only</b> until you send
        them, so drag anything you like: her car does not change until you
        press the button.
      </p>

      {/* --- what state this is in, in one line ----------------------------- */}
      <p className="admin-note">
        {unsent && changedCount === 0 ? (
          <>
            You have put the car back to <b>standard</b> — and{' '}
            <b>she has not been sent it</b>. She is still driving an earlier set
            of {publishedCount} {publishedCount === 1 ? 'dial' : 'dials'}.
          </>
        ) : unsent ? (
          <>
            You are driving <b>{changedCount} changed</b>{' '}
            {changedCount === 1 ? 'dial' : 'dials'} — and{' '}
            <b>she has not been sent them</b>.{' '}
            {publishedCount === 0
              ? 'She is driving the car as the code has it.'
              : `She is driving an earlier set of ${publishedCount}.`}
          </>
        ) : publishedCount === 0 ? (
          <>
            Nothing is moved. Both of you are driving the car exactly as the
            code has it.
          </>
        ) : (
          <>
            You and she are driving <b>the same car</b> — {publishedCount}{' '}
            {publishedCount === 1 ? 'dial' : 'dials'} moved and sent.
          </>
        )}
      </p>

      <div className="row">
        <button
          type="button"
          className={unsent ? 'on' : ''}
          disabled={me !== 'warm' || !unsent || sending}
          onClick={() => void send()}
        >
          {sending ? 'sending…' : 'send this car to both of you'}
        </button>
        <button type="button" disabled={draft === null} onClick={() => store.dropDraft()}>
          drop my changes
        </button>
        <button type="button" onClick={makeSnippet}>
          copy these numbers
        </button>
      </div>

      {/*
        The other half of the loop, and the reason this page is usable at all.

        Without it the round trip is: leave, land in the garden, swipe to the
        Hollow, open the rally, pick a road. Five gestures between moving a
        slider and feeling what it did — which is easily long enough to lose
        hold of what you were comparing it against.
      */}
      <div className="row">
        <button type="button" className="admin-go" onClick={driveIt}>
          drive it now →
        </button>
      </div>

      {me !== 'warm' ? (
        <p className="admin-note">
          Only the warm account can send. You can still drive anything you like
          on this device.
        </p>
      ) : null}

      {snippet !== null ? (
        <label>
          <span className="k">
            paste into DEFAULTS to make these the car everybody starts with
          </span>
          <textarea readOnly value={snippet} onFocus={(e) => e.currentTarget.select()} />
        </label>
      ) : null}

      {warnings.map((warning) => (
        <p key={warning} className="admin-warn">
          {warning}
        </p>
      ))}

      {/* --- somewhere to start from ---------------------------------------- */}
      <p className="admin-note admin-sub">start from one of these</p>
      <div className="row">
        {/*
          The way back, and it belongs in this row rather than up with send and
          drop.

          The other four *layer*. Each sets the handful of dials it has an
          opinion about and leaves every other dial exactly where you left it —
          which is what you want while chasing one feeling, and is quietly not
          what you want an hour later, when "looser" has landed on top of
          "heavier" on top of six things you moved by hand and the car it
          produces is none of the three.

          So the first chip is the one that empties the row: every dial back to
          the number in the code, nothing carried over. It reads as a character
          like the rest because that is what it is — the car before anybody had
          an opinion — and it is what the other four are meant to be pressed
          *from*. When it is lit, that is the car you are driving.

          This was previously a button up in the send-and-drop row reading
          "back to the code's numbers", which is true and was not findable:
          that row is about the seam between this phone and hers, so nobody
          looking for a way to undo a bad afternoon of tuning reads it.
        */}
        <button
          type="button"
          className={changedCount === 0 ? 'on' : ''}
          title="Every dial back to the number in the code — the car before anybody touched it."
          onClick={() => store.toDefaults()}
        >
          standard
        </button>
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            title={preset.note}
            onClick={() => store.setMany(preset.values)}
          >
            {preset.name}
          </button>
        ))}
      </div>
      <p className="admin-note">
        <span className="admin-legend">
          <b>standard</b> — all {DIALS.length} dials back to the code's numbers.
          The car before anybody touched it, and the clean start the other four
          are meant to be pressed from.
        </span>
        {PRESETS.map((preset) => (
          <span key={preset.id} className="admin-legend">
            <b>{preset.name}</b> — {preset.note}
          </span>
        ))}
        <span className="admin-legend">
          <i>
            Those four each move only their own dials and leave the rest where
            you left them, so they stack. Press <b>standard</b> first for the
            car as that one describes it.
          </i>
        </span>
      </p>

      {/* --- finding one ----------------------------------------------------- */}
      <label>
        <span className="k">find a dial</span>
        <input
          type="text"
          value={filter}
          placeholder="grip, camera, brake, drift…"
          onChange={(event) => setFilter(event.target.value)}
        />
      </label>
      <div className="row">
        <button
          type="button"
          className={onlyChanged ? 'on' : ''}
          onClick={() => setOnlyChanged(!onlyChanged)}
        >
          only what I have changed ({changedCount})
        </button>
        {filter !== '' || onlyChanged ? (
          <button
            type="button"
            onClick={() => {
              setFilter('')
              setOnlyChanged(false)
            }}
          >
            show all {DIALS.length}
          </button>
        ) : null}
      </div>

      {/*
        One group at a time.

        Forty-one sliders is not a page you read, it is a page you get lost in:
        the camera dials were eight thousand pixels below the grip ones, so
        "does the camera need to come in a bit" was a scroll rather than a
        question. Ten chips, one open — and the count on a chip says where the
        changes you have already made are living, which is the thing you most
        want to know coming back to half-finished work.
      */}
      <nav className="admin-chips">
        {GROUPS.map((entry) => {
          const moved = DIALS.filter(
            (dial) =>
              dial.group === entry.id &&
              Math.abs(TUNE[dial.key] - DEFAULTS[dial.key]) > 1e-9,
          ).length
          return (
            <button
              key={entry.id}
              type="button"
              className={!searching && group === entry.id ? 'on' : ''}
              title={entry.note}
              onClick={() => {
                // Choosing a group is also the way out of a search, because
                // otherwise the chips look broken while one is running.
                setGroup(entry.id)
                setFilter('')
                setOnlyChanged(false)
              }}
            >
              {entry.short}
              {moved > 0 ? <span className="admin-chip-count">{moved}</span> : null}
            </button>
          )
        })}
      </nav>

      {shown.length === 0 ? (
        <p className="admin-note">
          Nothing matches{onlyChanged && filter.trim() === '' ? ' — nothing is changed yet' : ''}.
        </p>
      ) : null}

      {GROUPS.filter((entry) => searching || entry.id === group).map((entry) => {
        const dials = shown.filter((dial) => dial.group === entry.id)
        if (dials.length === 0) return null
        return (
          <div key={entry.id} className="admin-group">
            <h3>{entry.name}</h3>
            <p className="admin-note">{entry.note}</p>
            {dials.map((dial) => (
              <DialRow key={dial.key} dial={dial} />
            ))}
          </div>
        )
      })}
    </section>
  )
}

/**
 * One dial.
 *
 * The value is read straight out of `TUNE` rather than held in state, so a
 * preset, a reset or a set arriving from the other phone all move the slider
 * without anything having to remember to tell it.
 */
function DialRow({ dial }: { dial: Dial }) {
  const set = useRallyTuning((s) => s.set)
  const clear = useRallyTuning((s) => s.clear)
  useRallyTuning((s) => s.stamp)

  const value = TUNE[dial.key]
  const moved = Math.abs(value - DEFAULTS[dial.key]) > 1e-9

  return (
    <div className={moved ? 'admin-dial moved' : 'admin-dial'}>
      <div className="admin-dial-head">
        <span className="admin-dial-name">{dial.name}</span>
        <span className="admin-dial-value">{dial.show(value)}</span>
        {moved ? (
          <button
            type="button"
            className="admin-dial-reset"
            title={`back to ${dial.show(DEFAULTS[dial.key])}`}
            onClick={() => clear(dial.key)}
          >
            reset
          </button>
        ) : null}
      </div>
      <div className="admin-dial-track">
        <span className="admin-dial-end">{dial.low}</span>
        <input
          type="range"
          min={dial.min}
          max={dial.max}
          step={dial.step}
          value={value}
          aria-label={dial.name}
          onChange={(event) => set(dial.key, Number(event.target.value))}
        />
        <span className="admin-dial-end">{dial.high}</span>
      </div>
      <p className="admin-note">{dial.note}</p>
    </div>
  )
}
