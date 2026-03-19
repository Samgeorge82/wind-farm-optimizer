import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { TurbineSpec } from '../../types'

export function PowerCurveChart({ turbine }: { turbine: TurbineSpec }) {
  return (
    <div className="bg-slate-800 rounded-lg p-3">
      <h3 className="text-xs font-semibold text-slate-300 mb-2">Power Curve — {turbine.name}</h3>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={turbine.power_curve} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="powerGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="wind_speed" tick={{ fill: '#94a3b8', fontSize: 10 }} unit=" m/s" />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} width={40}
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}MW` : `${v}kW`}
          />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 12 }}
            formatter={(v: number | undefined) => [`${((v ?? 0) / 1000).toFixed(2)} MW`, 'Power']}
            labelFormatter={(v) => `${v} m/s`}
          />
          <Area type="monotone" dataKey="power" stroke="#22c55e" fill="url(#powerGrad)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
