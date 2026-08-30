import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { WhenItBreaks } from './ui/WhenItBreaks'
import '@fontsource/im-fell-english/latin-400.css'
import '@fontsource/im-fell-english/latin-400-italic.css'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('No #root element in index.html.')

/*
  Outermost, so nothing at all can leave a white screen.

  There is a second one inside the games — see `Playing` — because a race
  falling over should put you back at the fire rather than back at the front
  door. This one is the floor under that: whatever gets past everything else
  still has to say what it was.
*/
createRoot(root).render(
  <StrictMode>
    <WhenItBreaks>
      <App />
    </WhenItBreaks>
  </StrictMode>,
)
