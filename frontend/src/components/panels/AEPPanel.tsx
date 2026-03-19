import { useState } from 'react'
import toast from 'react-hot-toast'
import { useLayoutStore } from '../../store/layoutStore'
import { useTurbineStore } from '../../store/turbineStore'
import { useWindStore } from '../../store/windStore'
import { useUIStore } from '../../store/uiStore'
import { evaluateLayout } from '../../api'
import { fmtGWh, fmtPct } from '../../utils/formatters'
import { CoordinateTransformer } from '../../utils/geo'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function AEPPanel() {
  const { boundary, turbines, aepResult, setAEPResult } = useLayoutStore()
  const { selectedTurbine } = useTurbineStore()
  const { windRose } = useWindStore()
  const { wakeModelType } = useUIStore()
  const [loading, setLoading] = useState(false)

  const handleEvaluate = async () => {
    if (!boundary || turbines.length === 0) return toast.error('Place turbines first')
    if (!selectedTurbine) return toast.error('Select a turbine')

    const transformer = CoordinateTransformer.fromBoundary(boundary)
    const turbinesWithLocal = turbines.map(t => {
      const { x, y } = transformer.geoToLocal(t.lat, t.lng)
      return { ...t, x, y }
    })

    try {
      setLoading(true)
      const result = await evaluateLayout({
        boundary, turbines: turbinesWithLocal,
        turbine_spec: selectedTurbine,
        wind_rose: windRose,
        wake_model: wakeModelType,
      })
      setAEPResult(result)
      toast.success(`AEP: ${result.aep_gwh.toFixed(1)} GWh | Wake loss: ${result.wake_loss_pct.toFixed(1)}%`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const r = aepResult

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide">AEP Evaluation</h2>

      <button
        onClick={handleEvaluate}
        disabled={loading || turbines.length === 0}
        className="w-full py-2.5 bg-green-700 hover:bg-green-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded font-medium text-sm transition-colors"
      >
        {loading ? '⏳ Calculating...' : '📊 Calculate AEP'}
      </button>

      {r && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-2">
            <KPICard label="Net AEP" value={fmtGWh(r.aep_gwh)} color="green" />
            <KPICard label="Gross AEP" value={fmtGWh(r.gross_aep_gwh)} color="blue" />
            <KPICard label="Wake Loss" value={fmtPct(r.wake_loss_pct)} color="orange"
              warning={r.wake_loss_pct > 15} />
            <KPICard label="Cap. Factor" value={fmtPct(r.capacity_factor * 100)} color="purple" />
          </div>

          {/* Per-turbine wake losses */}
          {r.per_turbine_wake_loss.length > 0 && (
            <div className="bg-slate-800 rounded-lg p-3">
              <h3 className="text-xs font-semibold text-slate-300 mb-2">Per-Turbine Wake Loss</h3>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart
                  data={r.per_turbine_wake_loss.map((v, i) => ({ i: i + 1, loss: +(v * 100).toFixed(1) }))}
                  margin={{ top: 0, right: 4, bottom: 0, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="2 2" stroke="#334155" />
                  <XAxis dataKey="i" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} unit="%" width={30} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 11 }}
                    formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(1)}%`, 'Wake Loss']}
                    labelFormatter={(v) => `Turbine ${v}`}
                  />
                  <Bar dataKey="loss" fill="#f97316" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {!r && turbines.length > 0 && (
        <div className="text-xs text-slate-400 text-center py-4">
          Click "Calculate AEP" to evaluate current layout
        </div>
      )}
    </div>
  )
}

function KPICard({ label, value, color, warning }: {
  label: string; value: string; color: string; warning?: boolean
}) {
  const colors: Record<string, string> = {
    green: 'text-green-400', blue: 'text-blue-400',
    orange: 'text-orange-400', purple: 'text-purple-400',
  }
  return (
    <div className={`bg-slate-800 rounded-lg p-3 ${warning ? 'border border-red-500/50' : ''}`}>
      <div className="text-[10px] text-slate-400 mb-0.5">{label}</div>
      <div className={`text-lg font-bold ${colors[color] || 'text-slate-200'}`}>{value}</div>
    </div>
  )
}
