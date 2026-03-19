import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { BoundaryPolygon, TurbinePosition, ExclusionZone, AEPResult } from '../types'
import { nanoid } from 'nanoid'

interface LayoutState {
  boundary: BoundaryPolygon | null
  turbines: TurbinePosition[]
  exclusionZones: ExclusionZone[]
  aepResult: AEPResult | null
  mapMode: 'view' | 'draw' | 'place'
  optimizationJobId: string | null
  setBoundary: (b: BoundaryPolygon | null) => void
  addTurbine: (lat: number, lng: number, x: number, y: number) => string
  moveTurbine: (id: string, lat: number, lng: number, x: number, y: number) => void
  removeTurbine: (id: string) => void
  setTurbines: (turbines: TurbinePosition[]) => void
  setAEPResult: (r: AEPResult | null) => void
  setMapMode: (mode: LayoutState['mapMode']) => void
  setJobId: (id: string | null) => void
  addExclusionZone: (z: ExclusionZone) => void
  clearAll: () => void
}

export const useLayoutStore = create<LayoutState>()(
  immer((set) => ({
    boundary: null,
    turbines: [],
    exclusionZones: [],
    aepResult: null,
    mapMode: 'view',
    optimizationJobId: null,

    setBoundary: (b) => set((s) => { s.boundary = b }),
    addTurbine: (lat, lng, x, y) => {
      const id = nanoid(8)
      set((s) => { s.turbines.push({ id, lat, lng, x, y }) })
      return id
    },
    moveTurbine: (id, lat, lng, x, y) => set((s) => {
      const t = s.turbines.find((t) => t.id === id)
      if (t) { t.lat = lat; t.lng = lng; t.x = x; t.y = y }
    }),
    removeTurbine: (id) => set((s) => {
      s.turbines = s.turbines.filter((t) => t.id !== id)
    }),
    setTurbines: (turbines) => set((s) => { s.turbines = turbines }),
    setAEPResult: (r) => set((s) => { s.aepResult = r }),
    setMapMode: (mode) => set((s) => { s.mapMode = mode }),
    setJobId: (id) => set((s) => { s.optimizationJobId = id }),
    addExclusionZone: (z) => set((s) => { s.exclusionZones.push(z) }),
    clearAll: () => set((s) => {
      s.boundary = null; s.turbines = []; s.aepResult = null
      s.exclusionZones = []; s.mapMode = 'view'; s.optimizationJobId = null
    }),
  }))
)
