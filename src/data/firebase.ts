/**
 * The real data layer.
 *
 * Same contract as the local mock (see DataLayer in types.ts) — nothing above
 * this folder knows which one it is talking to. That is the whole point of the
 * seam: if Firestore turns out not to reach mainland China, this file gets
 * replaced and the garden does not change.
 *
 * Two stores, on purpose:
 *
 *   Firestore  — everything that must survive. Letters, contributions,
 *                profiles, the pot. Written rarely, read live.
 *   Realtime DB — where the two of you are standing. Written several times a
 *                second, never kept. Firestore would be both slow and
 *                expensive at that rate, and only RTDB has onDisconnect(),
 *                which is the only honest way to know someone has gone: a
 *                phone that goes into a tunnel never gets to say goodbye.
 *
 * Everything that has to agree between two devices uses `now()`, which is the
 * server's clock corrected for this device's drift — never Date.now().
 */

import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  deleteDoc,
  deleteField,
  orderBy,
  query,
  limit as fsLimit,
  serverTimestamp,
  setDoc,
  updateDoc,
  runTransaction,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
/*
  The third store, and the only one that holds bytes.

  Firestore documents are capped at a megabyte and are the wrong shape for
  binary anyway; Storage is a bucket with its own rules file. It is imported
  here and nowhere else, which is the point of the seam — nothing above this
  folder knows the Glasshouse and the Stars' brief voice-lights are backed by
  a bucket rather than by IndexedDB.
*/
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes,
  type FirebaseStorage,
} from 'firebase/storage'
import {
  get as rtdbGet,
  getDatabase,
  onDisconnect,
  onValue,
  ref,
  serverTimestamp as rtdbTimestamp,
  set as rtdbSet,
  type Database,
} from 'firebase/database'
import { SEED, firebaseConfig, whichLight } from '@/config'
import { convert } from './money'
import { localDateKey } from '@/systems/time'
import {
  GROWN_DAYS,
  USER_IDS,
  type Contribution,
  type Decor,
  type DataLayer,
  type Letter,
  type Locks,
  type Memory,
  type Message,
  type Money,
  type Move,
  type Pot,
  type Presence,
  type Track,
  type Profile,
  type UserId,
  type WorldState,
  type QuestionAnswer,
  type QuestionRound,
  type VoiceLight,
} from './types'
import { AMBIENCE_KEYS } from './types'
import { newId } from './ids'
import {
  QUESTION_DAY,
  QUESTION_PROMPTS,
  questionHash,
} from './questionPrompts'

// ---------------------------------------------------------------------------
// Where things live
// ---------------------------------------------------------------------------

/**
 * One document holds the small, singular things — the pot's currency and goal,
 * the pollen, the date the two of you were first here together. They change
 * rarely and are always read together, so splitting them would buy nothing and
 * cost a listener each.
 */
const WORLD_DOC = ['world', 'ours'] as const
const PROFILES = 'profiles'
const LETTERS = 'letters'
const CONTRIBUTIONS = 'contributions'
/** One document per round; one document per move underneath it. See below. */
const TRACKS = 'tracks'

/** What `storage.rules` will accept for `music/`. Kept in step by hand. */
const MUSIC_MAX = 25 * 1024 * 1024
const MESSAGES = 'messages'
const MEMORIES = 'memories'
const ROUNDS = 'rounds'
const PLANTS = 'plants'
const DECOR = 'decor'
const MOVES = 'moves'
const QUESTION_ROUNDS = 'questionRounds'
const QUESTION_ANSWERS = 'answers'
const QUESTION_SEEDS = 'questionSeeds'
const VOICE_LIGHTS = 'voiceLights'
const VOICE_LIGHT_CONFIG = 'voiceLightConfig'
const RALLY_TUNING = 'rallyTuning'
const AMBIENCE_TUNING = 'ambienceTuning'
/** Which games and roads are shut, and to whom. One document: `ours`. */
const LOCKS = 'locks'

/** Presence is per person, under a path only that person may write. */
const presencePath = (id: UserId) => `presence/${id}`

/**
 * How often a moving body is published, in milliseconds.
 *
 * The camera runs at sixty frames a second; sending sixty positions a second
 * would be several million writes a month for a walk in a garden. Six a second
 * is plenty — the other person's light is interpolated between them, and at
 * walking pace nobody can tell.
 */
const PRESENCE_INTERVAL = 160

/**
 * And how often while a car is on the road.
 *
 * ---------------------------------------------------------------------------
 * A body walking a garden and a car at a hundred and forty are not the same
 * question. Six a second is a metre and a half between updates at racing speed,
 * and while the smoother carries her *along* the road between them, it does not
 * guess at her steering — a car changing lane is doing something deliberate,
 * and extrapolating that swings her into the rock. So the width of the road and
 * the angle of the car are always up to a sixth of a second stale, which at
 * speed is what reads as her wobbling rather than driving.
 *
 * Sixteen a second, and only while `driving` is in the patch. Everything else
 * in the garden keeps the walking rate.
 *
 * **What it costs, since that was the question.** The whole presence object is
 * about 215 bytes, so this is roughly 3.5 KB a second while a car is moving,
 * and a two-minute race is about 0.9 MB downloaded across the pair of you. The
 * Realtime Database is billed on download, and the free allowance is 10 GB a
 * month — something like eleven thousand races. Past that it is five dollars a
 * gigabyte, so a thousand races is about four and a half dollars. Racing every
 * evening does not reach the free allowance.
 *
 * Which is worth saying plainly: the rate was never what made her car lag. See
 * the note in `Race.tsx` on the repeat that was telling the smoother she had
 * stopped. This is the polish on top of that fix, and it is affordable.
 * ---------------------------------------------------------------------------
 */
const RACE_INTERVAL = 60

/** After this long without a word, treat them as gone even if onDisconnect didn't fire. */
const PRESENCE_STALE = 45_000

// ---------------------------------------------------------------------------
// Errors that are worth reading
// ---------------------------------------------------------------------------

export class NotOneOfUs extends Error {
  constructor(public readonly email: string) {
    super(
      `${email} is signed in, but it isn't either of the two addresses this ` +
        `garden knows (VITE_WARM_EMAIL, VITE_COOL_EMAIL). Nobody else can be a ` +
        `light here.`,
    )
    this.name = 'NotOneOfUs'
  }
}

// ---------------------------------------------------------------------------
// Seed state — what the world looks like before anything has been written
// ---------------------------------------------------------------------------

function seedProfile(id: UserId): Profile {
  const s = SEED[id]
  return {
    id,
    name: s.name || (id === 'warm' ? 'Warm' : 'Cool'),
    city: s.city,
    lat: s.lat,
    lon: s.lon,
    timeZone: s.timeZone,
  }
}

function offlinePresence(id: UserId): Presence {
  return {
    id,
    online: false,
    placeId: 'clearing',
    position: [0, 0, 0],
    heading: 0,
    lastSeen: 0,
  }
}

function emptyWorld(): WorldState {
  return {
    profiles: { warm: seedProfile('warm'), cool: seedProfile('cool') },
    presence: { warm: offlinePresence('warm'), cool: offlinePresence('cool') },
    pot: { currency: SEED.potCurrency, goal: null },
    contributions: [],
    pollen: { total: 0, unlocked: [] },
    letters: [],
    plants: [],
    decor: [],
    today: null,
    questions: {
      current: null,
      history: [],
      availableSeeds: 0,
      queued: 0,
      nextAt: null,
      loaded: false,
    },
    firstArrivalAt: null,
    lastReadAt: { warm: 0, cool: 0 },
  }
}

// ---------------------------------------------------------------------------
// Shaping what comes back
// ---------------------------------------------------------------------------

/**
 * Firestore hands back `unknown`. Everything below is defensive on purpose: a
 * document written by an older version of this app, or half-written by a
 * client that lost signal, must not take the garden down. A letter with no
 * body is dropped; a letter with a missing position is not.
 */
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const str = (v: unknown, fallback: string): string =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : fallback

const userId = (v: unknown): UserId => (v === 'cool' ? 'cool' : 'warm')

function vec3(v: unknown): [number, number, number] {
  if (Array.isArray(v) && v.length >= 3) {
    return [num(v[0], 0), num(v[1], 0), num(v[2], 0)]
  }
  return [0, 0, 0]
}

