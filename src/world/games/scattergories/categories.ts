/**
 * Everything the die might ask you for.
 *
 * ---------------------------------------------------------------------------
 * **Two hundred of them, and that number is the feature.**
 *
 * A category list you recognise is a category list you have already answered.
 * The boxed game ships twelve cards of twelve and you learn them; this has to
 * survive two people playing it for years, four rounds at a time, so the pool
 * has to be deep enough that a repeat is a coincidence rather than a pattern.
 *
 * **They are written to be answerable, not clever.** The failure mode of a
 * hand-written category list is the one nobody thinks of until they play it:
 * a prompt so specific that only three answers exist, all of which start with
 * the same letter. So these lean toward *kinds of thing* — "something sold on
 * the street", "a reason to miss a flight" — where the answer space is wide
 * and the fun is in what somebody picks out of it.
 *
 * **And they are theirs.** Kano, Lagos, and wherever the other one of them is
 * this year. A category list assembled out of American television is a list
 * where one of two people is always guessing, so this is deliberately mixed:
 * things from home, things from away, and a lot of things that belong to
 * anybody.
 * ---------------------------------------------------------------------------
 */

/**
 * The faces of the die, and there are twenty of them.
 *
 * **These are the real ones.** The physical Scattergories die leaves out
 * J, Q, V, X, Y and Z, and that is not an oversight to be improved on — it is
 * the single most important design decision in the whole game. A letter with
 * four possible answers is not a hard round, it is a round nobody enjoys, and
 * no amount of care over the category list rescues one.
 *
 * Keeping the real faces means the per-category exclusions below only have to
 * handle the genuinely awkward pairs rather than every impossible one.
 */
export const DIE_FACES = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K',
  'L', 'M', 'N', 'O', 'P', 'R', 'S', 'T', 'U', 'W',
] as const

export type Face = (typeof DIE_FACES)[number]

export interface Category {
  /**
   * A stable id. It ends up in no saved data today, but a category is the sort
   * of thing that gets reworded, and a list keyed by its own text would
   * silently become a different list every time somebody fixed a comma.
   */
  id: string
  text: string
  /**
   * Letters this one should never be dealt with.
   *
   * Only where the pairing is genuinely barren — not where it is merely hard.
   * Being stuck for a moment is the game; being stuck because there is no
   * answer is a bug in the list. Kept short on purpose: if a category needs
   * six exclusions it is the category that is wrong.
   */
  hard?: string
}

