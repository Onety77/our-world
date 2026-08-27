# Steps

Everything you have to do, in order, to take this from *runs on your laptop and
saves nothing* to *the two of you are actually in it*.

Do them in order. Several of them fail silently if done out of order, and the
failure looks like "the garden is broken" rather than "step 4 is missing".

`FIREBASE.md` covers part of this and is now out of date in one place — it says
Cloud Storage is not needed. It is: the Glasshouse stores photographs. This
file supersedes it.

---

## Where it stands right now

Checked, not remembered:

| | |
|---|---|
| The code | done — five places, three games, the conversation, the music, the Glasshouse |
| Firebase project | exists. Auth switched on, Firestore created, Realtime DB created |
| **Cloud Storage** | **not created** — needed now, for the Glasshouse |
| **The two accounts** | **not made** |
| **The rules** | **not published** — all three files |
| `.env.local` | keys filled in, but `VITE_DATA_BACKEND=local` and both addresses empty |
| **Hosting** | **does not exist.** There is no deploy config of any kind |

So: it currently runs only on your machine, in the fake local mode, and the
whole thing is stored in your browser and nowhere else.

Seven parts below. Parts 1–4 make it real. Part 5 puts it somewhere she can
reach. Part 6 is the first two-device test. Part 7 is what still won't work.

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

This is new. Nothing needed Storage before the Glasshouse; photographs are the
first thing in this world that stores bytes rather than documents.

## 1.3 Check the bucket name matches

**Storage → Files** shows the bucket, something like
`your-project.firebasestorage.app` or `your-project.appspot.com`.

Open `.env.local` and check `VITE_FB_STORAGE_BUCKET` is exactly that. It was
filled in from the config you pasted long ago, and Google changed the default
bucket domain partway through 2024 — so a project created around then can have
a value that looks right and is not. If it is wrong, uploads fail with a
permission error that has nothing to do with permissions.

---

# Part 2 — The env file

Open `.env.local`. Three things.

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

## 2.4 Check her timezone is actually hers

`VITE_COOL_TZ` is currently `Africa/Lagos` — the same as yours. That was
harmless before and is not now. **The world runs on the other person's clock**:
you get her hour and she gets yours. If both timezones are the same, the whole
thing is invisible and the Stars has no dawn on its horizon, because there is
no difference to show.

Set it to `Asia/Shanghai`, or wherever she actually is, the day she lands. It
is editable from `/dev7731` and from her own profile afterwards, so it does not
have to be right at build time — but it does have to be right.

Everything else in the file is already correct: the Firebase keys, the database
URL, the two cities, coordinates, and the pot currency.

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

That reads the two addresses out of `.env.local` and writes three files into
`rules-out/`:

```
rules-out/firestore.rules
rules-out/database.rules.json
rules-out/storage.rules
```

**Do not hand-edit the templates in the repo root.** The addresses have to
match what the app uses, and keeping that fact in four files is four places to
get it wrong. `rules-out/` is gitignored; the templates beside it are the
version to keep.

If it says `VITE_WARM_EMAIL is empty in .env.local`, go back to step 2.2.

## 3.2 Paste all three

In the console, one at a time:

| File | Where | |
|---|---|---|
| `rules-out/firestore.rules` | **Firestore Database → Rules** | paste → **Publish** |
| `rules-out/database.rules.json` | **Realtime Database → Rules** | paste → **Publish** |
| `rules-out/storage.rules` | **Storage → Rules** | paste → **Publish** |

Nothing takes effect until you press Publish on each one. All three. The
Storage one is new and is the one you will forget.

---

# Part 4 — Check it works, on your machine

```
npm run dev
```

Vite reads env files **once, at startup** — if it was already running, stop it
and start it again or none of Part 2 exists.

Then, in order:

1. You should get **"There's a garden here."** and a sign-in, not the garden.
   That alone proves the backend switch took.
2. Sign in with your address. You should land in the garden as warm.
3. Open `/dev7731`. Under **where this is** it should say **`connected`** —
   not `local · nothing is saved`.
4. **Leave a thought** at the Tree. Hard-refresh. It should still be hanging
   there. That proves Firestore and its rules.
5. **Say something** in the Stars. Hard-refresh. It should still be there.
6. **Leave a memory** in the Glasshouse — a real photograph off your phone or
   disk. Wait for the glass to form. Hard-refresh. The pane should still be
   there *with the picture in it*, not just its colour. That proves Storage,
   the Storage rules, and the bucket name all at once, and it is the one step
   that exercises anything new.

If any of those come back empty after a refresh, go to **Troubleshooting** at
the bottom before continuing. Do not deploy a broken configuration and try to
debug it over the network.

---

# Part 5 — Put it somewhere she can reach

**This does not exist yet.** There is no deploy config in the repo — no
`firebase.json`, no Vercel, no Netlify, nothing. Right now the only way to open
this is `npm run dev` on your laptop, which she obviously cannot do.

## 5.1 The one thing to understand first

Vite bakes every `VITE_*` value into the bundle **at build time**, not at run
time. So whichever host you use, the build has to happen somewhere that has
your `.env.local`. The simplest correct answer is: **build on your machine,
upload the result.** That is what the steps below do.

