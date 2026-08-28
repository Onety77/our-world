/**
 * The Rootway, as heard from the car.
 *
 * ---------------------------------------------------------------------------
 * The car already knows how it sounds. This is everything that proves the car
 * is *somewhere* — and the reason it had to be written is that the race was
 * numb with the engine working perfectly. A tunnel with a very good car in it
 * and nothing else is a car on a black background: every cue about speed comes
 * from the engine, so the engine has to carry a job it cannot do, and the road
 * ends up feeling like a texture scrolling past rather than a place with a
 * roof on it.
 *
 * **The test for whether this file is working is to stop the car.** With the
 * engine idling and nothing else, the old Rootway went almost silent, which is
 * the one thing a cave under a mountain never is. Everything below is built so
 * that standing still in the dark is a *sound*: rock close by, air moving
 * through it, water somewhere out of sight, and the roots.
 * ---------------------------------------------------------------------------
 *
 * **The layers, and what each one is for.**
 *
 *   deep      the mountain. Two very low tones and a rumble under them, always
 *             there, never consciously heard. Take it out and the cave becomes
 *             a room
 *   room      filtered noise that rises as the rock closes in. This is the
 *             *size* of the place, and it is the one layer that changes fast
 *             enough to be felt as the tunnel narrows
 *   draught   air moving through stone, breathing on a slow cycle of its own.
 *             Not the car's wind — that is in `engine.ts` and rides speed.
 *             This one is loudest when you are stopped, because that is when
 *             you can hear it
 *   stream    water somewhere below and to one side, following the wet
 *   drips     the single most cave-defining sound there is, scheduled at
 *             random into the reverb and panned wide. One every few seconds
 *             does more for the place than any of the continuous layers
 *   roots     a low woody groan under load, plus the occasional creak. The
 *             road is *named* for these and they made no sound at all
 *   fire      the lanterns and the two hearths, as crackle that arrives before
 *             the light does
 *
 * Events — a crash, a wall scraped along, standing water hit at speed — come
 * up from the physics through `around`, because they are things the tyre model
 * already knows and nothing should be deriving a second, slightly different
 * opinion about whether the car just hit something.
 *
 * All of it is filtered noise from the garden's one shared buffer, on the
 * garden's one AudioContext. No loops to download, no second context, and
 * every layer steered by the actual road rather than by a timeline.
 */

import type { SynthesisBus } from './ambience'

export interface RootwaySoundState {
  /** Metres per second. */
  speed: number
  /** 0 an open chamber, 1 the rock on the mirrors. */
  tight: number
  /** 0..1 — water on the stone. */
  wet: number
  /** 0..1 — off the stone, in the loose. */
  rough: number
  /** 0 the ordinary road, 1 well inside the Rootwake. */
  wake: number
  /** 0..1 — root through the vault near the car. */
  roots: number
  /** 0..1 — the nearest lantern. */
  lamp: number
  /** 0..1 — the nearest of the two real fires. */
  fire: number
  /** 0..1 — standing water under the wheels. */
  water: number
  /** 0..1 — leaning on the rock right now. */
  scrape: number
  paused: boolean
}

export interface RootwayVoice {
  set(state: RootwaySoundState): void
  /**
   * The room's answer to an impact.
   *
   * Deliberately *not* the impact — `engine.ts` already plays the car hitting
   * something, and doubling it makes one louder hit rather than a hit in a
   * place. This is what the cave does afterwards: stone chips coming off the
   * wall, and a slap that goes down the tunnel and comes back.
   */
  crash(force: number): void
  /** Through standing water at speed. */
  splash(force: number): void
  stop(): void
}

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))

function smoothstep(from: number, to: number, value: number) {
  const at = clamp((value - from) / Math.max(0.0001, to - from))
  return at * at * (3 - 2 * at)
}