function money(v: unknown, fallbackCurrency: string): Money {
  const o = (v ?? {}) as Record<string, unknown>
  return {
    minor: Math.round(num(o.minor, 0)),
    currency: str(o.currency, fallbackCurrency),
  }
}

function toProfile(id: UserId, data: Record<string, unknown> | undefined): Profile {
  const seed = seedProfile(id)
  if (!data) return seed
  return {
    id,
    name: str(data.name, seed.name),
    city: str(data.city, seed.city),
    // A coordinate that isn't a number is *unknown*, not zero — (0, 0) is a
    // real place in the Atlantic and would draw a confident wrong distance.
    lat: typeof data.lat === 'number' && Number.isFinite(data.lat) ? data.lat : null,
    lon: typeof data.lon === 'number' && Number.isFinite(data.lon) ? data.lon : null,
    timeZone: str(data.timeZone, seed.timeZone),
  }
}

function toLetter(id: string, d: Record<string, unknown>): Letter | null {
  const body = typeof d.body === 'string' ? d.body.trim() : ''
  if (body === '') return null
  return {
    id,
    by: userId(d.by),
    body,
    placeId: str(d.placeId, 'clearing'),
    position: vec3(d.position),
    at: num(d.at, 0),
    readAt: typeof d.readAt === 'number' ? d.readAt : null,
  }
}

function toContribution(
  id: string,
  d: Record<string, unknown>,
  potCurrency: string,
): Contribution | null {
  const amount = money(d.amount, potCurrency)
  if (amount.minor === 0) return null
  const rateUsed = num(d.rateUsed, 1)
  return {
    id,
    by: userId(d.by),
    amount,
    // Recomputed from the stored rate if the stored total is missing, never
    // from a live rate — history must not re-value itself.
    inPotCurrency:
      d.inPotCurrency === undefined
        ? convert(amount, potCurrency, rateUsed)
        : money(d.inPotCurrency, potCurrency),
    rateUsed,
    ...(typeof d.note === 'string' && d.note.trim() !== ''
      ? { note: d.note.trim() }
      : {}),
    at: num(d.at, 0),
  }
}

interface PrivateQuestionSeed {
  id: string
  prompt: string
  contributionId: string | null
  availableAfter: number
  usedAt: number | null
}

function toQuestionRound(id: string, d: Record<string, unknown>): QuestionRound | null {
  const prompt = str(d.prompt, '')
  if (prompt === '') return null
  return {
    id,
    prompt,
    openedAt: num(d.openedAt, 0),
    completedAt: typeof d.completedAt === 'number' ? d.completedAt : null,
    answered: {
      warm: d.answeredWarm === true,
      cool: d.answeredCool === true,
    },
    answers: {},
  }
}

function toQuestionAnswer(d: Record<string, unknown> | undefined): QuestionAnswer | null {
  if (!d) return null
  const body = str(d.body, '')
  if (body === '') return null
  return { by: userId(d.by), body, at: num(d.at, 0) }
}

// ---------------------------------------------------------------------------
// The layer
// ---------------------------------------------------------------------------

export interface FirebaseHandles {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  rtdb: Database
  store: FirebaseStorage
}

let handles: FirebaseHandles | null = null

/** Started once, on demand. Sign-in needs these before the layer exists. */
export function firebase(): FirebaseHandles {
  if (handles) return handles
  const app = initializeApp(firebaseConfig())
  handles = {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    rtdb: getDatabase(app),
    store: getStorage(app),
  }
  return handles
}

export function watchSignIn(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(firebase().auth, cb)
}

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(firebase().auth, email.trim(), password)
}

export async function signOutOfGarden(): Promise<void> {
  await signOut(firebase().auth)
}

export interface FirebaseDataLayer extends DataLayer {
  /** Tear down every listener. Called when the signed-in person changes. */
  dispose(): void
}

