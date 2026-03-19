import { useState } from 'react'
import { assessMarine } from '../../api'
import type { MarineAssessmentResult } from '../../types'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DEFAULT_HS = [1.8, 1.7, 1.5, 1.2, 1.0, 0.8, 0.9, 1.0, 1.3, 1.6, 1.8, 1.9]

export default function MarinePanel() {
  const [result, setResult] = useState<MarineAssessmentResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Wave inputs
  const [monthlyHs, setMonthlyHs] = useState<number[]>([...DEFAULT_HS])
  const [hsOperational, setHsOperational] = useState(1.5)
  const [hsCableLay, setHsCableLay] = useState(2.0)
  const [hsMonopile, setHsMonopile] = useState(2.5)
  const [currentSpeed, setCurrentSpeed] = useState(0.5)

  // Site conditions
  const [siteLatitude, setSiteLatitude] = useState(55.0)
  const [temperature, setTemperature] = useState(10.0)

  // Vertical extrapolation
  const [doExtrapolation, setDoExtrapolation] = useState(true)
  const [extMethod, setExtMethod] = useState<'log_law' | 'power_law'>('power_law')
  const [metMastHeight, setMetMastHeight] = useState(10)
  const [hubHeight, setHubHeight] = useState(150)
  const [refWindSpeed, setRefWindSpeed] = useState(8.5)
  const [roughnessLength, setRoughnessLength] = useState(0.0002)
  const [shearExponent, setShearExponent] = useState(0.11)

  async function runAssessment() {
    setLoading(true); setError(null)
    try {
      const body: any = {
        wave_conditions: {
          hs_operational_m: hsOperational,
          hs_cable_lay_m: hsCableLay,
          hs_monopile_m: hsMonopile,
          current_speed_ms: currentSpeed,
          monthly_mean_hs: monthlyHs,
        },
        site_latitude: siteLatitude,
        site_elevation_m: 0.0,
        temperature_celsius: temperature,
      }
      if (doExtrapolation) {
        body.vertical_extrapolation = {
          method: extMethod,
          met_mast_height_m: metMastHeight,
          hub_height_m: hubHeight,
          reference_wind_speed_ms: refWindSpeed,
          roughness_length_m: roughnessLength,
          shear_exponent: shearExponent,
        }
      }
      const res = await assessMarine(body)
      setResult(res)
    } catch (e: any) {
      setError(e.response?.data?.detail ?? e.message)
    } finally {
      setLoading(false)
    }
  }

  const waveChartData = MONTHS.map((m, i) => ({
    month: m, hs: monthlyHs[i],
    ops: hsOperational,
  }))

  return (
    <div className="panel-container">
      <h2 className="panel-title">Marine & Metocean</h2>

      {error && <div className="error-box">{error}</div>}

      {/* ─── Monthly Wave Heights ─── */}
      <div className="section-header">Monthly Mean Hs (m)</div>

      <div className="h-36 mb-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={waveChartData} margin={{ left: -10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
            <Legend wrapperStyle={{ fontSize: '10px', color: '#94a3b8' }} />
            <Line type="monotone" dataKey="hs" name="Monthly Hs (m)" stroke="#38bdf8" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="ops" name="Ops limit" stroke="#f97316" dot={false} strokeDasharray="5 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto mb-3">
        <div className="flex gap-1">
          {MONTHS.map((m, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <span className="text-[9px] text-gray-500">{m}</span>
              <input
                type="number" step="0.1" min="0" max="10"
                value={monthlyHs[i]}
                onChange={e => {
                  const a = [...monthlyHs]; a[i] = Number(e.target.value); setMonthlyHs(a)
                }}
                className="w-10 h-7 text-center text-xs bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          ))}
        </div>
      </div>

      {/* ─── Installation Limits ─── */}
      <div className="section-header">Operational Limits</div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="param-row">
          <label>Hs ops limit (m)</label>
          <input type="number" step="0.1" value={hsOperational}
            onChange={e => setHsOperational(Number(e.target.value))}
            className="input-field" />
        </div>
        <div className="param-row">
          <label>Hs cable lay (m)</label>
          <input type="number" step="0.1" value={hsCableLay}
            onChange={e => setHsCableLay(Number(e.target.value))}
            className="input-field" />
        </div>
        <div className="param-row">
          <label>Hs monopile (m)</label>
          <input type="number" step="0.1" value={hsMonopile}
            onChange={e => setHsMonopile(Number(e.target.value))}
            className="input-field" />
        </div>
        <div className="param-row">
          <label>Current (m/s)</label>
          <input type="number" step="0.1" value={currentSpeed}
            onChange={e => setCurrentSpeed(Number(e.target.value))}
            className="input-field" />
        </div>
      </div>

      {/* ─── Site ─── */}
      <div className="section-header">Site Conditions</div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="param-row">
          <label>Latitude (°)</label>
          <input type="number" step="0.5" value={siteLatitude}
            onChange={e => setSiteLatitude(Number(e.target.value))}
            className="input-field" />
        </div>
        <div className="param-row">
          <label>Temperature (°C)</label>
          <input type="number" step="1" value={temperature}
            onChange={e => setTemperature(Number(e.target.value))}
            className="input-field" />
        </div>
      </div>

      {/* ─── Vertical Extrapolation ─── */}
      <div className="section-header flex items-center gap-2">
        Wind Shear Extrapolation
        <label className="flex items-center gap-1 text-xs font-normal text-gray-400 ml-auto cursor-pointer">
          <input type="checkbox" checked={doExtrapolation}
            onChange={e => setDoExtrapolation(e.target.checked)}
            className="accent-cyan-500" />
          Enable
        </label>
      </div>

      {doExtrapolation && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="param-row">
            <label>Profile</label>
            <select value={extMethod}
              onChange={e => setExtMethod(e.target.value as 'log_law' | 'power_law')}
              className="input-field">
              <option value="power_law">Power Law (α)</option>
              <option value="log_law">Log Law (z₀)</option>
            </select>
          </div>
          <div className="param-row">
            <label>Mast height (m)</label>
            <input type="number" step="1" value={metMastHeight}
              onChange={e => setMetMastHeight(Number(e.target.value))}
              className="input-field" />
          </div>
          <div className="param-row">
            <label>Hub height (m)</label>
            <input type="number" step="1" value={hubHeight}
              onChange={e => setHubHeight(Number(e.target.value))}
              className="input-field" />
          </div>
          <div className="param-row">
            <label>Ref speed (m/s)</label>
            <input type="number" step="0.1" value={refWindSpeed}
              onChange={e => setRefWindSpeed(Number(e.target.value))}
              className="input-field" />
          </div>
          {extMethod === 'power_law' ? (
            <div className="param-row">
              <label>Shear exp (α)</label>
              <input type="number" step="0.01" value={shearExponent}
                onChange={e => setShearExponent(Number(e.target.value))}
                className="input-field" />
            </div>
          ) : (
            <div className="param-row">
              <label>Roughness z₀ (m)</label>
              <input type="number" step="0.0001" value={roughnessLength}
                onChange={e => setRoughnessLength(Number(e.target.value))}
                className="input-field" />
            </div>
          )}
        </div>
      )}

      <button
        onClick={runAssessment}
        disabled={loading}
        className="btn-primary w-full"
      >
        {loading ? 'Assessing...' : 'Run Marine Assessment'}
      </button>

      {/* ─── Results ─── */}
      {result && (
        <div className="space-y-3 mt-4">
          <div className="section-header">Air Density & Turbulence</div>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Air Density</div>
              <div className="kpi-value">{result.air_density_kg_m3.toFixed(4)} kg/m³</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Density Correction</div>
              <div className="kpi-value">
                {result.density_correction_factor >= 1
                  ? '+' : ''}
                {((result.density_correction_factor - 1) * 100).toFixed(1)}%
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Turbulence Class</div>
              <div className="kpi-value">{result.turbulence_class}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Ref TI</div>
              <div className="kpi-value">{(result.reference_turbulence_intensity * 100).toFixed(1)}%</div>
            </div>
          </div>

          <div className="section-header">Weather Windows</div>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Ops availability</div>
              <div className="kpi-value">{(result.weather_window.annual_operational_pct * 100).toFixed(1)}%</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Ops hours/yr</div>
              <div className="kpi-value">{result.weather_window.annual_operational_hours.toFixed(0)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Cable lay</div>
              <div className="kpi-value">{(result.weather_window.annual_cable_lay_pct * 100).toFixed(1)}%</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Monopile install</div>
              <div className="kpi-value">{(result.weather_window.annual_monopile_install_pct * 100).toFixed(1)}%</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Vessel days req.</div>
              <div className="kpi-value">{result.weather_window.installation_vessel_days_required.toFixed(0)} days</div>
            </div>
          </div>

          {result.weather_window.notes.length > 0 && (
            <div className="text-xs text-yellow-400 space-y-0.5">
              {result.weather_window.notes.map((n, i) => <div key={i}>• {n}</div>)}
            </div>
          )}

          {result.vertical_extrapolation && (
            <>
              <div className="section-header">Wind Shear Result</div>
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-label">Hub Speed</div>
                  <div className="kpi-value text-cyan-400">
                    {result.vertical_extrapolation.hub_height_wind_speed_ms.toFixed(2)} m/s
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">Shear Multiplier</div>
                  <div className="kpi-value">
                    ×{result.vertical_extrapolation.shear_multiplier.toFixed(3)}
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">Method</div>
                  <div className="kpi-value text-sm">{result.vertical_extrapolation.method_used}</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
