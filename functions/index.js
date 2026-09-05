/**
 * Closed-app notifications for everything either of you leaves for the other.
 *
 * ---------------------------------------------------------------------------
 * **This used to be the Stars and nothing else**, which was the right first one
 * and a strange place to stop. The Stars is the only thing in the garden that
 * expects an answer *now*; everything else — a thought under the Tree, a
 * picture in the Glasshouse, a move in a game, an answer to the question — is
 * by design something the other one finds later. And "later" only happens if
 * something tells them.
 *
 * `systems/newness` already lights what she left, in the place she left it,
 * beautifully. But it lights it *once you are in the garden*, and with seven
 * timezones coming that is the easier half of the problem. This is the half
 * that gets you there.
 *
 * Every trigger is a Firestore create, and none of them trusts the client with
 * anything: the sender cannot choose a token, a title, or a destination. Those
 * are derived here with Admin privileges, so client code and client rules
 * never need access to the other person's device addresses.
 * ---------------------------------------------------------------------------
 */

const { initializeApp } = require('firebase-admin/app')
const { getDatabase } = require('firebase-admin/database')
const { getFirestore } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')
const { logger, setGlobalOptions } = require('firebase-functions')
const { onDocumentCreated } = require('firebase-functions/v2/firestore')

initializeApp()

// The database already lives in us-central1. Two instances are far more than
// a two-person conversation can need and put a firm ceiling on accidental
// scale without delaying ordinary messages.
setGlobalOptions({ region: 'us-central1', maxInstances: 2, memory: '256MiB', timeoutSeconds: 30 })

const invalidTokenCodes = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
])

function cleanBody(value) {
  const body = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (body.length <= 180) return body
  return `${body.slice(0, 177)}…`
}

