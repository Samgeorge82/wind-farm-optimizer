import { useMemo } from 'react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts'
import type { WindRose } from '../../types'

const DIR_12 = ['N','NNE','NE','E','SE','SSE','S','SSW','SW','W','NW','NNW']

interface Props {
  windRose: WindRose
  height?: number
}

export function WindRoseChart({ windRose, height = 250 }: Props) {
  const data = useMemo(() => {
    return windRose.sectors.map((s, i) => {
      const label = windRose.n_sectors === 12 ? DIR_12[i] : `S${i + 1}`
      // Mean wind speed approx from Weibull: A × Γ(1+1/k) ≈ A × 0.886
      return {
        direction: label,
        frequency: +(s.frequency * 100).toFixed(1),
        meanSpeed: +(s.A * 0.886).toFixed(1),
      }
    })
  }, [windRose])

  return (
    <div className="bg-slate-800 rounded-lg p-3">
      <h3 className="text-xs font-semibold text-slate-300 mb-2">Wind Rose</h3>
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="#334155" />
          <PolarAngleAxis
            dataKey="direction"
            tick={{ fill: '#94a3b8', fontSize: 10 }}
          />
          <Radar
            name="Frequency (%)"
            dataKey="frequency"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.4}
          />
          <Tooltip
            formatter={(v: number | undefined) => [`${v ?? 0}%`, 'Frequency']}
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: '#e2e8f0' }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
