import { create } from 'zustand'
import { emptyLearning, type LearningGarden, type Coat } from './model'

export const useLearning = create<{
  garden: LearningGarden
  coat: Coat
  greeting: number
  view: string
}>(() => ({ garden: emptyLearning(), coat: 'honey', greeting: 0, view: 'home' }))

export const greetCompanion = () => useLearning.setState({ greeting: performance.now() })
