import { HUB_STREAM } from './hub/layout'

/**
 * The terrain height function, in GLSL.
 *
 * This is the same maths as `groundHeight` in systems/terrain.ts, and the two
 * MUST stay identical — the CPU copy decides where every place lays itself
 * out, the GPU copy decides where the ground is drawn and where every blade of
 * grass is rooted. If they drift you get the classic horror: grass floating an
 * inch above the floor, or a river running along the top of its own bank.
 *
 * They're separate because there's no way to share one implementation across
 * JS and GLSL, and porting the shader to run per-blade on the CPU would undo
 * the entire reason the meadow is one draw call. If you change one, change the
 * other in the same commit.
 */
export const TERRAIN_GLSL = /* glsl */ `
const float VALLEY_X = 0.0;
const float VALLEY_BED = 13.0;
const float VALLEY_BANKS = 30.0;
const float VALLEY_DEPTH = 5.0;

float gardenHeight(vec2 p) {
  float h = sin(p.x * 0.055) * cos(p.y * 0.047) * 1.05
          + sin(p.x * 0.131 + 1.3) * 0.34
          + cos(p.y * 0.108 - 0.7) * 0.38
          + sin((p.x + p.y) * 0.021 + 2.1) * 0.75;

  // the river valley — must match VALLEY in systems/terrain.ts.
  // The bed is blended toward a flat floor, not cut out of the meadow: the
  // meadow's own rolling would otherwise swing the channel through metres.
  float across = abs(p.x - VALLEY_X);
  if (across < VALLEY_BANKS) {
    float t = clamp((across - VALLEY_BED) / (VALLEY_BANKS - VALLEY_BED), 0.0, 1.0);
    float shape = 1.0 - smoothstep(0.0, 1.0, t);
    float floorY = -VALLEY_DEPTH + sin(p.y * 0.09) * 0.18 + sin(p.y * 0.31) * 0.07;
    h = mix(h, floorY, shape);
  }

  return h;
}
`

/**
 * Wraps an instance's tile-local position to the copy of the tile nearest the
 * camera. This is what makes the meadow endless: the same N blades are redrawn
 * around wherever you are looking, so no place ever runs out of grass and none
 * of them costs another instance.
 */
export const TILE_GLSL = /* glsl */ `
/**
 * How much of a plant survives at this spot, 0 in the water to 1 on dry land.
 *
 * Grass rooted at the terrain height grows perfectly happily along the bottom
 * of a river, straight up through the surface — this is what keeps a bed bare
 * and lets the water be seen. Two pieces of water ask for it: the world
 * river's channel, and the stream at the Wellspring's landmark out in the
 * garden. Both numbers come from one place, so neither can drift from the
 * water it is making room for.
 */
float dryLand(vec2 p) {
  float across = abs(p.x - VALLEY_X);
  float valley = smoothstep(VALLEY_BED - 1.0, VALLEY_BED + 3.5, across);

  vec2 d = (p - vec2(${HUB_STREAM.x.toFixed(3)}, ${HUB_STREAM.z.toFixed(3)}))
         / vec2(${HUB_STREAM.rx.toFixed(3)}, ${HUB_STREAM.rz.toFixed(3)});
  float stream = smoothstep(0.86, 1.0, length(d));

  return min(valley, stream);
}

vec2 tileAround(vec2 base, vec2 centre, float tile) {
  vec2 cell = floor((centre - base) / tile + 0.5) * tile;
  return base + cell;
}

/**
 * How much of a plant to bother growing, given where the camera is looking.
 *
 * -----------------------------------------------------------------------------
 * The meadow and the flowers are laid out in a disc that follows you around, so
 * you are always standing in the middle of them — and you can only ever see
 * about eighty degrees of a circle that goes all the way round. Better than
 * half of every field has always been behind your head.
 *
 * They cannot be culled the ordinary way. Their world positions do not exist in
 * any buffer: they are computed *here*, per frame, by wrapping a tile of blades
 * around wherever the camera happens to be. There is nothing for a bounding box
 * to hold on to.
 *
 * So they are culled where they are made. A blade behind you comes out of this
 * with a height of zero, which collapses it to a line with no area, and the
 * hardware throws it away before it shades a single pixel.
 *
 * **It is the same trick the rim already uses**, which is what makes it safe.
 * The outer edge of the meadow has always faded to nothing rather than stopping
 * at a line, for exactly the same reason and by exactly the same mechanism, and
 * the two multiply together as one number. Nothing new can pop, because nothing
 * new happens.
 *
 * The margins are deliberately generous. The screen is about forty degrees
 * either side of straight ahead; this keeps everything at full height out to
 * fifty-five, and does not reach zero until ninety. That is fifteen degrees of
 * slack before the fade even begins — enough for the camera's idle sway, for a
 * wide window, and for the corners of the frame, which reach further out than
 * the middle does.
 * -----------------------------------------------------------------------------
 */
float inTheView(vec2 at, vec2 eye, vec2 facing) {
  vec2 away = at - eye;
  float far = length(away);
  // Straight underfoot there is no direction to be behind, and that is where
  // the grass is most visible. Anything within a couple of metres stays.
  if (far < 2.5) return 1.0;
  float ahead = dot(away / far, facing);
  // cos(90 degrees) = 0, cos(55 degrees) = 0.574.
  return smoothstep(0.0, 0.574, ahead);
}
`
