# Steps

Everything you have to do, in order, to take this from *runs on your laptop and
saves nothing* to *the two of you are actually in it*.

Do them in order. Several of them fail silently if done out of order, and the
failure looks like "the garden is broken" rather than "step 4 is missing".

`FIREBASE.md` covers part of this and is out of date in one place — it says
Cloud Storage is not needed. It is: the Glasshouse stores photographs and the
Stars store voice-lights. This file supersedes it.

---

## Where it stands right now

Everything in this table that could be checked from the repo, was — just now,
not remembered. The three console rows are marked, because nothing here can see
your Firebase console; those are the ones to confirm with your own eyes.

| | |
|---|---|
| The code | done — five places, three games, the conversation, the music, the Glasshouse |
| Firebase project | exists. Auth on, Firestore created, Realtime DB created |
| Cloud Storage | *console — check.* Needed now, for photographs **and** voice-lights |
| The two accounts | *console — check.* |
| The rules | *console — check.* Three files, all three must be published |
| The rule templates | **present and current** — every collection the app uses is covered |
| `.env.local` | keys and database URL filled in. **`VITE_DATA_BACKEND=local`**, both addresses **empty**, both names **empty** |
| Her city and clock | **still set to Lagos** — same as yours. See 2.4; this one is invisible when wrong |
| Hosting | **does not exist.** No `firebase.json`, no Vercel, no Netlify, nothing |

So: it currently runs only on your machine, in the fake local mode, and the
whole thing is stored in your browser and nowhere else.

Eight parts below. Parts 1–4 make it real. Part 5 puts it somewhere she can
reach. Part 6 is the first two-device test. Part 7 is what still won't work,
and Part 8 is how to put real music in.

---

# Part 1 — The Firebase console

All of this is at <https://console.firebase.google.com>, in the existing
project.

## 1.1 Make the two accounts

**Authentication → Users → Add user.** Twice.

Real addresses, and a password you can actually give her. There is no sign-up
screen in the garden and there never will be — there are two people here
forever, so both accounts are made once, by hand, by you.

Write down which address is **warm** and which is **cool**. Warm is you. That
choice is permanent in the sense that all the data is keyed to it.

## 1.2 Turn on Cloud Storage

**Build → Storage → Get started.**

It will ask for a location. **Pick the same region the Firestore database is
in** (`us-central1` — see the note at the bottom of `FIREBASE.md`). Mixing
regions costs latency for no benefit.

It will offer to start in test mode or locked mode. **Locked.** You are pasting
real rules in step 3 and test mode is a bucket anyone can read for 30 days.

Storage now backs **two** things, not one: photographs in the Glasshouse and
the brief voice-lights in the Stars. Both are bytes, both are new, and neither
has ever run against a real bucket.

## 1.3 Check the bucket name matches

**Storage → Files** shows the bucket, something like
`your-project.firebasestorage.app` or `your-project.appspot.com`.

`VITE_FB_STORAGE_BUCKET` in `.env.local` is filled in — but it was filled in
from a config you pasted long ago, and Google changed the default bucket domain
partway through 2024, so a project created around then can have a value that
looks right and is not. Check it character for character. If it is wrong,
uploads fail with a permission error that has nothing to do with permissions.

---

# Part 2 — The env file

Open `.env.local`. Four things, and all four are currently unset or wrong.

## 2.1 Flip the switch

```
VITE_DATA_BACKEND=firebase
```

It is currently `local`. Nothing else in this file matters until this changes.

## 2.2 Fill in the two addresses

```
VITE_WARM_EMAIL=<the address you made for yourself>
VITE_COOL_EMAIL=<the address you made for her>
```

Both are currently empty. Exactly as you typed them into the console — case
does not matter, everything lowercases both sides, but a typo locks you out of
your own garden with no error message that says so.

## 2.3 Fill in the two names

```
VITE_WARM_NAME=<your name>
VITE_COOL_NAME=<her name>
```

