/**
 * Runtime configuration.
 *
 * Rule for this file: nothing environment-specific gets a plausible fallback.
 * A missing key either throws by name at startup, or lands us in an obviously
 * fake local mode that the UI announces on screen. There is no third option
 * where we quietly point at the wrong project.
 */

export type DataBackend = 'local' | 'firebase'

/*
  Vite's environment, or the process's when there is no Vite.

  `import.meta.env` is a build-time substitution and simply does not exist
  when a check script imports this module under Node — so reading a key off it
  threw before any harness could get near the data layer. Falling through to
  `process.env` costs nothing in the browser, where the first one is always
  there, and is what lets the question ritual be walked end to end in a script
  instead of only by hand in a phone.
*/
type Env = Record<string, string | undefined>

/*
  Reached through globalThis rather than named directly, because the browser
  build has no Node types and a bare `process` does not typecheck against
  them. This says the same thing and says it in a way both toolchains accept.
*/
const raw = (import.meta.env ??
  (globalThis as { process?: { env?: Env } }).process?.env ??
  {}) as Env

function required(key: string): string {
  const value = raw[key]
  if (value === undefined || value.trim() === '') {
    throw new ConfigError([key])
  }
  return value.trim()
}

function optional(key: string, fallback: string): string {
  const value = raw[key]
  return value === undefined || value.trim() === '' ? fallback : value.trim()
}

/** A seed number. A non-numeric value falls back rather than becoming NaN. */
function number(key: string, fallback: number): number {
  const value = raw[key]
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export class ConfigError extends Error {
  constructor(public readonly missing: string[]) {
    super(
      `The garden cannot start. Missing configuration:\n` +
        missing.map((k) => `  · ${k}`).join('\n') +
        `\n\nCopy .env.example to .env and fill these in.`,
    )
    this.name = 'ConfigError'
  }
}

/**
 * Which data layer is live. Defaults to 'local' — an in-memory mock that stores
 * nothing anywhere and is labelled as such in the corner of the screen. It is
 * deliberately the *safe* default: the failure mode is "obviously not real",
 * never "looks real, is wrong".
 */
/*
  `?mock=1` puts a development build on the local layer whatever the env says.

  Env files cannot do this from the outside: `.env.local` holds the real keys
  and beats anything handed to the process, so a checker that wants the mock
  has no way to ask for it except by editing the developer's own file. The
  browser checks — `npm run places` — need a garden they can walk into without
  a password, and this is the only door that does not involve touching
  `.env.local`, which has been corrupted once already by a script trying.

  Development only, and one-directional: it can only ever step *down* to the
  mock. There is no query string anywhere that turns the real backend on.
*/
function askedForTheMock(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('mock') === '1'
}

export const DATA_BACKEND: DataBackend =
  optional('VITE_DATA_BACKEND', 'local') === 'firebase' && !askedForTheMock()
    ? 'firebase'
    : 'local'

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  databaseURL: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}

/**
 * Only read when DATA_BACKEND === 'firebase'. Collects every missing key before
 * throwing, so you fix them in one pass instead of one reload at a time.
 */
export function firebaseConfig(): FirebaseConfig {
  const keys = {
    apiKey: 'VITE_FB_API_KEY',
    authDomain: 'VITE_FB_AUTH_DOMAIN',
    projectId: 'VITE_FB_PROJECT_ID',
    databaseURL: 'VITE_FB_DATABASE_URL',
    storageBucket: 'VITE_FB_STORAGE_BUCKET',
    messagingSenderId: 'VITE_FB_MESSAGING_SENDER_ID',
    appId: 'VITE_FB_APP_ID',
  } as const

  const missing = Object.values(keys).filter((k) => !raw[k]?.trim())
  if (missing.length > 0) throw new ConfigError(missing)

  return Object.fromEntries(
    Object.entries(keys).map(([field, envKey]) => [field, required(envKey)]),
  ) as unknown as FirebaseConfig
}

/**
 * Public Web Push credential for this Firebase project.
 *
 * Kept optional at application startup: a missing push key must disable one
 * device feature, never keep either person outside the whole garden. The
 * profile sheet names the missing setup when somebody tries to enable it.
 */
export function firebaseVapidKey(): string {
  return optional('VITE_FB_VAPID_KEY', '').trim()
}

/**
 * Which sign-in address is which light.
 *
 * There are two people here forever, so the mapping is configuration rather
 * than a lookup: whoever signs in is matched against these two addresses, and
 * anyone else is refused. No third person can quietly become a third light.
 *
 * Compared case-insensitively — nobody types their own address the same way
 * twice, and an account they can't sign into is a bad first impression.
 */
export function whichLight(email: string | null): 'warm' | 'cool' | null {
  const at = (email ?? '').trim().toLowerCase()
  if (at === '') return null
  const warm = optional('VITE_WARM_EMAIL', '').toLowerCase()
  const cool = optional('VITE_COOL_EMAIL', '').toLowerCase()
  if (warm !== '' && at === warm) return 'warm'
  if (cool !== '' && at === cool) return 'cool'
  return null
}

/** Both addresses must be set before the real backend can tell anyone apart. */
export function missingLightEmails(): string[] {
  return ['VITE_WARM_EMAIL', 'VITE_COOL_EMAIL'].filter((k) => !raw[k]?.trim())
}

/**
 * Seed values only. Once someone has been in the garden, their name, city and
 * timezone live in the data layer and are edited from their profile — these are
 * just what gets written on the very first run.
 */
export const SEED = {
  warm: {
    name: optional('VITE_WARM_NAME', 'Warm'),
    city: optional('VITE_WARM_CITY', 'Kano'),
    timeZone: optional('VITE_WARM_TZ', 'Africa/Lagos'),
    // Kano. Editable in the app — this is only what gets written on first run.
    lat: number('VITE_WARM_LAT', 12.0022),
    lon: number('VITE_WARM_LON', 8.592),
  },
  cool: {
    name: optional('VITE_COOL_NAME', 'Cool'),
    city: optional('VITE_COOL_CITY', 'Lagos'),
    timeZone: optional('VITE_COOL_TZ', 'Africa/Lagos'),
    // Lagos.
    lat: number('VITE_COOL_LAT', 6.5244),
    lon: number('VITE_COOL_LON', 3.3792),
  },
  /** ISO 4217. Everything in the pot is held in this currency. */
  potCurrency: optional('VITE_POT_CURRENCY', 'NGN'),
} as const

/** Shown in the corner so it is never ambiguous which backend is live. */
export const BACKEND_LABEL =
  DATA_BACKEND === 'local' ? 'local · nothing is saved' : 'connected'
