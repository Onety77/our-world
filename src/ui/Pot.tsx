/**
 * The Wellspring's three sheets: putting something in the pot, saying what
 * the pot is for, and looking at what went in.
 *
 * Same sheet of paper as a letter, because it is the same kind of act: you are
 * writing down something you did in the real world so the two of you have a
 * record of it. Nothing here charges anyone or moves a penny.
 *
 * The rate is typed in by hand when the currencies differ. That is deliberate:
 * inventing a rate would make the history quietly wrong, and fetching a live
 * one would re-value everything you'd already saved every time the market
 * moved.
 *
 * ---------------------------------------------------------------------------
 * **Two of the three sheets are new, and the data for both was always there.**
 * `Pot.goal` — what you are saving for — has been in the type since the first
 * day and nothing ever wrote it, so every river ran on the no-goal curve and
 * "62% of the trip" was a sentence the place could never say. And every
 * contribution is kept with who put it in and when, and nothing ever showed
 * them: the record the form's own note says it exists to make. A place whose
 * pleasure is watching a figure grow should say what the figure is growing
 * toward, and let you see how it got there.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from 'react'
import { attempt } from '@/systems/trouble'
import { useData, useWorldSlice } from '@/data/provider'
import { potByPerson, potTotal } from '@/data/local'
import { USER_IDS, type UserId } from '@/data/types'
import { format, parseMajor, progressToward } from '@/data/money'
import { LIGHT_COLORS } from '@/systems/palette'
import { usePot } from '@/systems/pot'
import { useQuestions } from '@/systems/questions'
import { ambience } from '@/systems/ambience'
import { useDismissOutside } from './useDismissOutside'

/** Escape closes whichever sheet is up. */
function useEscape(open: boolean, close: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])
}

export function PotForm() {
  const sheet = usePot((s) => s.sheet)
  if (sheet === 'goal') return <GoalSheet />
  if (sheet === 'record') return <RecordSheet />
  if (sheet === 'add') return <AddSheet />
  return null
}

