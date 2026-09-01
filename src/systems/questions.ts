/** The small amount of transient UI state around the Tree's question ritual. */
import { create } from 'zustand'

type QuestionView =
  | { kind: 'current' }
  | { kind: 'archive'; roundId: string }
  | { kind: 'plant' }
  | { kind: 'growing' }
  | null

interface QuestionsState {
  view: QuestionView
  seedNotice: number
  openCurrent(): void
  openArchive(roundId: string): void
  openPlanting(): void
  openGrowing(): void
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
  openGrowing: () => set({ view: { kind: 'growing' } }),
  close: () => set({ view: null }),
  announceSeed: () => set((state) => ({ seedNotice: state.seedNotice + 1 })),
  clearNotice: () => set({ seedNotice: 0 }),
}))
