/**
 * What to call the other person.
 *
 * ---------------------------------------------------------------------------
 * The garden was written from one side of itself. Every sentence in it that
 * mentions the other person says "she" — which is correct exactly half the
 * time, and on her screen the whole world was talking about her in the third
 * person while calling her a stranger's pronoun.
 *
 * There are two people here and there always will be, so this is a table of
 * two rather than a setting: `warm` is one of them, `cool` is the other, and
 * which pronouns each of them takes is a fact about those two people. It is
 * the same shape as `Profile.name` — something the world knows about a person
 * — and it lives here rather than in the profile because it is not editable
 * from inside the garden and nothing should invite either of you to edit the
 * other's.
 *
 * **Everything reads in the feminine in source.** `{she}`, `{her}`, `{hers}`
 * are the tokens, so a sentence written in a game definition still reads as a
 * sentence when you are looking at the code, and swaps when it is looking at
 * her. That was deliberate: the alternative — `{subject}`, `{object}` — turns
 * every line of copy in the garden into a form to fill in.
 * ---------------------------------------------------------------------------
 */

import { otherUser, type UserId } from '@/data/types'

export interface Pronouns {
  /** she · he */
  they: string
  /** her · him */
  them: string
  /** her · his — before a noun. "**her** line is on the road" */
  their: string
  /** hers · his — standing alone. "chase **hers**" */
  theirs: string
}

const SHE: Pronouns = { they: 'she', them: 'her', their: 'her', theirs: 'hers' }
const HE: Pronouns = { they: 'he', them: 'him', their: 'his', theirs: 'his' }

/**
 * Who takes which.
 *
 * If this is ever wrong it is wrong for one of exactly two people, and they
 * will say so within a minute of reading it.
 */
const OF: Record<UserId, Pronouns> = { warm: HE, cool: SHE }

/** The pronouns for the person you are *not*. */
export function themOf(me: UserId): Pronouns {
  return OF[otherUser(me)]
}

/** Capitalised, for the start of a sentence. */
function up(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/**
 * Fill a written sentence in.
 *
 * `{them}` is her name, which is what it already meant everywhere it was used,
 * and the rest are pronouns. Capitalised tokens give a capitalised word, so
 * `{She}` starts a sentence and `{she}` sits inside one.
 *
 * Anything with no tokens in it comes back untouched, which is most of the
 * garden — this is safe to run over any string that is about to be read.
 */
export function say(text: string, me: UserId, theirName: string): string {
  const p = themOf(me)
  const words: Record<string, string> = {
    them: theirName,
    she: p.they,
    her: p.them,
    hers: p.theirs,
    /*
      "Her" is two words wearing one spelling — the one in "give it to her" and
      the one in "her line is on the road" — and they part company as soon as
      it is him: "give it to him", "his line". So the second one is `{their}`,
      the only spelling English offers that cannot be mistaken for the other.
    */
    their: p.their,
  }
  return text.replace(/\{([A-Za-z]+)\}/g, (whole, token: string) => {
    const key = token.toLowerCase()
    const word = words[key]
    if (word === undefined) return whole
    return token[0] === token[0].toUpperCase() ? up(word) : word
  })
}
