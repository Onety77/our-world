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
  getFirestore,
  onSnapshot,
  deleteField,
  orderBy,
  query,
  limit as fsLimit,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
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
  type Message,
  type Money,
  type Move,
  type Pot,
  type Presence,
  type Track,
  type Profile,
  type UserId,
  type WorldState,
} from './types'
import { newId } from './ids'

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
const MESSAGES = 'messages'
const ROUNDS = 'rounds'
const PLANTS = 'plants'
const DECOR = 'decor'
const MOVES = 'moves'

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

// ---------------------------------------------------------------------------
// The layer
// ---------------------------------------------------------------------------

export interface FirebaseHandles {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  rtdb: Database
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

  const { db, rtdb } = firebase()

  let state = emptyWorld()
  const listeners = new Set<(s: WorldState) => void>()
  const unsubscribes: (() => void)[] = []

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
    }),
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
        commitPresence({
          ...state,
          presence: {
            ...state.presence,
            [id]: {
              id,
              // Both conditions: onDisconnect usually clears this, but a phone
              // that dies outright leaves the last position behind forever.
              online: d.online === true && now() - lastSeen < PRESENCE_STALE,
              placeId: str(d.placeId, 'clearing'),
              position: vec3(d.position),
              heading: num(d.heading, 0),
              lastSeen,
            },
          },
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
    const body = {
      online: true,
      placeId: pending.placeId ?? state.presence[me].placeId,
      position: pending.position ?? state.presence[me].position,
      heading: pending.heading ?? state.presence[me].heading,
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

      const since = Date.now() - lastSent
      if (since >= PRESENCE_INTERVAL) {
        flush()
        return
      }
      if (sendTimer) return
      sendTimer = setTimeout(() => {
        sendTimer = null
        flush()
      }, PRESENCE_INTERVAL - since)
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

    watchRound(id, listener) {
      const roundRef = doc(db, ROUNDS, id)
      let setup: unknown = undefined
      let startedAt = 0
      let exists = false
      let moves: Move[] = []

      const tell = () => {
        if (!exists) {
          listener(null)
          return
        }
        listener({ id, gameId: id.split(':')[0], setup, startedAt, moves })
      }

      const offRound = onSnapshot(roundRef, (snap) => {
        exists = snap.exists()
        const d = (snap.data() ?? {}) as Record<string, unknown>
        setup = d.setup
        startedAt = num(d.startedAt, 0)
        tell()
      })

      // Before your own opening move lands, this listener is *expected* to
      // come back short, or to error with permission-denied. Neither is a
      // fault; it is the seal on seq 0 working.
      const offMoves = onSnapshot(
        collection(db, ROUNDS, id, MOVES),
        (snap) => {
          moves = snap.docs
            .map((m) => {
              const d = m.data() as Record<string, unknown>
              return {
                by: userId(d.by),
                seq: Math.max(0, Math.round(num(d.seq, 0))),
                at: num(d.at, 0),
                data: d.data,
              }
            })
            .sort((a, b) => a.at - b.at || a.seq - b.seq)
          const mineHighest = moves.reduce(
            (top, m) => (m.by === me ? Math.max(top, m.seq) : top),
            -1,
          )
          seenSeq.set(id, mineHighest)
          tell()
        },
        () => {
          moves = []
          tell()
        },
      )

      return () => {
        offRound()
        offMoves()
      }
    },

    async openRound({ id, gameId, setup }) {
      const roundRef = doc(db, ROUNDS, id)
      const snap = await getDoc(roundRef)

      if (!snap.exists()) {
        // Both devices may reach this at the same moment. Whoever lands second
        // must not overwrite the setup — the two of you would then be playing
        // subtly different games and nothing would say so. Create-only is
        // enforced in the rules; here we simply ignore the loss.
        try {
          await setDoc(roundRef, { gameId, setup, startedAt: now() })
        } catch {
          /* someone else opened it first; theirs stands */
        }
      }

      const settled = await getDoc(roundRef)
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