/**
 * Stone, long — built out of delays rather than convolved.
 *
 * ---------------------------------------------------------------------------
 * **This started as a 2.9-second stereo convolver and does not use one, and
 * the honest reason is an argument rather than a measurement.**
 *
 * Convolution costs scale with the length of the impulse, and at this length,
 * in stereo, at 48 kHz, it is comfortably the most expensive thing in the
 * audio graph — more than the whole car. That is ordinary DSP arithmetic and
 * it does not need defending. What it does need is respecting, because the
 * surface that matters here is a phone, and an audio thread that is already
 * heavy before the ambient bed and the ghost are mixed in is how you get the
 * crackling that then gets blamed on the graphics.
 *
 * It is worth writing down that this was *not* successfully measured. Chrome's
 * `WebAudio.getRealtimeData` was polled thirty times a run across three
 * variants, and the run with no reverb at all came back **more** expensive
 * than either reverb — which is not a result, it is a reading dominated by the
 * software renderer and by wherever the car happened to be. Anyone tempted to
 * tune this by that number should know it did not work; the place to measure
 * is a real phone.
 *
 * So: a feedback delay network. Four combs at mutually awkward lengths so
 * their repeats never line up into a pitch, each fed back through a band —
 * stone eats the top end, and does not hold sub-bass either — then two short
 * diffusers to smear the individual echoes into a wash, then two decorrelated
 * taps for width. About twenty cheap nodes, and the tail can be *longer* than
 * the impulse was for nothing.
 *
 * It is not as good as a real impulse response. It is a great deal better than
 * a good impulse response that gets deleted the first time the sound stutters.
 * ---------------------------------------------------------------------------
 */
function stoneTail(ctx: AudioContext): { input: GainNode; output: GainNode } {
  const input = ctx.createGain()
  const output = ctx.createGain()
  output.gain.value = 0.35

  // The distance to the nearest wall, as silence before the first reflection.
  // Without it every sound is happening with its face against the rock.
  const pre = ctx.createDelay(0.25)
  pre.delayTime.value = 0.014
  input.connect(pre)

  const wash = ctx.createGain()
  /*
    Low, and it has to be.

    A comb with feedback g settles at a gain of 1/(1-g) for anything its loop
    filter passes — about six, here, and there are four of them in parallel. A
    send that does not account for that arrives at the compressor twenty times
    louder than it left, and what you hear is not a cave, it is the safety
    limiter breathing on every drip.
  */
  wash.gain.value = 0.16

  /*
    Four combs, and the lengths matter more than anything else here.

    Ratios near small integers make the repeats coincide, and a reverb whose
    repeats coincide has a *note* in it — the unmistakable metallic ring of a
    cheap plate. These four are close to mutually prime in samples, which is
    why they are unlovely numbers.

    The feedback figures give roughly a three-second tail: for a comb, that is
    delay × ln(1/1000) / ln(g), so 43 ms at 0.86 is about 2.0 s and 82 ms at
    0.815 is about 2.8 s. The spread is deliberate — a tail whose components
    all die together stops, and a cave fades.
  */
  const combs: readonly [number, number, number][] = [
    [0.0431, 0.862, 1800],
    [0.0537, 0.851, 1500],
    [0.0677, 0.839, 1250],
    [0.0819, 0.824, 1020],
  ]
  for (const [time, feedback, cut] of combs) {
    const delay = ctx.createDelay(0.5)
    delay.delayTime.value = time
    const damp = ctx.createBiquadFilter()
    damp.type = 'lowpass'
    damp.frequency.value = cut
    damp.Q.value = 0.5
    /*
      And a floor under the loop, which matters more than the lowpass does.

      Without it the combs have their full feedback all the way down to DC,
      where nothing is taking energy out — so the tail grows a low-frequency
      rumble that has no reason to ever stop, and every drip and crash leaves
      the cave humming. A real cave does not hold forty hertz either.
    */
    const floor = ctx.createBiquadFilter()
    floor.type = 'highpass'
    floor.frequency.value = 145
    floor.Q.value = 0.6
    const back = ctx.createGain()
    back.gain.value = feedback
    pre.connect(delay)
    // The loop. Legal because there is a DelayNode in it, and stable because
    // every gain is below unity and both filters take energy out on each pass.
    delay.connect(damp).connect(floor).connect(back).connect(delay)
    delay.connect(wash)
  }

  /*
    Two diffusers.

    Four combs on their own are four echoes you can count, which reads as a
    corrugated pipe. These smear them: short delays fed back at a level too low
    to ring but high enough to multiply each echo into a handful.
  */
  let chain: AudioNode = wash
  for (const time of [0.0071, 0.0113]) {
    const delay = ctx.createDelay(0.05)
    delay.delayTime.value = time
    const back = ctx.createGain()
    back.gain.value = 0.52
    const through = ctx.createGain()
    through.gain.value = 0.72
    chain.connect(delay)
    delay.connect(back).connect(delay)
    chain.connect(through).connect(output)
    chain = delay
  }

  /*
    And width, which is most of what says "this is a place and you are in it".

    Two taps a few milliseconds apart, panned wide. The ear reads a difference
    of that size between the two sides as room rather than as delay, and a
    tunnel where both ears hear the same tail is a pipe — the same note the
    engine's own impulse makes about its channels.
  */
  for (const [time, pan] of [[0.019, -0.75], [0.0231, 0.75]] as const) {
    const delay = ctx.createDelay(0.1)
    delay.delayTime.value = time
    const panner = ctx.createStereoPanner()
    panner.pan.value = pan
    chain.connect(delay).connect(panner).connect(output)
  }

  return { input, output }
}

