/**
 * The local data layer: everything in memory, persisted to localStorage, with a
 * second player you can puppet from the dev panel.
 *
 * This exists so the whole garden can be built and looked at with no network,
 * no Firebase project and no quota — and so the Firebase implementation has a
 * working reference to match. It is the default backend.
 */

import { SEED } from '@/config'
import { convert, money, zero } from './money'
// where a thought's flower grows; the seed uses the same spiral real ones do
import { thoughtSpot } from '@/sections/tree/layout'
import type {
  Contribution,
  Decor,
  Letter,
  DataLayer,
  Money,
  Move,
  Plant,
  Pot,
  Presence,
  Profile,
  Round,
  UserId,
  WorldState,
  Message,
  Memory,
  Track,
  Listening,
} from './types'
import { forgetPictures, pictureFromStore, putPicture } from './pictures'
import { newId } from './ids'
import { GROWN_DAYS, USER_IDS } from './types'
import { localDateKey } from '@/systems/time'

const STORAGE_KEY = 'garden:v1'

/** Presence is live-only — it never survives a reload, by design. */
type Persisted = Omit<WorldState, 'presence'>

function seedProfile(id: UserId): Profile {
  const s = SEED[id]
  return {
    id,
    name: s.name,
    city: s.city,
    timeZone: s.timeZone,
    lat: s.lat,
    lon: s.lon,
  }
}

function seedPresence(id: UserId): Presence {
  return {
    id,
    // Both online in local mode. This layer is a mock — an empty garden with
    // nobody in it just makes the thing you're building impossible to look at.
    online: true,
    placeId: 'clearing',
    position: id === 'warm' ? [0, 0, 0] : [5.5, 0, -4],
    heading: 0,
    lastSeen: Date.now(),
  }
}

const DAY = 86_400_000

/**
 * A few letters so the tree and the pond aren't bare the first time you walk
 * to them — you
 * can't tell whether hanging letters read well from an empty branch. The last
 * one is hers and unopened, so the glow is visible too.
 *
 * Placeholder text, and "reset world" in the dev panel clears the lot.
 */
function seedLetters(): Letter[] {
  const now = Date.now()
  const drafts: [UserId, string, number][] = [
    ['warm', 'Planted this whole thing today. Nobody here yet but the wind.', 9],
    ['warm', 'Walked to the edge. You can see a long way from there.', 6],
    ['cool', 'Found the tree. It is much bigger than you said.', 3],
    ['warm', 'Left you something. Go and look.', 1],
    ['cool', 'I looked. Thank you. I am keeping it.', 0.2],
  ]

  return drafts.map(([by, body, daysAgo], index) => ({
    id: `seed-thought-${index}`,
    by,
    body,
    placeId: 'tree',
    position: thoughtSpot(index),
    at: now - daysAgo * DAY,
    // the newest of hers is still unread, so its flower glows
    readAt: index === drafts.length - 1 ? null : now - daysAgo * DAY,
  }))
}

function seedState(): WorldState {
  return {
    profiles: { warm: seedProfile('warm'), cool: seedProfile('cool') },
    presence: { warm: seedPresence('warm'), cool: seedPresence('cool') },
    pot: { currency: SEED.potCurrency, goal: null },
    contributions: [],
    pollen: { total: 0, unlocked: [] },
    letters: seedLetters(),
    plants: [],
    decor: [],
    today: null,
    firstArrivalAt: null,
    lastReadAt: { warm: 0, cool: 0 },
  }
}

function load(): WorldState {
  const fresh = seedState()
  if (typeof localStorage === 'undefined') return fresh
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return fresh
    const parsed = JSON.parse(stored) as Partial<Persisted>
    return {
      ...fresh,
      ...parsed,
      // profiles merge field-by-field so a newly added field doesn't come back
      // undefined for someone who already has stored state
      profiles: {
        warm: { ...fresh.profiles.warm, ...parsed.profiles?.warm },
        cool: { ...fresh.profiles.cool, ...parsed.profiles?.cool },
      },
      presence: fresh.presence,
      // merged field-by-field for the same reason profiles are: somebody who
      // already has stored state predates this and would come back undefined
      lastReadAt: { ...fresh.lastReadAt, ...parsed.lastReadAt },
    }
  } catch {
    return fresh
  }
}