Both are currently empty and fall back to "Warm" and "Cool". These are seeds —
written once on first run, editable afterwards from the profile — but the very
first screen she ever sees says **"for {name}"**, and it should not say "for
Cool".

## 2.4 Move her to where she actually is

Not just the timezone. All four of these are currently hers-in-name-only:

```
VITE_COOL_CITY=Lagos
VITE_COOL_TZ=Africa/Lagos
VITE_COOL_LAT=6.5244
VITE_COOL_LON=3.3792
```

**The world runs on the other person's clock**: you get her hour and she gets
yours. With both of you set to Lagos the whole idea is invisible — same hour,
same sun, and the Stars has no dawn on its horizon because there is no
difference to show.

The coordinates matter as much as the zone, because they are what the weather
and the sun are worked out from. Setting `VITE_COOL_TZ=Asia/Shanghai` and
leaving the latitude in the Gulf of Guinea gives you her clock over your
daylight, which is worse than not doing it at all — it looks right and is not.

Change all four together, the day she lands. The timezone and city are editable
afterwards from `/dev7731` and from her own profile, so they do not have to be
right at build time — but they do have to be right.

Everything else in the file is already correct: the Firebase keys, the database
URL, your own city and coordinates, and the pot currency.

---

# Part 3 — The rules

**This is the security model.** The Firebase web API key in `.env.local` is
public — it ships inside the JavaScript bundle and always will, on every site
that uses Firebase. What actually stops anybody else touching your data is
these three files, and until they are published the database denies everything
and the garden looks broken for no visible reason.

## 3.1 Generate them

```
npm run rules
```

That reads the two addresses out of `.env.local` and writes into `rules-out/`:

```
rules-out/PASTE-ME.md          ← all three, in order, with the addresses filled in
rules-out/firestore.rules
rules-out/database.rules.json
rules-out/storage.rules
```

**Open `rules-out/PASTE-ME.md` and work down it.** It is the three files in one
document, in the order the console wants them, with a table at the top saying
which block goes on which screen. The three separate files are beside it if you
would rather copy them one at a time.

**Everything in `rules-out/` is comment-free.** The templates in the repo root
are heavily commented and stay that way — that is where the reasoning about the
security model lives, and anybody changing a rule needs to read why it is the
shape it is. What you paste is a different thing with a different job: it is
the rule and nothing else, because four hundred lines of explanation in a
console text box at one in the morning is not documentation, it is somewhere
for a mistake to hide. The generator strips them and then checks that stripping
did not change what the rules *do* — same matches, same allows, balanced
braces, both addresses intact — and refuses to write anything if it did.

`rules-out/` is gitignored, because that is the only copy anywhere with your
real addresses in it. The templates keep `__WARM_EMAIL__` placeholders and are
the version to keep. **Do not hand-edit the templates** — the addresses have to
match what the app uses, and keeping that fact in four files is four places to
get it wrong.

If it says `VITE_WARM_EMAIL is empty in .env.local`, go back to step 2.2.

## 3.2 Paste all three

In the console, one at a time:

| # | File | Where | |
|---|---|---|---|
| 1 | `firestore.rules` | **Firestore Database → Rules** | paste → **Publish** |
| 2 | `database.rules.json` | **Realtime Database → Rules** | paste → **Publish** |
| 3 | `storage.rules` | **Storage → Rules** | paste → **Publish** |

Nothing takes effect until you press Publish on each one. All three. The
Storage one is the one you will forget.

## 3.3 What each one is actually doing

Worth thirty seconds before you paste something you cannot read.

**Firestore** — the long one, and the only one worth reading in full. It starts
from *nobody, to nothing* and opens exactly two doors, matched on the two
addresses, lowercased on both sides. Every collection the app uses has its own
block: `world`, `profiles`, `letters`, `contributions`, `plants`, `decor`,
`tracks`, `messages`, `voiceLights`, `voiceLightConfig`, `rallyTuning`,
`memories`, `rounds/moves`, `questionRounds/answers`, `questionSeeds` — and a
final `match /{document=**}` that denies everything else forever. Checked
against the app just now: nothing the code writes is missing a rule.

