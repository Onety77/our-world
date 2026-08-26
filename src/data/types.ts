/**
 * Every shape that crosses the seam between the garden and whatever is storing
 * it. Phase 00 implements only a slice of this, but the whole contract is
 * declared here so nothing has to be guessed later — and so anyone picking this
 * up knows the units without reading the implementation.
 */

/** There are exactly two people, forever. This is deliberate. */
export type UserId = 'warm' | 'cool'
export const USER_IDS: readonly UserId[] = ['warm', 'cool'] as const
export const otherUser = (id: UserId): UserId => (id === 'warm' ? 'cool' : 'warm')

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface Profile {
  id: UserId
  /** What they call themselves. Editable. */
  name: string
  /** Display only — "Kano", "Shanghai". Never used for maths. */
  city: string
  /**
   * Where that city actually is, in degrees. Separate from `city` because the
   * name is a label you write for yourself and this is the number the distance
   * between you is computed from. `null` when unknown — in which case no
   * distance is shown, rather than one being guessed.
   */
  lat: number | null
  lon: number | null
  /**
   * IANA timezone identifier, e.g. "Africa/Lagos", "Asia/Shanghai".
   * This is the *only* input to where their moon sits in the sky. Editable,
   * because one of us is moving.
   */
  timeZone: string
}

/** Live, ephemeral, ~10x a second. Never persisted. */
export interface Presence {
  id: UserId
  online: boolean
  /** Which place they are standing in. */
  placeId: string
  /** World-space position, metres. */
  position: [number, number, number]
  /** Radians, rotation about Y. Which way they are looking. */
  heading: number
  /** epoch ms, from the server clock, not the device clock. */
  lastSeen: number
  /**
   * The key of a live round this person is sitting in, waiting for the other.
   *
   * ---------------------------------------------------------------------------
   * **This is how two phones agree on the same round without a server.**
   *
   * Everything else in the garden is asynchronous, and asynchronous rounds name
   * themselves: the id is the date, so both devices arrive at it independently
   * and neither has to be told. A live round cannot do that — it starts at a
   * moment somebody chose, and the other person has no way to guess which
   * moment. Deriving a key from a shared clock bucket almost works and then
   * fails at the boundary, which is the worst way for a thing to fail.
   *
   * So the invitation goes down the one channel that is already live and
   * already shared: presence. You put the key here, she sees it within the
   * second, and opens the same round. Ephemeral, never persisted, and gone the
   * moment either of you leaves.
   * ---------------------------------------------------------------------------
   */
  racing?: string

