import { stillSealed, type Letter, type UserId } from '@/data/types'

export type ThoughtFilter = 'all' | 'unread' | 'mine' | 'sealed'
export function thoughtUnread(letter: Letter, me: UserId, now: number) {
  return letter.by !== me && letter.readAt === null && !stillSealed(letter, me, now)
}
export function findThoughts(letters: Letter[], me: UserId, now: number, filter: ThoughtFilter, query = '') {
  const term = query.trim().toLocaleLowerCase()
  return letters.filter(letter => {
    if (letter.placeId !== 'tree') return false
    const sealed = stillSealed(letter, me, now)
    if (filter === 'unread' && !thoughtUnread(letter, me, now)) return false
    if (filter === 'mine' && letter.by !== me) return false
    if (filter === 'sealed' && !(letter.openAt !== null && letter.openAt > now)) return false
    // Never let a search reveal the contents of a closed seal, even if cached.
    return !term || (!sealed && letter.body.toLocaleLowerCase().includes(term))
  }).sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
}
