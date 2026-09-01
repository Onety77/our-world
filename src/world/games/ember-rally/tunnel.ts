/**
 * What the rock is doing around the car, right now.
 *
 * ---------------------------------------------------------------------------
 * A plain object, written once a frame by the race and read by the Rootway's
 * soundscape. The same shape as `weather.ts` for the Stormcrown and `depth.ts`
 * for the Drowned Mile, for the same reason: this changes sixty times a second
 * for two and a half kilometres, and React state at sixty frames a second is
 * exactly what the technical law is about.
 *
 * **Why the road has to tell the ear how big it is.** The other two roads have
 * a headline the ear can follow — the Moonbreak dives, the Stormcrown climbs
 * through weather — and the Rootway has neither. What it has instead is the
 * thing a cave actually does: it opens and it closes. A chamber is seven metres
 * of stone either side and thirteen to the vault; the throat before the finish
 * is under four. That is the entire drama of the road and until this existed
 * none of it reached the speakers, so the whole two and a half kilometres
 * sounded like one corridor.
 *
 * `enclosed` is therefore the road's own dimensions, not a district table. The
 * Rootway is dealt from a bag of pieces on a daily seed — a hand-written list
 * of "the tight bit is at 840 m" would be wrong on every other seed, which is
 * precisely the trap `MOONBREAK`'s derived marks exist to avoid.
 * ---------------------------------------------------------------------------
 */

export const tunnel = {
  /** Metres along the road, shared with the soundscape. */
  s: 0,
  /** True car speed in metres per second; camera motion is not vehicle motion. */
  speed: 0,
  /**
   * 0 in the great halls, 1 in the tightest throat.
   *
   * Both dimensions, because they are not the same fact: the arrival hall is
   * wide *and* high, the seep is narrow with a low roof, and a wide corridor
   * under a low vault is a different room from a narrow one under a high one.
   * Weighted toward the vault, which is what the ear is actually reading —
   * height is what a tail of reverb measures.
   */
  enclosed: 0,
  /** Metres to the vault. Sets how long the stone is allowed to ring. */
  ceiling: 5.6,
  /**
   * 0..1 — wet stone, the same number the sheen and the puddles are drawn from.
   *
   * Deliberately read off the road rather than worked out again here. The
   * Stormcrown's `rain` is in `weather.ts` for exactly this reason: an ear with
   * its own opinion about the weather is an ear describing a different place
   * from the one on screen.
   */
  wet: 0,
}

/**
 * How enclosed a piece of road is, from its two dimensions.
 *
 * A function rather than four lines inside the frame loop because `npm run
 * sound` drives the soundscape over a real lap in Node, where nothing that
 * imports React or three can be loaded — and a check that re-implemented this
 * formula would be checking its own copy of it. Same reason the Moonbreak's
 * marks are derived from the road instead of written beside it.
 *
 * `half` is metres from the middle to the wall — the driveable stone plus the
 * loose verge, which is what `vergeWidth` is for.
 */
export function enclosureOf(ceiling: number, half: number): number {
  const low = 1 - Math.max(0, Math.min(1, (ceiling - 3.4) / 9.6))
  const narrow = 1 - Math.max(0, Math.min(1, (half - 4.2) / 5.4))
  /*
    Weighted toward the vault, because height is what a tail of reverb is
    actually measuring — but not only the vault: the arrival hall is wide *and*
    high and the seep is narrow *and* low, and a road that listened to the
    ceiling alone would call a wide gallery under a low roof the same room as
    a crawl.
  */
  return Math.max(0, Math.min(1, low * 0.62 + narrow * 0.38))
}

// ---------------------------------------------------------------------------
// Where the dressing is, for the ear
// ---------------------------------------------------------------------------

/**
 * Metres between samples of the two fields below.
 *
 * Four, because both of them are smooth over tens of metres and the car covers
 * forty in a second: a finer grain would be measuring a smoothness that is not
 * there. A whole road is about six hundred floats.
 */
export const GRAIN = 4

