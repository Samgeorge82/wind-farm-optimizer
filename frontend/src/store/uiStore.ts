import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type ActiveModule =
  | 'site' | 'wind' | 'turbine' | 'layout' | 'aep'
  | 'electrical' | 'foundation' | 'marine'
  | 'financial' | 'sensitivity' | 'report'

export interface WakeFieldImage {
  dataUrl: string
  bounds: [[number, number], [number, number]]  // [[south, west], [north, east]]
}

interface UIState {
  activeModule: ActiveModule
  wakeModelType: 'jensen' | 'gaussian'
  showCableLayer: boolean
  showDepthLayer: boolean
  showWakeHeatmap: boolean

  // Wake field visualization state
  wakeFieldImage: WakeFieldImage | null
  wakeWindDirection: number   // degrees, meteorological (wind comes FROM)
  wakeWindSpeed: number       // m/s
  wakeFieldLoading: boolean

  setActiveModule: (m: ActiveModule) => void
  setWakeModel: (m: 'jensen' | 'gaussian') => void
  toggleCableLayer: () => void
  toggleDepthLayer: () => void
  toggleWakeHeatmap: () => void
  setWakeFieldImage: (img: WakeFieldImage | null) => void
  setWakeWindDirection: (deg: number) => void
  setWakeWindSpeed: (ms: number) => void
  setWakeFieldLoading: (loading: boolean) => void
}

export const useUIStore = create<UIState>()(
  immer((set) => ({
    activeModule: 'site',
    wakeModelType: 'jensen',
    showCableLayer: true,
    showDepthLayer: false,
    showWakeHeatmap: false,
    wakeFieldImage: null,
    wakeWindDirection: 270,
    wakeWindSpeed: 10,
    wakeFieldLoading: false,
    setActiveModule: (m) => set((s) => { s.activeModule = m }),
    setWakeModel: (m) => set((s) => { s.wakeModelType = m }),
    toggleCableLayer: () => set((s) => { s.showCableLayer = !s.showCableLayer }),
    toggleDepthLayer: () => set((s) => { s.showDepthLayer = !s.showDepthLayer }),
    toggleWakeHeatmap: () => set((s) => { s.showWakeHeatmap = !s.showWakeHeatmap }),
    setWakeFieldImage: (img) => set((s) => { s.wakeFieldImage = img }),
    setWakeWindDirection: (deg) => set((s) => { s.wakeWindDirection = deg }),
    setWakeWindSpeed: (ms) => set((s) => { s.wakeWindSpeed = ms }),
    setWakeFieldLoading: (loading) => set((s) => { s.wakeFieldLoading = loading }),
  }))
)
