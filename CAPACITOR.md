# Capacitor — making the Garden a real app on the two phones

Read `PLAN.md` first; this is a companion to it, not a replacement. `STEPS.md`
is how the *web* garden goes live and stays live — none of that is being
thrown away. This file is how the same garden also becomes an installed
application, what it buys, what it costs, and the order to do it in.

> **Both of us work in this repo.** If you change something here, say so in
> `NOTES.md`. The one rule in this document that must not be broken quietly is
> **the platform seam** (§5) — everything else is negotiable.

---

## 1. What Capacitor actually is

Capacitor is a native app — an Android app, an iOS app — whose entire screen is
a full-bleed browser view, and whose browser view is pointed at the `dist/`
folder we already build. That is the whole trick. There is no rewrite, no new
language for the interface, no second copy of the Garden.

Two things follow from that, and they are the two worth holding onto:

**What Capacitor gives us is not speed. It is *permission*.** The Garden
currently lives inside Chrome and Safari, which deliberately withhold things
from web pages: reliable notifications when closed, the filesystem, the
vibration motor, orientation locking, knowing that the phone just went to
sleep, the camera as anything other than a file picker. Capacitor is a bridge
across that line. The renderer is the same WebView underneath, so **Three.js
will not get faster because we wrapped it.** Anything in this document that
promises performance is promising it from *lifecycle control* — not rendering
more frames, but not rendering frames nobody is looking at.

**And it stops being a website that we update by pushing to Vercel.** That is
the real cost, and §3 is about it.

---

## 2. The situation, honestly

- **She is on Android.** She is also the person this is a surprise for.
- **You are on iPhone.**
- **A friend has a Mac.**

The consequence is not intuitive, so here it is plainly: **the person who gets
the good native app first is her, and you will be building it half-blind.**

Android builds, signs and installs entirely from this Windows machine. Free, no
account, no gatekeeper, iterate all day. iOS needs Xcode on macOS to even
compile, so every single iPhone build is a trip to your friend's house.

So the plan is: **Android first, all the way through. iOS as one concentrated
phase later.** You keep the installed PWA on your iPhone in the meantime — it
is what you use today and it does not get worse.

### Two practical things this creates

**You need an Android device to develop against.** Not optional. The Android
Studio emulator will run the Garden, but it renders through the desktop GPU and
will tell you comfortable lies about frame rate. The single most important
unknown in this whole project is *how the Hollow and Ember Rally actually
perform in a WebView on a mid-range Android phone*, and only real hardware
answers it. Any cheap Android phone, borrowed or bought, pays for itself in
Phase 1.

**Your friend's Mac is a one-time visit, not a dependency** — if it is set up
right. With a free Apple ID, a build installed from Xcode dies after **7 days**
and needs the Mac again. With a paid Apple Developer account (~$99/yr), you
archive once on their Mac, upload to **TestFlight**, and from then on install
and reinstall on your iPhone over the air, from your own home, for 90 days per
build. Budget the visit and the account together, or the visit is wasted.

---

## 3. The decision to make before writing any code

**Right now, shipping a change to the Garden takes ninety seconds.** You push,
Vercel builds, and the next time either of you opens it the world is new. That
property is genuinely valuable and native apps do not have it. An installed app
holds a frozen copy of `dist/` until someone installs a new one.

There are three ways to handle that, and the choice shapes everything:

| | How it works | What it costs |
|---|---|---|
| **A. Bundled** *(recommended)* | `dist/` is copied inside the app. No network needed to open the world. | Every change needs a new build and a new install. |
| **B. `server.url`** | The app is a thin shell pointed at the Vercel URL. Updates instantly. | Not really an app. No offline, launch depends on the network, and we keep every browser quirk we were trying to escape. |
| **C. Bundled + live updates** | Bundled, but the app pulls a new `dist/` over the air by itself. | A third-party service or self-hosted infrastructure, and a whole new failure mode to reason about. |

**Do A.** Offline resilience is on the wish list precisely because the network
between Kano and China is not reliable — and B throws that away to solve a
problem that is mostly *your* inconvenience, not hers. C is the right answer
eventually; it is not the right answer while we are still finding out whether
the thing runs well on her phone at all.

**But use B during development.** Capacitor lets `server.url` point at the Vite
dev server on your LAN, so the app on the Android phone live-reloads as you
edit, exactly like the browser does. Dev config, never in a release build.

### How she actually installs it