export function createFirebaseDataLayer(user: User): FirebaseDataLayer {
  const light = whichLight(user.email)
  if (light === null) throw new NotOneOfUs(user.email ?? '(no address)')
  // Re-declared with the narrowed type: `flush` below is a hoisted function
  // declaration, and the compiler won't carry a narrowing into one of those.
  const me: UserId = light

  const { db, rtdb, store } = firebase()

  let state = emptyWorld()
  const listeners = new Set<(s: WorldState) => void>()
  const unsubscribes: (() => void)[] = []

  /**
   * Download URLs, by storage path, for as long as the tab is open.
   *
   * The promise is cached rather than the string, so two panes coming into
   * range in the same frame share one round trip instead of racing.
   */
  const pictures = new Map<string, Promise<string>>()
  const voiceUrls = new Map<string, Promise<string>>()

  /**
   * The server's clock minus this device's. Phones are routinely a minute out,
   * and "who wrote first" and "are they still here" both fall apart when two
   * devices disagree about the time.
   */
  let clockSkew = 0

  /** Presence arrives many times a second and must not thrash React. */
  let presenceFrame = 0

  function emit() {
    for (const l of listeners) l(state)
  }

  function commit(next: WorldState) {
    state = next
    emit()
  }

  /** Presence-only change: coalesce into the next frame. */
  function commitPresence(next: WorldState) {
    state = next
    if (presenceFrame) return
    presenceFrame = requestAnimationFrame(() => {
      presenceFrame = 0
      emit()
    })
  }

  const now = () => Date.now() + clockSkew

  /**
   * How many moves this device has written to a round.
   *
   * Kept here rather than counted from the snapshot: the snapshot arrives
   * asynchronously, and typing two guesses quickly would otherwise write both
   * at the same seq and lose one.
   */
  const written = new Map<string, number>()
  function nextSeq(roundId: string): number {
    const fromServer = seenSeq.get(roundId) ?? -1
    const local = written.get(roundId) ?? -1
    const next = Math.max(fromServer, local) + 1
    written.set(roundId, next)
    return next
  }
  /** The highest seq of mine the server has confirmed, per round. */
  const seenSeq = new Map<string, number>()

  // ---- the question vine -------------------------------------------------
  // The seed documents stay private to their planter. Shared rounds contain
  // the prompt but deliberately carry no source or author field.
  let questionRounds: QuestionRound[] = []
  let questionSeeds: PrivateQuestionSeed[] = []
  let questionRoundsLoaded = false
  let questionSeedsLoaded = false
  let questionRevision = 0

  async function refreshQuestions() {
    const revision = ++questionRevision
    const hydrated = await Promise.all(
      questionRounds.map(async (round): Promise<QuestionRound> => {
        const answers: QuestionRound['answers'] = {}
        const both = round.answered.warm && round.answered.cool
        const wanted = both ? USER_IDS : round.answered[me] ? [me] : []
        await Promise.all(
          wanted.map(async (who) => {
            try {
              const snap = await getDoc(
                doc(db, QUESTION_ROUNDS, round.id, QUESTION_ANSWERS, who),
              )
              const answer = toQuestionAnswer(
                snap.data() as Record<string, unknown> | undefined,
              )
              if (answer) answers[who] = answer
            } catch {
              // Before both have answered, the other document is expected to
              // be permission-denied. An empty slot is the sealed state.
            }
          }),
        )
        return { ...round, answers }
      }),
    )
    if (revision !== questionRevision) return

    const spent = new Set(
      questionSeeds
        .filter((seed) => seed.contributionId)
        .map((seed) => seed.contributionId as string),
    )
    const current = hydrated.at(-1) ?? null
    commit({
      ...state,
      questions: {
        current,
        history: hydrated.filter((round) => round.completedAt !== null),
        availableSeeds: state.contributions.filter(
          (entry) => entry.by === me && entry.inPotCurrency.minor > 0 && !spent.has(entry.id),
        ).length,
        queued: questionSeeds.filter((seed) => seed.usedAt === null).length,
        nextAt: current?.completedAt ? current.openedAt + QUESTION_DAY : null,
        loaded: questionRoundsLoaded && questionSeedsLoaded,
      },
    })
  }

  // ---- clock ---------------------------------------------------------------
  unsubscribes.push(
    onValue(ref(rtdb, '.info/serverTimeOffset'), (snap) => {
      const offset = snap.val()
      if (typeof offset === 'number' && Number.isFinite(offset)) clockSkew = offset
    }),
  )

  // ---- the world doc -------------------------------------------------------
  unsubscribes.push(
    onSnapshot(doc(db, ...WORLD_DOC), (snap) => {
      const d = (snap.data() ?? {}) as Record<string, unknown>
      const pot = (d.pot ?? {}) as Record<string, unknown>
      const currency = str(pot.currency, SEED.potCurrency)
      const goalRaw = pot.goal as Record<string, unknown> | null | undefined
      const pollen = (d.pollen ?? {}) as Record<string, unknown>

      commit({
        ...state,
        pot: {
          currency,
          goal:
            goalRaw && typeof goalRaw === 'object'
              ? {
                  amount: money(goalRaw.amount, currency),
                  label: str(goalRaw.label, ''),
                }
              : null,
        },
        pollen: {
          total: Math.max(0, Math.round(num(pollen.total, 0))),
          unlocked: Array.isArray(pollen.unlocked)
            ? pollen.unlocked.filter((x): x is string => typeof x === 'string')
            : [],
        },
        firstArrivalAt:
          typeof d.firstArrivalAt === 'number' ? d.firstArrivalAt : null,
        lastReadAt: {
          warm: num((d.lastReadAt as Record<string, unknown>)?.warm, 0),
          cool: num((d.lastReadAt as Record<string, unknown>)?.cool, 0),
        },
      })
    }),
  )

  // ---- profiles ------------------------------------------------------------
  unsubscribes.push(
    onSnapshot(collection(db, PROFILES), (snap) => {
      const next = { ...state.profiles }
      for (const id of USER_IDS) {
        const found = snap.docs.find((docSnap) => docSnap.id === id)
        next[id] = toProfile(id, found?.data() as Record<string, unknown> | undefined)
      }
      commit({ ...state, profiles: next })
    }),
  )

  // ---- letters -------------------------------------------------------------
  unsubscribes.push(
    onSnapshot(collection(db, LETTERS), (snap) => {
      const letters = snap.docs
        .map((d) => toLetter(d.id, d.data() as Record<string, unknown>))
        .filter((l): l is Letter => l !== null)
        // Oldest first: the Reading Tree hangs them in the order they were left,
        // and a letter that moved because another arrived would be wrong.
        .sort((a, b) => a.at - b.at)
      commit({ ...state, letters })
    }),
  )

  // ---- the living garden ---------------------------------------------------
  unsubscribes.push(
    onSnapshot(collection(db, PLANTS), (snap) => {
      const plants = snap.docs
        .map((d) => {
          const v = d.data() as Record<string, unknown>
          return {
            id: d.id,
            species: v.species === 'tree' ? ('tree' as const) : ('flower' as const),
            by: userId(v.by),
            position: vec3(v.position),
            plantedAt: num(v.plantedAt, 0),
            growthDays: Math.max(0, Math.min(GROWN_DAYS, Math.round(num(v.growthDays, 0)))),
            lastWateredDay:
              typeof v.lastWateredDay === 'string' ? v.lastWateredDay : null,
            lastWateredAt: num(v.lastWateredAt, 0),
          }
        })
        .sort((a, b) => a.plantedAt - b.plantedAt)
      commit({ ...state, plants })
    }),
  )

  unsubscribes.push(
    onSnapshot(collection(db, DECOR), (snap) => {
      const decor = snap.docs
        .map((d) => {
          const v = d.data() as Record<string, unknown>
          const kind = v.kind as Decor['kind']
          if (kind !== 'lamp' && kind !== 'bench' && kind !== 'swing' && kind !== 'carpet') {
            return null
          }
          return {
            id: d.id,
            kind,
            by: userId(v.by),
            position: vec3(v.position),
            facing: num(v.facing, 0),
            at: num(v.at, 0),
          }
        })
        .filter((d): d is NonNullable<typeof d> => d !== null)
        .sort((a, b) => a.at - b.at)
      commit({ ...state, decor })
    }),
  )

  // ---- contributions -------------------------------------------------------
  unsubscribes.push(
    onSnapshot(collection(db, CONTRIBUTIONS), (snap) => {
      const contributions = snap.docs
        .map((d) =>
          toContribution(d.id, d.data() as Record<string, unknown>, state.pot.currency),
        )
        .filter((c): c is Contribution => c !== null)
        .sort((a, b) => a.at - b.at)
      commit({ ...state, contributions })
      void refreshQuestions()
    }),
  )

  // ---- the question vine -------------------------------------------------
  unsubscribes.push(
    onSnapshot(
      query(collection(db, QUESTION_ROUNDS), orderBy('openedAt', 'asc')),
      (snap) => {
        questionRounds = snap.docs
          .map((entry) =>
            toQuestionRound(entry.id, entry.data() as Record<string, unknown>),
          )
          .filter((round): round is QuestionRound => round !== null)
        questionRoundsLoaded = true
        void refreshQuestions()
      },
    ),
  )

  /*
    Only mine. This is part of the anonymity model rather than a bandwidth
    optimisation: the other person's planted prompt must never arrive on this
    device while it is still in the pool. When it opens, the shared round has
    only the words and no field saying where they came from.
  */
  unsubscribes.push(
    onSnapshot(
      query(collection(db, QUESTION_SEEDS), where('by', '==', me)),
      (snap) => {
        questionSeeds = snap.docs.flatMap((entry) => {
          const raw = entry.data() as Record<string, unknown>
          const prompt = str(raw.prompt, '')
          if (prompt === '') return []
          return [{
            id: entry.id,
            prompt,
            contributionId:
              typeof raw.contributionId === 'string' ? raw.contributionId : null,
            availableAfter: num(raw.availableAfter, 0),
            usedAt: typeof raw.usedAt === 'number' ? raw.usedAt : null,
          } satisfies PrivateQuestionSeed]
        })
        questionSeedsLoaded = true
        void refreshQuestions()
      },
    ),
  )

  // ---- presence ------------------------------------------------------------
  for (const id of USER_IDS) {
    unsubscribes.push(
      onValue(ref(rtdb, presencePath(id)), (snap) => {
        const d = (snap.val() ?? null) as Record<string, unknown> | null
        if (d === null) {
          commitPresence({
            ...state,
            presence: { ...state.presence, [id]: offlinePresence(id) },
          })
          return
        }
        const lastSeen = num(d.lastSeen, 0)
        const them: Presence = {
          id,
          // Both conditions: onDisconnect usually clears this, but a phone
          // that dies outright leaves the last position behind forever.
          online: d.online === true && now() - lastSeen < PRESENCE_STALE,
          placeId: str(d.placeId, 'clearing'),
          position: vec3(d.position),
          heading: num(d.heading, 0),
          lastSeen,
        }
        // Absent rather than present-and-empty, so `if (them.racing)` reads the
        // same here as it does against the mock. See the note in `flush`.
        if (typeof d.racing === 'string' && d.racing !== '') them.racing = d.racing
        if (typeof d.driving === 'string' && d.driving !== '') them.driving = d.driving
        if (typeof d.looking === 'string' && d.looking !== '') them.looking = d.looking

        commitPresence({
          ...state,
          presence: { ...state.presence, [id]: them },
        })
      }),
    )
  }

  // ---- publishing where I am ----------------------------------------------
  const mine = ref(rtdb, presencePath(me))
  let pending: Partial<Omit<Presence, 'id'>> = {}
  let hasPending = false
  let lastSent = 0
  let sendTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Say I've gone, the moment the connection drops rather than whenever the
   * tab happens to close. Re-armed on every reconnect, because onDisconnect is
   * registered per connection and a dropped socket forgets it.
   */
  unsubscribes.push(
    onValue(ref(rtdb, '.info/connected'), (snap) => {
      if (snap.val() !== true) return
      void onDisconnect(mine)
        .set({ online: false, lastSeen: rtdbTimestamp() })
        .then(() => flush(true))
    }),
  )

  function flush(force = false) {
    if (!hasPending && !force) return
    hasPending = false
    lastSent = Date.now()
    const here = state.presence[me]
    /*
      The two live invitations.

      **Neither of these was being sent.** `racing` has been declared on
      Presence, documented, and validated in database.rules.json since the day
      live rounds were built — and this function, the only thing that ever
      writes presence, never included it. So "roll together" worked perfectly
      against the mock, where presence is a local object, and would have
      silently done nothing at all the first time the two of you tried it for
      real. Nothing pointed at it because the real layer has never been run.

      `looking` is the Glasshouse's version — the memory you have open — and it
      is added here at the same time so that the next person to add a live
      field has a shape to copy rather than a gap to fall into.

      RTDB rejects `undefined` outright, so an absent one is left out of the
      object entirely rather than written as null. `null` would be a value that
      passes `.validate` on a string field and then reads back as "".
    */
    const racing = pending.racing ?? here.racing
    const looking = pending.looking ?? here.looking
    const driving = pending.driving ?? here.driving

    const body = {
      online: true,
      placeId: pending.placeId ?? here.placeId,
      position: pending.position ?? here.position,
      heading: pending.heading ?? here.heading,
      ...(racing ? { racing } : {}),
      ...(looking ? { looking } : {}),
      ...(driving ? { driving } : {}),
      lastSeen: rtdbTimestamp(),
    }
    // Fire and forget. A dropped presence write is not worth a retry — another
    // one is a sixth of a second away.
    void rtdbSet(mine, body).catch(() => {})
  }

  return {
    me,

    subscribe(listener) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },

    snapshot: () => state,

    now,

    async setProfile(id, patch) {
      // Only your own. The rules enforce this too; refusing here as well means
      // the mistake surfaces as an obvious bug rather than a silent denial.
      if (id !== me) {
        throw new Error(`Refusing to edit ${id}'s profile — you are ${me}.`)
      }
      await setDoc(doc(db, PROFILES, id), patch, { merge: true })
    },

    publishPresence(patch) {
      pending = { ...pending, ...patch }
      hasPending = true

      // Locally, immediately — your own light should never lag your own body.
      commitPresence({
        ...state,
        presence: {
          ...state.presence,
          [me]: { ...state.presence[me], ...patch, online: true, lastSeen: now() },
        },
      })

      // A car on the road gets the faster cadence; everything else in the
      // garden keeps the walking one. See `RACE_INTERVAL`.
      const wait = patch.driving ? RACE_INTERVAL : PRESENCE_INTERVAL
      const since = Date.now() - lastSent
      if (since >= wait) {
        flush()
        return
      }
      if (sendTimer) return
      sendTimer = setTimeout(() => {
        sendTimer = null
        flush()
      }, wait - since)
    },

    async writeLetter({ body, placeId, position }) {
      const trimmed = body.trim()
      if (trimmed === '') return
      const id = newId()
      await setDoc(doc(db, LETTERS, id), {
        by: me,
        body: trimmed,
        placeId,
        position,
        at: now(),
        // Your own letters are never unread. Only theirs glow.
        readAt: now(),
        writtenAt: serverTimestamp(),
      })
    },

    async markLetterRead(id) {
      const existing = state.letters.find((l) => l.id === id)
      // Only theirs, and only once — re-marking would move the moment you
      // first read it every time you opened it again.
      if (!existing || existing.by === me || existing.readAt !== null) return
      await updateDoc(doc(db, LETTERS, id), { readAt: now() })
    },

    async plantSeed({ species, position }) {
      const id = newId()
      await setDoc(doc(db, PLANTS, id), {
        species,
        by: me,
        position,
        plantedAt: now(),
        growthDays: 0,
        lastWateredDay: null,
        lastWateredAt: now(),
      })
    },

    async waterPlant(id) {
      const existing = state.plants.find((p) => p.id === id)
      if (!existing) return
      const today = localDateKey(state.profiles[me].timeZone)
      const grows =
        existing.lastWateredDay !== today && existing.growthDays < GROWN_DAYS
      await updateDoc(doc(db, PLANTS, id), {
        growthDays: existing.growthDays + (grows ? 1 : 0),
        lastWateredDay: today,
        lastWateredAt: now(),
      })
    },

    async placeDecor({ kind, position, facing }) {
      const id = newId()
      await setDoc(doc(db, DECOR, id), {
        kind,
        by: me,
        position,
        facing,
        at: now(),
      })
    },

    async addContribution({ amount, rateUsed, note }) {
      const id = newId()
      await setDoc(doc(db, CONTRIBUTIONS, id), {
        by: me,
        amount,
        inPotCurrency: convert(amount, state.pot.currency, rateUsed),
        rateUsed,
        ...(note ? { note } : {}),
        at: now(),
      })
    },

    async setPotGoal(goal: Pot['goal']) {
      await setDoc(doc(db, ...WORLD_DOC), { pot: { goal } }, { merge: true })
    },

    // ---- the question vine ------------------------------------------------

    async ensureQuestion() {
      const at = now()
      const latest = await getDocs(
        query(collection(db, QUESTION_ROUNDS), orderBy('openedAt', 'desc'), fsLimit(1)),
      )
      const latestDoc = latest.docs[0]
      const current = latestDoc
        ? toQuestionRound(
            latestDoc.id,
            latestDoc.data() as Record<string, unknown>,
          )
        : null
      if (current) {
        const both = current.answered.warm && current.answered.cool
        if (!both || at < current.openedAt + QUESTION_DAY) return
      }

      // Only this person's private pool is queryable. Her planted prompt never
      // reaches this device before it becomes a source-less shared round.
      const seedSnap = await getDocs(
        query(collection(db, QUESTION_SEEDS), where('by', '==', me)),
      )
      const eligible = seedSnap.docs.flatMap((entry) => {
        const raw = entry.data() as Record<string, unknown>
        const prompt = str(raw.prompt, '')
        if (
          prompt === '' ||
          typeof raw.usedAt === 'number' ||
          num(raw.availableAfter, 0) > at
        ) return []
        return [{ id: entry.id, prompt }]
      })

      const ordinal = questionRounds.length
      const roll = questionHash(`${Math.floor(at / QUESTION_DAY)}:${ordinal}:${me}`)
      const planted = eligible.length > 0 && roll % 3 === 0
        ? eligible[roll % eligible.length]
        : null
      const usedPrompts = new Set(questionRounds.map((round) => round.prompt))
      const unused = QUESTION_PROMPTS.filter((prompt) => !usedPrompts.has(prompt))
      const pool = unused.length > 0 ? unused : [...QUESTION_PROMPTS]
      const prompt = planted?.prompt ?? pool[questionHash(`tree:${ordinal}`) % pool.length]

      // One deterministic document per UTC day. If both phones arrive at the
      // same instant, one create wins; the other cannot overwrite it because
      // question rounds are create-only in the rules.
      const id = `question-${Math.floor(at / QUESTION_DAY)}`
      const roundRef = doc(db, QUESTION_ROUNDS, id)
      const body = {
        prompt,
        openedAt: at,
        answeredWarm: false,
        answeredCool: false,
      }
      try {
        if (planted) {
          const batch = writeBatch(db)
          batch.set(roundRef, body)
          batch.update(doc(db, QUESTION_SEEDS, planted.id), { usedAt: at })
          await batch.commit()
        } else {
          await setDoc(roundRef, body)
        }
      } catch (error) {
        // A simultaneous opener is success, not an error. Anything else still
        // needs to surface through the normal trouble path.
        if (!(await getDoc(roundRef)).exists()) throw error
      }
    },

    async answerQuestion(roundId, body) {
      const text = body.trim()
      if (text === '') return
      const roundRef = doc(db, QUESTION_ROUNDS, roundId)
      const answerRef = doc(db, QUESTION_ROUNDS, roundId, QUESTION_ANSWERS, me)
      await runTransaction(db, async (transaction) => {
        const [roundSnap, answerSnap] = await Promise.all([
          transaction.get(roundRef),
          transaction.get(answerRef),
        ])
        if (!roundSnap.exists() || answerSnap.exists()) return
        const raw = roundSnap.data() as Record<string, unknown>
        const mine = me === 'warm' ? raw.answeredWarm : raw.answeredCool
        if (mine === true) return
        const otherAnswered = me === 'warm'
          ? raw.answeredCool === true
          : raw.answeredWarm === true
        const at = now()
        transaction.set(answerRef, { by: me, body: text, at })
        transaction.update(roundRef, {
          [me === 'warm' ? 'answeredWarm' : 'answeredCool']: true,
          ...(otherAnswered ? { completedAt: at } : {}),
        })
      })
    },

    async plantQuestion(prompt) {
      const text = prompt.trim()
      if (text === '') return
      const spent = new Set(
        questionSeeds
          .filter((seed) => seed.contributionId)
          .map((seed) => seed.contributionId as string),
      )
      const contribution = state.contributions.find(
        (entry) => entry.by === me && entry.inPotCurrency.minor > 0 && !spent.has(entry.id),
      )
      if (!contribution) throw new Error('There is no question seed waiting to be planted.')
      const plantedAt = now()
      const delayDays = 2 + (questionHash(contribution.id) % 6)
      await setDoc(doc(db, QUESTION_SEEDS, contribution.id), {
        by: me,
        prompt: text,
        contributionId: contribution.id,
        plantedAt,
        availableAfter: plantedAt + delayDays * QUESTION_DAY,
      })
    },

    async plantAdminQuestion(prompt) {
      const text = prompt.trim()
      if (text === '') return
      if (me !== 'warm') throw new Error('The control-room question pool belongs to warm.')
      const plantedAt = now()
      await setDoc(doc(db, QUESTION_SEEDS, `admin-${newId()}`), {
        by: me,
        admin: true,
        prompt: text,
        plantedAt,
        availableAfter: plantedAt + QUESTION_DAY,
      })
    },

    async addPollen(amount) {
      // Read-then-write rather than increment(): pollen is shared and rarely
      // touched, and a plain number is far easier to reason about in the rules
      // than a sentinel. Revisit if two people ever earn it at the same instant.
      const snap = await getDoc(doc(db, ...WORLD_DOC))
      const current = num(
        ((snap.data()?.pollen ?? {}) as Record<string, unknown>).total,
        0,
      )
      await setDoc(
        doc(db, ...WORLD_DOC),
        { pollen: { total: Math.max(0, current + amount) } },
        { merge: true },
      )
    },

    // ---- games -------------------------------------------------------------
    //
    // A round is a document, and each move is a document *under* it. That
    // shape is the whole seal: the rules can allow reading her move only when
    // yours already exists, which they cannot do if both moves live in one
    // document. The server withholds it; the app never has it to leak.

    // ---- the music ---------------------------------------------------------

    watchTracks(listener) {
      return onSnapshot(collection(db, TRACKS), (snap) => {
        const tracks = snap.docs
          .map((d) => {
            const raw = d.data() as Record<string, unknown>
            const title = str(raw.title, '')
            if (title === '') return null
            return {
              id: d.id,
              title,
              artist: str(raw.artist, ''),
              by: userId(raw.by),
              // 0 means "not known yet" — never guess a length.
              duration: Math.max(0, num(raw.duration, 0)),
              url: typeof raw.url === 'string' && raw.url !== '' ? raw.url : null,
            } satisfies Track
          })
          .filter((t): t is Track => t !== null)
          .sort((a, b) => a.title.localeCompare(b.title))
        listener(tracks)
      })
    },

    async addTrack({ title, artist, file, duration }) {
      const name = title.trim()
      if (name === '') throw new Error('A song needs a name.')
      if (name.length > 300) throw new Error('That name is too long for the garden to keep.')
      /*
        Checked here as well as in the rules, and the reason is the message.

        The rules will refuse a video file or a forty-megabyte one, but they
        refuse it as a permission error after the whole thing has gone up the
        wire — which on a phone is a minute of waiting to be told "unauthorised"
        about a file whose only problem is that it is a film.
      */
      if (!file.type.startsWith('audio/')) {
        throw new Error(`That is a ${file.type || 'file of some kind'}, not audio.`)
      }
      if (file.size >= MUSIC_MAX) {
        const mb = (file.size / (1024 * 1024)).toFixed(1)
        throw new Error(`That is ${mb}MB. The garden takes songs up to 25MB.`)
      }

      const path = `music/${newId()}`
      await uploadBytes(storageRef(store, path), file, {
        contentType: file.type,
        // A song never changes under its own path, and it is listened to often.
        cacheControl: 'private, max-age=31536000, immutable',
      })
      const url = await getDownloadURL(storageRef(store, path))
      try {
        await setDoc(doc(db, TRACKS, newId()), {
          title: name,
          // The rules on `tracks` check the title and nothing else, so this
          // needs no rules change — see the note on furniture in firestore.rules.
          artist: artist.trim().slice(0, 200),
          by: me,
          duration: Math.max(0, Math.round(duration * 100) / 100),
          url,
          path,
          at: now(),
        })
      } catch (error) {
        /*
          The document is what makes the file a song. Without it the audio is
          twenty megabytes nobody can see, nobody can play and nobody will ever
          think to delete — so if the second half fails, the first half goes.
        */
        await deleteObject(storageRef(store, path)).catch(() => {})
        throw error
      }
    },

    async removeTrack(id) {
      const at = doc(db, TRACKS, id)
      const held = await getDoc(at)
      const path = str(held.data()?.path, '')
      await deleteDoc(at)
      /*
        Document first, then bytes, and it is that way round on purpose. The
        document is what anybody can see; a file left behind is invisible waste,
        but a document pointing at a file that is gone is a song in the list
        that plays silence.
      */
      if (path !== '') await deleteObject(storageRef(store, path)).catch(() => {})
    },

    /*
      What is playing, as one small document.

      It lives on the world doc rather than in its own collection because there
      is exactly one of it, forever, and a collection of one is a lie about the
      shape of the thing.
    */
    watchListening(listener) {
      return onSnapshot(doc(db, ...WORLD_DOC), (snap) => {
        const d = ((snap.data() ?? {}).listening ?? {}) as Record<string, unknown>
        listener({
          trackId: typeof d.trackId === 'string' ? d.trackId : null,
          playing: d.playing === true,
          at: Math.max(0, num(d.at, 0)),
          since: num(d.since, 0),
          by: userId(d.by),
        })
      })
    },

    async setListening(next) {
      await setDoc(
        doc(db, ...WORLD_DOC),
        {
          listening: {
            trackId: next.trackId,
            playing: next.playing,
            at: next.at,
            // The server's clock. Two phones seven timezones apart with a few
            // seconds of drift would otherwise sit at different places in the
            // same song.
            since: now(),
            by: me,
          },
        },
        { merge: true },
      )
    },

    // ---- the Glasshouse ----------------------------------------------------

    /*
      Every memory, oldest first — and no limit, deliberately.

      The Stars is limited because it is speech and there will be tens of
      thousands of lines of it. This is not: a memory is a deliberate act with
      a picture attached, so there will be hundreds over years, and each
      document is a few hundred bytes of which most is the sixteen-pixel
      preview. Pulling all of them is one small read and it is what lets the
      whole building be drawn — every pane in its right colour — before a
      single photograph has been fetched.

      Ordered ascending by the server, because a memory's place in the
      Glasshouse is its index in this list and that place is permanent.
    */
    watchMemories(listener) {
      return onSnapshot(query(collection(db, MEMORIES), orderBy('at', 'asc')), (snap) => {
        const memories = snap.docs
          .map((d) => {
            const raw = d.data() as Record<string, unknown>
            const path = str(raw.path, '')
            const gone = raw.removed as Record<string, unknown> | undefined

            /*
              A memory with no picture and no `removed` is a half-written
              document from an upload that died — dropped here, so nothing
              above ever has to render a pane that cannot exist.

              One that *has* been removed is kept, and has to be: its index in
              this list is a pane's place in the building, and dropping it here
              would renumber every memory after it. See `Memory.removed`.
            */
            if (path === '' && !gone) return null

            const memory: Memory = {
              id: d.id,
              by: userId(raw.by),
              at: num(raw.at, 0),
              width: Math.max(1, num(raw.width, 1)),
              height: Math.max(1, num(raw.height, 1)),
              tint: str(raw.tint, '#4a4a4a'),
              blur: str(raw.blur, ''),
              path,
            }
            if (gone) {
              memory.removed = { by: userId(gone.by), at: num(gone.at, 0) }
              // Nothing else on a removed memory is meaningful, and reading
              // the leftovers back would be the one way a cleared line could
              // reappear.
              return memory
            }
            if (typeof raw.when === 'string' && raw.when !== '') memory.when = raw.when
            if (typeof raw.why === 'string' && raw.why !== '') memory.why = raw.why

            const theirs = raw.theirs as Record<string, unknown> | undefined
            if (theirs && typeof theirs.body === 'string' && theirs.body !== '') {
              memory.theirs = {
                by: userId(theirs.by),
                body: theirs.body,
                at: num(theirs.at, 0),
              }
            }
            return memory
          })
          .filter((m): m is Memory => m !== null)
        listener(memories)
      })
    },

    /*
      The picture goes up first, and the document second.

      That order is the whole of the failure story. A document written first
      and an upload that then fails — a tunnel, a full bucket, a closed tab —
      leaves a permanent pane in the building with nothing behind it, and
      nobody would ever know which memory it had been. This way a failed
      upload leaves an orphaned file, which is invisible, costs a fraction of a
      penny, and can be swept up later. Bytes are the cheap thing to lose.
    */
    async hangMemory(input) {
      const id = newId()
      const path = `memories/${id}.${input.ext}`

      await uploadBytes(storageRef(store, path), input.display, {
        // Whatever was actually encoded — WebP where the browser has it. A
        // mislabelled object is served with the wrong type forever, and the
        // Storage rules check this, so a guess here is an upload that fails.
        contentType: input.type,
        /*
          A year, immutable. Every one of these is written once and never
          changed — the path has a fresh id in it — so there is no version of
          this that can go stale, and the two of you scrolling back through
          years of the Glasshouse should be paying for that bandwidth about
          once.
        */
        cacheControl: 'private, max-age=31536000, immutable',
      })

      const at = now()
      const memory: Memory = {
        id,
        by: me,
        at,
        width: input.width,
        height: input.height,
        tint: input.tint,
        blur: input.blur,
        path,
        ...(input.when?.trim() ? { when: input.when.trim() } : {}),
        ...(input.why?.trim() ? { why: input.why.trim() } : {}),
      }

      // `at` goes up as the server's number rather than serverTimestamp(),
      // because the order of these decides where each pane stands in the
      // building and a pending timestamp reads back as null on the writing
      // device — which would put your own new memory momentarily at the
      // beginning of time, at the far end of the Glasshouse.
      const { id: _id, ...body } = memory
      await setDoc(doc(db, MEMORIES, id), body)
      return memory
    },

    async sayWhatIRemember(id, body) {
      const text = body.trim()
      await updateDoc(
        doc(db, MEMORIES, id),
        text === ''
          ? { theirs: deleteField() }
          : { theirs: { by: me, body: text, at: now() } },
      )
    },

    /*
      Taken out of the glass. The file goes; the document stays, empty.

      The *file* first, and the document second — the same order as hanging one
      and for the same reason. A document cleared before the delete succeeded
      would leave a memory that says it has no picture while the picture is
      still sitting in the bucket, which is the one shape that is both a lie
      and a bill. This way a failed delete leaves the memory whole, and the
      person can simply try again.

      See the note on `Memory.removed` for why this is not a delete.
    */
    async removeMemory(id) {
      const at = doc(db, MEMORIES, id)
      const now = await getDoc(at)
      const raw = now.data() as Record<string, unknown> | undefined
      if (!raw) return
      // Yours only. The rules refuse it too; refusing here as well means the
      // seam behaves the same way against the mock, where there are no rules.
      if (userId(raw.by) !== me) return
      const path = str(raw.path, '')
      if (path === '') return

      await deleteObject(storageRef(store, path)).catch((error: unknown) => {
        // Already gone is not a failure — it is the state we were asking for,
        // and a half-finished removal from a dropped connection has to be
        // finishable rather than stuck.
        const code = (error as { code?: string })?.code
        if (code !== 'storage/object-not-found') throw error
      })
      pictures.delete(path)

      await updateDoc(at, {
        removed: { by: me, at: this.now() },
        // Everything that was *in* the memory. What is left is its number.
        path: '',
        tint: '#000000',
        blur: '',
        when: deleteField(),
        why: deleteField(),
        theirs: deleteField(),
      })
    },

    /*
      A download URL, cached for as long as the tab is open.

      `getDownloadURL` is a round trip to Storage, and a pane coming back into
      range asks for its picture again every time. The URL it returns carries a
      token and does not expire, so caching it costs nothing and saves a
      request per pane per approach.
    */
    pictureUrl(memory) {
      const had = pictures.get(memory.path)
      if (had) return had
      const asking = getDownloadURL(storageRef(store, memory.path)).catch((error) => {
        // Not cached, so a picture that failed once because the phone was in a
        // tunnel is asked for again the next time its pane comes near.
        pictures.delete(memory.path)
        throw error
      })
      pictures.set(memory.path, asking)
      return asking
    },

    // ---- the Stars ---------------------------------------------------------

    /*
      The conversation, newest last.

      Ordered and limited by the server rather than in the client: two people
      over a year is thousands of short strings, and pulling all of them down
      on every reconnect to throw most away is exactly the sort of thing that
      is invisible on a laptop in Lagos and painful on a phone.

      `orderBy('at', 'desc')` with a limit takes the newest N, and they are
      turned back the right way round here — Firestore has no "last N ascending".
    */
    watchMessages(listener, limit = 500) {
      return onSnapshot(
        query(collection(db, MESSAGES), orderBy('at', 'desc'), fsLimit(limit)),
        (snap) => {
          const messages = snap.docs
            .map((d) => {
              const raw = d.data() as Record<string, unknown>
              const body = str(raw.body, '')
              if (body === '') return null
              const raws = raw.hearts as Record<string, unknown> | undefined
              /*
                Absent rather than present-and-undefined.

                `{ replyTo: undefined }` is not the same shape as `{}` to
                TypeScript's optional properties, and a `satisfies Message`
                on the first one fails — which is the type system pointing at
                something real: a message with an explicit undefined reply is
                a message that has been asked about its reply and answered
                "none", and that is not what a message with no reply is.
              */
              const hearts: Message['hearts'] = {}
              if (typeof raws?.warm === 'number') hearts.warm = raws.warm
              if (typeof raws?.cool === 'number') hearts.cool = raws.cool

              const message: Message = { id: d.id, by: userId(raw.by), body, at: num(raw.at, 0) }
              if (typeof raw.replyTo === 'string') message.replyTo = raw.replyTo
              if (hearts.warm !== undefined || hearts.cool !== undefined) message.hearts = hearts
              return message
            })
            .filter((m): m is Message => m !== null)
            .reverse()
          listener(messages)
        },
      )
    },

    async sendMessage(body, replyTo) {
      const text = body.trim()
      if (text === '') return
      const id = newId()
      await setDoc(doc(db, MESSAGES, id), {
        by: me,
        body: text,
        ...(replyTo ? { replyTo } : {}),
        // The server's clock, not this phone's. Two people seven timezones
        // apart with a minute of drift between their devices would otherwise
        // see the conversation in two different orders.
        at: now(),
        sentAt: serverTimestamp(),
      })
      // Saying something is also reading everything up to it.
      await setDoc(
        doc(db, ...WORLD_DOC),
        { lastReadAt: { [me]: now() } },
        { merge: true },
      )
    },

    /*
      One field, merged.

      Written as `hearts.<me>` through `updateDoc` rather than by merging a
      whole `hearts` object, so two people hearting two different messages —
      or the same one — in the same second cannot overwrite each other. The
      rules only ever let you write your own key; see firestore.rules.
    */
    async heartMessage(id, on) {
      await updateDoc(doc(db, MESSAGES, id), {
        [`hearts.${me}`]: on ? now() : deleteField(),
      })
    },

    async markMessagesRead() {
      await setDoc(
        doc(db, ...WORLD_DOC),
        { lastReadAt: { [me]: now() } },
        { merge: true },
      )
    },

    watchVoiceLights(listener) {
      let lights: VoiceLight[] = []
      let limit = 3
      const tell = () => listener({ lights: lights.filter((light) => light.slot < limit), limit })
      const offLights = onSnapshot(collection(db, VOICE_LIGHTS), (snap) => {
        lights = snap.docs.flatMap((entry) => {
          const raw = entry.data() as Record<string, unknown>
          const path = str(raw.path, '')
          const waveform = Array.isArray(raw.waveform)
            ? raw.waveform.filter((value): value is number => typeof value === 'number').slice(0, 48)
            : []
          if (path === '') return []
          return [{
            id: entry.id,
            by: userId(raw.by),
            slot: Math.max(0, Math.round(num(raw.slot, 0))),
            at: num(raw.at, 0),
            duration: Math.max(0, num(raw.duration, 0)),
            path,
            mime: str(raw.mime, 'audio/webm'),
            waveform,
          } satisfies VoiceLight]
        }).sort((a, b) => a.at - b.at)
        tell()
      })
      const offConfig = onSnapshot(doc(db, VOICE_LIGHT_CONFIG, 'ours'), (snap) => {
        const raw = (snap.data() ?? {}) as Record<string, unknown>
        limit = Math.max(1, Math.min(12, Math.round(num(raw.limit, 3))))
        tell()
      })
      return () => {
        offLights()
        offConfig()
      }
    },

    async leaveVoiceLight({ slot, audio, mime, ext, duration, waveform }) {
      const config = await getDoc(doc(db, VOICE_LIGHT_CONFIG, 'ours'))
      const limit = Math.max(1, Math.min(12, Math.round(num(config.data()?.limit, 3))))
      const place = Math.round(slot)
      if (place < 0 || place >= limit) throw new Error('That voice-light place does not exist.')
      if (duration <= 0 || duration > 30.5) throw new Error('A voice-light can be at most thirty seconds.')

      const id = `${me}-${place}`
      const atDoc = doc(db, VOICE_LIGHTS, id)
      const previous = await getDoc(atDoc)
      const oldPath = str(previous.data()?.path, '')
      const path = `voice-lights/${me}/${newId()}.${ext.replace(/[^a-z0-9]/gi, '') || 'webm'}`
      await uploadBytes(storageRef(store, path), audio, {
        contentType: mime,
        cacheControl: 'private, max-age=31536000, immutable',
      })
      const light: VoiceLight = {
        id,
        by: me,
        slot: place,
        at: now(),
        duration,
        path,
        mime,
        waveform: waveform.slice(0, 48).map((value) => Math.max(0, Math.min(1, value))),
      }
      const { id: _id, ...body } = light
      try {
        await setDoc(atDoc, body)
      } catch (error) {
        await deleteObject(storageRef(store, path)).catch(() => {})
        throw error
      }
      if (oldPath && oldPath !== path) {
        await deleteObject(storageRef(store, oldPath)).catch(() => {})
        voiceUrls.delete(oldPath)
      }
      return light
    },

    async removeVoiceLight(slot) {
      const atDoc = doc(db, VOICE_LIGHTS, `${me}-${Math.round(slot)}`)
      const existing = await getDoc(atDoc)
      const raw = existing.data() as Record<string, unknown> | undefined
      if (!raw || userId(raw.by) !== me) return
      const path = str(raw.path, '')
      if (path) {
        await deleteObject(storageRef(store, path)).catch((error: unknown) => {
          if ((error as { code?: string })?.code !== 'storage/object-not-found') throw error
        })
        voiceUrls.delete(path)
      }
      await deleteDoc(atDoc)
    },

    voiceLightUrl(light) {
      const existing = voiceUrls.get(light.path)
      if (existing) return existing
      const asking = getDownloadURL(storageRef(store, light.path)).catch((error) => {
        voiceUrls.delete(light.path)
        throw error
      })
      voiceUrls.set(light.path, asking)
      return asking
    },

    async setVoiceLightLimit(limit) {
      if (me !== 'warm') throw new Error('Only the warm account owns this hidden setting.')
      await setDoc(doc(db, VOICE_LIGHT_CONFIG, 'ours'), {
        limit: Math.max(1, Math.min(12, Math.round(limit))),
      })
    },

    watchRallyTuning(listener) {
      return onSnapshot(
        doc(db, RALLY_TUNING, 'ours'),
        (snap) => {
          const raw = (snap.data() ?? {}) as Record<string, unknown>
          const values: Record<string, number> = {}
          for (const [key, value] of Object.entries(raw)) {
            if (typeof value === 'number' && Number.isFinite(value)) values[key] = value
          }
          listener(values)
        },
        /*
          A car that stops driving because a settings document could not be
          read is a far worse failure than a car driving on the numbers in the
          code, which are known-good by construction. So an error here is an
          empty set, quietly.
        */
        () => listener({}),
      )
    },

    async setRallyTuning(values) {
      if (me !== 'warm') throw new Error('Only the warm account sets how the car drives.')
      const clean: Record<string, number> = {}
      for (const [key, value] of Object.entries(values)) {
        if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value
      }
      /*
        Written whole rather than merged, so sending a set that no longer moves
        some dial actually puts that dial back to what the code says. A merge
        would leave a number nobody can see behind on her phone forever.
      */
      await setDoc(doc(db, RALLY_TUNING, 'ours'), clean)
    },

    watchAmbienceTuning(listener) {
      return onSnapshot(
        doc(db, AMBIENCE_TUNING, 'ours'),
        (snap) => {
          const raw = (snap.data() ?? {}) as Record<string, unknown>
          const values: Record<string, number> = {}
          for (const [key, value] of Object.entries(raw)) {
            if (typeof value === 'number' && Number.isFinite(value)) values[key] = value
          }
          listener(values)
        },
        // The mix written in code is always a safe fallback.
        () => listener({}),
      )
    },

    async setAmbienceTuning(values) {
      if (me !== 'warm') throw new Error('Only the warm account sets how the places sound.')
      /*
        Everything the rules accept, not five hard-coded names.

        This list was written when there were five places and nothing else, and
        it silently dropped anything it did not recognise. So the open garden's
        level and the five "how much garden reaches here" numbers were thrown
        away *here*, before the wire — the write then succeeded, because the
        five it did know about were fine, and the panel said "saved". Reopen it
        and the garden was back at full, because it had never been sent.

        Which is exactly what a control that does nothing looks like from the
        outside, and why it read as the sound being beyond anybody's reach.
      */
      const clean: Record<string, number> = {}
      for (const key of AMBIENCE_KEYS) {
        const value = values[key]
        if (typeof value === 'number' && Number.isFinite(value)) {
          clean[key] = Math.max(0, Math.min(1, value))
        }
      }
      await setDoc(doc(db, AMBIENCE_TUNING, 'ours'), clean)
    },

    watchLocks(listener) {
      return onSnapshot(
        doc(db, LOCKS, 'ours'),
        (snap) => {
          const raw = (snap.data() ?? {}) as Record<string, unknown>
          const locks: Locks = {}
          for (const [key, value] of Object.entries(raw)) {
            if (value === 'them' || value === 'both') locks[key] = value
          }
          listener(locks)
        },
        /*
          Nothing readable means nothing is locked, and that is the right way
          round.

          A door that fails open is a game she can play while it is being
          worked on, which is a bad evening. A door that fails *shut* is a
          garden that empties itself the first time a phone loses signal, which
          is worse — she opens the Hollow on a train and everything is gone,
          with no way to tell that from it having been taken away on purpose.
        */
        () => listener({}),
      )
    },

    async setLocks(locks) {
      const clean: Locks = {}
      for (const [key, value] of Object.entries(locks)) {
        if (value === 'them' || value === 'both') clean[key] = value
      }
      // Written whole, like the two tunings above: unlocking is the *absence*
      // of a key, so a merge could never remove one.
      await setDoc(doc(db, LOCKS, 'ours'), clean)
    },

    watchRound(id, listener) {
      const roundRef = doc(db, ROUNDS, id)
      let setup: unknown = undefined
      let startedAt = 0
      let exists = false
      let moves: Move[] = []

      /*
        A round is its moves.

        The document only carries the label — the setup, and the moment the
        round opened. Both of those are worked out locally as well, because
        both devices have to agree on them without asking each other; that is
        what `makeSetup(seedFromId(id))` is for, and `useRound` already
        prefers the derived one when the stored one is absent.

        This used to report `null` the moment the document was missing, which
        threw away moves that had been read back perfectly well — and that is
        how "on your own" and "time challenge" died.

        Those two round ids are opened by one device, once. The daily round is
        opened by either of you, so a create that doesn't land is covered by
        the other person arriving; nobody is coming to open a solo round but
        you. And a round can only ever be *created* — `allow update: if false`
        — so a create that didn't land can never be repaired afterwards. From
        then on every guess was written, stored, and read back correctly, and
        then dropped here, one line before it reached the board. Which is
        precisely what "the word disappears and the row goes empty, no matter
        how many I type" looks like from the outside, and why the tries left
        never moved.

        So: nothing to report only when there is genuinely nothing — no label
        and no moves. That keeps the Hollow's "neither of you has opened this"
        exactly as it was, since that case has no moves either.
      */
      const tell = () => {
        if (!exists && moves.length === 0) {
          listener(null)
          return
        }
        // Sorted oldest first, so the first move is a fair stand-in for when
        // the round began if the document that would have said so never came.
        const opened = startedAt || (moves.length > 0 ? moves[0].at : 0)
        listener({ id, gameId: id.split(':')[0], setup, startedAt: opened, moves })
      }

      const offRound = onSnapshot(roundRef, (snap) => {
        exists = snap.exists()
        const d = (snap.data() ?? {}) as Record<string, unknown>
        setup = d.setup
        startedAt = num(d.startedAt, 0)
        tell()
      })

      /*
        ------------------------------------------------------------------------
        Before your own opening move lands, this listener is *expected* to come
        back short, or to fail outright with permission-denied. Neither is a
        fault: it is the seal on seq 0 working, and the rules deny the whole
        listen rather than quietly leaving her document out of it.

        **What was a fault is that it never came back.** A Firestore listener is
        finished once it errors. It does not retry. So the moment the seal
        refused one — which is precisely while you have not yet moved — the
        round went deaf for as long as you stayed on the screen, and your own
        move landing was exactly the thing that would have lifted the seal.

        In a wheel-to-wheel race that produced a result which looked like
        favouritism. Whoever crossed the line **second** never saw the other's
        time: her run arrived in his collection while he was still driving, was
        refused because he had not finished, and killed his listener. He came
        home to "she is still on the road" and no placing, for ever. The one who
        finished first saw everything, because by the time the other's move
        arrived his own already existed and nothing was ever refused.

        So it re-attaches. Backing off, because the seal is a *reason* to be
        refused and not a glitch — it can legitimately refuse for as long as it
        takes somebody to play their move, and hammering it in the meantime is
        just spending someone's phone battery on being told no.
        ------------------------------------------------------------------------
      */
      let attempt = 0
      let retry: ReturnType<typeof setTimeout> | null = null
      let dropped = false
      /** Every move seen on this round, by document id. See the note below. */
      const known = new Map<string, Move>()
      let offMoves = watchMoves()

      function watchMoves() {
        return onSnapshot(
        collection(db, ROUNDS, id, MOVES),
        (snap) => {
          attempt = 0
          moves = snap.docs
            .map((m) => {
              /*
                ----------------------------------------------------------------
                The same move is the same object, for as long as the round is
                open — and that is a correctness rule, not a saving.

                A move can never change. `allow update, delete: if false` in
                `firestore.rules` means a move document is written once and is
                then a fact. So rebuilding one on every snapshot produces a new
                object describing something that did not happen, and anything
                downstream watching by identity is told a lie.

                Which is exactly what restarted the chase. Ember Rally hands the
                road `ghost` — her recorded run, read straight off her move —
                and re-opens the road whenever that changes. Finishing a chase
                writes *your* move, which fires a snapshot, which rebuilt *her*
                move too, which handed the road a brand-new ghost object for the
                same lap she drove last week. So the road opened again: the
                lights went green and both cars set off, underneath the result
                screen that was already up.

                The mock never did this — `local.ts` keeps the old move objects
                when it appends — so it only ever went wrong for the two of you.
                ----------------------------------------------------------------
              */
              const had = known.get(m.id)
              if (had) return had
              const d = m.data() as Record<string, unknown>
              const made = {
                by: userId(d.by),
                seq: Math.max(0, Math.round(num(d.seq, 0))),
                at: num(d.at, 0),
                data: d.data,
              }
              known.set(m.id, made)
              return made
            })
            .sort((a, b) => a.at - b.at || a.seq - b.seq)
          const mineHighest = moves.reduce(
            (top, m) => (m.by === me ? Math.max(top, m.seq) : top),
            -1,
          )
          seenSeq.set(id, mineHighest)
          tell()
        },
        (error) => {
          /*
            Keep whatever was last read, and go back for more.

            Blanking `moves` here would strand a board that is already being
            played on nothing at all — the same failure the note above spends
            thirty lines on. So the last good read stands, and a fresh listener
            is opened to replace the one that just died.
          */
          if (import.meta.env.DEV) console.warn('[round] moves listener stopped', id, error)
          tell()
          if (dropped) return
          // A second, then two, four, eight, and settling at sixteen. Long
          // enough that a permanently sealed round is not a background task,
          // short enough that a seal lifting is noticed while you are still
          // looking at the screen it lifted on.
          const wait = Math.min(16_000, 1000 * 2 ** attempt++)
          if (retry) clearTimeout(retry)
          retry = setTimeout(() => {
            retry = null
            if (dropped) return
            offMoves = watchMoves()
          }, wait)
        },
      )
      }

      return () => {
        dropped = true
        if (retry) clearTimeout(retry)
        offRound()
        offMoves()
      }
    },

    async openRound({ id, gameId, setup }) {
      const roundRef = doc(db, ROUNDS, id)
      const snap = await getDoc(roundRef)
      let refused: unknown = null

      if (!snap.exists()) {
        // Both devices may reach this at the same moment. Whoever lands second
        // must not overwrite the setup — the two of you would then be playing
        // subtly different games and nothing would say so. Create-only is
        // enforced in the rules; here we simply ignore the loss.
        try {
          await setDoc(roundRef, { gameId, setup, startedAt: now() })
        } catch (error) {
          /* someone else opened it first; theirs stands */
          refused = error
        }
      }

      const settled = await getDoc(roundRef)
      if (!settled.exists() && import.meta.env.DEV) {
        /*
          Losing the race is fine: the winner's document is there and the read
          above just found it. Coming back to *nothing* is a different thing —
          the round never got its label, and it can never get one later,
          because the rules allow a create and nothing else.

          The round still plays; its moves are the game, and `watchRound` no
          longer waits on this document to say so. But it was being swallowed
          whole by the catch above, and a create that quietly evaporates —
          rolled back after an offline write, or refused outright — is worth
          hearing about rather than inferring from a board that does nothing.
        */
        console.warn('[round] never opened', id, refused ?? '(create reported success)')
      }
      const d = (settled.data() ?? {}) as Record<string, unknown>
      return {
        id,
        gameId,
        setup: d.setup ?? setup,
        startedAt: num(d.startedAt, now()),
        moves: [],
      }
    },

    async playMove(roundId, data) {
      // The document is named for you and your position in the round, which is
      // what lets the rules say "your own, and never twice" without reading a
      // thing inside it. Two devices racing to write the same seq is a lost
      // write, not a corrupted round.
      const seq = nextSeq(roundId)
      await setDoc(doc(db, ROUNDS, roundId, MOVES, `${me}-${seq}`), {
        by: me,
        seq,
        at: now(),
        data,
      })
    },

    dispose() {
      for (const off of unsubscribes) off()
      unsubscribes.length = 0
      listeners.clear()
      if (sendTimer) clearTimeout(sendTimer)
      if (presenceFrame) cancelAnimationFrame(presenceFrame)
      void rtdbSet(mine, { online: false, lastSeen: rtdbTimestamp() }).catch(() => {})
    },
  }
}