**Realtime Database** — presence only. Where the two of you are standing right
now, written several times a second and thrown away. The rule that matters is
that **you may only write your own light**; without it either of you could drag
the other around the garden. It also carries the two live invitations —
`racing` (the Scattergories round you are sitting in) and `looking` (the memory
you have open) — which is why Part 6 steps 6 and 8 are the ones that fail if
this file is not published.

**Storage** — the bytes, and it allows exactly two paths:

- `memories/{file}` — create only, `image/webp` or `image/jpeg`, under 8 MB.
  Never overwritten: every upload goes to a fresh id, and `resource == null`
  makes that a rule rather than a habit.
- `voice-lights/{who}/{file}` — create only, `audio/webm|mp4|ogg`, under 3 MB,
  and `who` must be *you*.

Everything outside those two paths is denied to everybody, forever.

One honest caveat, because it is the single place in this garden where
"private" is not obvious: a Storage download URL carries a long unguessable
token, and **anybody holding that URL can fetch the file without signing in.**
That is how the picture gets into an `<img>` at all. So the bucket is private —
only the two of you can list it, upload to it, or ask for a URL — but a URL,
once handed out, is a key. Nothing in the app ever puts one in an address bar,
a link, or anything that leaves the device.

---

# Part 4 — Check it works, on your machine

```
npm run dev
```

Vite reads env files **once, at startup** — if it was already running, stop it
and start it again or none of Part 2 exists.

Then, in order. Each step proves one thing, and they are ordered so that a
failure tells you which:

1. You should get **"There's a garden here."** and a sign-in, not the garden.
   That alone proves the backend switch took.
2. Sign in with your address. You should land in the garden as warm.
3. Open `/dev7731`. Under **where this is** it should say **`connected`** —
   not `local · nothing is saved`.
4. **Leave a thought** at the Tree. Hard-refresh. It should still be hanging
   there. *Firestore, and its rules.*
5. **Say something** in the Stars. Hard-refresh. It should still be there.
6. **Leave a voice-light** in the Stars — the short recorded one, not typed.
   Hard-refresh and play it back. *Storage path one, and the microphone.*
7. **Leave a memory** in the Glasshouse — a real photograph off your phone or
   disk. Wait for the glass to form. Hard-refresh. The pane should still be
   there *with the picture in it*, not just its colour. *Storage path two, the
   Storage rules and the bucket name, all at once.*

Steps 6 and 7 are the two that have never executed against a real bucket in the
history of this project. If one thing in this whole list surprises you, it is
one of those.

If any of them come back empty after a refresh, go to **Troubleshooting** at
the bottom before continuing. Do not deploy a broken configuration and try to
debug it over the network.

---

# Part 5 — Put it somewhere she can reach

Right now the only way to open this is `npm run dev` on your laptop, which she
obviously cannot do. **You are going to Vercel**, so this part is written for
Vercel.

## 5.1 The one thing to understand first

Vite bakes every `VITE_*` value into the bundle **at build time**, not at run
time. There is no `.env.local` on the server and there never will be — by the
time the site is running, those values are already inside the JavaScript.

So Vercel needs its own copy of them, set in its dashboard. Miss one and the
build succeeds and the site says *"The garden won't open"* with the name of the
key it wanted, which is at least honest, but is a round trip you do not need.

**This is not a secret being leaked.** The Firebase web keys are public by
design — they ship in the bundle on every Firebase site there has ever been.
What stops anybody else touching your data is the rules of Part 3. The two
addresses are in there too, and that is also fine: they are checked against
Firebase Auth, so knowing one does not get you a password.

## 5.2 Vercel

### Once, to set it up