/**
 * Lay a soft bump at every source and sum them.
 *
 * Gaussian rather than distance-to-the-nearest, because two lanterns eleven
 * metres apart on a corner really should be warmer than one — a cave lit for a
 * corner is brighter there, and "how far to the closest" cannot say so.
 *
 * Built once when a road is opened. The alternative is scanning a couple of
 * hundred lanterns and six hundred roots every frame to find the nearest, sixty
 * times a second, for two numbers that change slowly — which is the same trade
 * the road itself makes by sampling its bands into arrays instead of solving
 * them per frame.
 */
export function field(length: number, sources: { s: number; weight: number; reach: number }[]) {
  const count = Math.floor(length / GRAIN) + 1
  const out = new Float32Array(count)
  for (const source of sources) {
    if (!(source.weight > 0) || !(source.reach > 0)) continue
    const from = Math.max(0, Math.floor((source.s - source.reach * 3) / GRAIN))
    const to = Math.min(count - 1, Math.ceil((source.s + source.reach * 3) / GRAIN))
    for (let i = from; i <= to; i++) {
      const d = i * GRAIN - source.s
      out[i] += source.weight * Math.exp(-(d * d) / (2 * source.reach * source.reach))
    }
  }
  return out
}

/** Read one of the fields at a point on the road. */
export function fieldAt(values: Float32Array, s: number) {
  const exact = Math.max(0, Math.min(values.length - 1, s / GRAIN))
  const i = Math.floor(exact)
  const j = Math.min(values.length - 1, i + 1)
  const mix = exact - i
  return values[i] * (1 - mix) + values[j] * mix
}

/**
 * Real flame only.
 *
 * `warm` is 0 for the cold fungus lights and 1 for the ones that are burning,
 * and the difference is the whole point of how the Rootway is lit — fire on the
 * corners, cold on the straights, learned in one lap. A soundscape that
 * crackled at the green ones would be teaching the ear the opposite of what the
 * road is teaching the eye.
 *
 * The per-lantern weight is small on purpose. Corner lanterns are eleven metres
 * apart, so four or five of them overlap at once; the first version gave each
 * one enough that a corner summed past 1 and pinned there, which measured — in
 * a real browser, over a real lap — as the fire layer sitting at full for about
 * half the road. That is not a lit corner, it is a bonfire, and it left the two
 * actual hearths nothing to be louder than. They are the only sources here that
 * reach the top of the range alone, which is right: they are the fire you leave
 * and the fire you come back to.
 */
export function fireField(track: {
  length: number
  lanterns: { s: number; warm: number; size: number }[]
  hearths: { s: number }[]
}) {
  return field(track.length, [
    ...track.lanterns
      .filter((l) => l.warm > 0.5)
      .map((l) => ({ s: l.s, weight: 0.17 * l.warm * (0.6 + l.size), reach: 7 + l.size * 5 })),
    ...track.hearths.map((h) => ({ s: h.s, weight: 1.2, reach: 22 })),
  ])
}

/**
 * And the timber.
 *
 * Weighted by how far each root reaches down and how thick it is, both of which
 * `dressTrack` already scales with how tight the rock is — so this quietly
 * concentrates in the narrow sections, which is where a root coming through the
 * roof is a thing you would actually hear move.
 *
 * The scale is small for the same reason the lanterns' is, and it was found the
 * same way: roots are laid every three to nine metres for the whole length of
 * the road, so six or seven of them overlap at any point. At the weight this
 * started on, the field sat clamped at 1 for four fifths of every seed — which
 * is a layer that has stopped being a layer, because it can no longer say that
 * *here* is rootier than *there*, and the creaks it gates come out evenly
 * spread down a road whose whole subject is that it changes. At this scale the
 * mean is around a third, it never pins, and rather less than half the road is
 * over the threshold the creaks need.
 */
export function rootField(track: {
  length: number
  roots: { s: number; reach: number; thickness: number }[]
}) {
  return field(
    track.length,
    track.roots.map((r) => ({
      s: r.s,
      weight: r.reach * (0.4 + r.thickness * 2.4) * 0.16,
      reach: 11,
    })),
  )
}
