import type { StageId } from './model'

export const ROAD_ORDER: readonly StageId[] = ['rootway', 'moonbreak', 'stormcrown', 'harmattan', 'nightfall']
export const ROAD_INFO: Record<
  StageId,
  {
    name: string
    landscape: string
    character: string
    description: string
    tip: string
    accent: string
  }
> = {
  rootway: {
    name: 'The Rootway',
    landscape: 'Beneath the garden',
    character: 'Technical · enclosed',
    description: 'Warm lanterns, close stone walls, and a road that keeps changing direction.',
    tip: 'Amber lights follow the main road. Cold lights on the right mark a narrower, quicker cut.',
    accent: '#e6ae65',
  },
  moonbreak: {
    name: 'The Moonbreak',
    landscape: 'Across the water',
    character: 'Fast · exposed',
    description: 'A pale causeway across open water. Long straights give way to demanding turns.',
    tip: 'Save some speed for the exit. The Moonhook needs an early brake.',
    accent: '#a9cce1',
  },
  stormcrown: {
    name: 'The Stormcrown',
    landscape: 'Above the clouds',
    character: 'Long · demanding',
    description:
      'Climb through the cedars, cross the cloud ridge, and descend through rain and hairpins.',
    tip: 'Watch the amber cairns. Brake on the straight before each mountain hairpin.',
    accent: '#bcb6e8',
  },
  harmattan: {
    name: 'The Harmattan',
    landscape: 'Into the dry wind',
    character: 'Expert · loose surface',
    description: 'Red earth, deep sand, and a road disappearing into the dust of a daylight rally.',
    tip: 'Pale ground means deep sand. Keep the steering calm when visibility drops.',
    accent: '#edb88a',
  },
  nightfall: {
    name: 'The Nightfall',
    landscape: 'Through the garden',
    character: 'Everything · at once',
    description:
      'From the tree at dusk, down to the river, through the Hollow, out under the stars and home along the lanterns.',
    tip: 'Carry speed round the tree, brake for the hearth, and save the lanterns for last.',
    accent: '#e9c48a',
  },
}
