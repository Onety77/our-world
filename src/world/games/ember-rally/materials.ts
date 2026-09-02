/**
 * How the Rootway is lit.
 *
 * The garden's law is that nothing is lit by scene lights — every surface has
 * a shader that takes the light it needs as uniforms, which is how a hundred
 * and fifty trees cost two draw calls. Underground the same law holds, but the
 * light is completely different: there is no sun, and almost everything you
 * can see is being shown to you by the lamps on the front of your own car.
 *
 * So there is one lighting model here, written once and pasted into every
 * shader that uses it:
 *
 *   two headlamps      a real pair of cones, offset either side of the nose,
 *                      with distance falloff and a specular term for wet stone
 *   a rear ember       small, warm, close — what stops the underside of the
 *                      car and the road behind it going to nothing
 *   ten lanterns       a sliding window of whichever lights are near you, kept
 *                      as uniforms and refilled from the car's position
 *   almost no ambient  because it is a cave
 *
 * Two materials with slightly different ideas about any of that is the kind of
 * thing nobody can name and everybody can see, so the rock, the car, the roots
 * and the ghost all include the same block. If you add a surface down here,
 * include it too.
 */

import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  NormalBlending,
  ShaderMaterial,
  Vector3,
  Vector4,
  type IUniform,
} from 'three'
// The one description of how the Swaying Span moves; see the note beside it.
import { SWAY_RATE, SWAY_ROLL, SWAY_WAVE } from './track'

/** How many lanterns can be lit at once. A window, not the whole road. */
export const LAMP_SLOTS = 10

export interface RallyLights {
  uniforms: Record<string, IUniform>
  /** Position of the two headlamps, world space. */
  headLeft: Vector3
  headRight: Vector3
  headDir: Vector3
  /** The pod of four over the bonnet, treated as one long narrow beam. */
  spot: Vector3
  /** Lantern window: xyz then radius, flattened. */
  lamps: Float32Array
  lampColors: Float32Array
}

export function createLights(): RallyLights {
  const lamps = new Float32Array(LAMP_SLOTS * 4)
  const lampColors = new Float32Array(LAMP_SLOTS * 3)
  const headLeft = new Vector3()
  const headRight = new Vector3()
  const headDir = new Vector3(0, 0, 1)
  const spot = new Vector3()

  return {
    headLeft,
    headRight,
    headDir,
    spot,
    lamps,
    lampColors,
    uniforms: {
      uTime: { value: 0 },
      uAmbient: { value: new Color('#4a5b72') },
      /*
        =====================================================================
        **Daylight, which this engine did not have.**

        Everything in Ember Rally is lit by the car. Two headlamp cones, a warm
        pool that travels with it, a sliding window of lanterns, and a black
        world beyond them — that is the whole grammar, it is written down as
        one of the four decisions the racer follows from, and it is *correct*
        for a cave and two nights.

        It does not survive noon. The Harmattan is the first road here with the
        sun on it, and lit this way every baobab, mound and wall on it came out
        as a black silhouette against a bright sky: the ground was unlit
        because nothing was lighting it, and the headlamps were laying visible
        beams across a road you can already see.

        So: one number, nought on the three night roads, which cross-fades the
        whole model over to a sun and a sky. Kept in the shared block rather
        than in a second material, because the road, the props, the car, the
        dust and the tyre marks all have to agree about what "lit" means — and
        the moment there are two lighting models, one of them is wrong.
        =====================================================================
      */
      uDaylight: { value: 0 },
      /** Where the sun is. Low and ahead, which is where a harmattan sun is. */
      uSunDir: { value: new Vector3(0.34, 0.2, -0.92).normalize() },
      /** Its colour: dimmed and yellowed by a hundred kilometres of dust. */
      uSunColor: { value: new Color('#f0d9a8') },
      /** And the sky's own fill, which in this weather is nearly as strong. */
      uSkyColor: { value: new Color('#c08b5c') },
      /*
        Cold mineral in the walls — the same green as the fungus lanterns, so
        the tunnel has exactly two colours of light in it: your fire, and
        whatever grows down here.
      */
      uVeinColor: { value: new Color('#14514a') },
      uFogColor: { value: new Color('#0a0908') },
      uFogNear: { value: 22 },
      uFogFar: { value: 118 },

      /*
        The Swaying Span's swing, as one vector so that the shape of it travels
        with the clock and cannot be half-updated: the race clock, then the
        three constants from `track.ts` that every other reader of this wave
        uses too. Zero on the clock is a bridge at rest, which is what the
        garage and the studio want.
      */
      uSway: { value: new Vector4(0, SWAY_ROLL, SWAY_RATE, SWAY_WAVE) },

      uHeadLeft: { value: headLeft },
      uHeadRight: { value: headRight },
      uHeadDir: { value: headDir },
      uHeadColor: { value: new Color('#ffd6a0') },
      uHeadPower: { value: 1 },

      /*
        The pod, as one beam.

        Four lamps twenty centimetres apart throw one pool at any distance
        worth lighting, so modelling them separately would cost four cones to
        draw a thing indistinguishable from one. What makes it *read* as a
        second set of lights is not where it is, it is what it does: narrow,
        aimed long, and much whiter — so the far end of a straight comes up
        cold and hard while the road under the nose stays warm.
      */
      uSpot: { value: spot },
      uSpotColor: { value: new Color('#e8f0ff') },
      uSpotPower: { value: 1 },

      uEmberPos: { value: new Vector3() },
      uEmberColor: { value: new Color('#ff9c56') },
      uEmberPower: { value: 0.7 },

      uLamps: { value: lamps },
      uLampColors: { value: lampColors },

      // The ghost carries its own pale light, and it has to fall on the rock
      // or she is a decal rather than a car that is actually in the tunnel.
      uGhostPos: { value: new Vector3(0, -999, 0) },
      uGhostColor: { value: new Color('#9fb6e8') },
      uGhostPower: { value: 0 },
    },
  }
}

