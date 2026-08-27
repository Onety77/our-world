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
  QuestionAnswer,
  QuestionGarden,
  QuestionRound,
  VoiceLight,
  VoiceLightGarden,
} from './types'
import { forgetPicture, forgetPictures, pictureFromStore, putPicture } from './pictures'
import {
  forgetVoiceClip,
  forgetVoiceClips,
  putVoiceClip,
  voiceClipFromStore,
} from './voiceClips'
import { newId } from './ids'
import { GROWN_DAYS, USER_IDS } from './types'
import { localDateKey } from '@/systems/time'
import {
  QUESTION_DAY,
  QUESTION_PROMPTS,
  questionHash,
} from './questionPrompts'

const STORAGE_KEY = 'garden:v1'

/** Presence is live-only — it never survives a reload, by design. */
type Persisted = Omit<WorldState, 'presence' | 'questions'>

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
    questions: {
      current: null,
      history: [],
      availableSeeds: 0,
      queued: 0,
      nextAt: null,
      loaded: true,
    },
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
      // Questions live beside the world and are reconstructed below. Never let
      // an older saved world replace the new shape with `undefined`.
      questions: fresh.questions,
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
const QUESTIONS_KEY = 'garden:questions:v1'
const VOICE_LIGHTS_KEY = 'garden:voice-lights:v1'
const VOICE_LIGHT_LIMIT_KEY = 'garden:voice-light-limit:v1'
const RALLY_TUNING_KEY = 'garden:rally-tuning:v1'

interface StoredQuestionSeed {
  id: string
  by: UserId
  prompt: string
  contributionId: string | null
  availableAfter: number
  plantedAt: number
  usedAt: number | null
}

interface StoredQuestionRound extends Omit<QuestionRound, 'answers'> {
  answers: Partial<Record<UserId, QuestionAnswer>>
}

interface StoredQuestions {
  rounds: StoredQuestionRound[]
  seeds: StoredQuestionSeed[]
}

function loadQuestions(): StoredQuestions {
  if (typeof localStorage === 'undefined') return { rounds: [], seeds: [] }
  try {
    const raw = JSON.parse(localStorage.getItem(QUESTIONS_KEY) ?? 'null') as
      | Partial<StoredQuestions>
      | null
    return {
      rounds: Array.isArray(raw?.rounds) ? raw.rounds : [],
      seeds: Array.isArray(raw?.seeds) ? raw.seeds : [],
    }
  } catch {
    return { rounds: [], seeds: [] }
  }
}

function questionView(
  stored: StoredQuestions,
  state: WorldState,
  me: UserId,
): QuestionGarden {
  const spent = new Set(
    stored.seeds
      .filter((seed) => seed.by === me && seed.contributionId)
      .map((seed) => seed.contributionId as string),
  )
  const availableSeeds = state.contributions.filter(
    (entry) => entry.by === me && entry.inPotCurrency.minor > 0 && !spent.has(entry.id),
  ).length

  const rounds = stored.rounds
    .toSorted((a, b) => a.openedAt - b.openedAt)
    .map((round): QuestionRound => {
      const both = round.answered.warm && round.answered.cool
      const answers: QuestionRound['answers'] = {}
      if (round.answers[me]) answers[me] = round.answers[me]
      if (both) {
        if (round.answers.warm) answers.warm = round.answers.warm
        if (round.answers.cool) answers.cool = round.answers.cool
      }
      return { ...round, answers }
    })
  const current = rounds.at(-1) ?? null

  return {
    current,
    history: rounds.filter((round) => round.completedAt !== null),
    availableSeeds,
    queued: stored.seeds.filter((seed) => seed.by === me && seed.usedAt === null).length,
    nextAt: current?.completedAt ? current.openedAt + QUESTION_DAY : null,
    loaded: true,
  }
}

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

function loadVoiceLights(): VoiceLight[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(VOICE_LIGHTS_KEY) ?? '[]')
    return Array.isArray(raw) ? (raw as VoiceLight[]) : []
  } catch {
    return []
  }
}

/**
 * The published set of car-handling numbers.
 *
 * In local mode "published" means nothing more than "saved on this device
 * under a different key from the draft" — there is no second person for it to
 * reach. It is still worth being a separate layer, because the whole point of
 * the control room is rehearsing the send, and a send that quietly did nothing
 * in local mode would be untested until the one time it mattered.
 */
function loadRallyTuning(): Record<string, number> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = JSON.parse(localStorage.getItem(RALLY_TUNING_KEY) ?? '{}') as unknown
    if (raw === null || typeof raw !== 'object') return {}
    const out: Record<string, number> = {}
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