  /**
   * The id of the memory this person has open in the Glasshouse.
   *
   * Down the same live channel and for a related reason: there is no way to
   * *derive* that the two of you are looking at the same photograph, so it has
   * to be said. When both of these match, the pane takes a warm edge and a
   * cool one and the colour in it strengthens — which is the whole of "we are
   * both here, in front of this", with no avatar and no "seen by" line.
   *
   * Ephemeral like the rest of presence. Cleared on leaving the picture, and
   * gone by itself when the phone goes into a tunnel.
   */
  looking?: string
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** ISO 4217, e.g. "NGN", "CNY", "USD". */
export type CurrencyCode = string

/**
 * Money is ALWAYS an integer count of minor units — kobo, fen, cents.
 * Never a float, never a formatted string. Formatting happens at the very edge,
 * in one place, and only for display.
 */
export interface Money {
  minor: number
  currency: CurrencyCode
}

/**
 * One deposit into the shared pot. This is an honour-system ledger: it records
 * money the two of you have actually set aside in real life. Nothing here moves
 * real funds and nothing here talks to a bank or a payment processor.
 */
export interface Contribution {
  id: string
  by: UserId
  /** What they actually put aside, in the currency they put it aside in. */
  amount: Money
  /**
   * The same deposit converted into the pot's currency, so the total is
   * meaningful when the two of you are saving in different currencies.
   */
  inPotCurrency: Money
  /**
   * Units of pot currency per 1 unit of `amount.currency`, at the moment it was
   * entered. Stored so history never silently re-values itself when rates move.
   * When both currencies match this is exactly 1.
   */
  rateUsed: number
  note?: string
  /** epoch ms */
  at: number
}

export interface Pot {
  /** Everything is totalled in this. */
  currency: CurrencyCode
  /** What you're saving toward. `null` means the pot has no target yet. */
  goal: { amount: Money; label: string } | null
}

// ---------------------------------------------------------------------------
// The garden's own economy — kept strictly separate from real money above.
// Pollen can never buy anything real; money can never buy anything in-world.
// ---------------------------------------------------------------------------

export interface Pollen {
  /** Shared pool. Never split per person, never compared. */
  total: number
  /** Ids of everything bought with it. */
  unlocked: string[]
}

// ---------------------------------------------------------------------------
// Things left behind
// ---------------------------------------------------------------------------

export interface Letter {
  id: string
  by: UserId
  body: string
  /** Where in the world it was left, so reading it means going there. */
  placeId: string
  position: [number, number, number]
  at: number
  readAt: number | null
}

// ---------------------------------------------------------------------------
// Memories
// ---------------------------------------------------------------------------

/**
 * One picture, kept in the Glasshouse.
 *
 * ---------------------------------------------------------------------------
 * **The first thing in this world that cannot be made again.**
 *
 * Everything else here regenerates: a road, a board, a sheet of categories and
 * the sky itself are all functions of a seed, and losing them costs a rerun.
 * A photograph is not. That single fact decides most of what follows —
 * `tint` and `blur` are kept *in the document* rather than derived from the
 * file, so a pane can be drawn honestly while the picture is still coming down
 * the wire or when it never arrives at all; `width` and `height` are stored
 * rather than measured, so the glass is cut to the right shape before anything
 * has been decoded and nothing is ever cropped to fit; and the original stays
 * exactly as it was handed over.
 * ---------------------------------------------------------------------------
 */
export interface Memory {
  id: string
  /** Who hung it. Decides which of the two lights seals the pane. */
  by: UserId
  /** epoch ms it was hung. Not when the photograph was taken. */
  at: number

  /**
   * When the moment itself was, in their own words — "the night before you
   * left", "some June".
   *
   * Free text and never parsed. A date picker would insist on a precision
   * nobody has about the things worth keeping, and would turn the two lines
   * this asks for into a form.
   */
  when?: string
  /** Why it stays. One line, and optional: some pictures say it themselves. */
  why?: string

  /**
   * What the *other* one remembers of it. At most one, and only from the
   * person who did not hang it — the seam has no way to say otherwise and the
   * rules refuse it if it tries.
   *
   * This is the whole of what a second person may add. Not a like, not a
   * thread: one person leaves the moment and the other leaves what it was
   * from where they were standing.
   */
  theirs?: { by: UserId; body: string; at: number }

  /** Pixels of the display copy. The pane is cut to this, never to a guess. */
  width: number
  height: number

  /**
   * The average colour of the picture, '#rrggbb'.
   *
   * What a pane *is* until it is close enough to be worth loading. Most of the
   * Glasshouse is only ever this: a wall of coloured glass, one colour per
   * memory, costing one instanced quad each and no network at all.
   */
  tint: string

  /**
   * A few hundred bytes of the picture, as a data URI — sixteen pixels or so,
   * stretched.
   *
   * In the document rather than in storage, deliberately: it means a pane has
   * something *true* to show the instant the garden knows the memory exists,
   * with no second round trip, and it makes the brief's "the glass clears and
   * the image appears" the literal behaviour of a progressive load rather than
   * an animation pretending to be one.
   */
  blur: string