/** A visible garden refreshes this at least every twenty seconds. */
async function recipientIsInGarden(recipient) {
  try {
    const snapshot = await getDatabase().ref(`presence/${recipient}`).get()
    const presence = snapshot.val()
    const lastSeen = Number(presence?.lastSeen)
    return presence?.online === true
      && Number.isFinite(lastSeen)
      && Date.now() - lastSeen < 45_000
  } catch (error) {
    // Push is the safe failure mode: a temporary presence read failure must not
    // silently lose a message meant for a closed phone.
    logger.warn('Could not establish whether the recipient was in the garden.', {
      recipient,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/** Whichever of the two did not do it. */
const theOther = (who) => (who === 'warm' ? 'cool' : 'warm')

/** One of the two, or nothing — every trigger below starts by asking this. */
const oneOfThem = (who) => (who === 'warm' || who === 'cool' ? who : null)

/** Their own name, or the side they are on if they have not written one. */
async function nameOf(db, who) {
  try {
    const profile = await db.collection('profiles').doc(who).get()
    const name = profile.exists ? profile.get('name') : null
    if (typeof name === 'string' && name.trim()) return name.trim().slice(0, 80)
  } catch (error) {
    logger.warn('Could not read a profile name.', { who })
  }
  return who === 'warm' ? 'Warm' : 'Cool'
}

/**
 * Say one thing to somebody's closed phone.
 *
 * ---------------------------------------------------------------------------
 * The whole of the delivery, in one place, because there are five callers now
 * and every one needs the same four things done exactly right: not disturbing
 * somebody who is already looking at the garden, addressing only devices that
 * have registered, forgetting addresses that have expired, and saying so when
 * a delivery fails for any other reason.
 *
 * Written five times, one of them would quietly stop clearing its dead tokens
 * and nobody would find out until a phone had silently stopped receiving
 * anything at all.
 *
 * **The tag is what stops five kinds of news replacing one another.** The
 * worker collapses notifications sharing one, which is right within a kind —
 * four moves in a row is one "it is your turn" — and wrong across them: an
 * unread letter must not be swallowed by a game.
 * ---------------------------------------------------------------------------
 */
async function tell(recipient, { title, body, url, tag, about }) {
  // A visible garden already has the live document, its own tone and its own
  // light. Do not send system chrome to this person's other devices as well.
  if (await recipientIsInGarden(recipient)) return

  const db = getFirestore()
  const devices = await db
    .collection('pushDevices').doc(recipient).collection('devices').get()

  const addressed = devices.docs
    .map((entry) => ({ ref: entry.ref, token: entry.get('token') }))
    .filter((entry) => typeof entry.token === 'string' && entry.token.length >= 20)
    // FCM multicast accepts at most 500 addresses. There will normally be one.
    .slice(0, 500)

  if (addressed.length === 0) return

  const result = await getMessaging().sendEachForMulticast({
    tokens: addressed.map((entry) => entry.token),
    data: { title, body, url, tag },
    webpush: { headers: { Urgency: 'high', TTL: '86400' } },
  })

  const expired = []
  result.responses.forEach((response, index) => {
    const code = response.error?.code
    if (!response.success && code && invalidTokenCodes.has(code)) {
      expired.push(addressed[index].ref)
    }
  })

  if (expired.length > 0) {
    const batch = db.batch()
    expired.forEach((ref) => batch.delete(ref))
    await batch.commit()
  }

  if (result.failureCount > expired.length) {
    logger.warn('Some push deliveries failed without invalidating their address.', {
      about,
      attempted: addressed.length,
      failed: result.failureCount,
      removed: expired.length,
    })
  }
}

exports.notifyNewMessage = onDocumentCreated('messages/{messageId}', async (event) => {
  const message = event.data?.data()
  const sender = oneOfThem(message?.by)
  if (!sender) return
  const db = getFirestore()

  await tell(theOther(sender), {
    title: await nameOf(db, sender),
    body: cleanBody(message.body) || 'Something is waiting in the Stars.',
    url: '/?section=stars',
    tag: 'garden:said',
    about: `message ${event.params.messageId}`,
  })
})

/*
  ---------------------------------------------------------------------------
  The four quiet ones.

  Everything below is something you find later by design, and every one of them
  went unannounced until now. They differ from the Stars in what they should
  say: a message carries its own words, and these mostly should not. A thought
  under the Tree is worth reading where it was left, in the place it grew a
  flower — putting its whole text on a lock screen spends it. So these say what
  happened and where, and let the garden do the rest.
  ---------------------------------------------------------------------------
*/

/** `word-duel` reads as "Word Duel" without a second copy of the registry. */
function gameName(roundId) {
  const id = String(roundId).split(':')[0].replace(/[-_]+/g, ' ').trim()
  if (!id) return 'a game'
  return id.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

/**
 * A thought left under the Tree — or wherever else a letter is put down.
 *
 * The body is deliberately not sent. A letter is written to be found in the
 * place it was left, with its flower beside it, and a lock screen is the
 * opposite of that: it would be read once, out of the world, and then be old
 * news by the time you got there.
 */
exports.notifyNewLetter = onDocumentCreated('letters/{letterId}', async (event) => {
  const letter = event.data?.data()
  const sender = oneOfThem(letter?.by)
  if (!sender) return
  const db = getFirestore()
  const where = typeof letter.placeId === 'string' && /^[a-z-]{1,32}$/.test(letter.placeId)
    ? letter.placeId
    : 'tree'

  await tell(theOther(sender), {
    title: await nameOf(db, sender),
    body: 'left you a thought.',
    url: `/?section=${where}`,
    tag: 'garden:thought',
    about: `letter ${event.params.letterId}`,
  })
})

/**
 * A picture hung in the Glasshouse.
 *
 * Its own line goes with it — unlike a letter, a memory's words are a caption
 * rather than the thing, and "the night before you left" is an invitation to
 * go and look rather than a substitute for looking.
 */
exports.notifyNewMemory = onDocumentCreated('memories/{memoryId}', async (event) => {
  const memory = event.data?.data()
  const sender = oneOfThem(memory?.by)
  if (!sender) return
  const db = getFirestore()
  const line = cleanBody(memory.why) || cleanBody(memory.when)

  await tell(theOther(sender), {
    title: await nameOf(db, sender),
    body: line ? `hung a picture — ${line}` : 'hung a picture in the Glasshouse.',
    url: '/?section=glasshouse',
    tag: 'garden:picture',
    about: `memory ${event.params.memoryId}`,
  })
})

/**
 * A move in a game, which is the one that most needs saying.
 *
 * These games are one move each, whenever you are here — the whole model
 * assumes the other one is asleep. Until now the only thing that said your
 * turn had come was opening the app and going to look.
 *
 * The move's own data is never read. It is opaque to everything but the game
 * that wrote it (see `Move` in `data/types`), and a notification is no place
 * to start being the exception.
 */
exports.notifyNewMove = onDocumentCreated('rounds/{roundId}/moves/{moveId}', async (event) => {
  const move = event.data?.data()
  const sender = oneOfThem(move?.by)
  if (!sender) return
  const db = getFirestore()

  await tell(theOther(sender), {
    title: await nameOf(db, sender),
    body: `played in ${gameName(event.params.roundId)}. Your turn.`,
    url: '/?section=hollow',
    tag: 'garden:turn',
    about: `move ${event.params.roundId}/${event.params.moveId}`,
  })
})

/**
 * An answer to the Tree's question.
 *
 * The answer itself is never sent, and that is not squeamishness — the whole
 * ritual is that neither of you sees the other's answer until you have both
 * written one. A notification carrying it would break the game it belongs to.
 */
exports.notifyNewAnswer = onDocumentCreated(
  'questionRounds/{roundId}/answers/{who}',
  async (event) => {
    const sender = oneOfThem(event.params.who)
    if (!sender) return
    const db = getFirestore()

    await tell(theOther(sender), {
      title: await nameOf(db, sender),
      body: 'answered. Yours is the one that opens it.',
      url: '/?section=tree',
      tag: 'garden:question',
      about: `answer ${event.params.roundId}/${event.params.who}`,
    })
  },
)
