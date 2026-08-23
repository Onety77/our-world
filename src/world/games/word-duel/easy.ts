/**
 * Words you would actually say out loud.
 *
 * ---------------------------------------------------------------------------
 * The answer list in `fair.ts` is the standard Wordle set: 2,315 words that
 * are *fair* — no cruel plurals, nothing obscure by dictionary standards. Fair
 * is not the same as **known**. It contains LATCH, GROUT, TAPIR, KNOLL and
 * several hundred others that are perfectly good English and that nobody
 * reaches for, and losing to a word you have never used is not losing a game,
 * it is being told you are stupid by a computer.
 *
 * This is the pile the game actually deals from: everyday words, the sort that
 * turn up in a conversation. It is smaller on purpose. One a day would take
 * well over a year to repeat, and the game is not trying to be a vocabulary
 * test — it is two people sending each other a puzzle.
 *
 * **`fair.ts` is untouched and still the checker.** Every word here is
 * filtered against it at load, so anything mistyped or not actually in the
 * answer set is silently dropped rather than dealing a word the other player
 * would not be allowed to type. See `loadWords` in `words.ts`.
 *
 * Written out with spaces rather than packed like the other two lists. Those
 * are 72KB and 11KB and have to be dense; this is a few kilobytes and wants to
 * be *edited* — if a word in here turns out to be annoying, it should be one
 * keystroke to take out.
 * ---------------------------------------------------------------------------
 */

export const EASY = `
about above actor acute admit adopt adult after again agent agree ahead alarm
album alert alike alive allow alone along aloud alter among anger angle angry
ankle apart apple apply arena argue arise arrow aside asset audio avoid
await awake award aware awful bacon badge badly baker basic batch beach beard
beast began begin begun being belly below bench berry birth black blade blame
blank blast blaze bleed blend bless blind block blood bloom blown blunt
blush board boast bonus boost booth bound brain brake brand brass brave bread
break breed brick bride brief bring broad broke brown brush build built bunch
burnt burst buyer cabin cable candy canoe cargo carry carve catch cause cease
chain chair chalk charm chart chase cheap cheat check cheek cheer chess chest
chief child chill china choir chose chunk cider cigar civic civil claim clash
class clean clear clerk click cliff climb cling clock close cloth cloud clown
coach coast cocoa color comic coral couch cough could count court cover crack
craft crane crash crawl crazy cream creek creep crest crime crisp cross crowd
crown crude cruel crush crust curve cycle daily dairy dance dealt death
debut decay delay delta dense depth devil diary dirty ditch diver dizzy dodge
doing donor doubt dozen draft drain drama drank drawn dream dress dried drift
drill drink drive drove drown drunk dryer dying eager eagle early earth eight
elbow elder elect elite empty enemy enjoy enter entry equal equip error essay
event every exact exist extra faint fairy faith false fancy fatal fault favor
feast fence ferry fever fewer fiber field fifth fifty fight final first flame
flash fleet flesh float flock flood floor flour flown fluid flush focus force
forge forth forty forum found frame fraud fresh fried front frost frown fruit
fully funny giant given glass gleam globe glory glove going grace grade grain
grand grant grape graph grasp grass grave gravy great greed green greet grief
grill grind groan groom group grove growl guard guess guest guide guilt habit
hairy handy happy harsh haste hatch haunt heard heart heavy hedge hello hence
hobby honey honor horse hotel house hover human humor hurry ideal image imply
index inner input irony issue ivory jelly jewel joint jolly judge juice juicy
kneel knife knock known label labor large later laugh layer learn lease
least leave legal lemon level lever light limit linen liver lobby local lodge
logic loose loser lover lower loyal lucky lunar lunch lying magic maker mango
maple march marry marsh match mayor meant medal media melon mercy merit merry
metal meter might minor minus model money month moral motor mount mouse
mouth movie music nasty naval needy nerve never newly night noble noise
north novel nurse nylon occur ocean offer often olive onion onset opera
orbit order organ other ought ounce outer owner paint panel panic paper party
pasta paste patch patio pause peace peach pearl pedal penny perch petal phase
phone photo piano piece pilot pinch pitch pizza place plain plane plant plate
plaza plead pluck plump point polar porch pound power press price pride prime
print prior prize probe proof proud prove pulse punch pupil puppy purse queen
query quest queue quick quiet quilt quite quote radar radio raise rally ranch
range rapid ratio reach react ready realm rebel refer reign relax relay reply
rider ridge rifle right rigid rinse risky rival river roast robin robot rocky
rogue rough round route royal rugby ruler rumor rural sadly saint salad
salon sandy sauce scale scarf scene scent scoop scope score scout scrap screw
seize sense serve seven shade shaft shake shall shame shape share shark sharp
shave sheep sheet shelf shell shift shine shiny shirt shock shoot shore short
shout shown shrug sight silly since sixth sixty skate skill skirt slave sleep
slice slide slope small smart smash smell smile smoke snake sneak solar solid
solve sorry sound south space spare spark speak spear speed spell spend spent
spice spike spill spine spite split spoil spoke spoon sport spray squad stack
staff stage stain stair stake stale stamp stand stare start state steak steal
steam steel steep steer stern stick stiff still sting stock stole stone stood
stool store storm story stove strap straw strip stuck study stuff style sugar
suite sunny super surge sweat sweep sweet swept swift swing sword syrup table
taken tally taste teach teeth tempo tenth thank theft their theme there these
thick thief thigh thing think third thorn those three threw throw thumb tiger
tight timer title toast today token tooth topic torch total touch tough
tower toxic trace track trade trail train trait trash treat trend trial tribe
trick tried truck truly trunk trust truth tulip tutor twice twist tying
ultra uncle under union unite unity until upper upset urban usage usual utter
vague valid value valve vapor vault venue verse video villa vinyl viral virus
visit vital vivid vocal voice voter wagon waist waste watch water weary weave
wedge weigh weird whale wheat wheel where which while white whole whose widen
widow width witch woman women world worry worse worst worth would wound wrist
write wrong wrote yacht yield young youth zebra
`