  /**
   * Where the display copy lives. Opaque above the seam — a storage path in
   * the real layer, an IndexedDB key in the mock — and never a URL, because a
   * URL from a private bucket expires and a stored one would rot.
   *
   * Empty once the memory has been taken out — see `removed`.
   */
  path: string

  /**
   * Taken out of the glass, by the one who hung it.
   *
   * ---------------------------------------------------------------------------
   * **The picture is really gone. The document is not, and cannot be.**
   *
   * A pane's place in the building is its index in the oldest-first list, and
   * that index is what makes the place work: nothing moves when a memory is
   * added. Actually deleting the document would renumber every memory after it
   * — a hundred photographs all sliding one bay down the building because one
   * was taken out. So the document stays as a marker with nothing in it: the
   * file is deleted from storage, `path` is emptied, and the tint, the preview
   * and both lines are cleared. What is left is a few bytes that say *there was
   * a number here*.
   *
   * **And the wall closes over it.** The panel it occupied is no longer held
   * open, so the ordinary milky glazing goes back in — which is not a
   * workaround, it is the building's own rule applied honestly: glass is
   * coloured where a memory is, and there is no memory there any more. No gap,
   * no empty frame, no scar. Somebody walking the aisle afterwards sees a
   * building with one fewer coloured pane in it, and there is nothing to point
   * at and say *that is where something was removed*.
   * ---------------------------------------------------------------------------
   */
  removed?: { by: UserId; at: number }
}

// ---------------------------------------------------------------------------
// Listening
// ---------------------------------------------------------------------------

/** One piece of music either of you has put in the garden. */
export interface Track {
  id: string
  title: string
  /** Who added it. Shown quietly; never a score. */
  by: UserId
  /**
   * Seconds. `0` means *not known yet* — the file has not been read. The
   * player must show nothing rather than guess a length, or a progress line
   * ends up lying about where you are in a song.
   */
  duration: number
  /**
   * Where the audio is.
   *
   * `null` until real files exist. Everything else here — the list, the
   * transport, the sync — works without it, which is the point: the seam is
   * declared now and the files drop in later without any of it changing.
   */
  url: string | null
}

/**
 * What is playing, for both of you.
 *
 * **Position is stored as an anchor, not as a number that ticks.** `at` is
 * where the track was at the moment `since`, and where it is *now* is worked
 * out from the clock. Writing a position every second instead would be a write
 * per second per person forever, and it still would not survive one dropped
 * message — this way two phones agree from a single fact, and a device that
 * was asleep for an hour catches up correctly the instant it wakes.
 *
 * `since` is server time (`DataLayer.now()`), never `Date.now()`. Two
 * devices seven timezones apart with a few seconds of drift between their
 * clocks would otherwise sit at visibly different places in the same song.
 */
export interface Listening {
  trackId: string | null
  playing: boolean
  /** Seconds into the track at `since`. */
  at: number
  /** Server time in ms when `at` was true. */
  since: number
  /** Who last moved it. */
  by: UserId
}

// ---------------------------------------------------------------------------
// Talking
// ---------------------------------------------------------------------------

/**
 * One thing said in the Stars.
 *
 * Deliberately thinner than a Letter. A letter is an object — it has a place
 * in the world, it grew a flower, it is kept. A message is speech: it has a
 * time and it has who said it, and that is all it needs. Conflating the two
 * would mean either the chat accumulated flowers or the letters lost theirs.
 */
export interface Message {
  id: string
  by: UserId
  body: string
  /** epoch ms, from the server clock where there is one. */
  at: number
  /**
   * The message this one answers, if it answers one.
   *
   * An id and nothing else — the quoted words are *not* copied in. Two reasons
   * and the second is the one that matters: a copy is a second version of
   * something that already exists, and a conversation between two people that
   * runs for years must not accumulate two versions of anything. And an id
   * resolves against the same list the reply is drawn from, so a quote can
   * never show text that is not in the conversation.
   *
   * The message it points at may be older than the window that got loaded, in
   * which case there is nothing to quote and the reply says so rather than
   * pretending.
   */
  replyTo?: string
  /**
   * Who has put a heart on it, and when.
   *
   * One heart, from each of you, and that is the whole vocabulary. Not an
   * emoji picker: there are exactly two people here forever, so a reaction is
   * a yes or nothing — and a row of six alternatives to a heart would be six
   * ways of saying something less than the one it replaced.
   *
   * The time is kept because it is free and it is the honest thing to know:
   * she may have hearted something days after you said it, and that is a
   * different event from hearting it while you were both awake.
   */
  hearts?: Partial<Record<UserId, number>>
}

/**
 * A short recording kept as one light in the Stars.
 *
 * These are slots rather than a feed: `warm-0` is always warm's first place,
 * and replacing it changes that light instead of growing an invisible audio
 * archive. The small waveform is metadata only; the actual bytes live in
 * IndexedDB locally and Firebase Storage in the real world.
 */
export interface VoiceLight {
  id: string
  by: UserId
  slot: number
  at: number
  duration: number
  path: string
  mime: string
  waveform: number[]
}

export interface VoiceLightGarden {
  lights: VoiceLight[]
  /** Maximum standing lights for each person, not the total between them. */
  limit: number
}

export interface DailyAnswer {
  by: UserId
  body: string
  at: number
}

/**
 * Neither answer is readable until both exist. That rule is enforced in the
 * data layer and in the security rules, not just in the UI.
 */
export interface DailyQuestion {
  /** Local date key, "2026-08-14". */
  id: string
  prompt: string
  answers: Partial<Record<UserId, DailyAnswer>>
}

// ---------------------------------------------------------------------------
// The question vine
// ---------------------------------------------------------------------------

export interface QuestionAnswer {
  by: UserId
  body: string
  /** epoch ms, from the shared clock where there is one. */
  at: number
}

/**
 * One question the Tree has opened.
 *
 * `answered` is public, but the answers are not. Each answer lives in its own
 * document below the round and the other person's document cannot be read
 * until both flags are true. This small duplication is the seal.
 */
export interface QuestionRound {
  id: string
  prompt: string
  openedAt: number
  completedAt: number | null
  answered: Record<UserId, boolean>
  /** Contains mine while waiting; contains both only after both have answered. */
  answers: Partial<Record<UserId, QuestionAnswer>>
}

export interface QuestionGarden {
  /** The newest question. It remains at the roots until the next one opens. */
  current: QuestionRound | null
  /** Every completed question, oldest first. */
  history: QuestionRound[]
  /** Unspent question privileges belonging to this person. */
  availableSeeds: number
  /** Their planted questions still resting under the roots. */
  queued: number
  /** Earliest moment another question may open; null while this one waits. */
  nextAt: number | null
  /** False until the question collections have answered once. */
  loaded: boolean
}

/**
 * Something planted, alive, and dependent on the two of you.
 *
 * Growth is a count of days on which somebody watered — not elapsed time. A
 * plant nobody visits stays a seedling forever; twenty watered days grows it
 * fully. Wilt is *derived* from hours since the last watering, never stored:
 * dry too long and it droops, but watering always revives it. Plants never
 * die permanently — a couple's garden that punishes a missed week kills the
 * habit it exists to build.
 */
export interface Plant {
  id: string
  species: 'flower' | 'tree'
  by: UserId
  position: [number, number, number]
  plantedAt: number
  /** Days on which someone watered. Full grown at 20. */
  growthDays: number
  /** Local date key of the most recent watering, in the waterer's timezone. */
  lastWateredDay: string | null
  /** epoch ms of the most recent watering — the wilt clock. */
  lastWateredAt: number
}

/** Full growth, in watered days. */
export const GROWN_DAYS = 20

/** Something bought and placed: the furniture of the garden. Create-only. */
export interface Decor {
  id: string
  kind: 'lamp' | 'bench' | 'swing' | 'carpet'
  by: UserId
  position: [number, number, number]
  /** Radians about Y. */
  facing: number
  at: number
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

/**
 * One playing of one game.
 *
 * Built for people seven hours apart. Lagos is UTC+1 and Shanghai is UTC+8, so
 * for most of the year the window where you are both awake and free is a
 * couple of hours at the edges of the day. A game that needs you both at a
 * keyboard at once is a game you will play four times and then stop.
 *
 * So the unit is not a session, it is a **round**: something you open alone,
 * put a move into, and close. She finds it later. The good feeling is not
 * winning, it is opening the Hollow and seeing that she has been.
 */
export interface Round {
  /**
   * "gameId:key" — the key is the game's own (a date for a daily, a
   * counter for a series). Deterministic so both devices name the same round
   * without having to agree first.
   */
  id: string
  gameId: string
  /**
   * The round's shared setup — the prompt, the board, the deal. Written once
   * when the round opens and not touched again, so both of you are certainly
   * playing the same thing. Opaque here: each game defines its own shape.
   */
  setup: unknown
  startedAt: number
  /**
   * Every move either of you has made, oldest first.
   *
   * A list, not one move each. The first version held exactly one move per
   * person, which fits a game where you both answer once and compare — and
   * fits nothing else. A word game needs six guesses; a board game needs
   * fifty alternating turns. Same shape covers all of it.
   */
  moves: Move[]
}

export interface Move {
  by: UserId
  /** Position in the round, from 0. Unique per person, never reused. */
  seq: number
  at: number
  /** Opaque. The game reads it; nothing else does. */
  data: unknown
}

/**
 * A note on what is hidden, because it is easy to claim more than is true.
 *
 * Moves are readable by both of you. They have to be: with no server of our
 * own, scoring a guess or drawing a board happens on your device, which means
 * your device needs the numbers.
 *
 * Where a game needs you to commit before seeing — both placing a fleet, both
 * answering at once — that is the *opening* move, seq 0, and the security
 * rules withhold hers until yours exists. Later moves are open.
 *
 * And where even that isn't possible — the word she chose for you has to reach
 * your device so your guesses can be scored — the game says so plainly rather
 * than pretending. Two people who want to spoil a word game for themselves
 * will manage it with or without our help.
 */

// ---------------------------------------------------------------------------
// The whole world, as the UI sees it
// ---------------------------------------------------------------------------

export interface WorldState {
  profiles: Record<UserId, Profile>
  presence: Record<UserId, Presence>
  pot: Pot
  contributions: Contribution[]
  pollen: Pollen
  letters: Letter[]
  plants: Plant[]
  decor: Decor[]
  /** null until today's has been fetched. */
  today: DailyQuestion | null
  questions: QuestionGarden
  /** Set once, the first time the second person ever arrives. */
  firstArrivalAt: number | null
  /**
   * The moment each of you last read the Stars, epoch ms.
   *
   * Here rather than on the device, because it is the one thing that lets the
   * garden say something true about the other person without inventing it: not
   * "she is typing", not "delivered", just *she has been here since you said
   * that*. Zero means never.
   */
  lastReadAt: Record<UserId, number>
}

/**
 * The seam. `local` and `firebase` both implement this; nothing above the data
 * folder knows which one it's talking to.
 */
export interface DataLayer {
  /** Who am I, on this device. */
  me: UserId

