# The upgrade — what the web garden got

No Capacitor, no Electron. Four things, chosen from a longer list on 6 Sep
2026; the ones that were turned down are at the bottom with the reason, so
nobody proposes them again by accident.

**All four are built.** `PLAN.md` carries what landed and the three debts it
left; `NOTES.md` has the entry with the measurements. This file is kept for the
reasoning behind the choice, and for the list of what was declined.

`PLAN.md` is still the plan and the design law still stands.

**The shape of it:** three of these four are about the garden being *reliable* —
opening with no signal, remembering where you were, not letting the screen die
mid-race. The fourth is the only new thing you can see.

**Two new checks came with it:** `npm run offline` builds the world, opens it,
kills the server and asks for it again; `npm run sealed` proves a thought left
for a day cannot be read early, with both people in one process so the words
are within reach and still refused.

---

## 1. Make the garden survive the network

**The biggest felt change available, and most of what Capacitor was being asked
for.** Two independent pieces.

**1a. Firestore has no local cache.** `src/data/firebase.ts` starts the
database with a bare `getFirestore(app)`. Every open of the garden re-reads the
conversation, the memories, the archive, the pot and the thoughts over the
network — from Kano, and soon from China — before anything appears. A
persistent cache means all of it comes back off the disk instantly and updates
when the network catches up, and writes made with no signal queue and send
themselves later, so a thought written on a plane actually lands.

> The archive already keeps revealed scores in `localStorage` for exactly this
> reason (5 Sep in `NOTES.md`). That stays correct and stays useful — it
> survives a cache eviction — but it stops being the only thing doing the job.

**1b. There is no service worker for the app.** `public/` has
`firebase-messaging-sw.js` and nothing else, so the shell is fetched from
Vercel on every launch. A precaching worker means the garden opens instantly
and opens with no network at all.

Two rules for doing it right:

- **Do not precache the music.** Four MP3s over a megabyte each. They belong in
  a runtime cache that fills the first time each is played, not in a download
  that has to finish before the first frame.
- **The update must be offered, not taken.** A stale shell that never updates
  is worse than no worker, and a silent auto-reload in the middle of a race is
  worse than both.

**Done when:** aeroplane mode, open the garden, and the world is there with the
conversation in it.

---

## 2. The native feeling is mostly free

Five browser APIs the garden does not use, each a real part of what Capacitor
was being sold for. Media Session is already done in `ui/Player.tsx` — that is
the proof the approach works.

| | What it does | Where |
|---|---|---|
| **Wake Lock** | The screen stops dimming mid-race and mid-film. | Ember Rally, the night screen |
| **Badging** | The count of what she left, on the home-screen icon. | With `newness`/`waiting` |
| **Vibration** | Countdown lights, impact, the ember, the finish. | Ember Rally |
| **Orientation lock** | Landscape held for a race, in fullscreen. | Ember Rally |
| **Share target** | She shares a photo from her camera roll *into the Glasshouse*, from the system share sheet. | Manifest + the worker from §1b |

**Wake Lock first.** The screen going dark during a race is a bug, not a
missing feature.

**Two are Android-only** — vibration and orientation lock. She is the one on
Android. Detect and degrade, and never announce a capability the device does
not have (design law: *honest states*).

**Share target needs §1b first.** It is a service worker POST handler plus
three lines of manifest, and it is the most charming item here: a photograph
reaching the Glasshouse without the garden being opened first.

---

## 3. Come back where you left

An iPhone discards a backgrounded home-screen web app quickly, and WebKit does
it without warning. You look at a message, answer it, come back — and you are
at the front door of a world you were standing in the middle of thirty seconds
ago.

Remember the place, and the position in it, and restore on return. `arrival`,
`sections` and `places` already hold everything this needs. It is the
difference between a page and an app more than any other single item here.

---

## 4. Sealed until a date

A thought hung on the Tree that does not open until a day you choose. A
birthday, an anniversary, the day she lands.

**The mechanism already exists twice.** The question vine seals an answer until
both have written; the archive seals a score until both have rated — and
`firestore.rules` knows how to refuse a read on a condition. A date is an
easier condition than either, and the Tree is already the place where written
things hang and wait to be found.

The only new thinking is what a sealed thought *looks like* hanging there,
which the design law settles: it is a real object in a state, not a badge on
one.

---

## Turned down, with reasons

Kept here so they do not come back as fresh suggestions.

- **Two suns** — putting both people's suns in one sky so the angle between
  them is the time difference. Fits the design law; the owner does not want it.
  Closed.
- **"She is asleep"** — the garden saying, when you write at three in the
  morning her time, that it will find her when she wakes. **Closed
  permanently.** Do not revive it in another form.
- **A countdown to the move** — a number that only goes one way, and the most
  interface-shaped thing that could be put in this world. Closed.
- **Real music files** — already done. The songs are uploaded and the player,
  the shared anchor and the two-phone sync all work. The line in `PLAN.md`
  *After that* #2 is stale.
- **A fourth game** — still a good idea (`PLAN.md` *After that* #3, and the
  registry auto-loads one), just not this round.
- **Go-live verification** — Cloud Storage was created long ago;
  `FIREBASE.md`'s table was simply out of date and has been corrected.

## One thing worth knowing about films

`systems/filmShelf` uses the File System Access API — Chrome on the desktop and
nowhere else. The remembered-file path does not exist on either phone, with or
without Capacitor.

What works on both phones today is a plain file input: both of you pick your
own copy each time, and Firebase carries only ready-state, play, pause,
position and rate. MP4/H.264/AAC plays; MKV does not. Worth saying so at the
moment the file is picked rather than the moment you both press play — but that
is a separate job, not part of this round.
