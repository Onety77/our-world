import type { UserId } from '@/data/types'
import { validatePractice, type Practice } from './model'

const key = (me: UserId) => `garden:clearing:pending:${me}`
export function readPending(me: UserId): Practice | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(me)) ?? 'null')
    if (!value) return null
    validatePractice(value, me)
    return value
  } catch {
    return null
  }
}
export function keepPending(practice: Practice) {
  try {
    localStorage.setItem(key(practice.by), JSON.stringify(practice))
    return true
  } catch {
    return false
  }
}
export function clearPending(practice: Practice) {
  try {
    if (readPending(practice.by)?.id === practice.id) localStorage.removeItem(key(practice.by))
  } catch {}
}