export interface LocalDataLayer extends DataLayer {
  /** Dev-panel only: drive the other person around to see how it feels. */
  setPresenceFor(id: UserId, patch: Partial<Omit<Presence, 'id'>>): void
  /** Dev-panel only: play her move for her, so a round can be seen settled. */
  playMoveAs(id: UserId, roundId: string, data: unknown): void
  /**
   * Dev-panel only: say something as the other person.
   *
   * Here rather than as seeded messages, and the difference matters: this is a
   * surprise she has not seen yet, and a garden that shipped with invented
   * things she had supposedly already said would be a small lie waiting in the
   * first thing she ever reads.
   */
  sayAs(id: UserId, body: string): void
  reset(): void
}

const LISTENING_KEY = 'garden:listening:v1'
const TRACKS_KEY = 'garden:tracks:v1'
const MESSAGES_KEY = 'garden:messages:v1'

/**
 * The music, and where it is.
 *
 * Beside the world like rounds and messages: what is playing changes every
 * time either of you touches it, and the meadow has no business re-rendering
 * for a track change.
 *
 * There are no real files yet — `url` is null on everything here. That is
 * deliberate and the whole player is built to work without it: the list, the
 * transport and the two-device sync all run on the clock, so the moment real
 * audio is uploaded it plays and nothing above this line changes.
 */
function loadTracks(): Track[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(TRACKS_KEY) ?? 'null')
    if (Array.isArray(raw)) return raw as Track[]
  } catch {
    /* fall through to the seed */
  }
  return seedTracks()
}

/**
 * Something to hold the player up until there are real files.
 *
 * Named after nothing in particular on purpose — these are placeholders, and a
 * list seeded with songs that sound like they mean something between the two
 * of them would be somebody else putting words in their mouths.
 */
function seedTracks(): Track[] {
  return [
    { id: 'track-1', title: 'the first one', by: 'warm', duration: 214, url: null },
    { id: 'track-2', title: 'the long drive', by: 'cool', duration: 187, url: null },
    { id: 'track-3', title: 'something slow', by: 'warm', duration: 246, url: null },
    { id: 'track-4', title: 'for the mornings', by: 'cool', duration: 173, url: null },
  ]
}

function loadListening(): Listening {
  const quiet: Listening = {
    trackId: null,
    playing: false,
    at: 0,
    since: Date.now(),
    by: 'warm',
  }
  if (typeof localStorage === 'undefined') return quiet
  try {
    const raw = JSON.parse(localStorage.getItem(LISTENING_KEY) ?? 'null')
    return raw && typeof raw === 'object' ? { ...quiet, ...raw } : quiet
  } catch {
    return quiet
  }
}
/**
 * Memory *documents* — never the pictures.
 *
 * The picture for each of these lives in IndexedDB under `memory.path`; see
 * data/pictures.ts for why it cannot live here. What is in this key is a few
 * hundred bytes per memory, of which most is the sixteen-pixel preview, and
 * that is deliberate: it means the whole Glasshouse can be drawn from
 * localStorage alone with nothing decoded and nothing fetched.
 */
const MEMORIES_KEY = 'garden:memories:v1'

function loadMemories(): Memory[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(MEMORIES_KEY) ?? 'null')
    return Array.isArray(raw) ? (raw as Memory[]) : []
  } catch {
    return []
  }
}

const ROUNDS_KEY = 'garden:rounds:v1'

/**
 * The conversation lives beside the world, for the same reason rounds do.
 *
 * Everything reads `WorldState` and re-renders when it changes. Two people
 * talking would otherwise repaint the meadow, the river and the overlay on
 * every sentence — and a chat is the one thing here that will change often.
 */
/**
 * A few things already said, so the sky is not empty the first time you stand
 * under it.
 *
 * Same reasoning as the seeded letters, and the same caveat: this is the
 * *mock*. The Firebase layer starts genuinely empty, because a real
 * conversation that arrives pre-populated with sentences neither of you wrote
 * would be the single worst thing this garden could do.
 *
 * It is here because half of what the Stars can now do is invisible without
 * it — a reply needs something to reply to, a heart needs something to sit on,
 * and "one light, low over her dawn" cannot be judged against no lights at
 * all. The last one is hers and unanswered, which is the state the corner and
 * the notification are both built around. "Reset world" in the dev panel
 * clears the lot.
 */
