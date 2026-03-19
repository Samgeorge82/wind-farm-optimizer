import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { WindRose } from '../types'

const DEFAULT_WIND_ROSE: WindRose = {
  n_sectors: 12,
  reference_height_m: 100,
  roughness_length_m: 0.0002,
  sectors: Array.from({ length: 12 }, (_, i) => ({
    k: 2.0,
    A: 9.0 + Math.sin((i * Math.PI) / 6) * 1.5,
    frequency: [0.10, 0.08, 0.07, 0.06, 0.06, 0.07, 0.09, 0.11, 0.12, 0.11, 0.09, 0.04][i],
  })),
}

interface WindState {
  windRose: WindRose
  setWindRose: (wr: WindRose) => void
  updateSector: (index: number, k?: number, A?: number, frequency?: number) => void
}

export const useWindStore = create<WindState>()(
  immer((set) => ({
    windRose: DEFAULT_WIND_ROSE,
    setWindRose: (wr) => set((s) => { s.windRose = wr }),
    updateSector: (i, k, A, frequency) => set((s) => {
      if (k !== undefined) s.windRose.sectors[i].k = k
      if (A !== undefined) s.windRose.sectors[i].A = A
      if (frequency !== undefined) s.windRose.sectors[i].frequency = frequency
    }),
  }))
)
