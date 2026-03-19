import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { ElectricalNetwork } from '../types'

interface ElectricalState {
  network: ElectricalNetwork | null
  distanceToShoreKm: number
  arrayVoltageKv: number
  maxTurbinesPerString: number
  shorePoint: { lat: number; lng: number } | null
  setNetwork: (n: ElectricalNetwork | null) => void
  setDistanceToShore: (d: number) => void
  setArrayVoltage: (v: number) => void
  setMaxPerString: (n: number) => void
  setShorePoint: (p: { lat: number; lng: number } | null) => void
}

export const useElectricalStore = create<ElectricalState>()(
  immer((set) => ({
    network: null,
    distanceToShoreKm: 50,
    arrayVoltageKv: 33,
    maxTurbinesPerString: 8,
    shorePoint: null,
    setNetwork: (n) => set((s) => { s.network = n }),
    setDistanceToShore: (d) => set((s) => { s.distanceToShoreKm = d }),
    setArrayVoltage: (v) => set((s) => { s.arrayVoltageKv = v }),
    setMaxPerString: (n) => set((s) => { s.maxTurbinesPerString = n }),
    setShorePoint: (p) => set((s) => { s.shorePoint = p }),
  }))
)
