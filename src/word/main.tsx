/**
 * The shared-word page: what a `/w/<code>` link opens.
 *
 * Its own entry (`word.html`), and the rule for everything under it is that it
 * imports nothing of the garden — only React and the word game's own stones,
 * words and link code. Whoever opens one of these links is not one of the two
 * of you, is not signed in, and should be looking at a board within a second
 * on a phone, not downloading a world.
 *
 * It registers no service worker. The garden's worker, on a device that has
 * the garden, knows to let these through — see `src/sw/worker.js`.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WordChallenge } from './WordChallenge'
import { startCave } from './cave'
import './word.css'

const root = document.getElementById('word')
if (!root) throw new Error('No #word element in word.html.')

// The Hollow, behind everything. See `cave.ts`.
const cave = document.querySelector<HTMLCanvasElement>('canvas.cave')
if (cave) startCave(cave)

createRoot(root).render(
  <StrictMode>
    <WordChallenge />
  </StrictMode>,
)