function seedMessages(): Message[] {
  const now = Date.now()
  const minute = 60_000
  const drafts: [UserId, string, number, string?][] = [
    ['warm', 'Found somewhere with a whole sky in it. I think you will like it.', 260],
    ['cool', 'Is it the one you would not tell me about for three weeks?', 213],
    ['warm', 'That one. There is a tree in it that keeps things.', 190],
    ['cool', 'It is nearly morning here and I am still awake looking at this.', 26],
  ]
  return drafts.map(([by, body, agoMinutes], index) => ({
    id: `seed-said-${index}`,
    by,
    body,
    at: now - agoMinutes * minute,
    // The third answers the second, so a quote has something to draw.
    ...(index === 2 ? { replyTo: 'seed-said-1' } : {}),
    // And she left a heart on the first, which is the two-colour state.
    ...(index === 0 ? { hearts: { cool: now - 250 * minute } } : {}),
  }))
}

function loadMessages(): Message[] {
  if (typeof localStorage === 'undefined') return seedMessages()
  try {
    const stored = localStorage.getItem(MESSAGES_KEY)
    if (stored === null) return seedMessages()
    const raw = JSON.parse(stored)
    return Array.isArray(raw) ? (raw as Message[]) : []
  } catch {
    return []
  }
}

/**
 * Rounds live beside the world rather than in it.
 *
 * The world state is read by everything and re-renders the overlay when it
 * changes; rounds are read by one game while you are standing in front of it.
 * Putting them in `WorldState` would mean her finishing a game across the
 * garden re-rendered your sky.
 */
interface StoredRound {
  id: string
  gameId: string
  setup: unknown
  startedAt: number
  moves: Move[]
}