  subscribe(listener: (state: WorldState) => void): () => void
  snapshot(): WorldState

  setProfile(id: UserId, patch: Partial<Omit<Profile, 'id'>>): Promise<void>
  publishPresence(patch: Partial<Omit<Presence, 'id'>>): void

  /**
   * Leave a letter. The position is where it will hang forever, worked out by
   * the place when it's written — a letter that moved because someone else
   * added one would be wrong.
   */
  writeLetter(input: {
    body: string
    placeId: string
    position: [number, number, number]
  }): Promise<void>

  /** Stops it glowing. Never removes it; letters don't come down. */
  markLetterRead(id: string): Promise<void>

  addContribution(input: {
    amount: Money
    rateUsed: number
    note?: string
  }): Promise<void>
  setPotGoal(goal: Pot['goal']): Promise<void>

  // ---- the question vine -------------------------------------------------

  /** Open today's question when the previous one is complete and 24h old. */
  ensureQuestion(): Promise<void>

  /** Seal my answer. It cannot be edited or taken back. */
  answerQuestion(roundId: string, body: string): Promise<void>

  /** Spend one contribution-earned seed to put a question into the hidden pool. */
  plantQuestion(prompt: string): Promise<void>

  /** The hidden control-room way to add a prompt without spending a seed. */
  plantAdminQuestion(prompt: string): Promise<void>

