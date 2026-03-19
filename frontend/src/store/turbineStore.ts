import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { TurbineSpec } from '../types'

interface TurbineState {
  selectedTurbine: TurbineSpec | null
  turbineLibrary: TurbineSpec[]
  setSelectedTurbine: (t: TurbineSpec | null) => void
  setLibrary: (lib: TurbineSpec[]) => void
}

export const useTurbineStore = create<TurbineState>()(
  immer((set) => ({
    selectedTurbine: null,
    turbineLibrary: [],
    setSelectedTurbine: (t) => set((s) => { s.selectedTurbine = t }),
    setLibrary: (lib) => set((s) => { s.turbineLibrary = lib }),
  }))
)
