/**
 * Ember Rally, as one object: two cars in the dark, one chasing the other.
 *
 * The entire picture of this game is a pair of headlamps coming at you out of
 * a tunnel, and a second pair further up the road that you are trying to
 * reach. So that is what this is — four lights, a wash of rock behind them,
 * and the pale line of fire she left between the two.
 *
 * Warm is yours and cool is hers, the same as everywhere else in the garden,
 * so the emblem says "you are chasing her" without any copy at all. Hers is
 * smaller and higher in the frame because she is further away, which is the
 * only perspective cue a thing this size can carry — and the only one it
 * needs.
 *
 * Nothing here is an image or a canvas: it is gradients on five spans. Sharp
 * at any size, nothing to load, and it cannot go stale the way a screenshot of
 * a road that is regenerated daily certainly would.
 */

export default function EmberRallyEmblem() {
  return (
    <span className="emblem emblem-lamps" aria-hidden="true">
      {/* the tunnel they are in */}
      <i className="throat" />
      {/* her line of fire, running away up the road */}
      <i className="trail" />
      {/* hers, further off */}
      <i className="lamp hers left" />
      <i className="lamp hers right" />
      {/* and yours, near */}
      <i className="lamp mine left" />
      <i className="lamp mine right" />
    </span>
  )
}