function loadVoiceLightLimit(): number {
  if (typeof localStorage === 'undefined') return 3
  const value = Number(localStorage.getItem(VOICE_LIGHT_LIMIT_KEY) ?? 3)
  return Number.isFinite(value) ? Math.max(1, Math.min(12, Math.round(value))) : 3
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
  let questions = loadQuestions()
  state = { ...state, questions: questionView(questions, state, me) }
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

  function saveQuestions() {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(QUESTIONS_KEY, JSON.stringify(questions))
    } catch {
      /* storage full; the ritual still works until this tab closes */
    }
  }

  function settleQuestions() {
    saveQuestions()
    commit({ ...state, questions: questionView(questions, state, me) })
  }

  function tellMessageWatchers() {
    for (const w of messageWatchers) w.listener(messages.slice(-w.limit))
  }

  let voiceLights = loadVoiceLights()
  let voiceLightLimit = loadVoiceLightLimit()
  const voiceLightWatchers = new Set<(garden: VoiceLightGarden) => void>()

  function voiceGarden(): VoiceLightGarden {
    return {
      lights: voiceLights.filter((light) => light.slot < voiceLightLimit).sort((a, b) => a.at - b.at),
      limit: voiceLightLimit,
    }
  }

  function tellVoiceLightWatchers() {
    const garden = voiceGarden()
    for (const watcher of voiceLightWatchers) watcher(garden)
  }

  let rallyTuning = loadRallyTuning()
  const rallyTuningWatchers = new Set<(values: Record<string, number>) => void>()

  function saveVoiceLights() {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(VOICE_LIGHTS_KEY, JSON.stringify(voiceLights))
    localStorage.setItem(VOICE_LIGHT_LIMIT_KEY, String(voiceLightLimit))
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
      const { presence: _presence, questions: _questions, ...rest } = state
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
      const next = { ...state, contributions: [...state.contributions, entry] }
      commit({ ...next, questions: questionView(questions, next, me) })
    },

    async setPotGoal(goal: Pot['goal']) {
      commit({ ...state, pot: { ...state.pot, goal } })
    },

    // ---- the question vine ------------------------------------------------

    async ensureQuestion() {
      const now = Date.now()
      const current = questions.rounds.toSorted((a, b) => a.openedAt - b.openedAt).at(-1)

      // One question at a time, and never more than one in a rolling day. A
      // late answer creates no backlog: the next question simply waits here.
      if (current) {
        const both = current.answered.warm && current.answered.cool
        if (!both || now < current.openedAt + QUESTION_DAY) return
      }

      const usedPrompts = new Set(questions.rounds.map((round) => round.prompt))
      const eligible = questions.seeds.filter(
        (seed) => seed.by === me && seed.usedAt === null && seed.availableAfter <= now,
      )
      const ordinal = questions.rounds.length
      const roll = questionHash(`${Math.floor(now / QUESTION_DAY)}:${ordinal}:${me}`)
      // Roughly one planted question in three, when this person's device is
      // the one that opens the new day. Otherwise the edited house pool leads.
      const planted = eligible.length > 0 && roll % 3 === 0
        ? eligible[roll % eligible.length]
        : null

      let prompt = planted?.prompt ?? ''
      if (!prompt) {
        const unused = QUESTION_PROMPTS.filter((candidate) => !usedPrompts.has(candidate))
        const pool = unused.length > 0 ? unused : [...QUESTION_PROMPTS]
        prompt = pool[questionHash(`tree:${ordinal}`) % pool.length]
      }

      const round: StoredQuestionRound = {
        id: `question-${Math.floor(now / QUESTION_DAY)}`,
        prompt,
        openedAt: now,
        completedAt: null,
        answered: { warm: false, cool: false },
        answers: {},
      }
      questions = {
        rounds: [...questions.rounds, round],
        seeds: questions.seeds.map((seed) =>
          seed.id === planted?.id ? { ...seed, usedAt: now } : seed,
        ),
      }
      settleQuestions()
    },

    async answerQuestion(roundId, body) {
      const text = body.trim()
      if (text === '') return
      const now = Date.now()
      questions = {
        ...questions,
        rounds: questions.rounds.map((round) => {
          if (round.id !== roundId || round.answered[me]) return round
          const answered = { ...round.answered, [me]: true }
          return {
            ...round,
            answered,
            completedAt: answered.warm && answered.cool ? now : null,
            answers: { ...round.answers, [me]: { by: me, body: text, at: now } },
          }
        }),
      }
      settleQuestions()
    },

    async plantQuestion(prompt) {
      const text = prompt.trim()
      if (text === '') return
      const spent = new Set(
        questions.seeds
          .filter((seed) => seed.by === me && seed.contributionId)
          .map((seed) => seed.contributionId as string),
      )
      const contribution = state.contributions.find(
        (entry) => entry.by === me && entry.inPotCurrency.minor > 0 && !spent.has(entry.id),
      )
      if (!contribution) throw new Error('There is no question seed waiting to be planted.')
      const plantedAt = Date.now()
      const delayDays = 2 + (questionHash(contribution.id) % 6)
      questions = {
        ...questions,
        seeds: [
          ...questions.seeds,
          {
            id: contribution.id,
            by: me,
            prompt: text,
            contributionId: contribution.id,
            plantedAt,
            availableAfter: plantedAt + delayDays * QUESTION_DAY,
            usedAt: null,
          },
        ],
      }
      settleQuestions()
    },

    async plantAdminQuestion(prompt) {
      const text = prompt.trim()
      if (text === '') return
      if (me !== 'warm') throw new Error('The control-room question pool belongs to warm.')
      const plantedAt = Date.now()
      questions = {
        ...questions,
        seeds: [
          ...questions.seeds,
          {
            id: `admin-${newId()}`,
            by: me,
            prompt: text,
            contributionId: null,
            plantedAt,
            // Admin prompts still do not jump straight to the front.
            availableAfter: plantedAt + QUESTION_DAY,
            usedAt: null,
          },
        ],
      }
      settleQuestions()
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
      const path = `memories/${id}.${input.ext}`
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

    async removeMemory(id) {
      const memory = memories.find((m) => m.id === id)
      if (!memory || memory.removed) return
      // Yours only. Enforced at the seam as well as in the interface, because
      // the seam is the part both layers share and the rules mirror.
      if (memory.by !== me) return

      // The picture first. If this throws, the document is untouched and the
      // memory is still whole — the reverse would leave a pane pointing at a
      // file that is gone, which is the one state this place must not have.
      await forgetPicture(memory.path)

      memories = memories.map((m) =>
        m.id !== id
          ? m
          : ({
              // Everything that was *in* the memory goes. What stays is its
              // number, which is the only reason the document survives at all.
              id: m.id,
              by: m.by,
              at: m.at,
              width: m.width,
              height: m.height,
              tint: '#000000',
              blur: '',
              path: '',
              removed: { by: me, at: Date.now() },
            } satisfies Memory),
      )
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

    watchVoiceLights(listener) {
      voiceLightWatchers.add(listener)
      listener(voiceGarden())
      return () => voiceLightWatchers.delete(listener)
    },

    async leaveVoiceLight({ slot, audio, mime, ext, duration, waveform }) {
      const place = Math.round(slot)
      if (place < 0 || place >= voiceLightLimit) throw new Error('That voice-light place does not exist.')
      if (duration <= 0 || duration > 30.5) throw new Error('A voice-light can be at most thirty seconds.')
      const id = `${me}-${place}`
      const previous = voiceLights.find((light) => light.id === id)
      const path = `${me}/${newId()}.${ext.replace(/[^a-z0-9]/gi, '') || 'webm'}`
      await putVoiceClip(path, audio)
      const light: VoiceLight = {
        id,
        by: me,
        slot: place,
        at: Date.now(),
        duration,
        path,
        mime,
        waveform: waveform.slice(0, 48).map((value) => Math.max(0, Math.min(1, value))),
      }
      voiceLights = [...voiceLights.filter((item) => item.id !== id), light]
      saveVoiceLights()
      tellVoiceLightWatchers()
      if (previous && previous.path !== path) await forgetVoiceClip(previous.path).catch(() => {})
      return light
    },

    async removeVoiceLight(slot) {
      const id = `${me}-${Math.round(slot)}`
      const existing = voiceLights.find((light) => light.id === id)
      if (!existing) return
      await forgetVoiceClip(existing.path)
      voiceLights = voiceLights.filter((light) => light.id !== id)
      saveVoiceLights()
      tellVoiceLightWatchers()
    },

    voiceLightUrl(light) {
      return voiceClipFromStore(light.path)
    },

    async setVoiceLightLimit(limit) {
      voiceLightLimit = Math.max(1, Math.min(12, Math.round(limit)))
      saveVoiceLights()
      tellVoiceLightWatchers()
    },

    watchRallyTuning(listener) {
      rallyTuningWatchers.add(listener)
      listener(rallyTuning)
      return () => rallyTuningWatchers.delete(listener)
    },

    async setRallyTuning(values) {
      const clean: Record<string, number> = {}
      for (const [key, value] of Object.entries(values)) {
        if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value
      }
      // Replaced whole, like the real layer: a dial left out of the set is a
      // dial going back to what the code says, not one keeping its old value.
      rallyTuning = clean
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(RALLY_TUNING_KEY, JSON.stringify(rallyTuning))
      }
      for (const watcher of rallyTuningWatchers) watcher(rallyTuning)
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
        localStorage.removeItem(QUESTIONS_KEY)
        localStorage.removeItem(VOICE_LIGHTS_KEY)
        localStorage.removeItem(VOICE_LIGHT_LIMIT_KEY)
        /*
          `RALLY_TUNING_KEY` is deliberately not in this list.

          This button wipes what the two of you have *made* — thoughts,
          messages, rounds, memories, photographs. How the car drives is not
          one of those; it is a setting, arrived at over an afternoon of
          driving, and losing it as a side effect of clearing test data would
          be a genuinely miserable surprise. The control room has its own
          button for putting the car back to what the code says, and that one
          says so on the tin.
        */
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
      void forgetVoiceClips()
      voiceLights = []
      voiceLightLimit = 3
      tellVoiceLightWatchers()
      tracks = seedTracks()
      for (const w of trackWatchers) w(tracks)
      listening = loadListening()
      for (const w of listeningWatchers) w(listening)
      questions = { rounds: [], seeds: [] }
      const fresh = seedState()
      commit({ ...fresh, questions: questionView(questions, fresh, me) }, { save: false })
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