/** Written as `text` or `text|hard-letters`, which keeps the list readable. */
const RAW: Record<string, string[]> = {
  places: [
    'A country you could point to on a map',
    'A city worth changing planes for',
    'Somewhere you have queued for too long',
    'A place you would hide',
    'Somewhere it is always too cold',
    'A street either of you has lived on',
    'Somewhere you can hear the sea',
    'A place that smells like something',
    'Somewhere you would not go back to|U',
    'A country neither of you has been to',
    'Somewhere people go to be seen',
    'A place that is better at night',
    'Somewhere you would take a visitor',
    'A place with a famous river|U',
    'Somewhere you would get lost',
    'A place nobody can pronounce',
    'Somewhere you would go to be alone',
    'A market worth waking up for|U',
    'A place a wedding might happen',
    'Somewhere with too many stairs|U',
    'A place you have only seen in a photograph',
    'Somewhere it rains too much',
    'An island',
    'A place you can walk to from here',
    'Somewhere a road ends',
    'A capital city',
    'Somewhere you would not want to break down',
    'A place that has changed its name|U',
  ],
  food: [
    'Something eaten with your hands',
    'A food you would not share',
    'Something sold on the street',
    'A drink for a hot afternoon',
    'Something that is better the next day',
    'A food you pretend to like',
    'Something you would cook to impress somebody',
    'A meal you eat standing up',
    'Something too sweet',
    'A food that needs a spoon',
    'Something you would carry on a long journey',
    'A soup, a stew or a broth|U',
    'Something you would never put in a sandwich',
    'A fruit',
    'Something you would eat at four in the morning',
    'A spice or a seasoning',
    'Something you would order for the table',
    'A food you have to be taught to eat|U',
    'Something you buy in a bag',
    'A dish with somebody else’s name on it|U',
    'Something you would eat on a beach',
    'A food that stains',
    'Something served in a leaf, a paper or a cone|U',
    'A breakfast',
    'Something you would bring to somebody who was ill',
    'A snack for a long drive',
  ],
  people: [
    'A name a grandparent would give a child',
    'Somebody you would call in an emergency|U',
    'A name that is hard to spell',
    'Somebody everybody has an opinion about',
    'A name you would give a son',
    'A name you would give a daughter',
    'Somebody you would want on your side of an argument|U',
    'A person from history',
    'Somebody who is famous for one thing',
    'A name that sounds like money',
    'Somebody you would not lend money to',
    'A person who works at night',
    'A job you would be terrible at',
    'Somebody in a uniform',
    'A name from a song',
    'A job that did not exist when you were born|U',
    'Somebody who talks too much',
    'A name you have never met anybody called',
    'A person who fixes things',
    'Somebody you would trust with a secret|U',
    'A job with a bad smell',
    'A person you would recognise from behind|U',
  ],
  things: [
    'Something in your pocket right now',
    'Something you have lost more than once',
    'Something that needs charging',
    'A terrible gift',
    'Something you would name a car',
    'Something you would grab in a fire',
    'Something that is always the wrong size',
    'Something you keep meaning to fix',
    'Something with a strap',
    'Something you would find under a bed',
    'Something too heavy to carry alone',
    'Something you own more than five of',
    'Something that comes in a box',
    'Something you would not lend to anybody',
    'Something in a handbag',
    'Something you have to sign for',
    'Something that is worth queueing for|U',
    'Something with a smell you like',
    'Something you would take camping',
    'Something you would find in a drawer',
    'Something older than you are',
    'Something that only works when you hit it|U',
    'Something you would put in a suitcase',
    'Something you would find behind a fridge|U',
    'Something you would buy secondhand',
    'Something that makes a noise you hate',
  ],
  entertainment: [
    'A film worth watching twice',
    'A song you know all the words to',
    'A book somebody made you read',
    'A game you played as a child',
    'A television programme you gave up on|U',
    'A musician',
    'A film with a bad ending',
    'Something you would sing badly',
    'A story everybody knows',
    'A dance',
    'A film you have never finished',
    'A band or a group',
    'Something you would watch with the sound off|U',
    'A cartoon',
    'A song for a long drive',
    'A film that made somebody cry',
    'An instrument',
    'A sport',
    'Something you would put on at a party',
    'A famous line from anything',
    'A comedian or somebody who thinks they are one',
    'A film set somewhere you would like to go',
  ],
  nature: [
    'An animal you would not want to meet',
    'A bird',
    'Something that grows',
    'An animal that is smaller than it sounds|U',
    'Something you would find on the ground after rain|U',
    'A tree',
    'An insect',
    'Something that lives in water',
    'A flower',
    'Something that only happens at night',
    'An animal with a good name',
    'Something in the sky',
    'A colour you would find outdoors',
    'Something that stings, bites or scratches',
    'An animal you have actually touched',
    'Something that grows without being planted|U',
    'A sound you would hear outside',
    'Something the wind does',
    'An animal in a story',
    'Something you would find on a riverbank',
  ],
  funny: [
    'A reason to miss a flight',
    'A bad excuse',
    'Something you would regret buying',
    'A terrible name for a restaurant',
    'Something that should not be a flavour',
    'A reason to leave a party early',
    'Something you would not want to find in your food',
    'A bad first line for a letter',
    'Something a cat would knock over|U',
    'A reason somebody is late',
    'Something you would not say in a lift',
    'A bad name for a boat',
    'Something you have argued about pointlessly',
    'A reason to be awake at three in the morning',
    'Something that is somehow always sticky|U',
    'A bad superpower',
    'Something you would not want to be famous for',
    'A terrible sound to wake up to',
    'Something that would ruin a photograph',
    'A rule nobody follows',
    'Something you would take to a desert island',
    'A bad thing to hear a pilot say|U',
    'Something you would not want doubled',
    'A reason to turn a car around',
  ],
  us: [
    'A place we should go',
    'Something you would keep of mine',
    'Something we both like',
    'Something I would never eat',
    'A thing you do that I would recognise anywhere|U',
    'Something worth saving up for',
    'A place we have both been',
    'Something you would send me a photograph of|U',
    'A word one of us says too much',
    'Something we should stop doing',
    'A name for a house',
    'Something you would want on a long journey with me|U',
    'A day worth remembering',
    'Something you would teach me',
    'Something I could teach you',
    'A thing we should own one day',
    'Something that would make either of us laugh',
    'A place to sit and say nothing',
  ],
  home: [
    'Something in a kitchen',
    'Something you plug in',
    'Something you would find on a roof|U',
    'Something in a bathroom',
    'A reason to leave the house',
    'Something you do before bed',
    'Something you clean too rarely',
    'Something on a wall',
    'Something you would find in a car',
    'A noise a house makes',
    'Something you would find in a school bag',
    'Something in a market stall',
    'Something you keep for no reason',
    'Something you would find at a wedding',
    'Something that wakes you up',
    'Something you would find at a bus stop',
    'Something people keep by the door',
    'Something you would find in a hospital',
    'Something in an office nobody uses|U',
    'Something you would find at a funeral',
  ],
}

function build(): Category[] {
  const out: Category[] = []
  for (const [group, lines] of Object.entries(RAW)) {
    lines.forEach((line, i) => {
      const [text, hard] = line.split('|')
      out.push({ id: `${group}-${i}`, text, ...(hard ? { hard } : {}) })
    })
  }
  return out
}

export const CATEGORIES: readonly Category[] = build()

/** Whether a category may be dealt with a given letter. */
export function fits(category: Category, letter: string): boolean {
  return !category.hard?.includes(letter)
}
