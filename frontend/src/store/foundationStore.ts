import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FoundationSummary } from '../types'

interface FoundationState {
  summary: FoundationSummary | null
  defaultDepthM: number
  defaultSeabed: 'sand' | 'clay' | 'rock'
  setSummary: (s: FoundationSummary | null) => void
  setDefaultDepth: (d: number) => void
  setDefaultSeabed: (s: 'sand' | 'clay' | 'rock') => void
}

export const useFoundationStore = create<FoundationState>()(
  immer((set) => ({
    summary: null,
    defaultDepthM: 30,
    defaultSeabed: 'sand',
    setSummary: (s) => set((state) => { state.summary = s }),
    setDefaultDepth: (d) => set((s) => { s.defaultDepthM = d }),
    setDefaultSeabed: (seabed) => set((s) => { s.defaultSeabed = seabed }),
  }))
)
