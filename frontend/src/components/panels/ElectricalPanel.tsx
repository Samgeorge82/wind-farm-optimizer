import { useState } from 'react'
import toast from 'react-hot-toast'
import { useLayoutStore } from '../../store/layoutStore'
import { useTurbineStore } from '../../store/turbineStore'
import { useElectricalStore } from '../../store/electricalStore'
import { buildElectrical } from '../../api'
import { fmtMUSD, fmtKm } from '../../utils/formatters'
import { CoordinateTransformer } from '../../utils/geo'

export default function ElectricalPanel() {
  const { boundary, turbines } = useLayoutStore()
  const { selectedTurbine } = useTurbineStore()
  const {
    network, setNetwork, distanceToShoreKm, setDistanceToShore,
    arrayVoltageKv, setArrayVoltage, maxTurbinesPerString, setMaxPerString
  } = useElectricalStore()
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'overview' | 'strings' | 'export'>('overview')

  const handleBuild = async () => {
    if (!boundary || turbines.length === 0) return toast.error('Place turbines first')
    if (!selectedTurbine) return toast.error('Select a turbine')
    const transformer = CoordinateTransformer.fromBoundary(boundary)
    const turbinesWithLocal = turbines.map(t => {
      const { x, y } = transformer.geoToLocal(t.lat, t.lng)
      return { ...t, x, y }
    })
    // Use boundary centroid as shore point placeholder
    const cen = boundary.coordinates.reduce(
      (a, c) => ({ lat: a.lat + c.lat / boundary.coordinates.length, lng: a.lng + c.lng / boundary.coordinates.length }),
      { lat: 0, lng: 0 }
    )
    try {
      setLoading(true)
      const result = await buildElectrical({
        turbines: turbinesWithLocal,
        boundary,
        turbine_spec: selectedTurbine,
        array_voltage_kv: arrayVoltageKv,
        max_turbines_per_string: maxTurbinesPerString,
        shore_point: cen,
        distance_to_shore_km: distanceToShoreKm,
      })
      setNetwork(result)
      toast.success(`Electrical network built! ${result.strings.length} strings, ${fmtMUSD(result.total_cable_cost_musd)} total`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Electrical Infrastructure</h2>

      <div className="bg-slate-800 rounded-lg p-3 space-y-3">
        <h3 className="text-xs font-semibold text-slate-300">Configuration</h3>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Array Voltage</label>
          <select value={arrayVoltageKv} onChange={(e) => setArrayVoltage(Number(e.target.value))}
            className="w-full bg-slate-700 text-slate-200 text-sm rounded px-2 py-1.5 border border-slate-600">
            <option value={33}>33 kV</option>
            <option value={66}>66 kV</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Max turbines per string</label>
          <input type="number" value={maxTurbinesPerString} min={2} max={20}
            onChange={(e) => setMaxPerString(Number(e.target.value))}
            className="w-full bg-slate-700 text-slate-200 text-sm rounded px-3 py-1.5 border border-slate-600" />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Distance to shore (km)</label>
          <input type="number" value={distanceToShoreKm} min={1} max={500} step={5}
            onChange={(e) => setDistanceToShore(Number(e.target.value))}
            className="w-full bg-slate-700 text-slate-200 text-sm rounded px-3 py-1.5 border border-slate-600" />
        </div>
      </div>

      <button onClick={handleBuild} disabled={loading || turbines.length === 0}
        className="w-full py-2.5 bg-purple-700 hover:bg-purple-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded font-medium text-sm transition-colors">
        {loading ? '⏳ Building...' : '🔌 Build Electrical Network'}
      </button>

      {network && (
        <div className="space-y-3">
          {/* Tabs */}
          <div className="flex gap-1 bg-slate-800 rounded p-1">
            {(['overview', 'strings', 'export'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                  tab === t ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <KV label="Strings" value={network.strings.length.toString()} />
                <KV label="Array cable" value={fmtKm(network.array_cable_total_km)} />
                <KV label="Array losses" value={`${network.total_array_losses_pct.toFixed(1)}%`} />
                <KV label="Total cost" value={fmtMUSD(network.total_cable_cost_musd)} />
              </div>
              <div className="bg-slate-800 rounded p-2 text-xs">
                <div className="text-slate-400 mb-1">OSS</div>
                <div className="text-slate-200">{network.oss.transformer_mva.toFixed(0)} MVA · {network.oss.voltage_lv_kv}/{network.oss.voltage_hv_kv} kV</div>
                <div className="text-green-400">{fmtMUSD(network.oss.total_cost_musd)}</div>
              </div>
            </div>
          )}

          {tab === 'strings' && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {network.strings.map(s => (
                <div key={s.string_id} className="bg-slate-800 rounded p-2 text-xs">
                  <div className="flex justify-between">
                    <span className="font-medium text-slate-200">{s.string_id}</span>
                    <span className="text-slate-400">{s.turbine_ids.length} turbines</span>
                  </div>
                  <div className="flex gap-3 mt-1 text-slate-400">
                    <span>{fmtKm(s.total_length_m / 1000)}</span>
                    <span>{s.total_losses_kw.toFixed(0)} kW loss</span>
                    <span>{fmtMUSD(s.total_cost_usd / 1e6)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'export' && (
            <div className="bg-slate-800 rounded p-3 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Type</span>
                <span className="text-blue-400 font-medium">{network.export_cable.cable_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Length</span>
                <span>{fmtKm(network.export_cable.length_km)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Losses</span>
                <span>{network.export_cable.losses_mw.toFixed(1)} MW</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total cost</span>
                <span className="text-green-400">{fmtMUSD(network.export_cable.total_cost_musd)}</span>
              </div>
              <div className="text-slate-500 mt-2 italic">{network.export_cable.selection_reason}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800 rounded p-2">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-200">{value}</div>
    </div>
  )
}