function loadRounds(): Record<string, StoredRound> {
  if (typeof localStorage === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(ROUNDS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

/**
 * What `me` is allowed to see of a round.
 *
 * The local layer withholds exactly what the real one does. It would be much
 * easier to hand back everything and let the game hide things — and it would
 * mean every game got built against a mock that lies, then behaved differently
 * on the real backend where the server genuinely refuses.
 *
 * The rule is narrow: her *opening* move (seq 0) is hidden until yours exists,
 * which is what "both commit before either sees" needs. Everything after that
 * is open, because a turn-based game is unplayable if you can't see her turn.
 */
function visibleTo(me: UserId, stored: StoredRound): Round {
  const iHaveOpened = stored.moves.some((m) => m.by === me && m.seq === 0)
  return {
    id: stored.id,
    gameId: stored.gameId,
    setup: stored.setup,
    startedAt: stored.startedAt,
    moves: stored.moves.filter(
      (m) => m.by === me || m.seq !== 0 || iHaveOpened,
    ),
  }
}

/** Add one move to the end of a round, numbered after that person's last. */
function append(stored: StoredRound, by: UserId, data: unknown): StoredRound {
  const seq = stored.moves.reduce(
    (top, m) => (m.by === by ? Math.max(top, m.seq) : top),
    -1,
  ) + 1
  return { ...stored, moves: [...stored.moves, { by, seq, at: Date.now(), data }] }
}

export function createLocalDataLayer(me: UserId): LocalDataLayer {
  let state = load()
  const listeners = new Set<(s: WorldState) => void>()

  let rounds = loadRounds()
  const roundWatchers = new Map<string, Set<(r: Round | null) => void>>()

  let tracks = loadTracks()
  const trackWatchers = new Set<(t: Track[]) => void>()

  let listening = loadListening()
  const listeningWatchers = new Set<(l: Listening) => void>()

  function saveListening() {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(LISTENING_KEY, JSON.stringify(listening))
      localStorage.setItem(TRACKS_KEY, JSON.stringify(tracks))
    } catch {
      /* storage full; the garden still plays, it just forgets */
    }
  }

  let messages = loadMessages()
  const messageWatchers = new Set<{
    listener: (m: Message[]) => void
    limit: number
  }>()

  function saveMessages() {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages))
    } catch {
      /* storage full; the garden still talks, it just forgets */
    }
  }

  function tellMessageWatchers() {
    for (const w of messageWatchers) w.listener(messages.slice(-w.limit))
  }

  let memories = loadMemories()
  const memoryWatchers = new Set<(m: Memory[]) => void>()

  function saveMemories() {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(MEMORIES_KEY, JSON.stringify(memories))
    } catch {
      /* storage full; see data/pictures.ts — the pictures are not in here */
    }
  }

  function tellMemoryWatchers() {
    for (const w of memoryWatchers) w(memories)
  }

  function saveRounds() {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(ROUNDS_KEY, JSON.stringify(rounds))
    } catch {
      /* storage full; the garden still plays, it just forgets */
    }
  }

  function tellWatchers(id: string) {
    const watching = roundWatchers.get(id)
    if (!watching) return
    const stored = rounds[id]
    const view = stored ? visibleTo(me, stored) : null
    for (const w of watching) w(view)
  }

  /**
   * Presence changes many times a second and must not thrash React. Everything
   * else notifies immediately; presence coalesces into the next frame.
   */
  let presenceFrame = 0

  function persist() {
    if (typeof localStorage === 'undefined') return
    try {
      const { presence: _presence, ...rest } = state
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rest))
    } catch {
      // storage full or blocked; the garden still works, it just forgets
    }
  }

  function emit() {
    for (const l of listeners) l(state)
  }

  function commit(next: WorldState, { save = true } = {}) {
    state = next
    if (save) persist()
    emit()
  }

  return {
    me,

    subscribe(listener) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },

    snapshot: () => state,

    now: () => Date.now(),

    async setProfile(id, patch) {
      commit({
        ...state,
        profiles: { ...state.profiles, [id]: { ...state.profiles[id], ...patch } },
      })
    },

    publishPresence(patch) {
      state = {
        ...state,
        presence: {
          ...state.presence,
          [me]: { ...state.presence[me], ...patch, online: true, lastSeen: Date.now() },
        },
      }
      if (presenceFrame) return
      presenceFrame = requestAnimationFrame(() => {
        presenceFrame = 0
        emit()
      })
    },

    setPresenceFor(id, patch) {
      state = {
        ...state,
        presence: {
          ...state.presence,
          [id]: { ...state.presence[id], ...patch, lastSeen: Date.now() },
        },
      }
      if (presenceFrame) return
      presenceFrame = requestAnimationFrame(() => {
        presenceFrame = 0
        emit()
      })
    },

    async writeLetter({ body, placeId, position }) {
      const trimmed = body.trim()
      if (trimmed === '') return
      const letter: Letter = {
        id: newId(),
        by: me,
        body: trimmed,
        placeId,
        position,
        at: Date.now(),
        // Your own letters are never unread. Only theirs glow.
        readAt: Date.now(),
      }
      commit({ ...state, letters: [...state.letters, letter] })
    },

    async markLetterRead(id) {
      const at = Date.now()
      commit({
        ...state,
        letters: state.letters.map((l) =>
          l.id === id && l.readAt === null ? { ...l, readAt: at } : l,
        ),
      })
    },

    async plantSeed({ species, position }) {
      const plant: Plant = {
        id: newId(),
        species,
        by: me,
        position,
        plantedAt: Date.now(),
        growthDays: 0,
        lastWateredDay: null,
        lastWateredAt: Date.now(),
      }
      commit({ ...state, plants: [...state.plants, plant] })
    },

    async waterPlant(id) {
      const today = localDateKey(state.profiles[me].timeZone)
      commit({
        ...state,
        plants: state.plants.map((p) => {
          if (p.id !== id) return p
          // One growth-day per calendar day, however many times either of you
          // water. Watering again the same day still resets the wilt clock —
          // kindness is never wasted, it just doesn't double the growing.
          const grows = p.lastWateredDay !== today && p.growthDays < GROWN_DAYS
          return {
            ...p,
            growthDays: p.growthDays + (grows ? 1 : 0),
            lastWateredDay: today,
            lastWateredAt: Date.now(),
          }
        }),
      })
    },

    async placeDecor({ kind, position, facing }) {
      const item: Decor = {
        id: newId(),
        kind,
        by: me,
        position,
        facing,
        at: Date.now(),
      }
      commit({ ...state, decor: [...state.decor, item] })
    },

    async addContribution({ amount, rateUsed, note }) {
      const inPotCurrency = convert(amount, state.pot.currency, rateUsed)
      const entry: Contribution = {
        id: newId(),
        by: me,
        amount,
        inPotCurrency,
        rateUsed,
        ...(note ? { note } : {}),
        at: Date.now(),
      }
      commit({ ...state, contributions: [...state.contributions, entry] })
    },

    async setPotGoal(goal: Pot['goal']) {
      commit({ ...state, pot: { ...state.pot, goal } })
    },

    async addPollen(amount) {
      commit({
        ...state,
        pollen: { ...state.pollen, total: Math.max(0, state.pollen.total + amount) },
      })
    },

    // ---- games -------------------------------------------------------------

    watchRound(id, listener) {
      let watching = roundWatchers.get(id)
      if (!watching) {
        watching = new Set()
        roundWatchers.set(id, watching)
      }
      watching.add(listener)
      const stored = rounds[id]
      listener(stored ? visibleTo(me, stored) : null)
      return () => {
        watching.delete(listener)
        if (watching.size === 0) roundWatchers.delete(id)
      }
    },

    async openRound({ id, gameId, setup }) {
      // First one there sets the board. Opening a round that already exists is
      // not an error and must not overwrite it — otherwise whoever loads second
      // silently changes the game out from under the first.
      if (!rounds[id]) {
        rounds = { ...rounds, [id]: { id, gameId, setup, startedAt: Date.now(), moves: [] } }
        saveRounds()
        tellWatchers(id)
      }
      return visibleTo(me, rounds[id])
    },

    async playMove(roundId, data) {
      const stored = rounds[roundId]
      if (!stored) throw new Error(`No such round: ${roundId}`)
      rounds = { ...rounds, [roundId]: append(stored, me, data) }
      saveRounds()
      tellWatchers(roundId)
    },

    // ---- the music ---------------------------------------------------------

    watchTracks(listener) {
      trackWatchers.add(listener)
      listener(tracks)
      return () => {
        trackWatchers.delete(listener)
      }
    },

    watchListening(listener) {
      listeningWatchers.add(listener)
      listener(listening)
      return () => {
        listeningWatchers.delete(listener)
      }
    },

    async setListening(next) {
      listening = { ...next, by: me, since: Date.now() }
      saveListening()
      for (const w of listeningWatchers) w(listening)
    },

    // ---- the Glasshouse ----------------------------------------------------

    watchMemories(listener) {
      memoryWatchers.add(listener)
      listener(memories)
      return () => {
        memoryWatchers.delete(listener)
      }
    },

    async hangMemory(input) {
      const id = newId()
      /*
        The path is made here and stored on the document, rather than being
        derived from the id when it is needed. It costs one string and it means
        the two layers can lay their pictures out however suits them — a bucket
        wants folders, IndexedDB wants a flat key — without anything above the
        seam knowing or caring which.
      */
      const path = `memories/${id}.jpg`
      // The picture first. If this throws, nothing is written, and the failure
      // is a memory that was never hung rather than a pane with a hole in it.
      await putPicture(path, input.display)

      const memory: Memory = {
        id,
        by: me,
        at: Date.now(),
        width: input.width,
        height: input.height,
        tint: input.tint,
        blur: input.blur,
        path,
        ...(input.when?.trim() ? { when: input.when.trim() } : {}),
        ...(input.why?.trim() ? { why: input.why.trim() } : {}),
      }
      memories = [...memories, memory]
      saveMemories()
      tellMemoryWatchers()
      return memory
    },

    async sayWhatIRemember(id, body) {
      const text = body.trim()
      memories = memories.map((m) => {
        if (m.id !== id) return m
        // Only on hers. Enforced at the seam and not only in the interface,
        // because the seam is the part both layers share and the rules mirror.
        if (m.by === me) return m
        if (text === '') {
          const { theirs: _gone, ...rest } = m
          return rest
        }
        return { ...m, theirs: { by: me, body: text, at: Date.now() } }
      })
      saveMemories()
      tellMemoryWatchers()
    },

    pictureUrl(memory) {
      return pictureFromStore(memory.path)
    },

    // ---- the Stars ---------------------------------------------------------

    watchMessages(listener, limit = 500) {
      const entry = { listener, limit }
      messageWatchers.add(entry)
      listener(messages.slice(-limit))
      return () => {
        messageWatchers.delete(entry)
      }
    },

    async sendMessage(body, replyTo) {
      const text = body.trim()
      // An empty message is not a message. Refused here rather than disabled
      // in the UI alone, because the seam is the thing both layers share.
      if (text === '') return
      // A reply to something that is not there is not a reply. Dropped rather
      // than stored, so nothing downstream has to cope with a dangling id.
      const answers = replyTo && messages.some((m) => m.id === replyTo) ? replyTo : undefined
      messages = [
        ...messages,
        { id: newId(), by: me, body: text, at: Date.now(), ...(answers ? { replyTo: answers } : {}) },
      ]
      saveMessages()
      tellMessageWatchers()
      // Saying something is also reading everything up to it — you cannot
      // reply to a conversation you have not looked at.
      commit({ ...state, lastReadAt: { ...state.lastReadAt, [me]: Date.now() } })
    },

    async heartMessage(id, on) {
      messages = messages.map((m) => {
        if (m.id !== id) return m
        const hearts = { ...(m.hearts ?? {}) }
        if (on) hearts[me] = Date.now()
        else delete hearts[me]
        return { ...m, hearts }
      })
      saveMessages()
      tellMessageWatchers()
    },

    async markMessagesRead() {
      commit({ ...state, lastReadAt: { ...state.lastReadAt, [me]: Date.now() } })
    },

    sayAs(id, body) {
      const text = body.trim()
      if (text === '') return
      messages = [
        ...messages,
        { id: newId(), by: id, body: text, at: Date.now() },
      ]
      saveMessages()
      tellMessageWatchers()
    },

    playMoveAs(id, roundId, data) {
      const stored = rounds[roundId]
      if (!stored) return
      rounds = { ...rounds, [roundId]: append(stored, id, data) }
      saveRounds()
      tellWatchers(roundId)
    },

    reset() {
      try {
        localStorage.removeItem(STORAGE_KEY)
        localStorage.removeItem(ROUNDS_KEY)
        localStorage.removeItem(MESSAGES_KEY)
        localStorage.removeItem(MEMORIES_KEY)
        localStorage.removeItem(LISTENING_KEY)
        localStorage.removeItem(TRACKS_KEY)
      } catch {
        /* ignore */
      }
      rounds = {}
      for (const id of roundWatchers.keys()) tellWatchers(id)
      messages = []
      tellMessageWatchers()
      memories = []
      tellMemoryWatchers()
      // The pictures are in IndexedDB, not localStorage, so clearing the keys
      // above would otherwise leave every photograph on the device with
      // nothing pointing at it. Fire and forget: "start again" must not wait
      // on a database, and a failure here leaks bytes rather than data.
      void forgetPictures()
      tracks = seedTracks()
      for (const w of trackWatchers) w(tracks)
      listening = loadListening()
      for (const w of listeningWatchers) w(listening)
      commit(seedState(), { save: false })
    },
  }
}

