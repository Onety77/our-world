/**
 * What the weather is doing on the Stormcrown, right now.
 *
 * ---------------------------------------------------------------------------
 * Written once a frame by the race, read by the sky, the cloud floor and the
 * rain. The same shape as `deep` for the Drowned Mile and `openPane` for the
 * Glasshouse: a plain object, one owner writing it, and nothing subscribed to
 * anything — this changes sixty times a second for four and a half kilometres,
 * and React state at sixty frames a second is the thing the technical law is
 * about.
 *
 * `inCloud` and `above` come from the road's own height (see `stormAt`). The
 * flash does not: it is time, and it belongs to the whole world rather than to
 * any one shader, because **a lightning flash that lights the sky but not the
 * road is a screen effect, and one that lights everything at once is weather.**
 * It goes through the shared light block like everything else.
 * ---------------------------------------------------------------------------
 */

export const storm = {
  /** 0 below the cloud, 1 in the thick of it. */
  inCloud: 0,
  /** 0 up to the cloud top, 1 well clear above it. */
  above: 0,
  /**
   * How hard the sky is lit this instant, 0..1.
   *
   * Strikes are short and they come in pairs and threes, the way real ones do —
   * a stroke, a gap you can hear, then another down the same channel. Below the
   * cloud it flashes overhead. Above it, the storm is *underneath* you and the
   * cloud floor lights from within, which is the whole reward for the climb.
   */
  flash: 0,
}