## 5.2 Firebase Hosting (recommended)

Same project, one command, free, HTTPS included — and HTTPS is not optional,
because notifications and the photo picker both require a secure origin.

Once, to set it up:

```
npx firebase-tools login
npx firebase-tools init hosting
```

When it asks:

- **Use an existing project** → the garden's project
- **Public directory** → `dist`
- **Single-page app (rewrite all urls to /index.html)** → **Yes**.
  This one matters. The app reads `?section=`, `?game=` and so on from the URL;
  without the rewrite anything but the bare root 404s.
- **Set up automatic builds with GitHub** → No
- **Overwrite `dist/index.html`** → **No.** It will offer to write a placeholder
  over your build.

Then, every time you want to publish:

```
npm run build
npx firebase-tools deploy --only hosting
```

It prints a URL ending in `.web.app`. That is the address you send her.

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
6. **Both of you tap "roll together"** on Scattergories within a few seconds of
   each other. You should land in the *same* round. This has never once run
   against the real backend — the invitation goes down the presence channel,
   and the code that sends it was fixed while building the Glasshouse but has
   never been exercised for real.
7. **She leaves a memory in the Glasshouse.** You open it, turn the pane over,
   and write what you remember. She refreshes and finds it on the back.
8. **Both of you open the same memory at once.** The pane should take a warm
   edge and a cool one, and say *you are both looking at this*.

Steps 6 and 8 are the two that go down the live presence channel. If everything
else works and those two do not, it is the Realtime Database rules — republish
`rules-out/database.rules.json`.

---

# Part 7 — What still will not work, honestly

None of these are broken. They were never built, and each is a decision rather
than an oversight.

**The music makes no sound.** The player, the list, the transport and the
both-of-you-in-step syncing are all built and all work — on a clock, with
`Track.url` set to `null`. There are no audio files and **no way to add one
from inside the app**: tracks are read, never written. To put real music in,
you would upload files to Storage by hand and write the matching documents into
a `tracks` collection in Firestore by hand, and `storage.rules` currently
allows exactly one path (`/memories`) so it would need a second block. Say the
word and I will build the way in properly.

**Notifications only fire while the garden is open in a tab.** The setting says
exactly that, deliberately, because that is all a web page can do without a
service worker and web push — neither of which is built. On iOS they
additionally require the site to have been added to the home screen. A
notification that arrives when her phone is asleep needs real push, which is a
separate piece of work.

**There is no offline mode.** No service worker, so with no connection there is
no garden.

**Nothing has ever run against a real Cloud Storage bucket.** Everything above
the seam has been driven end to end against the local mock, which keeps
photographs in IndexedDB, but there is no emulator here and Storage was not
switched on. Step 4.6 is the first time that code path will ever execute. If
one thing in this whole list is going to surprise you, it is that one.

**The control room is at `/dev7731`.** Nothing in the garden links to it and
nothing hints at it; the world does not render there at all. It is where you
check `connected`, pin an hour, set the quality tier, edit either profile,
puppet the other person in local mode, choose whose day the world is having,
and **tune how the rally car drives**. Bookmark it. If your host is not
rewriting unknown paths to `index.html` — see 5.2 — `?dev7731` on the root
works as a fallback.

**How the car drives** is forty-one sliders under *how the car drives*, and the
only thing about them worth reading before you start: **they are this device
only until you press "send this car to both of you".** Drag anything for as
long as you like — her car does not move. The page says which of the two states
you are in, in a sentence, at the top. "drop my changes" goes back to whatever
was last sent; "back to the code's numbers" goes back to how it shipped.

That send is a write to `rallyTuning/ours`, from the warm account only, so it
needs the rules of part 3 published like everything else. If sending fails
against the real backend and everything else works, that is the rule missing.

There used to be a `dev` panel sitting permanently in the corner of every
screen. It is gone.

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
`rules-out/storage.rules` published (3.2). It is almost always the third.

**A photograph will not open when you pick it, and says so by name.**
That is HEIC — the format iPhones use by default — being handed to a browser
that cannot decode it, which means desktop Chrome. It works from the phone
itself. There is nothing to fix.

**An opened memory says "the picture itself is not here right now".**
The document exists and the file behind it does not, or could not be reached.
On a phone that is usually the connection. If it persists on a good connection,
the upload failed after the document was written, which should be impossible —
the layer uploads first for exactly that reason — and is worth telling me.

**The control room says `local · nothing is saved`.**
`VITE_DATA_BACKEND` is still `local`, or Vite was not restarted after you
changed it.

---

# The short version

```
1  console → Authentication → add two users
2  console → Storage → Get started (locked, same region)
3  .env.local → VITE_DATA_BACKEND=firebase, both emails, both names
4  npm run rules
5  paste all THREE rule files, publish all three
6  npm run dev → sign in → leave a thought, a message, and a photograph
7  hard-refresh; all three still there
9  npx firebase-tools init hosting  (dist, SPA yes, overwrite no)
10 npm run build && npx firebase-tools deploy --only hosting
11 send her the link; both add it to the home screen
12 the two-device pass in Part 6
```