1. Push this repo to GitHub, if it is not there already.
2. <https://vercel.com> → **Add New… → Project** → import the repo.
3. It will detect Vite on its own. Leave the build settings alone:
   - Framework preset **Vite**
   - Build command `npm run build`
   - Output directory `dist`
4. **Before you press Deploy**, open **Environment Variables** and add every
   `VITE_` line from your `.env.local`. All of them, names exactly as they
   are, for **Production, Preview and Development**.

   The fastest way: open `.env.local`, copy the whole file, and use Vercel's
   paste-a-`.env` box — it takes the lot in one go. Then delete any comment
   lines it picked up.
5. Deploy. It gives you a `.vercel.app` address over HTTPS.

### The one thing Vercel will get wrong

**Deep links 404 without a rewrite.** The app reads `?section=`, `?rally=`
and `/dev7731` out of the URL. Vercel serves `dist` as static files, so
anything that is not `/` is a file that does not exist — and `/dev7731`, the
control room, is exactly that.

Add `vercel.json` in the repo root:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

That is the whole file. Commit it. Without it the site works until the first
time you open the control room or send her a link to a place.

### Every time after that

Push to your main branch. Vercel builds and deploys on its own; there is no
command to run. If you change anything in `.env.local`, change it in the
Vercel dashboard too and **redeploy** — the old values are baked into the old
build and will not update on their own.

## 5.2b What Vercel does *not* change

Hosting and data are separate things here, and only the hosting has moved:

- **Auth, Firestore, Realtime Database and Storage all stay on Firebase.** The
  rules of Part 3 are what protect them, and they are unaffected by where the
  page is served from.
- **You still need HTTPS**, and Vercel gives it. That matters more than it
  sounds: the microphone for voice-lights, the photo picker in the Glasshouse
  and notifications all *silently vanish* on a plain http origin. See the
  troubleshooting entry about the network address.
- **Storage may need to be told about the new address.** If photographs or
  voice-lights fail to load with a CORS error once you are on Vercel, that is
  the bucket refusing an origin it does not know. Fix with the `gsutil` CORS
  config, or from the Google Cloud console for the same bucket.

## 5.3 A real warning about China

`FIREBASE.md` says Firestore and the Realtime Database are unreliable to
blocked in mainland China. Firebase Hosting is on the same infrastructure, so
**hosting it there means the app itself may not load either**, not just its
data.

Moving the *hosting* elsewhere — Cloudflare Pages, Netlify — does not fix this,
because the data would still be on Google and the garden is nothing without its
data. So there is no clever hosting choice that solves it, and co-locating
everything on Firebase costs nothing extra.

What this actually means:

- **Test it the week she lands**, not the week you need it.
- She will most likely need a VPN. That is a real and normal thing there.
- If it turns out to be permanently unreachable, the fix is a third
  implementation of `DataLayer` (`src/data/types.ts`) pointing at something
  that *is* reachable. Nothing in the world above `src/data/` knows or cares
  which backend is live — that seam was built for exactly this day. It is a
  real piece of work, but it is one file, and none of the five places, three
  games or the Glasshouse would change.

## 5.4 Add it to her home screen

Not a build step — tell her to do it.

On iPhone: open the link in **Safari** (not Chrome — on iOS, only Safari can
install), Share → **Add to Home Screen**. On Android: Chrome → menu → **Add to
Home screen**.

It gets a proper icon, opens without browser chrome, and on iOS it is a
prerequisite for notifications working at all.

---

# Part 6 — The first real two-device test

Both of you signed in, on your own devices, at the same time. In this order,
because each step proves something the next one assumes:

1. **Both of you open it.** The two clocks top right should show your real
   local times, and both names should be lit as online.
2. **You leave a thought.** She refreshes; it is there, in your colour.
3. **She says something in the Stars.** It should reach you within a second or
   two without a refresh — that is the live listener, which nothing before this
   step has proven.
4. **Put a heart on one of hers.** Her copy of that light should get bigger and
   warmer too.
