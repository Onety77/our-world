# The roads' music

One file per road. Drop them here, named exactly:

    rootway.m4a
    moonbreak.m4a
    stormcrown.m4a

That is the whole installation step — `../roadMusic.ts` picks them up by name at
build time. A road with no file here is silent, which is a valid state and not
an error: the rest of the racing sound carries the road on its own.

**Only these three names are read.** Anything else in this folder is ignored, so
`rootway-take3.m4a` is a file you can leave lying about while you decide.

## When it plays

**Not while you are on the road — while you are *racing* on it.** Nothing sounds
before the green light, it arrives over about fifteen seconds from almost
nothing, it gets out of the way of a drift, it drops and goes muffled under the
Drowned Mile, it ducks for a close strike on the Stormcrown, it fades out on a
pause and comes back when you carry on, and it fades away at the flag. See
`../roadMusic.ts` — the volume law is `musicWant`, and `npm run sound` checks it.

So pick a track that can be *underneath* something. The first ten seconds of a
race are the loudest thing in it, and this is joining them rather than replacing
them.

## What goes in a file

- **90 seconds or so**, and it must loop — the end has to run into the start
  without a bump, because a race is longer than any track you will find.
- **AAC in an `.m4a` container**, 128 kbps stereo. Not Opus: Opus is smaller and
  technically better, and a silent iPhone is the worst outcome there is.
- **No count-in and no fade at either end.** Silence at the top is a hole every
  ninety seconds.

`ffmpeg -i whatever.mp3 -c:a aac -b:a 128k -ar 44100 rootway.m4a` is the whole
conversion.

## What not to put here

Masters. Keep the WAVs somewhere outside the repository and commit only the
export you actually chose — a binary file that lands in git history is there for
good, and auditioning six versions of a track means six copies for ever.