/** Declarations, shared. */
const LIGHT_HEAD = /* glsl */ `
  #define LAMP_SLOTS ${LAMP_SLOTS}

  uniform float uTime;
  uniform vec3 uAmbient;
  uniform float uDaylight;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uVeinColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;

  uniform vec3 uHeadLeft;
  uniform vec3 uHeadRight;
  uniform vec3 uHeadDir;
  uniform vec3 uHeadColor;
  uniform float uHeadPower;

  uniform vec3 uSpot;
  uniform vec3 uSpotColor;
  uniform float uSpotPower;

  uniform vec3 uEmberPos;
  uniform vec3 uEmberColor;
  uniform float uEmberPower;

  uniform vec4 uLamps[LAMP_SLOTS];
  uniform vec3 uLampColors[LAMP_SLOTS];

  uniform vec3 uGhostPos;
  uniform vec3 uGhostColor;
  uniform float uGhostPower;
`

/**
 * The model itself.
 *
 * `gloss` is how sharply a surface takes a highlight — wet stone and brass
 * high, dry rock and leather near zero. It is the only thing that separates
 * the materials down here, and it does most of the work: a puddle is only a
 * patch of road with a gloss of one on it.
 */
const LIGHT_BODY = /* glsl */ `
  vec3 headlampAt(vec3 origin, vec3 world, vec3 normal, vec3 view, float gloss) {
    vec3 toward = origin - world;
    float dist = length(toward);
    vec3 dir = toward / max(dist, 0.001);

    // How far off the beam's axis this point is. "-dir" runs from the lamp out
    // to the surface, which is the direction the lamp is actually shining in.
    float axis = dot(-dir, uHeadDir);
    // Low edge first: a reversed-edge smoothstep is undefined in GLSL and
    // silently returns zero, which is an evening nobody gets back.
    float cone = smoothstep(0.52, 0.93, axis);
    // A breath of spill outside it, or the edge of the beam is a drawn line.
    cone = max(cone, 0.09 * max(0.0, axis));

    float fall = 1.0 / (1.0 + dist * dist * 0.0021);
    float lambert = max(dot(normal, dir), 0.0);

    /*
      A generous floor under the lambert term, and it is not a fudge.

      The road runs away from the lamps almost edge-on: a point fifteen metres
      ahead sees them from about two degrees above the surface, so a pure
      lambert gives it four per cent of full brightness and the tunnel comes
      out unlit and undriveable. Real headlights are aimed down and their
      beams are wide and scattered, and the light on a road at night is mostly
      that scatter rather than the direct term.
    */
    vec3 lit = uHeadColor * (0.42 + lambert * 0.58) * cone * fall;

    if (gloss > 0.01) {
      vec3 halfway = normalize(dir + view);
      float spec = pow(max(dot(normal, halfway), 0.0), 26.0 + gloss * 70.0);
      lit += uHeadColor * spec * gloss * cone * fall * 1.7;
    }
    return lit;
  }

  /**
   * The spot pod: narrow, cold, and it reaches.
   *
   * Same shape as a headlamp with three numbers changed, and those three
   * numbers are the whole point. The cone is tight, so it does not wash the
   * walls beside you; the falloff is a quarter of the headlamps', so it is
   * still doing something at fifty metres where they have given up; and there
   * is no floor under the lambert term, because unlike the dipped beams this
   * one is *not* mostly scatter — it is a hard edge sweeping across the rock,
   * and that edge is what tells you the road has turned before you arrive.
   */
  vec3 spotAt(vec3 world, vec3 normal, vec3 view, float gloss) {
    vec3 toward = uSpot - world;
    float dist = length(toward);
    vec3 dir = toward / max(dist, 0.001);
    float axis = dot(-dir, uHeadDir);
    float cone = smoothstep(0.9, 0.988, axis);
    if (cone <= 0.0) return vec3(0.0);

    float fall = 1.0 / (1.0 + dist * dist * 0.0005);
    float lambert = max(dot(normal, dir), 0.0);
    vec3 lit = uSpotColor * (0.12 + lambert * 0.88) * cone * fall;
    if (gloss > 0.01) {
      vec3 halfway = normalize(dir + view);
      float spec = pow(max(dot(normal, halfway), 0.0), 30.0 + gloss * 80.0);
      lit += uSpotColor * spec * gloss * cone * fall * 1.4;
    }
    return lit;
  }

  vec3 pointLightAt(vec3 origin, vec3 tint, float radius, vec3 world, vec3 normal) {
    vec3 toward = origin - world;
    float dist = length(toward);
    // Falls off over a stated radius rather than inverse-square: a cave lit by
    // true inverse-square is either a white wall or nothing at all, and this
    // can be placed by eye.
    float fall = max(0.0, 1.0 - dist / max(radius, 0.001));
    fall *= fall;
    if (fall <= 0.0) return vec3(0.0);
    float lambert = max(dot(normal, toward / max(dist, 0.001)), 0.0);
    return tint * fall * (0.22 + lambert * 0.78);
  }

  vec3 caveLight(vec3 world, vec3 normal, vec3 albedo, float gloss) {
    vec3 view = normalize(cameraPosition - world);

    // A cave is not black. It is very nearly black, from above, where the
    // cracks are — and that faint cool wash is the only reason a wall the
    // headlights have not reached still reads as a wall.
    float up = normal.y * 0.5 + 0.5;
    vec3 col = albedo * uAmbient * (0.3 + 0.7 * up);

    /*
      The lamps, and how much of them is left once the sun is up.

      Not switched off — turned down to about a tenth. A car on a dusty road at
      midday does have its lights on, and you can just see them on the ground
      in front of it; what you must not see is a *beam*, because a visible cone
      of light in full daylight is the single thing that would give this away
      as a night road with a bright sky pasted behind it.
    */
    float lamps = mix(1.0, 0.035, uDaylight);
    vec3 beams = headlampAt(uHeadLeft, world, normal, view, gloss) +
                 headlampAt(uHeadRight, world, normal, view, gloss);
    col += albedo * beams * uHeadPower * lamps;
    col += albedo * spotAt(world, normal, view, gloss) * uSpotPower * lamps;

    /*
      And the sun, if there is one.

      A hard lambert term plus a hemisphere fill, and the fill is unusually
      strong on purpose: in a dust haze most of the light arriving at the
      ground has been scattered on the way, so shadows are soft and nothing is
      ever properly dark. That is exactly what makes a harmattan photograph
      look like a harmattan — the contrast is *low* and the value is high, and
      a sun with a weak fill would give crisp black shadows and read as a clear
      desert noon instead.
    */
    if (uDaylight > 0.0) {
      float facing = max(0.0, dot(normal, uSunDir));
      vec3 day = albedo * (uSunColor * (0.30 + 0.70 * facing) + uSkyColor * (0.34 + 0.30 * up));
      col = mix(col, col * 0.25 + day, uDaylight);
    }

    /*
      The car as a lamp in a dark room.

      Not a detail: the headlamps point forward, so everything beside and
      behind the car — including the road the camera is sitting on — gets
      nothing from them at all, and the bottom half of the frame comes out
      pure black at forty metres a second. This is the warm pool that travels
      with you, and it brightens as the ember meter fills, so the tunnel
      itself tells you how much boost you are carrying.
    */
    col += albedo * pointLightAt(uEmberPos, uEmberColor, 17.0, world, normal) * uEmberPower;

    if (uGhostPower > 0.0) {
      col += albedo * pointLightAt(uGhostPos, uGhostColor, 16.0, world, normal) * uGhostPower;
    }

    /*
      An empty slot costs nothing.

      The window is ten lanterns wide and is very often not full — at the start
      of the road, in a long dark throat, and in the studio where there are only
      three. Without this the shader pays for ten point lights everywhere
      regardless, which is most of the cost of every fragment on screen; the
      unused ones are parked at radius 0.0001 by updateLamps, so one compare
      skips them.
    */
    for (int i = 0; i < LAMP_SLOTS; i++) {
      if (uLamps[i].w < 0.01) continue;
      col += albedo * pointLightAt(uLamps[i].xyz, uLampColors[i], uLamps[i].w, world, normal);
    }
    return col;
  }

  vec3 caveFog(vec3 col, float depth) {
    return mix(col, uFogColor, smoothstep(uFogNear, uFogFar, depth));
  }
`

