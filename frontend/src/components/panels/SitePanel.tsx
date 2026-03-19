import { useState } from 'react'
import { useLayoutStore } from '../../store/layoutStore'
import { polygonAreaKm2 } from '../../utils/geo'
import { fmtKm2 } from '../../utils/formatters'

export default function SitePanel() {
  const { boundary, turbines, setMapMode, mapMode } = useLayoutStore()
  const [projectName, setProjectName] = useState('My Wind Farm')

  const area = boundary ? polygonAreaKm2(boundary.coordinates) : 0
  const installedMW = turbines.length * 15  // assume 15MW turbines placeholder

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Site & Project</h2>

      <div>
        <label className="text-xs text-slate-400 block mb-1">Project Name</label>
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="w-full bg-slate-700 text-slate-200 text-sm rounded px-3 py-2 border border-slate-600 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Boundary controls */}
      <div className="bg-slate-800 rounded-lg p-3 space-y-2">
        <h3 className="text-xs font-semibold text-slate-300">Site Boundary</h3>
        <button
          onClick={() => setMapMode(mapMode === 'draw' ? 'view' : 'draw')}
          className={`w-full py-2 rounded text-xs font-medium transition-colors ${
            mapMode === 'draw'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          {mapMode === 'draw' ? '✏️ Drawing... (click map)' : '✏️ Draw Boundary'}
        </button>
        {boundary && (
          <div className="text-xs text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Area:</span>
              <span className="text-green-400 font-medium">{fmtKm2(area)}</span>
            </div>
            <div className="flex justify-between">
              <span>Vertices:</span>
              <span>{boundary.coordinates.length}</span>
            </div>
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div className="bg-slate-800 rounded-lg p-3 space-y-2">
        <h3 className="text-xs font-semibold text-slate-300">Project Summary</h3>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Turbines" value={turbines.length.toString()} />
          <Stat label="Capacity" value={`${installedMW} MW`} />
          <Stat label="Area" value={boundary ? fmtKm2(area) : '—'} />
          <Stat label="Density" value={area > 0 ? `${(installedMW / area).toFixed(1)} MW/km²` : '—'} />
        </div>
      </div>

      <div className="text-xs text-slate-500 space-y-1">
        <p>1. Draw site boundary on map</p>
        <p>2. Select turbine type (Turbines tab)</p>
        <p>3. Place turbines or run optimization</p>
        <p>4. Configure wind rose (Wind tab)</p>
        <p>5. Evaluate AEP and run financials</p>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-700 rounded p-2">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-200">{value}</div>
    </div>
  )
}
