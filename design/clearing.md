# The Clearing

A new place between the Stars and the Lantern Walk. Learning is personal; a discovery can become something the two people share. The scene, open typography, and small companion belong to the garden rather than a course dashboard.

## What is built

- 26 starter studies: six Spanish, six Mandarin, four Hausa, six drawing, four rhythm.
- 48 phrases, each with a situation, meaning, and usage note. Learn a phrase, retrieve its meaning from shuffled choices, then produce the words yourself. Mandarin accepts characters or pinyin. Accents are shown in feedback; typing without them is accepted. Reveals and wrong attempts remain recorded as needing practice.
- Phrase review after 1, 3, 7, 14, and 30 days of successful retrieval. A mistake brings the phrase back tomorrow. The review history uses all kept practices; the journal displays the most recent 250.
- Drawing guides, an actual pointer drawing surface, undo, fresh paper, and a paper-based alternative. Reflections are self-assessment, never an automated claim about drawing quality.
- Four rhythm patterns at 80 BPM, with count-in, demonstration, visual pulse, keyboard/touch input, timing feedback, and retries. Extra taps lower the score. Reported audio output latency is included; unreported device latency can still affect timing.
- A named companion in honey, ink, or cloud. Distinct local practice days grow the dog at 4, 12, and 30 days; repeating a lesson on the same day cannot accelerate growth. Progress does not reset. Absence makes the dog sleepy, and greeting it prompts a response. The garden landmark reflects the adopted companion after its data loads.
- A private journal and explicitly shared discoveries. A discovery may carry a kept drawing and a short note. The other person can open the same study. Only its author can remove it.

## Persistence

Both existing data adapters implement `LearningData`. The local adapter uses `garden:clearing:v1`; the cloud adapter uses `learning/{warm|cool}`, private `practices` subcollections, and `learningDiscoveries`.

Cloud practice saves and companion progress are one batch. Retrying the same immutable practice is idempotent. A temporary recovery copy is kept separately on the device until the save succeeds; reopening restores a retry action. Never show a successful save solely because a local snapshot arrived.

The Firestore rules restrict private practices to their owner. Both people can read companions and discoveries; shared drawing/path/lesson fields must match a practice the author actually kept. The emulator test exercises allowed writes and rejected cross-account operations.

The generated `rules-out/firestore.rules` must be published with this feature for the Firebase backend. Generating a file does not publish it. No live database was used for the automated checks.

## Content and limits

These are starter studies, not a complete language course or a promise of fluency. Listening uses an available device voice and says when none is installed. There is no speech recognition, pronunciation scoring, or AI art grading. No AI key is needed by this version.

The learning approach uses retrieval and spaced revisiting, supported by [The Learning Scientists' retrieval-practice resources](https://www.learningscientists.org/retrieval-practice). The lesson wording and drawing guides are authored for this garden. Further-learning links are included in each path:

- [University of Texas: Trayectos introductions](https://trayectos.coerll.utexas.edu/v1/mod0/introduccion-comunicativa/).
- [MIT OpenCourseWare: Learning Chinese, text and audio](https://ocw.mit.edu/courses/res-21g-003-learning-chinese-a-foundation-course-in-mandarin-spring-2011/pages/online-textbook/).
- [University of Wisconsin: Hausa greetings](https://wisc.pb.unizin.org/lctlresources/chapter/hausa-greetings/). Starter spellings do not mark Hausa tone or vowel length.
- [Drawabox: lines, ellipses, and boxes](https://drawabox.com/lesson/1).
- [musictheory.net: note duration](https://www.musictheory.net/lessons/11).

## Repeatable checks

- `npm run learning`: dates and time zones, review scheduling, validation, rhythm scoring, recovery records, local persistence, privacy, sharing ownership, idempotence, and growth.
- `npm run clearing`: starts an isolated Vite server and headless Chrome; exercises keyboard, touch, lessons, real drawing strokes, rhythm timing, recovery after a failed save/reload, sharing, and destination order. Screenshots go to the system temp directory `clearing-review`. `CHROME` can override the Windows executable path.
- `npx tsx scripts/clearing-rules-check.ts`: expects a Firestore emulator at `127.0.0.1:8189` for the fixed demo project `demo-clearing`. Load a copy of `firestore.rules` with the two email placeholders replaced by `warm@example.test` and `cool@example.test`. The test always uses mock identities and the emulator, never production.
- `npm run build`, `npm run shaders`, `npm run rules`.

The new UI is fetched when the Clearing is approached; other sections do not load its lessons at startup. Animations update Three.js objects directly, and reduced-motion preferences turn down companion movement.
