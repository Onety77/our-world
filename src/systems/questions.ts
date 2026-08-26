/** The small amount of transient UI state around the Tree's question ritual. */
import { create } from 'zustand'

type QuestionView =
  | { kind: 'current' }
  | { kind: 'archive'; roundId: string }
  | { kind: 'plant' }
  | null

interface QuestionsState {
  view: QuestionView
  seedNotice: number
  openCurrent(): void
  openArchive(roundId: string): void
  openPlanting(): void
  close(): void
  announceSeed(): void
  clearNotice(): void
}

export const useQuestions = create<QuestionsState>((set) => ({
  view: null,
  seedNotice: 0,
  openCurrent: () => set({ view: { kind: 'current' } }),
  openArchive: (roundId) => set({ view: { kind: 'archive', roundId } }),
  openPlanting: () => set({ view: { kind: 'plant' } }),
  close: () => set({ view: null }),
  announceSeed: () => set((state) => ({ seedNotice: state.seedNotice + 1 })),
  clearNotice: () => set({ seedNotice: 0 }),
}))