5. **The Hollow → what is waiting.** Play a round of Word Duel. Check that
   before you have played, it says *your move* and never anything about whether
   she has — that is the seal, and it is the thing most worth confirming
   against the real rules rather than the mock.
6. **Both of you tap "roll together"** on Scattergories. You no longer have to
   do it within a few seconds of each other: whoever taps first waits in a
   room, sees the other one arrive, and the glass only turns once you have
   both said *ready*. Three, two, one, and you both get the same letter at the
   same moment. It asks again before round two, because round two turns a
   fresh glass.

   The same room is now in front of Word Duel's *time challenge* and the
   racer's *wheel to wheel*, and it is the same code in all three
   (`ui/RaceRoom`, over `systems/lobby` — `npm run lobby` checks the
   arithmetic without a browser). Worth trying all three, because this is the
   part that has never once run against the real backend: the invitation and
   the readiness both go down the presence channel.
7. **She leaves a memory in the Glasshouse.** You open it, turn the pane over,
   and write what you remember. She refreshes and finds it on the back.
8. **Both of you open the same memory at once.** The pane should take a warm
   edge and a cool one, and say *you are both looking at this*.

Steps 6 and 8 are the two that go down the live presence channel — `racing` and
`looking` in Part 3.3. If everything else works and those two do not, it is the
Realtime Database rules; republish `rules-out/database.rules.json`.

---

# Part 7 — What still will not work, honestly

None of these are broken. They were never built, and each is a decision rather
than an oversight.

**There is no way to add music from inside the app.** The player, the list, the
transport and the both-of-you-in-step syncing are all built and all work — they
have just never had a file to play. Adding one is a job you do by hand, twice:
once in Storage and once in Firestore. It takes about a minute per song and
**Part 8 is the whole procedure**. If you end up adding more than a handful,
say so and I will build the way in properly.

**Closed-app notifications are built, but have a one-time publish step.** In
Firebase Console → Project settings → Cloud Messaging → Web Push certificates,
generate a key pair. Add its public key as `VITE_FB_VAPID_KEY` in `.env.local`
and Vercel, then redeploy the site. Re-run `npm run rules` and publish the new
Firestore rule before either phone enables the switch. Finally deploy the
message trigger:

```powershell
npx firebase-tools login
npx firebase-tools deploy --only functions:notifyNewMessage --project our-world-c9a07
```

On iPhone the garden must be added to the Home Screen. Open the profile on each
phone and enable notifications once; the confirmation must say that the device
can hear the garden after it is closed. Signing out removes that phone's push
address before ending its session.

**There is no offline mode.** No service worker, so with no connection there is
no garden.

**Nothing has ever run against a real Cloud Storage bucket.** Everything above
the seam has been driven end to end against the local mock, which keeps
photographs and recordings in IndexedDB, but there is no emulator here and
Storage was not switched on. Steps 4.6 and 4.7 are the first time those two
code paths will ever execute.

**The control room is at `/dev7731`.** Nothing in the garden links to it and
nothing hints at it; the world does not render there at all. Bookmark it.

It has four tabs. **car** is how the rally car drives; **world** is whose day
the world is having, the hour, and jumping straight to a place; **you two** is
both profiles, the voice-light limit and the Tree's question pool; **device**
is the backend, the quality tier, puppeting the other person in local mode, and
wiping this machine. It remembers which tab you were last on. If your host is
not rewriting unknown paths to `index.html` — see 5.2 — `?dev7731` on the root
works as a fallback.

**How the car drives** is forty-two sliders under the **car** tab, and the only
thing about them worth reading before you start: **they are this device only
until you press "send this car to both of you".** Drag anything for as long as
you like — her car does not move. The page says which of the two states you are
in, in a sentence, at the top.