Two mechanisms, for two different moments:

- **While building — Firebase App Distribution.** Free, already part of the
  Firebase project we use, emails an install link. Use this for every test
  build on your own Android device.
- **For the gift itself — Google Play, internal testing track.** $25, once,
  forever. She installs from the Play Store like any other app, and it updates
  itself silently thereafter.

Do not hand her a raw APK for the reveal. Sideloading means walking her through
"allow installs from unknown sources" past two red Play Protect warnings about
software from an unverified developer. That is a terrible thirty seconds to
have in the middle of a surprise.

---

## 4. What the repo already got right

Genuinely lucky, and worth knowing before we start dreading things:

- **Sign-in is email and password** (`src/data/firebase.ts:544`). This is the
  big one. Firebase's `signInWithPopup`/`signInWithRedirect` are the classic
  thing that shatters inside a Capacitor WebView, and we do not use them. The
  Firebase JS SDK works essentially as-is.
- **The back gesture already exists and is already correct.**
  `src/systems/backstop.ts` pushes a history entry per screen, and Android's
  hardware back button drives WebView history. The single most common "this app
  feels broken" bug on Android — back button quits the game instead of leaving
  it — is already solved. It needs one adjustment (§7, Phase 7) and nothing
  more.
- **Config already refuses to guess** (`src/config.ts`). A missing key throws by
  name. That discipline is exactly what we need when there are suddenly three
  build targets that can each be misconfigured independently.
- **`dist/` is ~20 MB including four music tracks.** Bundled, that is a ~40 MB
  app — completely normal — and it means the music and the world load from
  local storage instead of over her network. This is a straight win.
- **The security model is Firestore rules, not client secrets.** Keys ending up
  inside the APK changes nothing, because that was already true of the web
  bundle, and `firestore.rules` is what actually protects the data.

---

## 5. The platform seam — the one architectural rule

Before any native feature is added, this exists:

```text
src/platform/
├─ index.ts      the only thing the rest of src/ ever imports
├─ web.ts        exactly today's behaviour, unchanged
└─ native.ts     Capacitor implementations, lazily imported
```

`index.ts` exports one `IS_NATIVE` flag and a small set of capability functions
— notify, lifecycle, keyboard, haptics, orientation, keepAwake, immersive,
pickPhoto, share. Each has a web implementation that is what the code does
today, and a native implementation that does it properly.

**The rule: no file outside `src/platform/` may import `@capacitor/*`.** Ever.

This is not tidiness. Capacitor plugin imports throw or return nonsense in a
plain browser, and the Garden must keep running as a website — that is your
iPhone until Phase 10, and it is the fallback for both of you forever. If
`@capacitor/haptics` gets imported directly inside `EmberRally.tsx` because it
was quicker, the web build breaks in a way nobody notices until the race
starts. One seam, checked once, is how that stays impossible.

Both of us must respect this. Write it into `PLAN.md` when the folder lands.

---

## 6. What breaks the moment we wrap it

Found by reading the actual code. None are hard; all are silent if missed.

**6.1 Push notifications stop working entirely.** `src/data/push.ts` is Web
Push through a service worker (`public/firebase-messaging-sw.js`). Service
workers do not run in a Capacitor WebView. This is not a degradation — the
notification feature simply goes dark, and it is the feature the whole
long-distance thing leans on. Must be replaced with
`@capacitor/push-notifications` on native, behind the seam.

**6.2 The Cloud Function's payload is web-shaped.** `functions/index.js:124-127`
sends `data`-only with a `webpush` block. A native Android or iOS client
receives that and displays **nothing** — no error, no crash, just silence. It
needs `notification` plus `android`/`apns` blocks added alongside, and the
device documents in Firestore need to record which kind of address they are.
Small change; catastrophic to overlook, because everything looks fine in the
logs.

**6.3 YouTube embeds may refuse to play.** `src/systems/youtube.ts:225` passes
`origin: location.origin`. Inside Capacitor that origin becomes
`https://localhost` on Android and `capacitor://localhost` on iOS, and the
YouTube IFrame API validates it. The fix is configuration, not code: set a real
`server.hostname` in `capacitor.config.ts` and force the https scheme on both
platforms, so the origin is a plausible `https://` address. Verify on device —
this is not a thing to assume.

