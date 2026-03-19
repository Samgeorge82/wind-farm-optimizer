import { useState } from 'react'
import toast from 'react-hot-toast'
import { useLayoutStore } from '../../store/layoutStore'
import { useTurbineStore } from '../../store/turbineStore'
import { useFoundationStore } from '../../store/foundationStore'
import { assessFoundation } from '../../api'
import { fmtMUSD } from '../../utils/formatters'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const FOUNDATION_COLORS: Record<string, string> = {
  monopile: '#3b82f6',
  jacket: '#8b5cf6',
  floating_semi_sub: '#22c55e',
  floating_spar: '#f59e0b',
}

export default function FoundationPanel() {
  const { turbines } = useLayoutStore()
  const { selectedTurbine } = useTurbineStore()
  const { summary, setSummary, defaultDepthM, setDefaultDepth, defaultSeabed, setDefaultSeabed } = useFoundationStore()
  const [loading, setLoading] = useState(false)

  const handleAssess = async () => {
    if (turbines.length === 0) return toast.error('Place turbines first')
    if (!selectedTurbine) return toast.error('Select a turbine')
    try {
      setLoading(true)
      const result = await assessFoundation({
        turbines,
        turbine_spec: selectedTurbine,
        default_water_depth_m: defaultDepthM,
        default_seabed_type: defaultSeabed,
        depth_overrides: {},
      })
      setSummary(result)
      toast.success(`Foundation assessment complete. Total: ${fmtMUSD(result.total_cost_musd)}`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const pieData = summary
    ? Object.entries(summary.type_distribution).map(([k, v]) => ({
        name: k.replace('_', ' '), value: v, color: FOUNDATION_COLORS[k] ?? '#64748b'
      }))
    : []

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Foundation Design</h2>

      <div className="bg-slate-800 rounded-lg p-3 space-y-3">
        <h3 className="text-xs font-semibold text-slate-300">Site Conditions</h3>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Water depth (m)</label>
          <input type="number" value={defaultDepthM} min={5} max={500} step={5}
            onChange={(e) => setDefaultDepth(Number(e.target.value))}
            className="w-full bg-slate-700 text-slate-200 text-sm rounded px-3 py-1.5 border border-slate-600" />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Seabed type</label>
          <select value={defaultSeabed} onChange={(e) => setDefaultSeabed(e.target.value as any)}
            className="w-full bg-slate-700 text-slate-200 text-sm rounded px-2 py-1.5 border border-slate-600">
            <option value="sand">Sand</option>
            <option value="clay">Clay</option>
            <option value="rock">Rock</option>
          </select>
        </div>
      </div>

      <button onClick={handleAssess} disabled={loading || turbines.length === 0}
        className="w-full py-2.5 bg-blue-700 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded font-medium text-sm transition-colors">
        {loading ? '⏳ Assessing...' : '⚓ Assess Foundations'}
      </button>

      {summary && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <KV label="Total Cost" value={fmtMUSD(summary.total_cost_musd)} />
            <KV label="Avg/Turbine" value={fmtMUSD(summary.average_cost_musd_per_turbine)} />
          </div>

          {/* Foundation type distribution pie */}
          {pieData.length > 0 && (
            <div className="bg-slate-800 rounded-lg p-3">
              <h3 className="text-xs font-semibold text-slate-300 mb-2">Foundation Types</h3>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 12 }}
                    formatter={(v: number | undefined) => [`${v ?? 0} turbines`, '']}
                  />
                  <Legend iconSize={8} formatter={(v) => <span style={{ fontSize: 11, color: '#94a3b8' }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Cost by type */}
          <div className="bg-slate-800 rounded-lg p-3 space-y-1">
            {Object.entries(summary.cost_by_type).map(([type, cost]) => (
              <div key={type} className="flex justify-between text-xs">
                <span className="text-slate-400 capitalize">{type.replace(/_/g, ' ')}</span>
                <span className="text-slate-200">{fmtMUSD(cost as number)}</span>
              </div>
            ))}
          </div>
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
