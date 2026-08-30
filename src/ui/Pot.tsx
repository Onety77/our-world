/**
 * Putting something in the pot.
 *
 * Same sheet of paper as a letter, because it is the same kind of act: you are
 * writing down something you did in the real world so the two of you have a
 * record of it. Nothing here charges anyone or moves a penny.
 *
 * The rate is typed in by hand when the currencies differ. That is deliberate:
 * inventing a rate would make the history quietly wrong, and fetching a live
 * one would re-value everything you'd already saved every time the market
 * moved.
 */

import { useEffect, useRef, useState } from 'react'
import { attempt } from '@/systems/trouble'
import { useData, useWorldSlice } from '@/data/provider'
import { potTotal } from '@/data/local'
import { format, parseMajor, progressToward } from '@/data/money'
import { usePot } from '@/systems/pot'
import { useQuestions } from '@/systems/questions'
import { ambience } from '@/systems/ambience'
import { useDismissOutside } from './useDismissOutside'

export function PotForm() {
  const data = useData()
  const state = useWorldSlice((s) => s)
  const open = usePot((s) => s.open)
  const close = usePot((s) => s.close)

  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(state.pot.currency)
  const [rate, setRate] = useState('1')
  const [note, setNote] = useState('')
  const field = useRef<HTMLInputElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const actions = useRef<HTMLDivElement>(null)
  const untouched =
    amount === '' && note === '' && currency === state.pot.currency && rate === '1'

  useDismissOutside(open && untouched, close, [sheet, actions])

  useEffect(() => {
    if (open) field.current?.focus()
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  const parsed = parseMajor(amount, currency)
  const sameCurrency = currency === state.pot.currency
  const rateValue = Number(rate)
  const rateOk = sameCurrency || (Number.isFinite(rateValue) && rateValue > 0)
  const canSave = parsed !== null && parsed.minor !== 0 && rateOk

  async function put() {
    if (!parsed || !rateOk) return
    const added = await attempt('that didn’t go in the pot', () =>
      data.addContribution({
        amount: parsed,
        rateUsed: sameCurrency ? 1 : rateValue,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    )
    // The figures stay in the form if it failed — this is real money either of
    // you actually set aside, and quietly losing the entry is the worst of the
    // available outcomes.
    if (!added) return
    ambience.cue('water', 0.78)
    setAmount('')
    setNote('')
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

            <input
              className="ink pot-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="what it was for, if you like"
              aria-label="note"
            />

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