**6.4 Voice-lights need permissions declared natively.**
`src/ui/VoiceLights.tsx:171` calls `getUserMedia`. On Android that needs
`RECORD_AUDIO` in the manifest; on iOS, `NSMicrophoneUsageDescription` in
Info.plist. Without them it fails at the moment of recording, not at startup.
The existing `MediaRecorder` mime negotiation in `voiceRecording.ts` already
handles the codec difference between platforms correctly — leave it alone.

**6.5 Presence goes stale.** `src/App.tsx:258-278` publishes presence from
`visibilitychange` and `pagehide`. `pagehide` never fires when Android kills a
backgrounded app, so she will show as here in the garden when she is not. Needs
`@capacitor/app` `appStateChange` instead, behind the seam.

**6.6 Tapping a notification reloads the entire world.**
`src/systems/notify.ts:154` does `window.location.assign('/?section=stars')` —
a full reload of a Three.js application. In a browser that is a slow moment; in
an app it is a cold start with a white flash. This becomes an in-app navigation
event, which is also the foundation the deep links in Phase 3 need.

**6.7 Fullscreen is a no-op.** `src/ui/Together.tsx:1741` calls
`requestFullscreen`, which WKWebView does not honour. Replaced by native
immersive mode.

**6.8 The film shelf does not exist on phones.** `src/systems/filmShelf.ts` uses
the File System Access API — Chrome on desktop only. It is absent in both
mobile WebViews, so the persistent-handle mechanism has no mobile equivalent
and needs a Capacitor Filesystem path. This is why films are last (Phase 11),
not because they are unimportant.

**6.9 The hidden `/dev7731` path needs checking.** Vercel rewrites everything to
`index.html` (`vercel.json`). There is no server inside the app. Confirm path
routing resolves natively in Phase 1 rather than discovering it later.

---

## 7. The phases

Ordered so that each one is independently worth shipping, and so that the
riskiest unknown is answered first rather than last.

### Phase 1 — Wrap it, run it, measure it

Install Capacitor 8, add the Android platform, write `capacitor.config.ts` with
the scheme/hostname settings from §6.3, build, sync, run on a real Android
phone. Change nothing in `src/`.

**The point of this phase is the measurement, not the app.** Walk the whole
world on real hardware: garden browsing, each of the five places, a full Ember
Rally race, the Stars with the keyboard up. Record the numbers in `NOTES.md`.

**Done when:** the Garden runs on a physical Android device and we know its
frame rate in the Hollow and mid-race. If Ember Rally is unplayable in a
WebView, that is a finding worth having on day one — it changes the plan, and
no amount of later work would have fixed it.

### Phase 2 — The platform seam (§5)

Create `src/platform/`, move nothing yet, wire the web implementations to
current behaviour so the web build is provably unchanged. Add the rule to
`PLAN.md`.

**Done when:** `npm run build` produces an identical-behaving web app, and
`IS_NATIVE` reads correctly in both.

### Phase 3 — Native push and deep links

The largest single improvement, and the one that justifies the project.
Replaces §6.1, fixes §6.2, fixes §6.6. A notification tap opens the right place
in the world — Stars for a message, the Tree for today's question, the lobby
for a race invitation — without reloading. Suppress the OS banner when the app
is already open and foregrounded; the world has its own way of announcing
things.

**Done when:** her Android phone, with the app fully closed, receives a message
notification, and tapping it lands inside the Stars on the right message.

### Phase 4 — Lifecycle and battery

On background: stop the render loop, the race loop, particles, audio analysers,
and unsubscribe the listeners that do not need to keep running. On foreground:
resume only the current section. Fix presence (§6.5).

**This is where "the app feels better" actually comes from.** A backgrounded
Three.js WebView quietly cooking her battery is a real thing, and the browser
gives us no honest signal to stop.

**Done when:** the phone stops warming while the Garden sits in the background,
and presence is correct after a force-quit.

### Phase 5 — Keyboard, safe areas, immersion

Native keyboard height and open/close events for the Stars composer and
Whisper. Real safe-area insets. Status and navigation bar control. A splash
screen from the existing logos that hands over to the world instead of
revealing a loading page.

**Done when:** the composer sits on the keyboard on the Android phone with no
shifting, and the scroll position survives the keyboard closing.

### Phase 6 — The Glasshouse

Native photo picker and direct camera capture. Correct permission flow. Read
EXIF orientation, rotate and downscale *before* upload — meaningful on a slow
connection. Local thumbnail cache. Save a memory back to the device.