  addPollen(amount: number, reason: string): Promise<void>

  // ---- the living garden ---------------------------------------------------

  /** Put a seed in the ground. Spends a credit — see potCredits in local.ts. */
  plantSeed(input: {
    species: Plant['species']
    position: [number, number, number]
  }): Promise<void>

  /**
   * Water a plant. At most one growth-day per calendar day (in the waterer's
   * own timezone), however many times either of you water.
   */
  waterPlant(id: string): Promise<void>

  placeDecor(input: {
    kind: Decor['kind']
    position: [number, number, number]
    facing: number
  }): Promise<void>

  // ---- games ---------------------------------------------------------------

  /**
   * Watch one round. Fires immediately with what is known now — which may be
   * `null` (nobody has opened it), or a round with only your own move in it.
   *
   * Separate from `subscribe`, because a round is only interesting while you
   * are standing in the Hollow and there is no reason for the whole world to
   * re-render when she plays a game you are not looking at.
   */
  watchRound(id: string, listener: (round: Round | null) => void): () => void

  /**
   * Open a round if it does not exist yet. Safe to call from both devices at
   * once: whoever gets there first sets the setup, and the other reads it.
   * Returns the round as it now stands.
   */
  openRound(input: { id: string; gameId: string; setup: unknown }): Promise<Round>

