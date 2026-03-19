import { useState } from 'react'
import { useFinancialStore } from '../../store/financialStore'
import { useLayoutStore } from '../../store/layoutStore'
import { useElectricalStore } from '../../store/electricalStore'
import { useFoundationStore } from '../../store/foundationStore'
import { useTurbineStore } from '../../store/turbineStore'
import { runTornado, startMonteCarlo, getMCJob } from '../../api'
import type { TornadoResult, MonteCarloResult } from '../../types'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, Cell,
} from 'recharts'

type ActiveTab = 'tornado' | 'montecarlo' | 'scenarios'

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`

export default function SensitivityPanel() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('tornado')
  const [tornadoResult, setTornadoResult] = useState<TornadoResult | null>(null)
  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [mcLoading, setMcLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mcIterations, setMcIterations] = useState(1000)
  const [mcProgress, setMcProgress] = useState<string | null>(null)

  const { result: finResult, inputs } = useFinancialStore()
  const { aepResult, turbines } = useLayoutStore()
  const { network } = useElectricalStore()
  const { summary: foundSummary } = useFoundationStore()
  const { selectedTurbine } = useTurbineStore()

  const installedMw = turbines.length * (selectedTurbine?.rated_power_kw ?? 15000) / 1000
  const aepGwh = aepResult?.aep_gwh ?? 0

  function buildFinancialRequest() {
    const foundationMusd = foundSummary?.total_cost_musd ?? 0
    const arrayCableKm = network?.array_cable_total_km ?? 0
    const exportCableKm = inputs.distanceToShoreKm
    const ossMusd = network ? network.oss.total_cost_musd : inputs.ossUsdMusd

    return {
      params: {
        project_lifetime_years: inputs.projectLifetime,
        construction_years: 3,
        capex_draw_schedule: [0.20, 0.50, 0.30],
        wacc: inputs.wacc,
        tax_rate: inputs.taxRate,
        depreciation_years: 15,
        inflation_rate: 0.025,
        debt: {
          debt_fraction: inputs.debtFraction,
          interest_rate: inputs.interestRate,
          loan_tenor_years: inputs.loanTenorYears,
          grace_period_years: 2,
          amortization: 'annuity',
        },
        energy_price: {
          base_price_usd_mwh: inputs.energyPriceUsdMwh,
          escalation_rate: inputs.escalationRate,
        },
        capex: {
          turbine_supply_usd_mw: inputs.turbineSupplyUsdMw,
          turbine_installation_usd_mw: inputs.turbineInstallUsdMw,
          foundation_total_musd: foundationMusd,
          array_cable_usd_km: 400000,
          array_cable_total_km: arrayCableKm,
          oss_total_musd: ossMusd,
          export_cable_usd_km: 1200000,
          export_cable_total_km: exportCableKm,
          onshore_substation_musd: 15,
          installation_vessels_musd: inputs.installationVesselsMusd,
          mobilization_musd: 10,
          development_engineering_pct: 0.03,
          contingency_pct: 0.05,
        },
        opex: {
          fixed_usd_mw_year: inputs.fixedOpexUsdMwYear,
          variable_usd_mwh: inputs.variableOpexUsdMwh,
          insurance_pct_capex: 0.005,
          lease_usd_mw_year: 8000,
          asset_management_usd_year: 500000,
          opex_escalation_rate: 0.02,
        },
        decommissioning: { method: 'pct_capex', pct_capex: 0.05, lump_sum_musd: 0 },
      },
      installed_mw: installedMw,
      aep_gwh: aepGwh || 1,
      n_turbines: turbines.length || 1,
    }
  }

  async function runTornadoAnalysis() {
    if (!finResult) { setError('Run financial model first'); return }
    setLoading(true); setError(null)
    try {
      const res = await runTornado({
        request: buildFinancialRequest(),
        variables: [
          { name: 'aep_gwh', display_label: 'AEP (energy yield)', base_value: aepGwh,
            low_pct: 0.10, high_pct: 0.10, attribute_path: '' },
          { name: 'energy_price', display_label: 'Energy Price ($/MWh)',
            base_value: inputs.energyPriceUsdMwh, low_pct: 0.10, high_pct: 0.10,
            attribute_path: 'energy_price.base_price_usd_mwh' },
          { name: 'wacc', display_label: 'WACC', base_value: inputs.wacc,
            low_pct: 0.10, high_pct: 0.10, attribute_path: 'wacc' },
          { name: 'fixed_opex', display_label: 'Fixed OPEX ($/MW/yr)',
            base_value: inputs.fixedOpexUsdMwYear, low_pct: 0.10, high_pct: 0.10,
            attribute_path: 'opex.fixed_usd_mw_year' },
          { name: 'debt_fraction', display_label: 'Debt Fraction',
            base_value: inputs.debtFraction, low_pct: 0.10, high_pct: 0.10,
            attribute_path: 'debt.debt_fraction' },
          { name: 'interest_rate', display_label: 'Interest Rate',
            base_value: inputs.interestRate, low_pct: 0.10, high_pct: 0.10,
            attribute_path: 'debt.interest_rate' },
          { name: 'turbine_supply', display_label: 'Turbine Supply Cost',
            base_value: inputs.turbineSupplyUsdMw, low_pct: 0.10, high_pct: 0.10,
            attribute_path: 'capex.turbine_supply_usd_mw' },
        ],
        target_metric: 'project_irr',
      })
      setTornadoResult(res)
    } catch (e: any) {
      setError(e.response?.data?.detail ?? e.message)
    } finally {
      setLoading(false)
    }
  }

  async function runMonteCarloAnalysis() {
    if (!finResult) { setError('Run financial model first'); return }
    setMcLoading(true); setError(null); setMcProgress('Submitting...')
    try {
      const p90Gwh = (aepGwh || 1) * 0.92
      const res = await startMonteCarlo({
        request: buildFinancialRequest(),
        n_iterations: mcIterations,
        aep_p90_gwh: p90Gwh,
        capex_uncertainty_pct: 0.10,
        opex_uncertainty_pct: 0.10,
        energy_price_uncertainty_pct: 0.08,
      })

      // Small runs (<= 500) return result directly
      if (res.n_iterations !== undefined) {
        setMcResult(res as MonteCarloResult)
        setMcProgress(null)
        setMcLoading(false)
        return
      }

      // Large run: poll job
      const jobId = res.job_id
      const poll = async () => {
        const status = await getMCJob(jobId)
        if (status.status === 'running' || status.status === 'pending') {
          setMcProgress(`Running (${status.status})...`)
          setTimeout(poll, 1500)
        } else if (status.status === 'completed') {
          setMcResult(status.result as MonteCarloResult)
          setMcProgress(null)
          setMcLoading(false)
        } else {
          setError(status.error ?? 'Monte Carlo failed')
          setMcProgress(null)
          setMcLoading(false)
        }
      }
      setTimeout(poll, 1500)
    } catch (e: any) {
      setError(e.response?.data?.detail ?? e.message)
      setMcLoading(false)
      setMcProgress(null)
    }
  }

  return (
    <div className="panel-container">
      <h2 className="panel-title">Risk & Sensitivity</h2>

      <div className="tab-bar">
        {(['tornado', 'montecarlo', 'scenarios'] as ActiveTab[]).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`tab-btn ${activeTab === t ? 'tab-active' : ''}`}>
            {t === 'tornado' ? 'Tornado' : t === 'montecarlo' ? 'Monte Carlo' : 'Scenarios'}
          </button>
        ))}
      </div>

      {error && <div className="error-box">{error}</div>}
      {!finResult && (
        <p className="text-xs text-yellow-400 mb-3">
          Run the financial model first (Financial panel).
        </p>
      )}

      {/* ─── TORNADO ─── */}
      {activeTab === 'tornado' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-400">One-at-a-time ±10% sensitivity on Project IRR</p>
          <button onClick={runTornadoAnalysis} disabled={loading || !finResult}
            className="btn-primary w-full">
            {loading ? 'Running...' : 'Run Tornado Analysis'}
          </button>

          {tornadoResult && (
            <div className="space-y-3">
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-label">Base IRR</div>
                  <div className="kpi-value">{fmtPct(tornadoResult.base_result)}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">Top Driver</div>
                  <div className="kpi-value text-sm">{tornadoResult.bars[0]?.display_label ?? '–'}</div>
                </div>
              </div>

              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={tornadoResult.bars.map(b => ({
                      name: b.display_label,
                      low: (b.low_impact - tornadoResult.base_result) * 100,
                      high: (b.high_impact - tornadoResult.base_result) * 100,
                    }))}
                    layout="vertical"
                    margin={{ left: 120, right: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" tickFormatter={v => `${v.toFixed(1)}%`}
                      tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <YAxis dataKey="name" type="category"
                      tick={{ fill: '#94a3b8', fontSize: 10 }} width={120} />
                    <Tooltip
                      formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(2)}% vs base`, '']}
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
                    <ReferenceLine x={0} stroke="#64748b" />
                    <Bar dataKey="low" name="-10%" fill="#ef4444" />
                    <Bar dataKey="high" name="+10%" fill="#22c55e" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <table className="data-table text-xs">
                <thead>
                  <tr><th>Variable</th><th>Low IRR</th><th>High IRR</th><th>Swing</th></tr>
                </thead>
                <tbody>
                  {tornadoResult.bars.map(b => (
                    <tr key={b.variable}>
                      <td>{b.display_label}</td>
                      <td className="text-red-400">{fmtPct(b.low_impact)}</td>
                      <td className="text-green-400">{fmtPct(b.high_impact)}</td>
                      <td className="text-yellow-400">{fmtPct(b.swing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── MONTE CARLO ─── */}
      {activeTab === 'montecarlo' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-400">
            Probabilistic: AEP ~ LogNormal, CAPEX/OPEX/price ~ Normal
          </p>
          <div className="param-row">
            <label>Iterations</label>
            <select value={mcIterations} onChange={e => setMcIterations(Number(e.target.value))}
              className="input-field">
              <option value={500}>500 (sync)</option>
              <option value={1000}>1,000 (async)</option>
              <option value={2000}>2,000</option>
              <option value={5000}>5,000</option>
            </select>
          </div>

          <button onClick={runMonteCarloAnalysis} disabled={mcLoading || !finResult}
            className="btn-primary w-full">
            {mcLoading ? (mcProgress ?? 'Running...') : 'Run Monte Carlo'}
          </button>

          {mcResult && (
            <div className="space-y-3">
              <div className="section-header">Project IRR Distribution</div>
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-label">P10 (downside)</div>
                  <div className="kpi-value text-red-400">{fmtPct(mcResult.project_irr.p10)}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">P50 (median)</div>
                  <div className="kpi-value">{fmtPct(mcResult.project_irr.p50)}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">P90 (upside)</div>
                  <div className="kpi-value text-green-400">{fmtPct(mcResult.project_irr.p90)}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">Mean</div>
                  <div className="kpi-value">{fmtPct(mcResult.project_irr.mean)}</div>
                </div>
              </div>

              <div className="section-header">LCOE $/MWh</div>
              <div className="flex gap-2 text-xs">
                <span className="kpi-card flex-1 text-center text-green-400">P10: ${mcResult.lcoe_usd_mwh.p10.toFixed(1)}</span>
                <span className="kpi-card flex-1 text-center">P50: ${mcResult.lcoe_usd_mwh.p50.toFixed(1)}</span>
                <span className="kpi-card flex-1 text-center text-red-400">P90: ${mcResult.lcoe_usd_mwh.p90.toFixed(1)}</span>
              </div>

              <div className="section-header">NPV M$</div>
              <div className="flex gap-2 text-xs">
                <span className="kpi-card flex-1 text-center text-red-400">P10: ${mcResult.npv_musd.p10.toFixed(0)}M</span>
                <span className="kpi-card flex-1 text-center">P50: ${mcResult.npv_musd.p50.toFixed(0)}M</span>
                <span className="kpi-card flex-1 text-center text-green-400">P90: ${mcResult.npv_musd.p90.toFixed(0)}M</span>
              </div>

              {mcResult.irr_histogram?.length > 0 && (
                <>
                  <div className="section-header">IRR Histogram ({mcResult.n_iterations} simulations)</div>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={mcResult.irr_histogram.map((v, i) => ({ i, irr: +(v * 100).toFixed(2) }))}
                        margin={{ left: -10, right: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="irr" type="number" tickFormatter={v => `${v}%`}
                          tick={{ fill: '#94a3b8', fontSize: 9 }} />
                        <YAxis hide />
                        <Tooltip formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(1)}%`, 'IRR']}
                          contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
                        <Bar dataKey="irr">
                          {mcResult.irr_histogram.map((v, i) => (
                            <Cell key={i} fill={v >= 0.08 ? '#22c55e' : '#ef4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── SCENARIOS ─── */}
      {activeTab === 'scenarios' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-400">Compare multiple project scenarios side-by-side.</p>
          <div className="rounded-lg border border-dashed border-slate-600 p-6 text-center text-sm text-gray-500">
            Run the financial model and save scenarios to compare them here.
          </div>
          <div className="text-xs text-gray-500 space-y-1">
            <p>Suggested scenarios:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Base Case — current inputs</li>
              <li>Optimistic — AEP +5%, CAPEX −5%, price +5%</li>
              <li>Conservative — AEP −10%, CAPEX +10%, price −5%</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