`PLAN.md:918` already flags HEIC. Native picking gives us a real chance to
resolve that at the source instead of decoding it in the browser.

### Phase 7 — Ember Rally, physically

Landscape lock during a race and portrait after. Immersive mode. Keep-awake.
Haptics on the countdown lights, impacts, nitro and the finish. Correct pause
when the app loses focus. **Also: back button while racing should ask before
leaving** — currently, once the backstop stack is empty, back exits the app
instantly, which mid-race is a small disaster.

Tilt steering (`PLAN.md:1670`) is a stretch here, not a requirement.

### Phase 8 — Audio discipline

Respect silent mode and media volume. Duck or pause when another app takes
audio. Recover after a call. Reliably stop every section's audio on leaving it.
Route the voice-light microphone through native permissions (§6.4).

### Phase 9 — Offline and poor network

The world opens without the network. Recent messages and memories stay
readable. Drafts and Tree answers queue and send when the connection returns.
Failed uploads resume. A graceful "waiting for the connection" state rather
than a broken garden.

Firebase's own offline persistence does most of this; the work is mostly making
the UI honest about which state it is in.

### Phase 10 — iOS, at your friend's Mac

One concentrated visit. `npx cap add ios`, Info.plist permission strings, push
certificates, archive, upload to TestFlight. Everything from Phases 2–9 is
already written and platform-agnostic by then — this phase is configuration and
signing, not features.

**Book the Apple Developer account before the visit,** or you will get seven
days out of the trip.

### Phase 11 — Films

Local file selection through the native picker on both phones, both people
choosing their own copy, and Firebase carrying only ready-state, play, pause,
position and rate. No upload, no streaming, no bandwidth.

Be honest in the interface about codecs: MP4/H.264/AAC will play; an arbitrary
MKV will not, on either phone, without a native player engine that is its own
project. The app should say so when the file is picked, clearly, rather than
failing at the moment you both press play.

---

## 8. Things worth doing that nobody listed

- **Back the keystore up, twice.** The Android signing key is generated once in
  Phase 1. Lose it and you can never update the app on her phone again — not
  "it's difficult", it is not possible. Password manager and an offline copy.
- **`npm run` scripts for the whole loop.** `build && cap sync && cap run
  android` as one command, plus a live-reload variant. The failure mode
  otherwise is forgetting `npm run build` and spending an hour debugging a
  change that was never copied into the app.
- **Commit `android/` and `ios/`, ignore their build outputs.** Those folders
  hold real configuration — permissions, plist entries, gradle changes — and
  regenerating them silently discards it. Add the build directories to
  `.gitignore` in Phase 1, before the first build litters them.
- **Generate icons and splash from the existing logos** with
  `@capacitor/assets`. There is already a `garden-icon-master.png` and a
  `logos/` folder; this is one command, not a design task.
- **One `STEPS.md` section per platform.** `STEPS.md` is the file that lets a
  cold session take the Garden live. It needs the Android chapter added, and
  later the iOS one, or the build knowledge lives only in this conversation.
- **Decide what a notification is allowed to say.** An app on a lock screen
  shows message previews to whoever is holding the phone. "Something reached
  the garden" as an option is a real feature for a private world, not a
  paranoid one.
- **Check the Android WebView version on her actual phone.** The WebView updates
  through the Play Store independently of the OS, and an old one is the most
  likely explanation for a Three.js feature that works on your test device and
  not on hers.

## 9. Deliberately not doing

- **Not chasing a native renderer.** The Garden stays Three.js in a WebView. If
  Phase 1 says the race is too slow, we optimise the scene — resolution scaling,
  draw calls, `world/games/README.md` — we do not port it.
- **Not bundling mpv or VLC.** See Phase 11.
- **Not removing the web version.** It is your iPhone until Phase 10, it is the
  fallback on any device forever, and `STEPS.md` stays true.
- **Not touching gameplay, world design or Firebase data shapes.** Nothing in
  this document is a reason to change what the Garden *is*.

---

## 10. The first session, concretely

```bash
npm i @capacitor/core @capacitor/cli
npx cap init          # app name, and an id like com.<yours>.garden
npm i @capacitor/android
npm run build         # dist/ must exist before the next line
npx cap add android
npx cap sync
npx cap run android   # with the phone plugged in, or an emulator
```

Then Android Studio installs it, and the whole of Phase 1 is: **walk the entire
world on a real phone and write down what you see.** Nothing else.