export function createRootwayVoice(bus: SynthesisBus): RootwayVoice {
  const { context: ctx, output, noise, noiseSeconds } = bus
  const born = ctx.currentTime
  let stopped = false

  /*
    One safe envelope for the whole place, same as the Moonbreak's. The cave
    may be large without a drip, a crash and the car ever summing into a crack
    on a laptop speaker.
  */
  const out = ctx.createGain()
  out.gain.value = 0.0001
  const speakerCut = ctx.createBiquadFilter()
  speakerCut.type = 'highpass'
  speakerCut.frequency.value = 28
  speakerCut.Q.value = 0.6
  const safety = ctx.createDynamicsCompressor()
  safety.threshold.value = -17
  safety.knee.value = 20
  safety.ratio.value = 3.4
  safety.attack.value = 0.007
  safety.release.value = 0.26
  out.connect(speakerCut).connect(safety).connect(output)

  const dry = ctx.createGain()
  dry.gain.value = 1
  dry.connect(out)

  const verb = stoneTail(ctx)
  const verbSend = ctx.createGain()
  verbSend.gain.value = 0.3
  const verbReturn = ctx.createGain()
  verbReturn.gain.value = 0.85
  verbSend.connect(verb.input)
  verb.output.connect(verbReturn).connect(out)

  function loop(rate: number): AudioBufferSourceNode {
    const source = ctx.createBufferSource()
    source.buffer = noise
    source.loop = true
    source.playbackRate.value = rate
    source.start()
    return source
  }

  // --- the mountain ----------------------------------------------------------
  /*
    Two tones a fifth apart and a rumble under them.

    Never heard as notes. 31 and 47 Hz is below where most phone speakers
    reproduce anything at all, which is the point — on a phone this layer is
    only present through the rumble, and on headphones it is the floor the
    whole cave stands on.
  */
  const deepA = ctx.createOscillator()
  deepA.type = 'sine'
  deepA.frequency.value = 31
  const deepB = ctx.createOscillator()
  deepB.type = 'sine'
  deepB.frequency.value = 46.5
  const deepGain = ctx.createGain()
  deepGain.gain.value = 0.0001
  deepA.connect(deepGain)
  deepB.connect(deepGain)
  deepGain.connect(out)

  const rumbleSource = loop(0.42)
  const rumbleLow = ctx.createBiquadFilter()
  rumbleLow.type = 'lowpass'
  rumbleLow.frequency.value = 105
  rumbleLow.Q.value = 0.8
  const rumbleGain = ctx.createGain()
  rumbleGain.gain.value = 0.0001
  rumbleSource.connect(rumbleLow).connect(rumbleGain).connect(out)

  // --- the size of it --------------------------------------------------------
  const roomSource = loop(0.72)
  const roomBand = ctx.createBiquadFilter()
  roomBand.type = 'bandpass'
  roomBand.frequency.value = 260
  roomBand.Q.value = 0.55
  const roomGain = ctx.createGain()
  roomGain.gain.value = 0.0001
  roomSource.connect(roomBand).connect(roomGain).connect(dry)
  roomGain.connect(verbSend)

  // --- air through stone -----------------------------------------------------
  /*
    Breathing on its own slow cycle, which is the whole trick.

    A draught held at a constant level stops being heard within about fifteen
    seconds — the ear files it as the noise floor and it may as well not be
    there. Moving it by a third of its own level over eleven seconds keeps it
    permanently just barely noticeable, which is exactly where a cave's air
    should sit.
  */
  const draughtSource = loop(0.95)
  const draughtHigh = ctx.createBiquadFilter()
  draughtHigh.type = 'highpass'
  draughtHigh.frequency.value = 300
  const draughtLow = ctx.createBiquadFilter()
  draughtLow.type = 'lowpass'
  draughtLow.frequency.value = 2100
  draughtLow.Q.value = 0.6
  const draughtGain = ctx.createGain()
  draughtGain.gain.value = 0.0001
  const draughtPan = ctx.createStereoPanner()
  draughtSource.connect(draughtHigh).connect(draughtLow).connect(draughtGain).connect(draughtPan)
  draughtPan.connect(dry)
  draughtPan.connect(verbSend)

  // --- water somewhere out of sight ------------------------------------------
  const streamSource = loop(1.06)
  const streamBand = ctx.createBiquadFilter()
  streamBand.type = 'bandpass'
  streamBand.frequency.value = 900
  streamBand.Q.value = 0.5
  const streamGain = ctx.createGain()
  streamGain.gain.value = 0.0001
  const streamPan = ctx.createStereoPanner()
  streamPan.pan.value = -0.4
  streamSource.connect(streamBand).connect(streamGain).connect(streamPan).connect(verbSend)
  streamPan.connect(dry)

  // --- the roots -------------------------------------------------------------
  /*
    A groan rather than a creak.

    The continuous layer is very low and very narrow — wood under load, heard
    through stone. The creaks on top of it are events, because a *continuous*
    creak is a rocking chair and what is wanted is the occasional complaint of
    something enormous holding a roof up.
  */
  const rootSource = loop(0.5)
  const rootBand = ctx.createBiquadFilter()
  rootBand.type = 'bandpass'
  rootBand.frequency.value = 155
  rootBand.Q.value = 2.6
  const rootGain = ctx.createGain()
  rootGain.gain.value = 0.0001
  rootSource.connect(rootBand).connect(rootGain).connect(dry)
  rootGain.connect(verbSend)

  // --- fire ------------------------------------------------------------------
  const fireSource = loop(1.35)
  const fireBand = ctx.createBiquadFilter()
  fireBand.type = 'bandpass'
  fireBand.frequency.value = 620
  fireBand.Q.value = 0.7
  const fireGain = ctx.createGain()
  fireGain.gain.value = 0.0001
  fireSource.connect(fireBand).connect(fireGain).connect(dry)

  // ---------------------------------------------------------------------------
  // One-shots
  // ---------------------------------------------------------------------------

  function burst(
    when: number,
    peak: number,
    length: number,
    type: BiquadFilterType,
    frequency: number,
    Q: number,
    rate: number,
    into: AudioNode = dry,
    pan = 0,
  ): void {
    const source = ctx.createBufferSource()
    source.buffer = noise
    source.playbackRate.value = rate
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = Q
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length)
    if (pan === 0) {
      source.connect(filter).connect(gain).connect(into)
    } else {
      const panner = ctx.createStereoPanner()
      panner.pan.value = clamp(pan, -1, 1)
      source.connect(filter).connect(gain).connect(panner).connect(into)
    }
    source.start(when, Math.random() * Math.max(0.05, noiseSeconds - length - 0.1), length + 0.05)
    source.stop(when + length + 0.06)
  }

  /**
   * One drop of water, landing.
   *
   * A drip is a *pitched* click, not a noise burst — the pitch is the size of
   * the puddle it lands in, and getting it wrong is the difference between
   * water and a stick being tapped on a table. So: a short sine that falls
   * about a fifth in forty milliseconds, straight into the reverb, panned
   * somewhere off to a side. Almost no dry signal at all, because a drip you
   * hear dry is a drip inside the car.
   */
  function drip(when: number, pan: number): void {
    const tone = ctx.createOscillator()
    tone.type = 'sine'
    const top = 900 + Math.random() * 1500
    tone.frequency.setValueAtTime(top, when)
    tone.frequency.exponentialRampToValueAtTime(top * 0.62, when + 0.045)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.03, when + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.075)
    const panner = ctx.createStereoPanner()
    panner.pan.value = clamp(pan, -1, 1)
    tone.connect(gain).connect(panner)
    panner.connect(verbSend)
    // A hair of dry, so the nearest ones are in the tunnel rather than behind it.
    const close = ctx.createGain()
    close.gain.value = 0.22
    panner.connect(close).connect(dry)
    tone.start(when)
    tone.stop(when + 0.09)
  }

  /** Something enormous holding a roof up, complaining about it. */
  function creak(when: number, force: number): void {
    const tone = ctx.createOscillator()
    tone.type = 'sawtooth'
    const base = 58 + Math.random() * 34
    tone.frequency.setValueAtTime(base, when)
    tone.frequency.linearRampToValueAtTime(base * (0.86 + Math.random() * 0.3), when + 0.5)
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 210 + Math.random() * 180
    band.Q.value = 6
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(0.016 + force * 0.022, when + 0.14)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.62)
    const panner = ctx.createStereoPanner()
    panner.pan.value = Math.random() * 1.4 - 0.7
    tone.connect(band).connect(gain).connect(panner)
    panner.connect(verbSend)
    panner.connect(dry)
    tone.start(when)
    tone.stop(when + 0.68)
  }

  // ---------------------------------------------------------------------------
  // Scheduling
  // ---------------------------------------------------------------------------

  let dripDue = 1.4
  let creakDue = 6
  let last = ctx.currentTime
  let lastScrape = 0

  deepA.start()
  deepB.start()
  out.gain.setTargetAtTime(0.9, born, 0.5)

  return {
    set(state) {
      if (stopped) return
      const now = ctx.currentTime
      const step = Math.min(0.12, Math.max(0, now - last))
      last = now

      const tight = clamp(state.tight)
      const wake = clamp(state.wake)
      const wet = clamp(state.wet)
      const speed = clamp(state.speed, 0, 46)
      const fast = smoothstep(2, 38, speed)
      const paused = state.paused ? 0.2 : 1

      out.gain.setTargetAtTime(0.9 * paused, now, state.paused ? 0.12 : 0.4)

      /*
        The mountain. Barely moves, and what movement there is comes from how
        much rock is between you and the outside — which the Rootwake has more
        of than the ordinary road, and which is most of why the hidden tunnel
        should feel like a *decision* rather than a shortcut.
      */
      deepGain.gain.setTargetAtTime(0.028 + tight * 0.016 + wake * 0.022, now, 0.9)
      deepA.frequency.setTargetAtTime(31 - wake * 3.5, now, 1.2)
      rumbleLow.frequency.setTargetAtTime(96 + tight * 40, now, 0.8)
      rumbleGain.gain.setTargetAtTime(0.05 + tight * 0.03 + wake * 0.026, now, 0.7)

      /*
        The size of it. This is the fast one — the rock closing in has to be
        audible on the same corner it is visible, not a second later, or it
        reads as the mix drifting rather than as the tunnel narrowing.
      */
      const loose = clamp(state.rough)
      roomBand.frequency.setTargetAtTime(210 + tight * 260 + wake * 90 - loose * 60, now, 0.25)
      // Off the stone the room goes duller and wider: loose ground under the
      // car is the one surface in here that does not reflect anything back.
      roomBand.Q.setTargetAtTime(0.5 + tight * 1.5 + wake * 0.8 - loose * 0.3, now, 0.3)
      roomGain.gain.setTargetAtTime(0.026 + tight * 0.05 + wake * 0.03 + loose * 0.02, now, 0.22)

      /*
        Air. Loudest standing still, which is backwards from every other layer
        and is the entire point: at forty metres a second the car's own wind
        owns this band and a second draught underneath it is mud, while parked
        in the dark it is the only thing there is.
      */
      const still = 1 - fast * 0.72
      draughtHigh.frequency.setTargetAtTime(250 + tight * 420, now, 0.4)
      draughtLow.frequency.setTargetAtTime(1700 + tight * 1900 + fast * 900, now, 0.4)
      // Eleven seconds is prime enough against the drip and creak schedules
      // that the three never fall into a pattern you can hear.
      const breath = 0.78 + Math.sin(now * 0.571) * 0.22
      draughtGain.gain.setTargetAtTime(
        (0.03 + tight * 0.042) * still * breath * (1 - wake * 0.45),
        now,
        0.5,
      )
      draughtPan.pan.setTargetAtTime(Math.sin(now * 0.23) * 0.42, now, 0.8)

      /*
        Water. The stream follows the wet stone rather than a sector, so the
        one place in the road where the ceiling is running is also the one
        place it can be heard, without either of them being authored.
      */
      const standing = clamp(state.water)
      streamBand.frequency.setTargetAtTime(760 + wet * 620 + fast * 380, now, 0.4)
      streamGain.gain.setTargetAtTime(
        (0.012 + wet * 0.05 + wake * 0.03 + standing * 0.04) * (0.5 + still * 0.5),
        now,
        0.45,
      )
      streamPan.pan.setTargetAtTime(Math.sin(now * 0.17 + 2) * 0.55, now, 1.1)

      // The roots, under load.
      const root = clamp(state.roots)
      rootBand.frequency.setTargetAtTime(132 + root * 70, now, 0.5)
      rootGain.gain.setTargetAtTime(root * (0.02 + still * 0.02), now, 0.5)

      /*
        Fire. Arrives before the light does — the crackle of a lantern is up
        about twenty metres out while the lamp itself is still a smear in the
        fog, which is the cheapest way there is of making a light feel like it
        is somewhere rather than on the screen.
      */
      const heat = clamp(state.lamp * 0.55 + state.fire)
      fireBand.frequency.setTargetAtTime(520 + heat * 320, now, 0.3)
      fireGain.gain.setTargetAtTime(heat * (0.03 + still * 0.035), now, 0.3)

      /*
        The tail. Long and wide open in the Rootwake, tighter on the ordinary
        road, and *shorter* the faster you go — a two-and-a-half second tail at
        thirty-five metres a second is a wash, because the reflection of a
        thing arrives after you have left the place that reflected it.
      */
      verbSend.gain.setTargetAtTime(0.2 + tight * 0.24 + wake * 0.3 - fast * 0.12, now, 0.6)

      // --- scheduled ---------------------------------------------------------
      if (!state.paused) {
        /*
          Drips. The rate follows the wet, so a dry chamber is properly dry —
          a cave that drips at a constant rate everywhere is a sound effect
          somebody left running.
        */
        // Standing water is where a drip has somewhere to land, so a puddle
        // on the road is also the loudest place in the cave for them.
        dripDue -= step * (0.25 + wet * 2.4 + wake * 0.5 + standing * 2)
        while (dripDue <= 0) {
          dripDue += 0.5 + Math.random() * 1.6
          drip(now + Math.random() * 0.08, Math.random() * 1.7 - 0.85)
        }

        // And the roots, only where there are any.
        creakDue -= step * (0.05 + root * 0.5)
        while (creakDue <= 0) {
          creakDue += 3 + Math.random() * 7
          creak(now + Math.random() * 0.15, root)
        }
      }

      /*
        Scraping the rock.

        Rate-limited rather than continuous, and this is the same trap the
        wall itself had in the physics: a grind laid down every frame is a
        buzz whose pitch is the frame rate. Grit coming off the wall in
        handfuls is a car against stone; a sine at 60 Hz is a broken speaker.
      */
      const scrape = clamp(state.scrape)
      if (scrape > 0.02 && speed > 3) {
        lastScrape -= step * (14 + scrape * 30) * Math.min(1, speed / 14)
        while (lastScrape <= 0) {
          lastScrape += 1
          burst(
            now + Math.random() * 0.02,
            0.01 + scrape * 0.035,
            0.05 + Math.random() * 0.05,
            'bandpass',
            1100 + Math.random() * 2600,
            2.2,
            1.6 + Math.random(),
            dry,
            Math.random() * 1.2 - 0.6,
          )
        }
      } else {
        lastScrape = 0
      }
    },

    crash(force) {
      if (stopped) return
      const now = ctx.currentTime
      const size = clamp(force)
      /*
        Three things, and none of them is the impact itself.

          the slap    the whole tunnel answering, straight into the reverb and
                      nothing dry at all. This is the one that says "cave"
          the chips   stone coming off the wall, panned, arriving over about a
                      third of a second because gravity is not instant
          the settle  a low thud a beat later, which is the rock deciding it is
                      staying where it is
      */
      burst(now, 0.11 + size * 0.16, 0.42, 'bandpass', 420 + size * 380, 0.6, 0.85, verbSend)
      const chips = 3 + Math.round(size * 6)
      for (let i = 0; i < chips; i++) {
        const at = now + 0.04 + Math.random() * 0.3
        burst(
          at,
          0.012 + size * 0.03,
          0.03 + Math.random() * 0.04,
          'bandpass',
          1600 + Math.random() * 3400,
          3.5,
          2 + Math.random() * 1.4,
          dry,
          Math.random() * 1.6 - 0.8,
        )
      }
      burst(now + 0.09, 0.05 + size * 0.07, 0.3, 'lowpass', 150, 1, 0.4)
    },

    splash(force) {
      if (stopped) return
      const now = ctx.currentTime
      const size = clamp(force)
      // Water is broadband and *fast* — the sheet leaves the wheel before the
      // body of it has finished being displaced, so the bright part comes
      // first and the low part follows a moment behind.
      burst(now, 0.05 + size * 0.09, 0.22, 'highpass', 1300, 0.5, 1.9)
      burst(now + 0.02, 0.035 + size * 0.06, 0.34, 'bandpass', 520, 0.7, 0.9)
      burst(now + 0.05, 0.02 + size * 0.03, 0.5, 'highpass', 2600, 0.45, 2.4, verbSend)
    },

    stop() {
      if (stopped) return
      stopped = true
      const now = ctx.currentTime
      out.gain.cancelScheduledValues(now)
      out.gain.setTargetAtTime(0.0001, now, 0.16)
      verbReturn.gain.setTargetAtTime(0.0001, now, 0.24)
      globalThis.setTimeout(() => {
        for (const node of [
          deepA,
          deepB,
          rumbleSource,
          roomSource,
          draughtSource,
          streamSource,
          rootSource,
          fireSource,
        ]) {
          try {
            node.stop()
          } catch {
            /* already stopped */
          }
        }
        out.disconnect()
        verbReturn.disconnect()
      }, 950)
    },
  }
}