/** Total of every contribution, in the pot's currency. */
export function potTotal(state: WorldState): Money {
  return state.contributions.reduce(
    (acc, c) => money(acc.minor + c.inPotCurrency.minor, acc.currency),
    zero(state.pot.currency),
  )
}

/** Per-person totals. Shown as information, never as a scoreboard. */
export function potByPerson(state: WorldState): Record<UserId, Money> {
  const out = Object.fromEntries(
    USER_IDS.map((id) => [id, zero(state.pot.currency)]),
  ) as Record<UserId, Money>
  for (const c of state.contributions) {
    out[c.by] = money(out[c.by].minor + c.inPotCurrency.minor, state.pot.currency)
  }
  return out
}

/**
 * How many garden choices are still unspent.
 *
 * Derived, never stored: every contribution of ₦5000 or more (in the pot's
 * currency) earns one choice from the catalogue, and every plant or piece of
 * decor placed spends one. Deriving it means there is no second ledger to
 * drift out of agreement with the first.
 */
export const CREDIT_THRESHOLD_MINOR = 500_000 // ₦5000, in kobo

export function gardenCredits(state: WorldState): number {
  const earned = state.contributions.filter(
    (c) => c.inPotCurrency.minor >= CREDIT_THRESHOLD_MINOR,
  ).length
  const spent = state.plants.length + state.decor.length
  return Math.max(0, earned - spent)
}