  /**
   * Append one of your moves. Existing moves are immutable; games that need a
   * blind commitment use move zero, while later moves can form turns or
   * stages without rewriting what came before.
   */
  playMove(roundId: string, data: unknown): Promise<void>

  // ---- the Stars -----------------------------------------------------------

  /**
   * Watch the conversation, newest last.
   *
   * Separate from `subscribe` for the same reason rounds are: the world state
   * re-renders the overlay whenever it changes, and two people talking should
   * not repaint the meadow on every sentence. Fires immediately with what is
   * known now.
   *
   * `limit` is how far back to keep in memory. There is no paging: two people
   * over a year is a few thousand short strings, and a chat that forgets is a
   * worse failure than one that costs a little memory.
   */
  watchMessages(listener: (messages: Message[]) => void, limit?: number): () => void

  /**
   * Say something. Empty bodies are refused rather than stored.
   *
   * `replyTo` is the id of the message being answered, if any. It is refused
   * the same way an empty body is if it names nothing.
   */
  sendMessage(body: string, replyTo?: string): Promise<void>

  /**
   * Put a heart on something she said, or take yours off.
   *
   * Yours only — the seam has no way to express "heart this on her behalf" and
   * the rules would refuse it if it did.
   */
  heartMessage(id: string, on: boolean): Promise<void>

  /**
   * Mark the conversation read up to now.
   *
   * Called when the Stars is open and on screen, not when a message scrolls
   * past — "read" should mean you were there, which is the only claim the
   * garden can honestly make about it.
   */
  markMessagesRead(): Promise<void>

  /** Watch the six (by default) rare voice objects and their shared capacity. */
  watchVoiceLights(listener: (garden: VoiceLightGarden) => void): () => void