Under *start from one of these* there are five chips. **standard** is the way
back: all forty-two dials to the numbers in the code, the car before anybody
touched it. The other four — forgiving, sharper, looser, heavier — each move
only their own dials and leave the rest where you left them, so they stack;
press **standard** first if you want the car one of them actually describes.
"drop my changes" is different again: it goes back to whatever was last *sent*,
not to the code.

That send is a write to `rallyTuning/ours`, from the warm account only, so it
needs the rules of Part 3 published like everything else. If sending fails
against the real backend and everything else works, that is the rule missing.

There used to be a `dev` panel sitting permanently in the corner of every
screen. It is gone.

---

---

# Part 8 — Putting real music in

The player has always worked. It has never had a file. This is how one gets in,
and it is two things per song: **the audio goes in Storage, a document pointing
at it goes in Firestore.** No folder needs creating in advance — Storage makes
the folder the moment you upload into it.

Do Part 3 first. `storage.rules` gained a `music/` block for exactly this, so
if you published the rules before today, **publish `storage.rules` again** or
the upload is refused.

## 8.1 Put the file in Storage

**Build → Storage → Files.**

1. There is a folder button beside **Upload file**. Make one called `music`.
   Exactly that, lowercase — the rule matches `music/` and nothing else.
2. Open it and upload the audio. Anything the browser can play: mp3, m4a, ogg,
   wav. Under 25 MB, which is a long song at a high bitrate.
3. Click the file. On the right, **File location → Download URL**. Copy it.
   It is long and has a `?alt=media&token=…` on the end. **Keep all of it** —
   the token is what makes the file fetchable.

## 8.2 Write the document in Firestore

**Build → Firestore Database → Data.**

1. If there is no `tracks` collection yet, **Start collection** → id `tracks`.
2. **Add document.** Let it auto-ID; nothing reads the id.
3. Four fields:

   | Field | Type | Value |
   |---|---|---|
   | `title` | string | what it is called. **Required** — a track with no title is ignored |
   | `url` | string | the download URL from 8.1 |
   | `by` | string | `warm` or `cool` — who put it on |
   | `duration` | number | length in **seconds**, e.g. `214` for 3:34 |

4. Save.

That is it. The list is live, so it appears in the corner player without a
refresh, on both of your devices.

## 8.3 The two fields that behave oddly, and why

**`duration` is in seconds, and `0` means "not known".** Put `0` in and the
player shows no progress line at all rather than a wrong one — a bar that lies
about where you are in a song is worse than no bar. So it is worth getting
right, but nothing breaks if you do not.

**The list is sorted by `title`**, not by when you added it. If you want an
order, number the titles.

## 8.4 What to check

Open the garden, press play in the corner. If it stays silent:

- **Nothing in the list at all** → the document has no `title`, or it is not in
  a collection called exactly `tracks`.
- **It is listed but will not play** → the `url` is wrong. The usual cause is
  copying the file *path* instead of the **Download URL**, or losing the
  `?alt=media&token=…` on the end.
- **It plays for you and not for her** → `storage.rules` was not republished
  after the `music/` block was added.

# The checks you can run without a browser

None of these need Firebase, a console or a network. They are the fastest way
to find out whether something you changed broke something you were not looking
at.

```
npm run typecheck   the whole project
npm run rally       the car: acceleration, braking, stability, the drift,
                    and the fire-spirit round every road looking for spins,
                    stalls, wall-riding and anything gone NaN
npm run drift       what a drift costs, as a speed trace per second
npm run tuning      that every one of the forty-two dials still reaches the car
npm run sound       the Rootway's soundscape against a stub Web Audio API:
                    every value finite, every layer actually reached over a
                    real lap, nothing left running afterwards
npm run shaders     the shader mistake this codebase keeps making
npm run tris        what the garden costs in triangles, by object
npm run scatter     Scattergories, played headless
```

Two of those earn their place rather than being box-ticking:

`npm run tuning` failing with *dead dial* means a slider was added to
`tuning.ts` and nothing reads it — a control that moves and does nothing, which
you would otherwise find by tuning a car for an hour against a number that was
never connected.

