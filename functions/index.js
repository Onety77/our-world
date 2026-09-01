/**
 * Closed-app notifications for the Stars.
 *
 * One Firestore create is the only trigger. The sender cannot choose a token,
 * a title, or a destination: those are derived here with Admin privileges, so
 * client code and client rules never need access to the other person's device
 * addresses.
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

exports.notifyNewMessage = onDocumentCreated('messages/{messageId}', async (event) => {
  const message = event.data?.data()
  if (!message || (message.by !== 'warm' && message.by !== 'cool')) return

  const sender = message.by
  const recipient = sender === 'warm' ? 'cool' : 'warm'
  const db = getFirestore()

  // A visible copy already has the live Firestore message, authored tone and
  // unread light. Do not send a system notification to any of this person's
  // other registered devices while they are visibly in the garden.
  if (await recipientIsInGarden(recipient)) return

  const [devices, profile] = await Promise.all([
    db.collection('pushDevices').doc(recipient).collection('devices').get(),
    db.collection('profiles').doc(sender).get(),
  ])

  const addressed = devices.docs
    .map((entry) => ({ ref: entry.ref, token: entry.get('token') }))
    .filter((entry) => typeof entry.token === 'string' && entry.token.length >= 20)
    // FCM multicast accepts at most 500 addresses. There will normally be one.
    .slice(0, 500)

  if (addressed.length === 0) return

  const profileName = profile.exists ? profile.get('name') : null
  const from = typeof profileName === 'string' && profileName.trim()
    ? profileName.trim().slice(0, 80)
    : sender === 'warm' ? 'Warm' : 'Cool'
  const body = cleanBody(message.body) || 'Something is waiting in the Stars.'

  const result = await getMessaging().sendEachForMulticast({
    tokens: addressed.map((entry) => entry.token),
    data: {
      title: from,
      body,
      url: '/?section=stars',
      messageId: event.params.messageId,
    },
    webpush: {
      headers: {
        Urgency: 'high',
        TTL: '86400',
      },
    },
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
    logger.warn('Some push deliveries failed without invalidating their device address.', {
      messageId: event.params.messageId,
      attempted: addressed.length,
      failed: result.failureCount,
      removed: expired.length,
    })
  }
})
