# The Fold

> *"somewhere we go and learn something, mostly alone, but then maybe there is
> a way of sharing the experience... i kinda have this idea of like adopting a
> pet in the garden like a dog... when you do, it grows"*

A shallow fold in the hills above the garden, full of mist. Long wet grass, a
broken wall, wind-bent thorns, and **animals out on the slope** — one for every
thing either of you is trying to get better at.

The mist lies in the bottom of the fold and you cannot see across it. **Doing
today's work is what lifts it.** By the time you have finished you can see the
whole hill, and every animal on it, including the ones nobody has fed for a
month.

---

## Why it is not a language app

The obvious build is Duolingo in a 3D wrapper: a lesson screen, four choices, a
streak, XP. Every part of that is forbidden here, and not by taste.

- *No cards, no borders, no rounded rectangles, no panels* — the design law.
- *No leaderboards, no per-person scores* — the design law.
- *Nothing may make being far apart feel worse* — the design law.
- And `data/types.ts` already settled the hard one, for plants:
  **"a couple's garden that punishes a missed week kills the habit it exists to
  build."**

That last line is the whole design of this place, and it is the one thing here
that argues with the brief. The ask was for a pet that *"becomes angry and
shrinks"* when you stop. A creature that punishes you for a bad fortnight is a
Tamagotchi, and the failure mode of a Tamagotchi is that you stop opening it —
which is the exact opposite of what a habit-keeper is for. This is also a
**gift**, and a gift that scolds is a bad gift.

So the stakes are kept and the punishment is not:

**Growth only ever goes up.** An animal is as big as the number of days it has
been fed, and that number cannot fall. What absence changes is where the animal
*is* and what it is *doing* — near and awake and following you about, or lying
down in the mist at the far end of the fold. Nothing dies. Nothing shrinks.
Nothing is angry with you.

And then the part that makes it bite anyway:

**The mist is what hides them.** Neglect is not announced; it is simply out of
sight. You have to do the work to see what you have been neglecting. Coming
back after a month and watching the fog pull back off four sleeping animals
says everything a red streak counter would say, and says it without once
telling you off.

## Why an animal per practice, and not one pet

The brief asked for a pet and then, in the same breath, for it to be tied to
*"whatever it is useful that is affecting our lives in a good way"* — plural,
and different for each of you. One dog cannot carry that: if it is fed by the
language and the drawing and the guitar all at once, it tells you nothing about
which of them you dropped.

So: **one animal per practice.** Walking in and seeing which parts of your life
are up and moving and which are asleep in the grass is the entire readout, and
it needs no numbers.

**The shared practice gets the shared animal.** The language the two of you are
both learning is one practice with one creature, and you both feed it — so it
is always the healthiest thing on the hill, because two people keep it. That is
the dog from the brief. It is the one that comes to you.

Her animals live on the same hill as yours. Not as a score — as company. Walking
up here while she is asleep seven timezones away and finding her animals fed is
the good half of being far apart, and it is the reason this place is shared at
all.

## The two kinds of practice, and the honesty line

| kind | what it is | what the garden does |
|---|---|---|
| `words` | a language | runs it — a real deck, real spacing, real review |
| `days` | drawing, an instrument, anything | remembers that you did it |

**The garden must never pretend to teach you the guitar.** For a `days`
practice, all that happens is that you say you did it and leave a line about
what you did. The place says so on its face: *"this one is on your word"*. That
is the honest-states law, and the alternative — a fake exercise for an
instrument nobody is holding — would be worse than nothing.

For a language it can do the real thing, and it should, because spaced
repetition is the one part of learning a language that software genuinely does
better than a notebook.

## Letting one rest

A practice somebody has genuinely given up on must be able to stop asking.

Without that, the threshold says *"three to say you did"* every day for ever
about a thing nobody is doing any more — which is a nagging list, and a nagging
list is exactly what this place was built not to be. Tapping the animal offers
**let it rest**: it walks to the far end and stops being counted.

It is never a delete. The animal stays on the hill and the days are still there,
because deleting it would take the six weeks somebody *did* keep it along with
the six they did not. `restPractice` is an update in both layers and the rules
have no delete rule for `practices` at all.

## Where the words come from

**From the two of you.** Not from a word list, and not from a model.

This is how adults actually learn a language: you meet a word, it matters
because of where you met it, and you keep it. A shipped list of the thousand
commonest Spanish words is something you can already get anywhere, and none of
it would be *yours*.

It also unlocks the one thing no learning app can do:

> **She can hand you a word.**

A word she met today, put into your deck with her name on it. Learning a word
because she left it for you is not the same activity as learning one off a
list, and it is the reason this section is in this garden rather than on a
phone's home screen.

## The spacing

Leitner, five boxes, fixed intervals: **same session, 1 day, 3, 7, 16, 35.**

Right moves up a box. **Wrong drops to box 1, never to box 0.** Dropping a word
you have half-learned all the way back to the beginning is what makes people
quit; box 1 costs you a day and no self-respect.

Grading is **yours** — you turn the word over and say whether you had it. Typing
an accented answer on a phone to be told it is wrong by one character is not
learning a language, it is fighting a keyboard. Self-grading is what a paper
flashcard does and it works.

The arithmetic is in `systems/fold.ts`, pure and with no React or three in it,
and `npm run fold` drives it headless — the whole schedule, the growth curve
and the seal on a handed word — the same way `npm run archive` does the ratings.

## The mist

The only progress indicator, and it is weather rather than an interface.

It is the fog uniforms every shader in this garden already has — `uFogNear`
and `uFogFar` — pulled in to a few metres at the start of a session and let out
to the far side of the fold as it finishes. Nothing is drawn that would not
have been drawn anyway.

**Deliberately not a sunrise**, which was the first version. The garden's law is
*one sky and one time of day across every place, so it reads as one world seen
in five*, and a place with a private dawn breaks it. Mist is weather: it works
at two in the afternoon, and at midnight it is fog under a moon, and neither
contradicts the hour anywhere else.

It comes back tomorrow. That is not a punishment either — it is just weather.

## What is deliberately not here

- **No model, and no key in the browser.** An OpenAI key in a `VITE_` variable
  ships inside the JavaScript bundle, which Vercel serves before anybody signs
  in — so it would be readable by anyone who found the address, with the
  owner's credits behind it. It is not like `VITE_YOUTUBE_API_KEY`, which is a
  restrictable public browser credential. If pronunciation or generated
  examples are wanted later they go through `functions/`, where the key stays
  on the server. The shape it would take is written down at the foot of
  `systems/fold.ts`; there is deliberately no empty function waiting for it,
  because an export that always returns null is dead code with a good excuse.
- **No streak, no XP, no percentage, no per-person totals.**
- **No test you can fail.**
