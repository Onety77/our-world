/**
 * One browser's address for real, closed-app notifications.
 *
 * The service worker is the ear on the device; Firebase Cloud Messaging is
 * the road to it; this document in Firestore is the address the server sends
 * to. None of those is a person-wide preference. A phone, a laptop and a
 * tablet are three independent addresses and may each be switched off.
 *
 * Loaded only when notifications are enabled. Keeping Messaging behind this
 * dynamic boundary means a person who never asks for push never downloads it.
 */

import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseConfig, firebaseVapidKey } from '@/config'
import type { UserId } from './types'
import { firebase } from './firebase'

const DEVICE_KEY = 'garden:push-device:v1'
const WORKER = '/firebase-messaging-sw.js'

function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY)
    if (existing) return existing
    const made = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, made)
    return made
  } catch {
    // A blocked localStorage should not make the notification permission that
    // was already granted useless. This address lasts for the session; a later
    // successful registration replaces no data and is still safe.
    return crypto.randomUUID()
  }
}

function workerUrl(): string {
  const config = firebaseConfig()
  const query = new URLSearchParams({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  })
  return `${WORKER}?${query}`
}

function deviceRef(me: UserId) {
  return doc(firebase().db, 'pushDevices', me, 'devices', deviceId())
}

export class PushUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PushUnavailable'
  }
}

/** Register or refresh this particular browser's FCM address. */
export async function registerPushDevice(me: UserId): Promise<void> {
  if (!window.isSecureContext) {
    throw new PushUnavailable('Notifications need the secure, hosted garden.')
  }
  if (!('serviceWorker' in navigator)) {
    throw new PushUnavailable('This browser cannot keep notifications while the garden is closed.')
  }

  const vapidKey = firebaseVapidKey()
  if (!vapidKey) {
    throw new PushUnavailable('The garden is missing its Web Push key.')
  }

  const { deleteToken, getMessaging, getToken, isSupported } = await import('firebase/messaging')
  if (!(await isSupported())) {
    throw new PushUnavailable('This browser does not support Web Push here.')
  }

  const registration = await navigator.serviceWorker.register(workerUrl(), { scope: '/' })
  await registration.update().catch(() => {})
  const messaging = getMessaging(firebase().app)
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration })
  if (!token) throw new PushUnavailable('This phone did not give the garden a notification address.')

  try {
    await setDoc(
      deviceRef(me),
      {
        owner: me,
        token,
        updatedAt: serverTimestamp(),
      },
      { merge: false },
    )
  } catch (error) {
    // Do not leave a live browser token which the owner believes was refused.
    await deleteToken(messaging).catch(() => {})
    throw error
  }
}

/**
 * Stop this device. Token deletion happens even if Firestore is temporarily
 * unreachable; the next attempted send then fails and the server removes the
 * stale address itself.
 */
export async function unregisterPushDevice(me: UserId): Promise<void> {
  const tasks: Promise<unknown>[] = [deleteDoc(deviceRef(me))]

  try {
    const { deleteToken, getMessaging, isSupported } = await import('firebase/messaging')
    if (await isSupported()) tasks.push(deleteToken(getMessaging(firebase().app)))
  } catch {
    // The Firestore address is the authoritative switch. If this browser no
    // longer supports Messaging, removing that address is enough.
  }

  const results = await Promise.allSettled(tasks)
  const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failed) throw failed.reason
}