/**
 * First run only: write the seed profiles and the pot's currency if nobody has
 * ever been here. Guarded on the world document rather than on the profiles, so
 * two devices arriving at once can't both decide they're first.
 */
export async function ensureWorldExists(me: UserId): Promise<void> {
  const { db } = firebase()
  const worldRef = doc(db, ...WORLD_DOC)
  const snap = await getDoc(worldRef)

  if (!snap.exists()) {
    await setDoc(worldRef, {
      pot: { currency: SEED.potCurrency, goal: null },
      pollen: { total: 0, unlocked: [] },
      firstArrivalAt: null,
      createdAt: serverTimestamp(),
    })
  }

  // Your own profile, if you've never had one. Only ever your own — writing
  // theirs would overwrite what they'd set from their own phone.
  const mineRef = doc(db, PROFILES, me)
  if (!(await getDoc(mineRef)).exists()) {
    const seed = seedProfile(me)
    await setDoc(mineRef, {
      name: seed.name,
      city: seed.city,
      lat: seed.lat,
      lon: seed.lon,
      timeZone: seed.timeZone,
    })
  }
}

/**
 * Has the other person ever been here? Used only to decide whether to record
 * the moment you were both first in the garden.
 */
export async function markFirstArrival(): Promise<void> {
  const { db, rtdb } = firebase()
  const worldRef = doc(db, ...WORLD_DOC)
  const snap = await getDoc(worldRef)
  if (typeof snap.data()?.firstArrivalAt === 'number') return

  const both = await Promise.all(
    USER_IDS.map((id) => rtdbGet(ref(rtdb, presencePath(id)))),
  )
  if (!both.every((s) => s.val()?.online === true)) return
  await updateDoc(worldRef, { firstArrivalAt: Date.now() })
}