// ---------------------------------------------------------------------------
// Rock, road, roots, stones — one material, distinguished by vertex data
// ---------------------------------------------------------------------------

const ROCK_VERT = /* glsl */ `
  attribute vec3 aColor;
  /** x: how wet, y: how rough. */
  attribute vec2 aSurface;
  /*
    The Swaying Span, and nothing else in the game.

    aSwing is where this vertex goes when the deck under it rolls one radian,
    worked out once when the mesh was built — see CourseMesh.onSwayingRoad. It
    is zero everywhere except the one bridge, and absent entirely from the
    Rootway and the Stormcrown, where WebGL supplies zero for it and this
    branch costs a comparison.

    aSwayPhase is how much this piece of road moves and how far along the road
    it is. The distance is in the phase because the wave *travels*: the whole
    bridge does not tip at once, which is what stops the span being learnable
    as "lean left here".
  */
  attribute vec3 aSwing;
  attribute vec2 aSwayPhase;

  /** x: the race clock. yzw: how far it rolls, how fast, and how long the wave is. */
  uniform vec4 uSway;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec2 vSurface;
  varying float vDepth;

  void main() {
    vColor = aColor;
    vSurface = aSurface;

    /*
      The same roll, from the same three numbers, as the one gravity is
      resolved down in physics and the one the car is laid on in placeCar. Kept
      as uniforms rather than typed in here so there is exactly one place the
      bridge's swing is described; a shader with its own copy of the wave would
      drift a few degrees from the road and put the car visibly through the
      deck.
    */
    vec3 laid = position;
    if (aSwayPhase.x > 0.002) {
      float roll = -uSway.y * aSwayPhase.x * sin(uSway.x * uSway.z - aSwayPhase.y * uSway.w);
      laid += aSwing * sin(roll);
    }

    vec4 world = modelMatrix * vec4(laid, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mv = viewMatrix * world;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const ROCK_FRAG = /* glsl */ `
  precision highp float;
