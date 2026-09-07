/**
 * Moving water.
 *
 * The garden had one piece of water before this and it was a flat cyan
 * rectangle with a standard material on it. It read as a swimming pool tile
 * dropped in a field, which is roughly the worst thing a river can look like
 * in a place whose entire meaning is that the river runs faster the more the
 * two of you have put by.
 *
 * Four things, together, are what make a surface read as *flowing* water at a
 * glance — and it has to work at a glance, because in the garden the river is
 * a thumbnail twenty metres away:
 *
 *  1. **Travel.** Swell moving one way, always. A surface that merely wobbles
 *     is a puddle in the wind; a surface that wobbles *downstream* is a river.
 *  2. **Glitter.** Small, sharp, moving specular hits. This is the single
 *     strongest cue and it is nearly free — it falls straight out of the wave
 *     normal you already computed for the swell.
 *  3. **A shore.** Water that ends on a straight line is a plane. Water that
 *     goes pale, then foams, then stops is water with a bank.
 *  4. **Depth.** Dark in the channel, light in the shallows.
 *
 * The geometry is a *ribbon*, not a plane: a meandering centreline with a
 * width that varies down its length. The design law bans rectangles, and a
 * river is the clearest case of why — a straight-edged one is instantly a
 * texture on a quad.
 */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  ShaderMaterial,
  Vector3,
} from 'three'
import type { SkyPalette } from '@/systems/palette'
import { ambientLightLevel } from './forms'

export interface RibbonOptions {
  /** How far it runs, along +z. */
  length: number
  /**
   * Rows across that length. **Leave it out.**
   *
   * The default is derived from the length so the swell is always sampled
   * finely enough to draw — see `ROW_METRES`. It is still settable for a
   * ribbon that wants to be coarser than the water needs, and nothing in the
   * garden currently does.
   */
  rows?: number
  /** Sideways wander of the centreline, in metres. */
  meander?: number
  /** Half-width at its narrowest and widest. */
  width: [number, number]
  /**
   * Where the ribbon's own origin sits in the world, and how high the ground
   * is there. Given together, the strip *rides the terrain* instead of lying
   * flat.
   *
   * This is not a nicety. The meadow rolls by a third of a metre over the
   * length of a stream this size, so a flat sheet either floats at one end or
   * disappears into the hillside at the other — which is exactly what the
   * first cut of the Wellspring's landmark did: it was buried forty
   * centimetres inside the ground mesh and drew nothing at all.
   */
  origin?: [number, number]
  baseY?: number
  heightAt?: (x: number, z: number) => number
  /**
   * How far above the ground the surface sits, in metres.
   *
   * Positive, and small. Sinking it would put it back inside the terrain: the
   * ground mesh has no idea this water exists and will not make room for it.
   * A few centimetres of lift plus stones straddling the edge reads as a
   * shallow brook, which is what this is.
   */
  lift?: number
}

/** The height of the ribbon's surface at a point along it, in local space. */
function surfaceY(
  x: number,
  z: number,
  { origin, baseY = 0, heightAt, lift = 0 }: RibbonOptions,
): number {
  if (!origin || !heightAt) return lift
  return heightAt(origin[0] + x, origin[1] + z) - baseY + lift
}

/**
 * A meandering strip in the XZ plane, y = 0.
 *
 * `uv.x` runs 0..1 across the channel and `uv.y` runs 0..1 down it, which is
 * what the shader uses for "how near a bank am I" and "how far downstream".
 */