  /** Put a prepared recording into one of my fixed places, replacing it if occupied. */
  leaveVoiceLight(input: {
    slot: number
    audio: Blob
    mime: string
    ext: string
    duration: number
    waveform: number[]
  }): Promise<VoiceLight>

  /** Remove one of my own lights. */
  removeVoiceLight(slot: number): Promise<void>

  /** Resolve the binary behind a light without exposing which store provides it. */
  voiceLightUrl(light: VoiceLight): Promise<string>

  /** Hidden control-room setting. The real layer accepts this only for warm. */
  setVoiceLightLimit(limit: number): Promise<void>

  // ---- the Glasshouse ------------------------------------------------------

  /**
   * Watch every memory, oldest first.
   *
   * Oldest first because a memory's place in the Glasshouse is its index in
   * this list, and that place is permanent — the same law the letters follow.
   * Sorting newest-first here would move every pane in the building every time
   * one was hung.
   *
   * Separate from `subscribe` for the usual reason, and one more: this is
   * documents only. No picture crosses this listener, so a Glasshouse with
   * five hundred memories in it costs about the same to watch as an empty one.
   */
  watchMemories(listener: (memories: Memory[]) => void): () => void

  /**
   * Hang one.
   *
   * The picture arrives already prepared — downscaled, turned the right way
   * up, stripped of where it was taken, and measured. That work is identical
   * whichever layer is live and it is all done in the browser, so it happens
   * *above* the seam in `systems/picture` and both implementations receive the
   * same finished thing. See the note there about what is thrown away.
   */
  hangMemory(input: {
    display: Blob
    /**
     * What the display copy actually is.
     *
     * Reported by the preparation rather than assumed from a module constant,
     * because the encoder falls back to JPEG if WebP will not answer — and an
     * object labelled with the wrong type is refused by the Storage rules, or
     * served as the wrong thing forever.
     */
    type: string
    ext: string
    width: number
    height: number
    tint: string
    blur: string
    when?: string
    why?: string
  }): Promise<Memory>

  /**
   * Say what you remember of one she hung.
   *
   * Yours only, and only on hers — the same shape as hearting a message. An
   * empty body takes it back off rather than storing a blank.
   */
  sayWhatIRemember(id: string, body: string): Promise<void>

  /**
   * Take one out of the glass. Yours only.
   *
   * Deletes the picture from storage for real, and leaves the document behind
   * with nothing in it — see the note on `Memory.removed` for why it cannot
   * simply be deleted, and for what the wall does with the space.
   *
   * Not undoable, and the seam does not pretend otherwise: there is no bin and
   * nothing to restore from. The interface asks twice.
   */
  removeMemory(id: string): Promise<void>

  /**
   * Something a browser can put in an `<img>`.
   *
   * Asynchronous because in the real layer this is a signed download and in
   * the mock it is a read out of IndexedDB, and callers must not care which.
   * Rejects rather than resolving to a placeholder: a picture that quietly
   * becomes a grey square is the failure this world is least willing to have.
   */
  pictureUrl(memory: Memory): Promise<string>

  // ---- the music -----------------------------------------------------------

  /** Everything either of you has put in the garden to listen to. */
  watchTracks(listener: (tracks: Track[]) => void): () => void

  /**
   * What is playing, shared between the two of you.
   *
   * Fires immediately with what is known. Whether the garden actually *follows*
   * this is decided above the seam — see `systems/listening`: you are only in
   * step while you are both here, and alone you play your own thing without
   * disturbing hers.
   */
  watchListening(listener: (state: Listening) => void): () => void

  /** Put the music somewhere. Stamps `by` and `since` itself. */
  setListening(next: { trackId: string | null; playing: boolean; at: number }): Promise<void>

  /**
   * Server time, corrected for this device's clock drift. Everything that has
   * to agree between two phones — music position, presence timeouts — uses this
   * and never `Date.now()`.
   */
  now(): number
}
