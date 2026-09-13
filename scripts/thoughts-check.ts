import assert from 'node:assert/strict'
import type { Letter } from '../src/data/types'
import { findThoughts, thoughtUnread } from '../src/systems/thoughts'

const now = 1800000000000
const thought = (id: string, values: Partial<Letter> = {}): Letter => ({ id, body: 'Remember the river', by: 'cool', placeId: 'tree', position: [0, 0, 0], at: now - 100, openAt: null, readAt: null, ...values })
const sealed = thought('sealed', { body: 'PRIVATE CANARY', openAt: now + 1000 })
const mine = thought('mine', { by: 'warm', at: now - 50 })
const read = thought('read', { readAt: now - 10 })
const other = thought('other', { placeId: 'hollow' })
const all = [sealed, mine, read, other, thought('new')]
const before = JSON.stringify(all)
assert.equal(findThoughts(all, 'warm', now, 'all').length, 4)
assert.deepEqual(findThoughts(all, 'warm', now, 'unread').map(l => l.id), ['new'])
assert.deepEqual(findThoughts(all, 'warm', now, 'mine').map(l => l.id), ['mine'])
assert.deepEqual(findThoughts(all, 'warm', now, 'sealed').map(l => l.id), ['sealed'])
assert.equal(findThoughts(all, 'warm', now, 'all', 'canary').length, 0, 'search cannot reveal a cached sealed body')
assert.equal(findThoughts(all, 'cool', now, 'all', 'canary').length, 1, 'authors retain access to their own words')
assert.equal(findThoughts(all, 'warm', now + 1000, 'all', 'canary').length, 1)
assert(thoughtUnread(sealed, 'warm', now + 1000), 'an opened seal becomes unread at its date')
assert(!thoughtUnread(mine, 'warm', now), 'own thoughts are not unread')
assert.equal(findThoughts(all, 'warm', now, 'all', '  RIVER  ').length, 3)
assert.equal(JSON.stringify(all), before, 'search cannot mutate stored ordering or content')
console.log('PASS tree-only search, unread/author/date filters, sealed-content privacy, opening boundary, stable source data')