/**
 * How far apart the rows of a water ribbon may be, in metres.
 *
 * =============================================================================
 * **This number belongs to the shader, not to whoever is drawing a river, and
 * that is the whole lesson of it.**
 *
 * The swell in `VERT` is stated in *cycles per metre* — the three waves are
 * `run * 1.0`, `run * 2.0` and `run * 3.7`, so the shortest of them is about
 * **1.7 metres** from crest to crest. It is computed per vertex and handed
 * down as a varying, so the mesh has to have enough rows to *carry* it. Below
 * roughly two rows per wavelength there is nothing to carry it with, and what
 * comes out is not a smoother river — it is the wave beating against the row
 * spacing, drawn as hard, evenly spaced bars marching downstream.
 *
 * **It shipped that way and only in one place.** The garden's brook happened
 * to be dealt 80 rows over 26 metres, which is a third of a metre each and
 * comfortably fine; the Wellspring was dealt 200 over 240, which is one and a
 * fifth metres — *one and a half samples* on the shortest wave. Same shader,
 * same water, and the big one looked like a ladder while the small one looked
 * like a river. Nobody could have found that by reading either file, because
 * neither file contains both numbers.
 *
 * So the spacing is stated once, here, next to the waves it has to carry, and
 * every ribbon gets it by default. A third of a metre is five samples on the
 * shortest wave, and it is what the brook was already proving works.
 * =============================================================================
 */
export const ROW_METRES = 0.32

