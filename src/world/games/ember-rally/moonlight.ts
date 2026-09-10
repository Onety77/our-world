/**
 * The moon the Moonbreak is named for, and the night around it.
 *
 * ---------------------------------------------------------------------------
 * Four things are drawn by it — the sky, the sea, the far shore, and, through
 * the shared light block, every stone, tree and car on the road — and a moon
 * that is in a slightly different place for any one of them is the kind of
 * wrong nobody can name: a glint on the water that does not sit under the
 * disc, a lit face on an arch turned away from it.
 *
 * Its own file for the reason `depth` has one. The world mounts the far shore
 * and the far shore needs the sky; put either in the other's file and the two
 * import each other in a circle, which works right up until something reads a
 * shader string during module initialisation and finds `undefined` in it.
 * ---------------------------------------------------------------------------
 */
import { Color, Vector3 } from 'three'

/** Where the moon is, as an offset from the camera. Carried, so it never moves when you do. */
export const MOON = new Vector3(-420, 245, 980)
export const MOON_DIR = MOON.clone().normalize()

/** The colour and strength of its light on a surface squarely facing it. */
export const MOONLIGHT = new Color('#b8c6e0')

/**
 * The night, as one function the sky, the sea and the far shore can all ask.
 *
 * ---------------------------------------------------------------------------
 * The water reflects the sky and the distance dissolves into it, so all three
 * have to agree about it exactly: a horizon one shade lighter in the sky than in
 * its reflection is a hard line where the sea meets the air, and that line is
 * the first thing the eye finds on an open road.
 *
 * The numbers are chosen *through the tone curve*, not against a swatch. The
 * renderer's ACES crushes dark values hard — a linear 0.01 comes out nearly
 * black — which is why the old sky had to be a pale lavender to be visible at
 * all. Worked backwards from the colours wanted on screen: a navy zenith near
 * #05080f, #1a2338 along the horizon, and #2e3a52 low under the moon.
 * ---------------------------------------------------------------------------
 */
export const NIGHT = /* glsl */ `
  uniform vec3 uMoonDir;
  vec3 nightSky(vec3 d) {
    float up = clamp(d.y, 0.0, 1.0);
    vec2 level = normalize(d.xz + vec2(0.0001, 0.0));
    float facing = dot(level, normalize(uMoonDir.xz)) * 0.5 + 0.5;
    vec3 horizon = mix(vec3(0.025, 0.034, 0.062), vec3(0.046, 0.061, 0.099), facing * facing);
    vec3 colour = mix(horizon, vec3(0.0126, 0.0182, 0.0378), smoothstep(0.0, 0.3, up));
    colour = mix(colour, vec3(0.0075, 0.0102, 0.0164), smoothstep(0.28, 0.95, up));
    float toMoon = max(dot(d, uMoonDir), 0.0);
    colour += vec3(0.05, 0.064, 0.096) * pow(toMoon, 8.0);
    colour += vec3(0.08, 0.095, 0.13) * pow(toMoon, 120.0);
    colour += vec3(0.20, 0.22, 0.26) * pow(toMoon, 1400.0);
    return colour;
  }
`

/** A hash and a smooth noise, for the shaders that want grain without a texture. */
export const NOISE = /* glsl */ `
  float hash13(vec3 cell) {
    return fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(
        mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y),
      mix(
        mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y),
      f.z);
  }
`
