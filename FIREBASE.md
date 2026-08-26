# Turning the garden on

> **Read `STEPS.md` instead.** It supersedes this file and covers the whole
> job, in order — the console, the env file, all three rule files, hosting, the
> first two-device pass, and what still will not work.
>
> This file is kept for the two things at the bottom that are worth knowing and
> are not steps: the China problem, and what it costs to run. The table below
> was true before the Glasshouse and is now wrong in one row, corrected there.

## Where this actually stands

Checked against the live project, not from memory:

| | |
|---|---|
| Email/password sign-in | **done** — switched on |
| Firestore | **done** — created, and locked (denying everything, which is correct until the rules go up) |
| Realtime Database | **done** — created at `https://our-world-c9a07-default-rtdb.firebaseio.com`, locked |
| Cloud Storage | **not created — and it now has to be.** Glasshouse photographs and the brief Stars voice-lights are the two things here that store bytes. They share the locked-down `storage.rules`; `npm run rules` fills and emits it alongside the other two. See `STEPS.md` 1.2. |
| The two accounts | **not done** |
| The rules | **not published** |

So: three things left — the accounts, Storage, and the rules. Walked through in **STEPS.md**.

---

## 1. Make the two accounts

**Console → Authentication → Users → Add user**, twice.

Real addresses, and passwords you can actually give her. There is no "sign up"
screen in the garden and there never will be — there are two people here
forever, so both accounts are made once, by hand.

## 2. Tell the garden which address is which

In `.env.local`, fill in these two lines and flip the switch at the top:

```
VITE_DATA_BACKEND=firebase
VITE_WARM_EMAIL=<yours>
VITE_COOL_EMAIL=<hers>
```

Everything else in that file is already filled in — the config you pasted, and
the database URL, which I read off the live project rather than asking you for.

## 3. Generate the rules and paste them

```
npm run rules
```

That reads the two addresses out of `.env.local` and writes
`rules-out/firestore.rules`, `rules-out/database.rules.json` and
`rules-out/storage.rules` with them filled in. **Don't hand-edit the templates in the repo root** — the addresses
have to match what the app uses, and keeping that fact in four files is four
places to get it wrong. The failure mode is silent: mismatched rules just deny
everything and the garden looks broken for no visible reason.

Then, in the console:

- `rules-out/firestore.rules` → **Firestore Database → Rules** → paste → **Publish**
- `rules-out/database.rules.json` → **Realtime Database → Rules** → paste → **Publish**
- `rules-out/storage.rules` → **Storage → Rules** → paste → **Publish**

Nothing takes effect until you press Publish on each.

These matter more than they look. The API key in the client is public — it
ships in the bundle and always will — so these rules *are* the security model.
They start from "nobody, to nothing" and open exactly two doors.

## 4. Restart

Vite reads env files once, at startup. `npm run dev` again.

---

## What "done" looks like

Open it and you get **There's a garden here.** instead of the garden. Sign in,
and you're in as whichever light your address is.

To be sure it's really connected: the dev panel top-left should say `connected`
rather than `local · nothing is saved`. Leave a letter, hard-refresh, and it
should still be hanging there.

**If it says "The garden isn't finished being set up"** when you sign in —
that's sign-in not being switched on, which it now is, so you shouldn't see it.

**If it says "The garden won't open"** with a list of names — that's
`.env.local`, and it names the exact lines.

**If you get in but the garden is empty and nothing saves** — the rules haven't
been published, or the addresses in them don't match `.env.local`. Re-run
`npm run rules` and paste again.

---

## Two things worth knowing

**China.** Firestore and the Realtime Database run on `googleapis.com` and
`firebaseio.com`, which are unreliable to blocked in mainland China. There's a
real chance that when you land, this stops reaching you. It's why everything
Firebase touches sits behind one interface — `DataLayer` in
`src/data/types.ts`, implemented twice, in `local.ts` and `firebase.ts`.
Swapping to something reachable means writing a third file; nothing in the
world itself knows or cares which is live. Worth testing on the ground early
rather than during a week when you badly want it to work.

Note also that this database landed in **us-central1** — the default. Not
ideal for Lagos or Shanghai, and Firestore's region can't be changed after the
fact. It's a latency cost, not a correctness one, and at two people it will not
be noticeable. Not worth remaking the project over.

**Cost.** Two people is far inside the free tier. The one thing that could
change that is presence, which is why it's throttled to about six writes a
second while you're moving and none at all while you're standing still — see
`PRESENCE_INTERVAL` in `src/data/firebase.ts`.