${LIGHT_HEAD}

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec2 vSurface;
  varying float vDepth;

${LIGHT_BODY}

  void main() {
    vec3 normal = normalize(vNormal);

    /*
      Grain, keyed to where the surface is in the world rather than to the
      screen, so it sits still on the rock instead of swimming across it as the
      camera moves. Three frequencies, because one reads as noise added to a
      flat colour and three reads as stone.
    */
    float fine = fract(sin(dot(floor(vWorld * 11.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float broad = fract(sin(dot(floor(vWorld * 0.65), vec3(39.34, 11.13, 83.155))) * 24634.6345);
    // Rock takes most of it; the road is worn smooth and a checker on it reads
    // as tiling rather than as stone.
    float tooth = 0.25 + vSurface.y * 0.75;
    vec3 albedo = vColor * (1.0 - 0.13 * tooth + fine * 0.2 * tooth + broad * 0.16 * tooth);

    // Wet stone is darker as well as shinier, which is most of why rain reads.
    float wet = vSurface.x;
    albedo *= 1.0 - wet * 0.34;

    vec3 col = caveLight(vWorld, normal, albedo, wet * 0.9 + 0.04);

    /*
      --- something in the rock that glows -----------------------------------

      Veins of cold mineral, running through the walls and the vault. They are
      the one thing down here that is not shown to you by your own headlamps:
      they are *already lit* when you arrive, so the tunnel has a shape before
      the beams reach it and the far end of a straight is not a black hole.

      Drawn as the contour of a sum of sines in world space rather than a
      threshold on noise — a threshold gives blotches, and a contour gives thin
      branching lines, which is what a mineral seam actually looks like. Three
      frequencies, so it does not repeat within the length of the road.

      Never on the road surface. Glowing stone underfoot would compete with the
      three lamps on the back of your own car, and those are the only gauge the
      game has.
    */
    float seam =
      sin(vWorld.x * 3.9 + vWorld.y * 6.4) +
      sin(vWorld.z * 5.1 - vWorld.y * 3.3) +
      sin((vWorld.x + vWorld.z) * 2.1 + vWorld.y * 1.4);
    /*
      Thin, and it has to be thin.

      The first attempt used a band four times this wide with a colour four
      times this bright, and the tunnel came out looking like neon tubing
      stapled to the ceiling — the veins became the brightest thing on screen
      and the car, the road and the lanterns all disappeared behind them. A
      seam in rock is a hairline that catches the eye once; anything wider is
      a light fitting.
    */
    float vein = 1.0 - smoothstep(0.0, 0.07, abs(seam - 0.85));
    vein *= smoothstep(0.28, 0.72, vSurface.y);
    /*
      Broken into pieces, because a contour is a *loop*.

      The contour of a sum of sines is smooth and closed, so unbroken it reads
      as somebody's doodle on the wall rather than as mineral. Cutting it with
      a blocky hash turns each loop into a run of dashes and flecks, which is
      what a seam in rock actually does — it appears, runs for a bit, and is
      gone.
    */
    float patchy = fract(sin(dot(floor(vWorld * 2.3), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    vein *= smoothstep(0.3, 0.78, patchy);
    // And gone by the middle distance, so it never flattens the depth of the
    // tunnel by drawing the far wall as brightly as the near one.
    vein *= 1.0 - smoothstep(uFogNear * 0.5, uFogFar * 0.5, vDepth);
    // Breathing, very slowly, and out of phase along the road so a whole wall
    // never brightens at once.
    float breathe = 0.6 + 0.4 * sin(uTime * 0.45 + vWorld.x * 0.12 + vWorld.z * 0.1);
    col += uVeinColor * vein * vein * breathe;

    gl_FragColor = vec4(caveFog(col, vDepth), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function useRockMaterial(lights: RallyLights): ShaderMaterial {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: ROCK_VERT,
        fragmentShader: ROCK_FRAG,
        uniforms: lights.uniforms,
      }),
    [lights],
  )
  useEffect(() => () => material.dispose(), [material])
  return material
}

// ---------------------------------------------------------------------------
// What the tyres leave on the stone
// ---------------------------------------------------------------------------

const MARK_VERT = /* glsl */ `
  attribute vec3 iAt;
  /** Already scaled to half a length and half a width. */
  attribute vec3 iFwd;
  attribute vec3 iSide;
  /** x: how black. y: when it was laid, in seconds. */
  attribute vec2 iMark;

  uniform float uNow;
  uniform float uLife;

  varying vec2 vUv;
  varying float vFade;
  varying float vDepth;

  void main() {
    vUv = uv;
    float age = (uNow - iMark.y) / uLife;
    // Holds its darkness for the first third and then goes. Rubber on stone
    // does not fade linearly; it sits there and then one day it has gone.
    vFade = iMark.x * clamp(1.0 - max(0.0, age - 0.3) / 0.7, 0.0, 1.0);

    vec3 local = iAt + iSide * (position.x * 2.0) + iFwd * (position.y * 2.0);
    vec4 mv = modelViewMatrix * vec4(local, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const MARK_FRAG = /* glsl */ `
  precision highp float;

  uniform vec3 uFogColor;
  uniform float uFogFar;

  varying vec2 vUv;
  varying float vFade;
  varying float vDepth;

  void main() {
    if (vFade <= 0.001) discard;

    // Soft along the width and tapered at both ends, so a run of them reads as
    // one continuous smear rather than a row of dominoes.
    float across = abs(vUv.x - 0.5) * 2.0;
    float along = abs(vUv.y - 0.5) * 2.0;
    float shape = (1.0 - smoothstep(0.45, 1.0, across)) *
                  (1.0 - smoothstep(0.78, 1.0, along));

    // Fades out into the fog with everything else, or a mark eighty metres
    // back stays perfectly black on a wall of nothing.
    float far = 1.0 - smoothstep(uFogFar * 0.35, uFogFar * 0.85, vDepth);

    float alpha = vFade * shape * far * 0.62;
    if (alpha <= 0.002) discard;
    gl_FragColor = vec4(uFogColor * 0.35, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * Rubber on stone.
 *
 * Normal blending onto a near-black, so the mark *darkens* the road rather
 * than adding to it — additive would make a skid glow, which is the one thing
 * it must not do in a tunnel lit by two headlamps.
 */
export function useMarkMaterial(lights: RallyLights): ShaderMaterial {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: MARK_VERT,
        fragmentShader: MARK_FRAG,
        transparent: true,
        // Flat on the road and drawn after it: writing depth would make every
        // mark fight the stone it is lying on.
        depthWrite: false,
        uniforms: {
          uNow: { value: 0 },
          uLife: { value: 12 },
          uFogColor: lights.uniforms.uFogColor,
          uFogFar: lights.uniforms.uFogFar,
        },
      }),
    [lights],
  )
  useEffect(() => () => material.dispose(), [material])
  return material
}

// ---------------------------------------------------------------------------
// The car
// ---------------------------------------------------------------------------

const CAR_VERT = /* glsl */ `
  attribute vec3 aColor;
  /**
   * x: gloss
   * y: which tail lens this is, one-based — glows with the ember meter
   * z: glows always, whatever anything else is doing
   * w: what kind of lamp — 1 brake, 2 brake disc, 3 exhaust tip. see car.ts
   */
  attribute vec4 aFinish;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec4 vFinish;
  varying float vDepth;

  void main() {
    vColor = aColor;
    vFinish = aFinish;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mv = viewMatrix * world;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

/**
 * The car is the hardest thing down here to light, because it is standing
 * *behind* its own headlamps: almost nothing on it is in its own beam.
 *
 * What actually shows it to you is bounce — warm light coming back off the
 * road a couple of metres ahead — plus the lanterns going past, its own ember
 * lamp behind, and a cool rim off the ambient that keeps the roofline legible
 * against black rock. `uGlow` is the ember meter, and it is why the tail of
 * the car brightens as you fill it.
 */
const CAR_FRAG = /* glsl */ `
  precision highp float;
${LIGHT_HEAD}

  uniform vec3 uBounce;
  uniform float uGlow;
  uniform float uGhost;
  uniform float uTint;
  uniform vec3 uGhostTint;
  /** 0..1 — the brake pedal. Lights the two red lenses in the tail. */
  uniform float uBrake;
  /** 0..1 — how hot *this corner's* disc is. Only wheels ever set it. */
  uniform float uDisc;
  /** 0..1 — the exhaust tips, on the ember and on the overrun. */
  uniform float uPipe;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec4 vFinish;
  varying float vDepth;

${LIGHT_BODY}

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 view = normalize(cameraPosition - vWorld);
    float gloss = vFinish.x;

    vec3 albedo = vColor;
    vec3 col = caveLight(vWorld, normal, albedo, gloss);

    // Light thrown back off the road the lamps are pointed at. Comes from
    // below and in front, which is exactly where a real car's fill comes from
    // at night and is what stops the whole thing being a silhouette.
    float fromRoad = max(0.0, -normal.y) * 0.65 + max(0.0, dot(normal, uHeadDir)) * 0.35;
    col += albedo * uBounce * fromRoad;

    // And the tail lamps light the tail. Without it the back of the car is a
    // black panel with three bright holes punched in it, which is what the
    // lamps are set into rather than what they do.
    float behind = max(0.0, -dot(normal, uHeadDir));
    col += albedo * uEmberColor * behind * (0.1 + uGlow * 0.5);

    // The edge. Cool, and only where the surface turns away.
    float rim = pow(1.0 - max(dot(normal, view), 0.0), 3.5);
    col += mix(vec3(0.2, 0.26, 0.38), uGhostTint * 0.9, uTint) * rim * 0.45;

    /*
      Anything the car lights itself.

      A lens's own colour is its glow, so a headlamp burns warm-white and the
      tail lamps burn ember without either of them needing a uniform. The tail
      ones ride uGlow, which is the ember meter — and that is the entire
      reason this game has no gauge anywhere on the screen: you read how much
      you have left off the back of your own car.
    */
    // vFinish.y is which tail lens this is, one-based; each lights over its own
    // third of the meter. Zero on everything that is not one of them.
    float lens = vFinish.y > 0.5
      ? clamp(uGlow * 3.0 - (vFinish.y - 1.0), 0.0, 1.0)
      : 0.0;

    /*
      The lamp channel.

      Written as three step windows rather than three branches: every
      fragment on the car runs this, most of them are not a lamp at all, and a
      branch that almost never goes the same way twice in a warp costs more
      than the arithmetic it was meant to save.
    */
    float kind = vFinish.w;
    float isBrake = step(0.5, kind) * step(kind, 1.5);
    float isDisc = step(1.5, kind) * step(kind, 2.5);
    float isPipe = step(2.5, kind);

    // A brake lamp has a dim filament in it always, and comes right up on the
    // pedal — which is what makes her braking point readable from behind.
    float lit = lens + vFinish.z + isBrake * (0.06 + uBrake * 1.5) + isPipe * uPipe;
    col += mix(vColor, uGhostTint * 1.4, uTint) * lit * 3.2;

    /*
      A disc is not a lamp. It is a piece of iron with heat in it, so it runs
      up its own ramp — dull cherry first, orange next, and never white,
      because a disc that goes white is a disc that is about to fail. It is
      squared so that the first third of the pedal shows almost nothing, and
      the last third shows a lot.
    */
    float heat = isDisc * clamp(uDisc, 0.0, 1.0);
    col += mix(vec3(0.85, 0.11, 0.02), vec3(1.0, 0.55, 0.16), heat) * heat * heat * 2.6;

    /*
      Her colour, and separately how much of the rock you can see through her.

      These used to be one flag, which forced a choice the game should not have
      to make: her car was either yours or a see-through recording. Wheel to
      wheel is neither — she is *actually there*, on the road, right now — so
      it is her colour at full strength and no transparency at all. A chase
      keeps the transparency, because there she really is a recording, and
      pretending otherwise would be the one dishonest thing in the game.
    */
    col = mix(col, uGhostTint * (0.16 + rim * 0.7), 0.62 * uTint);

    gl_FragColor = vec4(caveFog(col, vDepth), mix(1.0, 0.5 + rim * 0.4, uGhost));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * Whose car this is.
 *
 * `mine` is the one you are driving. `chase` is her recorded line — her
 * colour, and see-through, because it is a thing that already happened.
 * `live` is her, now, wheel to wheel: the same colour and completely solid,
 * because she is a car on the road and not a memory of one.
 */
export type Whose = 'mine' | 'chase' | 'live'

function carMaterial(lights: RallyLights, whose: Whose): ShaderMaterial {
  const hers = whose !== 'mine'
  const seeThrough = whose === 'chase'
  return new ShaderMaterial({
    vertexShader: CAR_VERT,
    fragmentShader: CAR_FRAG,
    transparent: seeThrough,
    depthWrite: !seeThrough,
    /*
      Spreading the light uniforms copies the *references*, not the values, so
      every material made this way shares one `uHeadLeft` object with the rock
      and the roots and never has to be told about it again. Only the ones
      declared after the spread are this material's own.
    */
    uniforms: {
      ...lights.uniforms,
      uBounce: { value: new Color('#7d5327') },
      uGlow: { value: 0.3 },
      uGhost: { value: seeThrough ? 1 : 0 },
      uTint: { value: hers ? 1 : 0 },
      /*
        Her blue.

        It was `#9fb6e8` — a pale lavender that, once mixed down and fogged,
        was close enough to the road's own moonlight that on a phone at speed
        she read as a grey car. This is the same idea with the blue actually
        in it, so that at a glance, in a mirror, in the dark, the car ahead is
        obviously not yours.
      */
      uGhostTint: { value: new Color('#5cc4ff') },
      uBrake: { value: 0 },
      uDisc: { value: 0 },
      uPipe: { value: 0 },
    },
  })
}

export function useCarMaterial(lights: RallyLights, whose: Whose = 'mine'): ShaderMaterial {
  const material = useMemo(() => carMaterial(lights, whose), [lights, whose])
  useEffect(() => () => material.dispose(), [material])
  return material
}

/**
 * Four materials, one per wheel, and the reason is one uniform.
 *
 * A brake disc glows with the heat in *that corner*, and the four corners do
 * not agree: into a hard braking zone the fronts come up before the rears
 * because the weight has moved onto them, and the inside front comes up before
 * the outside because it is the one being asked for the most. That is load
 * transfer, made visible, and it is the only place in the whole game you can
 * watch it happen.
 *
 * One shared material could only glow all four together, which would say
 * something false. Four materials cost four uniform uploads a frame and *one*
 * shader program — three.js caches those by source — so this is close to free
 * and it is the difference between a car and a picture of one.
 */
export function useWheelMaterials(lights: RallyLights, whose: Whose = 'mine'): ShaderMaterial[] {
  const materials = useMemo(
    () => [0, 1, 2, 3].map(() => carMaterial(lights, whose)),
    [lights, whose],
  )
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])
  return materials
}

// ---------------------------------------------------------------------------
// Everything that is only light: lanterns, sparks, dust, the beams themselves
// ---------------------------------------------------------------------------

const GLOW_VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute vec3 iTint;
  /** x: radius, y: phase, z: 1 = flickers like fire, 0 = steady. */
  attribute vec3 iShape;

  varying vec2 vUv;
  varying vec3 vTint;
  varying float vDepth;

  uniform float uTime;

  void main() {
    vUv = uv;
    vTint = iTint;

    float flicker = 1.0 + iShape.z * (
      sin(uTime * 7.9 + iShape.y * 30.0) * 0.13 +
      sin(uTime * 15.3 + iShape.y * 11.0) * 0.09
    );
    float size = iShape.x * flicker;

    // Billboarded off the model-view matrix, so it faces the camera without a
    // per-instance matrix or a CPU pass.
    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up    = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    vec3 local = iAt + right * position.x * size + up * position.y * size;

    vec4 mv = modelViewMatrix * vec4(local, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const GLOW_FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  varying vec3 vTint;
  varying float vDepth;

  uniform vec3 uFogColor;
  uniform float uFogFar;

  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;
    // A hot core with a wide soft halo — one falloff curve gives you either a
    // disc or a smudge, and a lantern is both at once.
    float core = pow(1.0 - r, 6.0);
    float halo = pow(1.0 - r, 1.7) * 0.32;
    float a = (core + halo) * (1.0 - smoothstep(uFogFar * 0.6, uFogFar, vDepth));
    if (a < 0.004) discard;
    gl_FragColor = vec4(vTint * (0.5 + core * 1.9), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function useGlowMaterial(lights: RallyLights): ShaderMaterial {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        uniforms: {
          uTime: lights.uniforms.uTime,
          uFogColor: lights.uniforms.uFogColor,
          uFogFar: lights.uniforms.uFogFar,
        },
      }),
    [lights],
  )
  useEffect(() => () => material.dispose(), [material])
  return material
}

/**
 * The beams, as objects in the air.
 *
 * Two cones of dust hanging off the front of the car. This is the single
 * biggest thing in the whole race for making a dark tunnel feel like a place
 * with air in it — without them the headlights are a lit patch of road and
 * nothing between it and you.
 *
 * Fades out at the very near end as well as the far one: a cone that starts
 * at full strength has a visible flat lid where it meets the lamp.
 */
const BEAM_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const BEAM_FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  varying vec3 vWorld;

  uniform float uTime;
  uniform float uPower;
  uniform float uDaylight;
  uniform vec3 uTint;

  void main() {
    // uv.y runs 0 at the lamp to 1 at the far end of the cone.
    float along = vUv.y;
    float body = (1.0 - smoothstep(0.0, 1.0, along)) * smoothstep(0.0, 0.16, along);
    // Dust drifting through it, so the beam is never a clean solid.
    float motes = 0.82 + 0.18 * sin(vWorld.x * 3.1 + vWorld.z * 2.7 + uTime * 1.6);
    float a = body * uPower * 0.075 * motes;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uTint, a) * (1.0 - uDaylight * 0.94);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function useBeamMaterial(lights: RallyLights, tint = '#ffcf96'): ShaderMaterial {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: BEAM_VERT,
        fragmentShader: BEAM_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        uniforms: {
          uTime: lights.uniforms.uTime,
          uPower: { value: 1 },
          uTint: { value: new Color(tint) },
          /*
            A beam is a volume of lit dust, and you only see it when the air
            around it is darker than the beam. In daylight there is no such
            air: a visible cone of headlight at noon is the single clearest
            tell that a scene is a night scene with a bright sky behind it.

            Shared with the light block rather than set separately, so the cone
            and the pool it casts can never disagree about whether it is day.
          */
          uDaylight: lights.uniforms.uDaylight,
        },
      }),
    [lights, tint],
  )
  useEffect(() => () => material.dispose(), [material])
  return material
}

