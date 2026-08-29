/**
 * `say`, bound to whoever is holding the phone.
 *
 * The pronoun table and the substitution are in `systems/them`, which has no
 * React in it. This is the two lines that find out who you are and who the
 * other one is, so a component can write `{say('{She} is here.')}` and be
 * correct on both screens.
 */

import { useCallback } from 'react'
import { useData, useWorldSlice } from '@/data/provider'
import { otherUser } from '@/data/types'
import { say } from './them'

export function useSay(): (text: string) => string {
  const data = useData()
  const me = data.me
  const theirName = useWorldSlice((s) => s.profiles[otherUser(me)].name)
  return useCallback((text: string) => say(text, me, theirName), [me, theirName])
}
