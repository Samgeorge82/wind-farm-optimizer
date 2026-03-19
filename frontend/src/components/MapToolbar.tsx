import { useCallback, useEffect, useRef } from 'react'
import { useLayoutStore } from '../store/layoutStore'
import { useTurbineStore } from '../store/turbineStore'
import { useUIStore } from '../store/uiStore'
import { computeWakeField } from '../api'
import { renderWakeFieldToDataUrl } from '../utils/wakeRenderer'
import toast from 'react-hot-toast'

/** Cardinal label for a meteorological wind direction */
function dirLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(deg / 45) % 8]
}

export default function MapToolbar() {
  const { mapMode, setMapMode, turbines, boundary, clearAll } = useLayoutStore()
  const { selectedTurbine } = useTurbineStore()
  const {
    showCableLayer, toggleCableLayer, wakeModelType, setWakeModel,
    showWakeHeatmap, toggleWakeHeatmap,
    wakeWindDirection, wakeWindSpeed, wakeFieldLoading,
    setWakeWindDirection, setWakeWindSpeed,
    setWakeFieldImage, setWakeFieldLoading,
  } = useUIStore()

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchWakeField = useCallback(async () => {
    if (!boundary || turbines.length === 0 || !selectedTurbine) {
      setWakeFieldImage(null)
      return
    }

    setWakeFieldLoading(true)
    try {
      const payload = {
        boundary,
        turbines: turbines.map(t => ({
          x: t.x, y: t.y, lat: t.lat, lng: t.lng,
        })),
        turbine_spec: selectedTurbine,
        wind_direction_deg: wakeWindDirection,
        wind_speed_ms: wakeWindSpeed,
        wake_model: wakeModelType,
        grid_resolution_m: 80,
      }

      const result = await computeWakeField(payload)

      // Render grid to canvas data URL
      const dataUrl = renderWakeFieldToDataUrl(result.grid, result.rows, result.cols)

      setWakeFieldImage({
        dataUrl,
        bounds: [
          [result.bounds.min_lat, result.bounds.min_lng],
          [result.bounds.max_lat, result.bounds.max_lng],
        ],
      })
    } catch (e: any) {
      console.error('Wake field error:', e)
      toast.error('Failed to compute wake field')
      setWakeFieldImage(null)
    } finally {
      setWakeFieldLoading(false)
    }
  }, [boundary, turbines, selectedTurbine, wakeWindDirection, wakeWindSpeed, wakeModelType, setWakeFieldImage, setWakeFieldLoading])

  // Debounced wake field update
  const debouncedFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchWakeField, 350)
  }, [fetchWakeField])

  // Auto-update wake field when inputs change and heatmap is active
  useEffect(() => {
    if (showWakeHeatmap && turbines.length > 0 && boundary && selectedTurbine) {
      debouncedFetch()
    }
    if (!showWakeHeatmap) {
      setWakeFieldImage(null)
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [showWakeHeatmap, wakeWindDirection, wakeWindSpeed, wakeModelType, turbines.length, boundary, selectedTurbine, debouncedFetch, setWakeFieldImage])

  const handleDrawBoundary = () => {
    setMapMode(mapMode === 'draw' ? 'view' : 'draw')
    if (mapMode !== 'draw') {
      toast('Click on map to draw boundary points. Click first point to close polygon.', { duration: 4000 })
    }
  }

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-2">
      {/* Main toolbar row */}
      <div className="flex gap-2 bg-slate-900/95 rounded-lg p-2 shadow-xl border border-slate-700">
        {/* Mode buttons */}
        <button
          onClick={handleDrawBoundary}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            mapMode === 'draw'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Draw Boundary
        </button>

        <button
          onClick={() => setMapMode(mapMode === 'place' ? 'view' : 'place')}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            mapMode === 'place'
              ? 'bg-green-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Place Turbine
        </button>

        <div className="w-px bg-slate-600 mx-1" />

        {/* Wake model */}
        <select
          value={wakeModelType}
          onChange={(e) => setWakeModel(e.target.value as 'jensen' | 'gaussian')}
          className="bg-slate-700 text-slate-300 text-xs rounded px-2 py-1 border border-slate-600"
        >
          <option value="jensen">Jensen Wake</option>
          <option value="gaussian">Gaussian Wake</option>
        </select>

        {/* Layer toggles */}
        <button
          onClick={toggleCableLayer}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            showCableLayer
              ? 'bg-purple-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Cables
        </button>

        <button
          onClick={toggleWakeHeatmap}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            showWakeHeatmap
              ? 'bg-orange-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          {wakeFieldLoading ? 'Loading...' : 'Wake Map'}
        </button>

        <div className="w-px bg-slate-600 mx-1" />

        {/* Stats */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>{turbines.length} turbines</span>
          {boundary && <span className="text-blue-400">Boundary set</span>}
        </div>

        {turbines.length > 0 && (
          <button
            onClick={() => { if (confirm('Clear all turbines and boundary?')) clearAll() }}
            className="px-3 py-1.5 rounded text-xs font-medium bg-red-900 text-red-300 hover:bg-red-800 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Wake controls row (shown when wake heatmap is active) */}
      {showWakeHeatmap && (
        <div className="flex items-center gap-3 bg-slate-900/95 rounded-lg px-3 py-2 shadow-xl border border-orange-700/50">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 whitespace-nowrap">Wind from:</span>
            <input
              type="range"
              min={0}
              max={350}
              step={10}
              value={wakeWindDirection}
              onChange={(e) => setWakeWindDirection(Number(e.target.value))}
              className="w-28 h-1 accent-orange-500"
            />
            <span className="text-xs text-orange-300 font-mono w-12 text-right">
              {wakeWindDirection}&deg; {dirLabel(wakeWindDirection)}
            </span>
          </div>

          <div className="w-px h-5 bg-slate-600" />

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 whitespace-nowrap">Speed:</span>
            <input
              type="range"
              min={4}
              max={25}
              step={0.5}
              value={wakeWindSpeed}
              onChange={(e) => setWakeWindSpeed(Number(e.target.value))}
              className="w-20 h-1 accent-orange-500"
            />
            <span className="text-xs text-orange-300 font-mono w-12 text-right">
              {wakeWindSpeed} m/s
            </span>
          </div>

          {wakeFieldLoading && (
            <span className="text-[10px] text-orange-400 animate-pulse">Computing...</span>
          )}
        </div>
      )}
    </div>
  )
}