`npm run sound` catches the one bug that matters in the audio files: a
non-finite value reaching an AudioParam. That throws exactly once and takes the
whole ambient bed down with it — no crash on screen, no red in a console you
are looking at, just a world that stopped making noise somewhere around the
third corner, on one machine, sometimes.

---

# Troubleshooting

Every one of these has been arranged to fail *loudly and by name*. If you are
guessing, read the screen first.

**"The garden won't open", with a list of key names.**
`.env.local` is missing those exact lines. It names them. Part 2.

**"The garden isn't finished being set up" when you sign in.**
Email/password sign-in is switched off in the console. It is on, so you should
not see this.

**An address is signed in but "isn't either of the two addresses this garden
knows".** The address you used does not match `VITE_WARM_EMAIL` or
`VITE_COOL_EMAIL`. Note that if you change either of those, you must
**re-run `npm run rules` and republish all three rule files** — the addresses
are compiled into them.

**You get in, but the garden is empty and nothing saves.**
The rules are not published, or the addresses in them do not match
`.env.local`. Re-run `npm run rules`, paste all three again, publish all three.

**Everything works except photographs.**
Storage-specific. In order: is Storage created at all (1.2); does
`VITE_FB_STORAGE_BUCKET` match the real bucket exactly (1.3); is
`storage.rules` published (3.2). It is almost always the third.

**Photographs work but voice-lights do not.**
Same bucket, different path and a different content type. `storage.rules`
accepts `audio/webm`, `audio/mp4` and `audio/ogg` under 3 MB, and nothing else
— so a browser recording in a fourth format is refused by the rule rather than
by the app. If the recording never starts at all it is the microphone
permission, which is a browser prompt and not this.

**A photograph will not open when you pick it, and says so by name.**
That is HEIC — the format iPhones use by default — being handed to a browser
that cannot decode it, which means desktop Chrome. It works from the phone
itself. There is nothing to fix.

**An opened memory says "the picture itself is not here right now".**
The document exists and the file behind it does not, or could not be reached.
On a phone that is usually the connection. If it persists on a good connection,
the upload failed after the document was written, which should be impossible —
the layer uploads first for exactly that reason — and is worth telling me.

**The microphone, the photo picker or notifications quietly do not exist.**
You are on `http://` at a plain address — almost always the **Network** URL
Vite prints, like `http://172.20.10.10:5173`, opened so a phone can reach the
same server. Browsers only hand out the microphone and the file picker on a
*secure* origin, which means https **or localhost**, and on anything else the
whole API is simply missing rather than refused. Nothing is wrong with the
browser. Open `http://localhost:5173` on the machine itself, and use the
Vercel address for the phone. The voice-light now says exactly this when it
happens, and names the address it is on.

**The control room says `local · nothing is saved`.**
`VITE_DATA_BACKEND` is still `local`, or Vite was not restarted after you
changed it.

**Both clocks show the same time, and the Stars has no dawn.**
`VITE_COOL_TZ` is still `Africa/Lagos`. Step 2.4 — and change the city and
coordinates with it.

---

# The short version

```
1  console → Authentication → add two users
2  console → Storage → Get started (locked, same region as Firestore)
3  console → Storage → Files → check the bucket name matches .env.local
4  .env.local → VITE_DATA_BACKEND=firebase
                both emails, both names
                her city + timezone + lat + lon
5  npm run rules
6  open rules-out/PASTE-ME.md → paste all THREE → Publish all three
7  npm run dev  (restart it; env is read once)
8  sign in → a thought, a message, a voice-light, a photograph
9  hard-refresh; all four still there, the picture still in the pane
10 push to GitHub → vercel.com → import the repo
11 paste every VITE_ line into Vercel's environment variables
12 commit vercel.json (already in the repo) or deep links 404
13 deploy; send her the .vercel.app link; both add it to the home screen
14 the two-device pass in Part 6
```