function AddSheet() {
  const data = useData()
  const state = useWorldSlice((s) => s)
  const close = usePot((s) => s.close)

  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(state.pot.currency)
  const [rate, setRate] = useState('1')
  const field = useRef<HTMLInputElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const actions = useRef<HTMLDivElement>(null)
  const untouched = amount === '' && currency === state.pot.currency && rate === '1'

  useDismissOutside(untouched, close, [sheet, actions])
  useEscape(true, close)
  useEffect(() => {
    field.current?.focus()
  }, [])

  const parsed = parseMajor(amount, currency)
  const sameCurrency = currency === state.pot.currency
  const rateValue = Number(rate)
  const rateOk = sameCurrency || (Number.isFinite(rateValue) && rateValue > 0)
  const canSave = parsed !== null && parsed.minor !== 0 && rateOk

  async function put() {
    if (!parsed || !rateOk) return
    const added = await attempt('that didn’t go in the pot', () =>
      /*
        No note any more — see the field that used to be below the amount.

        `note` stays optional on the contribution and entries that already carry
        one keep it; nothing displays it and nothing new writes one.
      */
      data.addContribution({
        amount: parsed,
        rateUsed: sameCurrency ? 1 : rateValue,
      }),
    )
    // The figures stay in the form if it failed — this is real money either of
    // you actually set aside, and quietly losing the entry is the worst of the
    // available outcomes.
    if (!added) return
    ambience.cue('water', 0.78)
    setAmount('')
    close()
    if (parsed.minor > 0) useQuestions.getState().announceSeed()
  }

  const total = potTotal(state)
  const goal = state.pot.goal
  const progress = progressToward(total, goal?.amount ?? null)

  return (
    <div className="reader composing">
      <div ref={sheet} className="sheet" role="presentation">
        <div className="sheet-scroll">
          <div className="sheet-body">
            <p className="addressed">into the pot</p>

            <div className="pot-row">
              <input
                ref={field}
                className="ink pot-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                aria-label="amount"
              />
              <input
                className="ink pot-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                aria-label="currency"
              />
            </div>

            {!sameCurrency && (
              <p className="pot-rate">
                <label>
                  1 {currency} ={' '}
                  <input
                    className="ink pot-inline"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    inputMode="decimal"
                    aria-label={`rate from ${currency} to ${state.pot.currency}`}
                  />{' '}
                  {state.pot.currency}
                </label>
                <span className="pot-why">
                  Recorded with the entry, so what you saved never re-values
                  itself later.
                </span>
              </p>
            )}

            {/*
              There was a "what it was for" line here, and it has gone.

              Every entry in this pot is for the same thing and the two of them
              know what it is, so the field asked a question with one answer and
              then made you type it. A form that asks for something nobody needs
              is a form that is slower to use and slightly harder to trust —
              you look for the reason it is being collected.
            */}
            <p className="pot-standing">
              {format(total)} between you
              {goal && progress !== null && (
                <span>
                  {' '}
                  · {Math.round(progress * 100)}% of {goal.label || 'the goal'}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div ref={actions} className="sheet-actions">
        <button
          type="button"
          className="put-back"
          onClick={() => void put()}
          disabled={!canSave}
        >
          put it in
        </button>
        <button type="button" className="put-back quiet" onClick={close}>
          not now
        </button>
      </div>
    </div>
  )
}

/**
 * What it is for.
 *
 * A name and an amount, in the pot's own currency, and either of you may set
 * it or change it — it is the two of you deciding, and a place that let only
 * one of you name the thing would be taking a side. Clearing it puts the
 * river back on the curve that keeps rewarding deposits without ever
 * arriving; see `riverFullness`.
 */
function GoalSheet() {
  const data = useData()
  const state = useWorldSlice((s) => s)
  const close = usePot((s) => s.close)
  const goal = state.pot.goal
  const currency = state.pot.currency
  const per = (() => {
    // Whole units to show in the field, from the stored minor units.
    const parsed = parseMajor('1', currency)
    return parsed ? parsed.minor : 100
  })()

  const [label, setLabel] = useState(goal?.label ?? '')
  const [amount, setAmount] = useState(goal ? String(goal.amount.minor / per) : '')
  const field = useRef<HTMLInputElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const actions = useRef<HTMLDivElement>(null)
  const untouched = label === (goal?.label ?? '') && amount === (goal ? String(goal.amount.minor / per) : '')

  useDismissOutside(untouched, close, [sheet, actions])
  useEscape(true, close)
  useEffect(() => {
    field.current?.focus()
  }, [])

  const parsed = parseMajor(amount, currency)
  const canSet = parsed !== null && parsed.minor > 0
  const total = potTotal(state)

  async function set() {
    if (!parsed) return
    const done = await attempt('that didn’t take', () =>
      data.setPotGoal({ amount: parsed, label: label.trim() }),
    )
    if (!done) return
    ambience.cue('water', 0.5)
    close()
  }

  async function clear() {
    const done = await attempt('that didn’t take', () => data.setPotGoal(null))
    if (!done) return
    close()
  }

  return (
    <div className="reader composing">
      <div ref={sheet} className="sheet" role="presentation">
        <div className="sheet-scroll">
          <div className="sheet-body">
            <p className="addressed">{goal ? 'what it is for' : 'what is it for?'}</p>

            <input
              ref={field}
              className="ink pot-goal-label"
              value={label}
              onChange={(e) => setLabel(e.target.value.slice(0, 48))}
              placeholder="the trip · the flat · the next visit"
              aria-label="what you are saving for"
            />

            <div className="pot-row">
              <input
                className="ink pot-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                aria-label="how much it will take"
              />
              <span className="pot-currency-fixed">{currency}</span>
            </div>

            <p className="pot-standing">
              {format(total)} there already
              {parsed && parsed.minor > 0 ? (
                <span>
                  {' '}
                  · {Math.round(Math.min(1, total.minor / parsed.minor) * 100)}% of the way
                </span>
              ) : null}
            </p>
            <p className="pot-why">
              The river brims on the day you reach it. Either of you can change
              this; it is the two of you deciding.
            </p>
          </div>
        </div>
      </div>

      <div ref={actions} className="sheet-actions">
        <button type="button" className="put-back" onClick={() => void set()} disabled={!canSet}>
          {goal ? 'change it' : 'set it'}
        </button>
        {goal ? (
          <button type="button" className="put-back quiet" onClick={() => void clear()}>
            no goal, just ours
          </button>
        ) : null}
        <button type="button" className="put-back quiet" onClick={close}>
          not now
        </button>
      </div>
    </div>
  )
}

/**
 * What went in, and who put it there — newest first, with each of your
 * totals at the top. Information, never a scoreboard: the two figures sit
 * side by side in your two colours and neither is called more.
 */
function RecordSheet() {
  const data = useData()
  const state = useWorldSlice((s) => s)
  const close = usePot((s) => s.close)
  const sheet = useRef<HTMLDivElement>(null)
  const actions = useRef<HTMLDivElement>(null)

  useDismissOutside(true, close, [sheet, actions])
  useEscape(true, close)

  const total = potTotal(state)
  const each = potByPerson(state)
  const entries = [...state.contributions].sort((a, b) => b.at - a.at)
  const name = (id: UserId) => (id === data.me ? 'you' : state.profiles[id].name)
  const when = (at: number) =>
    new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="reader composing">
      <div ref={sheet} className="sheet" role="presentation">
        <div className="sheet-scroll">
          <div className="sheet-body">
            <p className="addressed">what went in</p>

            <p className="pot-each">
              {USER_IDS.map((id) => (
                <span key={id} className="pot-each-one">
                  <span className="pot-each-spark" style={{ background: LIGHT_COLORS[id] }} />
                  <b>{format(each[id])}</b> {name(id)}
                </span>
              ))}
            </p>
            <p className="pot-standing">{format(total)} between you</p>

            {entries.length === 0 ? (
              <p className="pot-why">Nothing yet. The first thing either of you puts in starts the river.</p>
            ) : (
              <ul className="pot-entries">
                {entries.map((c) => (
                  <li key={c.id}>
                    <span className="pot-entry-spark" style={{ background: LIGHT_COLORS[c.by] }} />
                    <span className="pot-entry-who">{name(c.by)}</span>
                    <span className="pot-entry-when">{when(c.at)}</span>
                    <span className="pot-entry-amount">
                      {format(c.inPotCurrency)}
                      {c.amount.currency !== c.inPotCurrency.currency ? (
                        <small> {format(c.amount)}</small>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div ref={actions} className="sheet-actions">
        <button type="button" className="put-back quiet" onClick={close}>
          back to the water
        </button>
      </div>
    </div>
  )
}
