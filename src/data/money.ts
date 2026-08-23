/**
 * The only place money becomes a string, and the only place strings become
 * money. Everything in between is integer minor units.
 *
 * Deliberately thin: currency conversion is NOT done here. A rate is always
 * supplied by whoever records the contribution — see `convert` — because an
 * invented rate is worse than no total at all.
 */

import type { CurrencyCode, Money } from './types'

/** How many minor units make one major unit. NGN → 100, JPY → 1. */
export function minorUnitsPerMajor(currency: CurrencyCode): number {
  try {
    const digits = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits
    return 10 ** (digits ?? 2)
  } catch {
    return 100
  }
}

export const money = (minor: number, currency: CurrencyCode): Money => ({
  minor: Math.round(minor),
  currency,
})

export const zero = (currency: CurrencyCode): Money => money(0, currency)

/** "2500.50" in NGN → 250050 kobo. Returns null if it isn't a number. */
export function parseMajor(input: string, currency: CurrencyCode): Money | null {
  const cleaned = input.replace(/[\s,_]/g, '')
  if (cleaned === '' || !/^-?\d*\.?\d*$/.test(cleaned)) return null
  const asNumber = Number(cleaned)
  if (!Number.isFinite(asNumber)) return null
  return money(asNumber * minorUnitsPerMajor(currency), currency)
}

export function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(
      `Refusing to add ${a.currency} to ${b.currency}. Convert first, with an explicit rate.`,
    )
  }
  return money(a.minor + b.minor, a.currency)
}

export function sum(items: Money[], currency: CurrencyCode): Money {
  return items.reduce(add, zero(currency))
}

/**
 * Convert with an explicit rate: units of `to` per 1 unit of `from.currency`.
 * There is no rate table and no network lookup in here on purpose — see
 * `RateProvider` below for the seam where a real one plugs in.
 */
export function convert(from: Money, to: CurrencyCode, rate: number): Money {
  if (from.currency === to) return { ...from }
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Refusing to convert ${from.currency}→${to} with rate ${rate}.`)
  }
  const majors = from.minor / minorUnitsPerMajor(from.currency)
  return money(majors * rate * minorUnitsPerMajor(to), to)
}

/**
 * Stubbed seam. Today the rate is typed in by whoever adds the contribution,
 * which is honest and costs nothing. Swap in a real provider later without
 * touching anything that stores or displays money.
 */
export interface RateProvider {
  /** Units of `to` per 1 unit of `from`. Throws rather than guessing. */
  rate(from: CurrencyCode, to: CurrencyCode): Promise<number>
}

export const manualRates: RateProvider = {
  async rate(from, to) {
    if (from === to) return 1
    throw new Error(
      `No exchange rate for ${from}→${to}. Enter it by hand when recording the contribution.`,
    )
  },
}

export function format(m: Money, opts: { compact?: boolean } = {}): string {
  const majors = m.minor / minorUnitsPerMajor(m.currency)
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: m.currency,
      notation: opts.compact ? 'compact' : 'standard',
      maximumFractionDigits: opts.compact ? 1 : undefined,
    }).format(majors)
  } catch {
    return `${majors.toFixed(2)} ${m.currency}`
  }
}

/** 0..1, or null when there's no goal to be a fraction of. */
export function progressToward(total: Money, goal: Money | null): number | null {
  if (!goal || goal.minor <= 0) return null
  if (total.currency !== goal.currency) return null
  return Math.max(0, Math.min(1, total.minor / goal.minor))
}