export function ribbonGeometry(options: RibbonOptions): BufferGeometry {
  const { length, meander = 1.1, width } = options
  /*
    A ribbon is two vertices wide, so rows are close to free: the Wellspring
    goes from four hundred triangles to fifteen hundred, on a road that draws
    a hundred thousand. There is no reason to be careful with this number and
    every reason not to be.
  */
  const rows = options.rows ?? Math.max(8, Math.ceil(length / ROW_METRES))
  const positions: number[] = []
  const uvs: number[] = []
  const normals: number[] = []
  /**
   * Where the middle of the channel is at each row.
   *
   * Kept apart from the vertex's own x so the shader can narrow the water
   * without also straightening it. Scaling raw x about zero shrinks the
   * meander by the same factor — at the Wellspring's empty setting that took
   * five metres of wander down to eighty centimetres and the river ran dead
   * straight down its valley, which is the one thing a river never does.
   */
  const centres: number[] = []
  const indices: number[] = []

  for (let i = 0; i <= rows; i++) {
    const t = i / rows
    const z = (t - 0.5) * length

    // Two frequencies so the bends don't repeat on an obvious period.
    const centre = Math.sin(t * 4.1 + 0.6) * meander + Math.sin(t * 9.3 + 2.2) * meander * 0.32
    const half =
      width[0] +
      (width[1] - width[0]) * (Math.sin(t * 5.7 + 1.1) * 0.5 + 0.5)

    const leftX = centre - half
    const rightX = centre + half
    positions.push(
      leftX, surfaceY(leftX, z, options), z,
      rightX, surfaceY(rightX, z, options), z,
    )
    centres.push(centre, centre)
    uvs.push(0, t, 1, t)
    // Flat up. The water shader computes its own normal from the swell; these
    // are here so the same ribbon can be handed to the shared form shader for
    // the bed underneath, which does read them.
    normals.push(0, 1, 0, 0, 1, 0)
  }

  for (let i = 0; i < rows; i++) {
    const a = i * 2
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
  geo.setAttribute('aCentre', new BufferAttribute(new Float32Array(centres), 1))
  geo.setIndex(indices)
  return geo
}

/**
 * Where the two banks are, for whatever has to stand on them.
 *
 * Stones scattered by eye along a river drawn by a formula will not follow it.
 * Anything that belongs to the edge asks here instead, so the shore and the
 * things on the shore cannot drift apart.
 */
export function bankAt(
  t: number,
  options: RibbonOptions,
): { x: number; z: number; y: number; half: number } {
  const { length, meander = 1.1, width } = options
  const centre = Math.sin(t * 4.1 + 0.6) * meander + Math.sin(t * 9.3 + 2.2) * meander * 0.32
  const half = width[0] + (width[1] - width[0]) * (Math.sin(t * 5.7 + 1.1) * 0.5 + 0.5)
  const z = (t - 0.5) * length
  return { x: centre, z, y: surfaceY(centre, z, options), half }
}

const VERT = /* glsl */ `
  attribute float aCentre;

  uniform float uTime;
  uniform float uFlow;
  uniform float uChop;
  /**
   * Scales the channel sideways, about its own centreline.
   *
   * The Wellspring's whole meaning is that the river widens as the two of you
   * put money by, and that has to animate — putting something in should raise
   * the water while you watch. Rebuilding the ribbon every frame to do it
   * would be absurd, so the width is a uniform and the geometry is the shape
   * at full flow. It scales the meander too, which is right: a fuller river
   * swings wider through its own bends.
   */
  uniform float uWidth;
  /**
   * How long the ribbon is, in metres.
   *
   * Every wave and every streak below is stated *per metre*, not per unit of
   * uv. Without this the same shader gave a brook a ripple every metre and
   * gave the river it previews — nine times longer, same uv range — swells
   * nine metres apart and froth in fourteen-metre slabs. Waves have a size in
   * the world; they do not scale with the thing they are on.
   */
  uniform float uLength;

  varying vec2 vUv;
  varying float vDepth;
  varying vec3 vNormal;
  varying float vCrest;
  varying float vStreak;
  varying float vTravel;
  varying float vRunM;
  varying float vAcrossM;
  /**
   * Where the carried band is, this frame. See uCarrying in the fragment stage.
   *
   * Worked out here rather than down there, and that is not a preference — it
   * is the second time this exact wall has been walked into. The fragment stage
   * declares a mediump float precision and the vertex stage does not, so a
   * uniform named in both is highp in one and mediump in the other, and the
   * program simply refuses to link: **"Precisions of uniform 'uTime' differ
   * between VERTEX and FRAGMENT shaders."** Nothing throws, nothing is drawn,
   * and the river is a dry valley with no error anywhere on screen. The
   * Glasshouse lost an afternoon to the same thing with a uniform called uForm.
   *
   * A varying has one precision, declared once, in both stages. So anything
   * time-varying is computed up here and handed down — which is what the note
   * further up this file has been saying all along.
   */
  varying float vCarry;

  void main() {
    vUv = uv;

    // Downstream is +v. Everything travels that way and nothing travels back.
    float travel = uTime * (0.5 + uFlow * 1.4);

    // How far down the channel this vertex is, in metres.
    float run = uv.y * uLength;

    // Three swells at different sizes and speeds, each stated as cycles per
    // metre. The slowest carries the river's body; the fastest is the texture
    // you actually read the speed from.
    float a = sin(run * 1.0 - travel * 3.0 + uv.x * 3.1);
    float b = sin(run * 2.0 - travel * 5.2 + uv.x * 7.7);
    float c = sin(run * 3.7 - travel * 8.1 - uv.x * 4.3);

    float h = (a * 0.055 + b * 0.026 + c * 0.011) * uChop;

    /*
      The normal, differentiated rather than guessed.

      d/dv of the same three waves, which is exact and costs three cosines.
      Faking it by offsetting the height twice looked fine on the swell and
      wrong on the glitter — the highlights lagged the crests they were
      supposed to be sitting on.
    */
    // d/d(metre downstream), so the slope is a real gradient whatever length
    // of channel this happens to be.
    float dv =
      cos(run * 1.0 - travel * 3.0 + uv.x * 3.1) * 1.0 * 0.055 +
      cos(run * 2.0 - travel * 5.2 + uv.x * 7.7) * 2.0 * 0.026 +
      cos(run * 3.7 - travel * 8.1 - uv.x * 4.3) * 3.7 * 0.011;
    float du =
      cos(run * 1.0 - travel * 3.0 + uv.x * 3.1) * 3.1 * 0.055 +
      cos(run * 2.0 - travel * 5.2 + uv.x * 7.7) * 7.7 * 0.026 +
      cos(run * 3.7 - travel * 8.1 - uv.x * 4.3) * -4.3 * 0.011;

    vNormal = normalize(vec3(-du * uChop, 1.0, -dv * uChop));
    vCrest = a;

    /*
      Handed down so the fragment stage can have a surface of its own.

      A ribbon is two vertices wide, so anything computed up here can only ever
      be a straight line from one bank to the other — the 'uv.x' terms above
      tilt the crests, they cannot bend them. That is what put a ladder of hard
      white rungs across the Wellspring: every crest lit along its whole length
      at once, because every crest *was* a line.

      These three are the ingredients for a second, finer surface worked out per
      pixel instead: how far down the channel this fragment is, how far across
      in real metres, and where the current has got to. All varyings, and that
      is deliberate — see the note below on why the fragment stage may not read
      a uniform the vertex stage reads.
    */
    vTravel = travel;
    vRunM = run;
    // vAcrossM waits until 'p' exists, a few lines down — it is the only one of
    // the three that needs the narrowed position rather than the raw one.

    /*
      Streaks of froth being carried along.

      Two frequencies that do not divide into each other. One alone laid down
      evenly-spaced white bars marching downstream — a barcode, not a river.
      Froth is irregular, and irregular is cheap: the sum of two waves whose
      periods never line up does not repeat inside the length of the stream.

      Read in the fragment stage as a pattern rather than as a time, which
      keeps uTime out of it entirely — see the note below on linking.
    */
    float froth1 = sin(run * 0.65 - travel * 2.6 + sin(uv.x * 6.0) * 1.4);
    float froth2 = sin(run * 1.12 - travel * 4.1 + cos(uv.x * 9.0) * 1.9);
    vStreak = froth1 * 0.62 + froth2 * 0.38;

    vec3 p = position;
    // Narrow about the channel's own centreline, not about the origin, so the
    // bends survive at any width.
    p.x = aCentre + (position.x - aCentre) * uWidth;
    // How far across the channel this vertex actually sits, in metres, *after*
    // the narrowing — so the per-pixel ripple below keeps its real scale when
    // the river runs thin instead of stretching with the water.
    vAcrossM = p.x - aCentre;
    // Runs with the current, one band, slowly. See vCarry.
    vCarry = fract(uv.y - uTime * 0.06);
    p.y += h;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

/*
  The fragment stage never reads uTime, uFlow or uChop.

  Not for speed. A uniform read by both stages at two different precisions
  makes the program fail to LINK, and it fails silently — nothing in the
  console, the water simply never draws. The vertex stage is highp by default
  and this one is mediump, so everything time-varying is worked out up there
  and handed down as a varying. The river section carries the same scar; see
  the comment in sections/river/River.tsx.
*/
const FRAG = /* glsl */ `
  precision mediump float;

  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uLight;
  uniform float uSun;
  /**
   * Something she put in while you were away, travelling down the water.
   *
   * ---------------------------------------------------------------------------
   * The Wellspring already says how full it is by being wider and faster, which
   * is the right way for a river to talk and is completely useless for saying
   * *when*: a river that has been brimming for a fortnight looks exactly like
   * one that was filled this morning.
   *
   * So a contribution you have not seen sends one band of brighter water down
   * the channel, over and over, slowly. It is not a marker sitting on the spot
   * where she put something in — nothing here is a pin on a map — it is the
   * river carrying it, which is what a river does with anything you give it.
   *
   * Zero the next time you come. See useStoodIn.
   * ---------------------------------------------------------------------------
   */
  uniform float uCarrying;

  varying vec2 vUv;
  varying float vCarry;
  varying float vDepth;
  varying vec3 vNormal;
  varying float vCrest;
  varying float vStreak;
  varying float vTravel;
  varying float vRunM;
  varying float vAcrossM;

  void main() {
    // 0 midstream, 1 at either bank
    float across = abs(vUv.x - 0.5) * 2.0;

    // Deep and cold in the channel, warm and pale where it runs thin.
    vec3 col = mix(uDeep, uShallow, smoothstep(0.18, 0.94, across));

    /*
      A second surface, finer than the mesh and worked out per pixel.

      ------------------------------------------------------------------------
      **This is what stops the water reading as a ladder.** The swell comes
      down from the vertex stage, and a ribbon is two vertices wide — so every
      crest it can describe is a straight line from one bank to the other. The
      'uv.x' terms up there tilt those lines; they cannot bend them. Then the
      specular below, which is a very tight lobe, lights each line along its
      whole length in the same instant. Straight crest plus sharp highlight is
      a white rung, and a river's worth of them is a ladder.

      Real water is broken up because its surface varies in *two* directions.
      So here are two more ripples that do, stated in real metres both down the
      channel and across it, and given to the normal before anything reflects
      off it. They cost two sines and two cosines and they are the difference
      between glitter that scintillates and glitter that stripes.

      **Every input is a varying, and that is not incidental.** The note above
      this stage explains that a uniform read by both stages at different
      precisions makes the program fail to link, silently — so the current's
      position arrives as a varying rather than by reading 'uTime' here.
      ------------------------------------------------------------------------
    */
    /*
      Three, at angles that do not answer each other.

      **Two was a lattice.** They were aimed at plus and minus thirty-five
      degrees off the current — symmetric, near enough the same frequency — and
      two waves like that cross into a diamond grid. On the Wellspring, seen
      down its length, it passed for chop; on the garden's brook, seen from
      three metres away, it was unmistakably a net laid over the water. Which
      is the same failure as the ladder it replaced, one order finer: regular
      structure where there should be none.

      So: three, spread twenty, minus thirty-seven and sixty-five degrees, at
      frequencies that are not multiples of each other. Nothing lines up with
      anything, and nothing repeats inside the length of a river.

      **And the amplitude falls as the frequency rises.** The slope a wave puts
      on a surface is its height times its frequency, and slope is the whole of
      what the specular reads — raise one without lowering the other and the
      glitter does not get finer, it gets *wider*, and the water goes from a
      ladder to a field of splashes.
    */
    /*
      The ground is bent before the ripples are laid on it.

      Three straight waves at three angles is still three straight waves: they
      interfere on a fixed grid, and the eye finds a grid however cleverly the
      angles are chosen — two of them made a diamond net over the brook, and
      three made a finer one. Adding a fourth would make a finer one again.

      So the coordinates themselves are pushed about first, by two slow waves
      that are nothing to do with the fast ones. Every crest below then follows
      a wandering line instead of a straight one, nothing stays in step with
      anything, and the pattern never closes. This is the cheapest honest way
      to get irregularity without a texture to sample.
    */
    float warpRun    = sin(vAcrossM * 1.10 + vTravel * 1.7) * 0.85
                     + sin(vRunM    * 0.70 - vTravel * 1.1) * 0.55;
    float warpAcross = sin(vRunM    * 0.90 + vTravel * 1.3) * 0.85
                     + sin(vAcrossM * 1.30 - vTravel * 0.9) * 0.55;
    float rr = vRunM + warpRun;
    float aa = vAcrossM + warpAcross;

    float p1 = rr * 11.0 + aa *  4.0 - vTravel * 10.0;
    float p2 = rr * 17.0 - aa * 13.0 - vTravel * 15.0;
    float p3 = rr *  7.0 + aa * 15.0 - vTravel *  6.5;

    /*
      ------------------------------------------------------------------------
      **A ripple the screen cannot resolve is faded out rather than drawn
      anyway, and this is what finally killed the combing.**

      There is already a distance fade further down, and it was measuring the
      wrong thing. What decides whether a wave can be drawn is not how far away
      it is but how fast its phase moves per *pixel* — and at a grazing angle
      that runs away long before 'vDepth' grows, because a metre of river
      flattens into almost no screen at all. Which is exactly why the marks were
      worst across the middle of the channel and not at the far bend, and why
      pulling the distance fade in never touched them.

      A sinusoid survives sampling while its phase advances less than pi across
      one pixel. Past that it does not vanish, it *beats*: neighbouring pixels
      land on unrelated parts of the wave and the eye joins them into long slow
      diagonals. Those diagonals were the streaks, and they were being drawn
      with total conviction.

      'fwidth' is that number measured rather than guessed, so this holds at any
      resolution, any field of view and any camera height instead of being tuned
      until one screenshot looked acceptable. It also explains why this was so
      much worse on a phone: same river, narrower view, more metres per pixel.

      Fading to zero leaves the mean, which is flat water — and that is the
      honest answer rather than a compromise. Past its resolving distance a real
      river is sheen and colour, not texture.
      ------------------------------------------------------------------------
    */
    float phaseStep = max(fwidth(p1), max(fwidth(p2), fwidth(p3)));
    float resolved = 1.0 - smoothstep(1.1, 3.0, phaseStep);

    /*
      The same test for the swell, which is geometry and aliases anyway — and
      an honest note about how much it actually does.

      The crests are one row every ROW_METRES, and perspective eventually puts a
      whole wave inside a pixel. Two things ride on them and both come to a
      point there: the glitter, which is a very tight lobe, and the froth, which
      is brightest over a crest. No smoothstep can fix that however wide it is
      made — the froth's comment below is right that wide steps beat tight ones,
      but width in metres stops helping once the metres are gone.

      **Measured, rather than assumed.** Rendering 'crestStep' straight to the
      screen shows it crossing this threshold only on thin spikes, not across
      the broad bands — so this removes the worst individual sparkles and it is
      *not* what makes the water calmer. The per-pixel fade above is. The
      remaining bands are the swell itself, drawn correctly, and if they ever
      want changing that is an amplitude and a wavelength, not an alias.
    */
    float crestStep = fwidth(vCrest);
    float crestResolved = 1.0 - smoothstep(0.35, 1.1, crestStep);
    /*
      The gradient of the three, taken as though the warp were not there.

      Deliberately approximate: carrying the warp's own derivative through
      would be exact and would cost four more cosines to place a highlight a
      few centimetres from where it already is. The swell above is the one that
      has to be exact — a crest whose glitter lags it reads as wrong — and this
      is texture riding on top of that.
    */
    float rippleAcross = cos(p1) * 4.0 - cos(p2) * 13.0 + cos(p3) * 15.0;
    float rippleDown   = cos(p1) * 11.0 + cos(p2) * 17.0 + cos(p3) * 7.0;
    /*
      Faded with distance, and that is not a saving.

      This is the one thing in the water with no geometry behind it, so there
      is nothing to average it down: at sixty metres a ripple half a metre wide
      is a fraction of a pixel, and a fraction of a pixel that moves is a
      shimmer. It is strongest underfoot, where you can actually see the
      surface, and mostly gone by the far bend — which is also what water
      genuinely does, since past a certain distance all you read is the sheen.
    */
    float ripple = 0.0034 * (1.0 - smoothstep(14.0, 85.0, vDepth) * 0.72) * resolved;
    vec3 n = normalize(vNormal + vec3(-rippleAcross * ripple, 0.0, -rippleDown * ripple));

    /*
      Fresnel. Water is nearly a mirror at a grazing angle and nearly clear
      looking straight down, and getting that one relationship right does more
      for "this is water" than any amount of blue.
    */
    vec3 view = normalize(vec3(0.0, 1.0, 0.9));
    float facing = clamp(dot(n, view), 0.0, 1.0);
    float fresnel = pow(1.0 - facing, 2.6);
    col = mix(col, uSky, fresnel * 0.72);

    // Glitter: a hard specular lobe off the wave normal. Small and sharp, so
    // it scintillates as the crests travel instead of smearing into a sheen.
    float spec = pow(clamp(dot(reflect(-normalize(uSunDir), n), view), 0.0, 1.0), 42.0);
    col += uSunColor * spec * 1.15 * uSun * crestResolved;

    /*
      Froth carried downstream, strongest over the crests.

      Wide smoothsteps on purpose. Tight ones turned this into clean white
      lines ruled across the channel — legible as motion, and not at all like
      water. Froth wants to be a gradient that happens to be brighter in
      places, never an edge.
    */
    float streak = smoothstep(0.25, 1.0, vStreak) * smoothstep(-0.2, 0.9, vCrest);
    col += vec3(0.84, 0.88, 0.88) * streak * 0.075 * crestResolved;

    /*
      The shore: pale, then foam, then the edge — never a cut line.

      Held to the last fifth of the width. Foam across a third of the river
      turned the whole surface white and lost the colour that says how deep it
      is, which is one of the four things making this read as water at all.
    */
    float shore = smoothstep(0.8, 1.0, across);
    float foam = shore * (0.4 + 0.6 * smoothstep(0.0, 0.9, vStreak));
    col = mix(col, vec3(0.86, 0.89, 0.88), foam * 0.34);

    /*
      The ribbon. A soft band, a quarter of the channel long, running with the
      current — and brightest in the middle of the water rather than at the
      banks, so it reads as something being carried rather than as foam.
    */
    if (uCarrying > 0.001) {
      float band = smoothstep(0.24, 0.0, abs(vCarry - 0.5));
      float midstream = 1.0 - smoothstep(0.15, 0.85, across);
      col += vec3(0.42, 0.68, 0.74) * band * midstream * uCarrying * 0.5;
    }

    col *= uLight;

    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    col = mix(col, uFogColor, fog);

    // The last hand's width dissolves, so the bank is wet rather than sliced.
    float edge = 1.0 - smoothstep(0.94, 1.0, across);

    gl_FragColor = vec4(col, edge);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export interface WaterOptions {
  /** 0..1 — how hard it is running. Drives speed and froth. */
  flow?: number
  /** Multiplies the wave height. Small water wants small waves. */
  chop?: number
  /** Sideways scale about the centreline. 1 is the ribbon as built. */
  width?: number
  /**
   * The ribbon's length in metres. Must match the geometry, or the waves come
   * out the wrong size — pass the same number given to ribbonGeometry.
   */
  length?: number
}

export function makeWaterMaterial({
  flow = 0.5,
  chop = 1,
  width = 1,
  length = 20,
}: WaterOptions = {}) {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: DoubleSide,
    // The rim fades out rather than ending on a line, so the water meets its
    // bank wet instead of being cut off against it.
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uFlow: { value: flow },
      uChop: { value: chop },
      uWidth: { value: width },
      uCarrying: { value: 0 },
      uLength: { value: length },
      uDeep: { value: new Color('#2e474f') },
      uShallow: { value: new Color('#6f8a83') },
      uSky: { value: new Color('#c3cebe') },
      uSunColor: { value: new Color('#fff2d8') },
      // a direction, not a colour — it has to be able to point downward
      uSunDir: { value: new Vector3(0.3, 0.8, -0.3) },
      uFogColor: { value: new Color('#c3cebe') },
      uFogNear: { value: 16 },
      uFogFar: { value: 150 },
      uLight: { value: 1 },
      uSun: { value: 1 },
    },
  })
}

/**
 * Where the sun is, as a direction.
 *
 * The same arc `world/Sky.tsx` puts the disc on, so the glitter on the water
 * sits under the sun you can actually look up and see rather than under a
 * light that was picked to look nice.
 */
export function sunDirection(hour: number): [number, number, number] {
  const angle = ((hour - 6) / 24) * Math.PI * 2
  const x = Math.cos(angle) * 0.9
  const y = Math.sin(angle) * 0.78
  const z = -0.34
  const len = Math.hypot(x, y, z) || 1
  return [x / len, y / len, z / len]
}

/** Keeps the water in step with the hour of the garden. */
export function tuneWater(material: ShaderMaterial, palette: SkyPalette) {
  const u = material.uniforms
  u.uSky.value.set(palette.skyBottom)
  u.uSunColor.value.set(palette.sunColor)
  u.uFogColor.value.set(palette.fogColor)
  u.uFogNear.value = palette.fogNear
  u.uFogFar.value = palette.fogFar
  u.uLight.value = ambientLightLevel(palette)
  u.uSun.value = Math.min(1, palette.sunIntensity)
  const [x, y, z] = sunDirection(palette.hour)
  u.uSunDir.value.set(x, y, z)
}