/**
 * Everything the tyres throw and the exhaust spits.
 *
 * One instanced quad per particle, positioned entirely on the CPU because
 * there are only a few hundred of them and they have to know about the road.
 * `iLife` runs 1 at birth to 0 at death and drives both the fade and the size.
 */
const DUST_VERT = /* glsl */ `
  attribute vec3 iAt;
  attribute vec3 iTint;
  /** x: life 1→0, y: size, z: spin. */
  attribute vec3 iShape;

  varying vec2 vUv;
  varying vec3 vTint;
  varying float vLife;
  varying float vDepth;

  void main() {
    vUv = uv;
    vTint = iTint;
    vLife = iShape.x;
    if (iShape.x <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    float c = cos(iShape.z), s = sin(iShape.z);
    vec2 spun = vec2(position.x * c - position.y * s, position.x * s + position.y * c);

    vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 up    = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    vec3 local = iAt + (right * spun.x + up * spun.y) * iShape.y;

    vec4 mv = modelViewMatrix * vec4(local, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const DUST_FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  varying vec3 vTint;
  varying float vLife;
  varying float vDepth;

  uniform float uFogFar;
  uniform float uAdditive;

  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;
    float shape = pow(1.0 - r, uAdditive > 0.5 ? 3.0 : 1.6);
    float a = shape * vLife * (uAdditive > 0.5 ? 1.0 : 0.5) *
              (1.0 - smoothstep(uFogFar * 0.5, uFogFar, vDepth));
    if (a < 0.006) discard;
    gl_FragColor = vec4(vTint * (uAdditive > 0.5 ? 0.6 + vLife * 1.5 : 1.0), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function useDustMaterial(lights: RallyLights, additive: boolean): ShaderMaterial {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
        transparent: true,
        depthWrite: false,
        blending: additive ? AdditiveBlending : NormalBlending,
        side: DoubleSide,
        uniforms: {
          uFogFar: lights.uniforms.uFogFar,
          uAdditive: { value: additive ? 1 : 0 },
        },
      }),
    [lights, additive],
  )
  useEffect(() => () => material.dispose(), [material])
  return material
}

/**
 * The ghost's line, revealed by time.
 *
 * `uNow` is where she is in her own run, in seconds, so the ribbon exists
 * behind her and not in front — the road ahead stays dark, which is the whole
 * point of chasing somebody. It fades out over `uTrail` seconds behind her, so
 * what you are following is a live line rather than a route map.
 */
const TRAIL_VERT = /* glsl */ `
  attribute float aTime;
  varying float vTime;
  varying float vDepth;
  void main() {
    vTime = aTime;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const TRAIL_FRAG = /* glsl */ `
  precision mediump float;
  varying float vTime;
  varying float vDepth;

  uniform float uNow;
  uniform float uTrail;
  uniform vec3 uTint;
  uniform float uFogFar;

  void main() {
    // Nothing in front of her, ever.
    float behind = 1.0 - smoothstep(uNow - 0.04, uNow + 0.12, vTime);
    // and it dies away at the far end
    float alive = smoothstep(uNow - uTrail, uNow - uTrail * 0.42, vTime);
    // Held off the camera as well as the far end: when she has just gone past
    // you, her line runs directly under the lens and a ribbon there reads as a
    // streamer stuck to the screen rather than as light on the road.
    float near = smoothstep(2.5, 11.0, vDepth);
    float a = behind * alive * near * 0.17 *
              (1.0 - smoothstep(uFogFar * 0.55, uFogFar, vDepth));
    // Breathing, so it reads as something burning along the stone rather than
    // as a line somebody painted down the middle of the road.
    float alive2 = 0.82 + 0.18 * sin(vTime * 5.5 - uNow * 3.0);
    if (a < 0.006) discard;
    gl_FragColor = vec4(uTint * (0.4 + alive * 0.7) * alive2, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function useTrailMaterial(lights: RallyLights, tint = '#9fb6e8'): ShaderMaterial {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: TRAIL_VERT,
        fragmentShader: TRAIL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        uniforms: {
          uNow: { value: 0 },
          uTrail: { value: 5.5 },
          uTint: { value: new Color(tint) },
          uFogFar: lights.uniforms.uFogFar,
        },
      }),
    [lights, tint],
  )
  useEffect(() => () => material.dispose(), [material])
  return material
}
