import { useState } from 'react'
import toast from 'react-hot-toast'
import { useLayoutStore } from '../../store/layoutStore'
import { useTurbineStore } from '../../store/turbineStore'
import { useElectricalStore } from '../../store/electricalStore'
import { useFoundationStore } from '../../store/foundationStore'
import { useFinancialStore } from '../../store/financialStore'
import { calculateFinancial } from '../../api'
import { fmtMUSD, fmtIRR, fmtUSD_MWh, fmtDSCR, fmtGWh } from '../../utils/formatters'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { PieChart, Pie, Cell, Legend } from 'recharts'

const CAPEX_COLORS = ['#3b82f6','#8b5cf6','#22c55e','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16']

export default function FinancialPanel() {
  const { turbines, aepResult } = useLayoutStore()
  const { selectedTurbine } = useTurbineStore()
  const { network } = useElectricalStore()
  const { summary: foundationSummary } = useFoundationStore()
  const { inputs, setInputs, result, setResult, isCalculating, setCalculating } = useFinancialStore()
  const [tab, setTab] = useState<'inputs' | 'results' | 'cashflow'>('inputs')

  const installedMW = turbines.length * (selectedTurbine?.rated_power_kw ?? 15000) / 1000
  const aepGwh = aepResult?.aep_gwh ?? 0

  const handleCalculate = async () => {
    if (!aepGwh) return toast.error('Run AEP calculation first')
    if (!installedMW) return toast.error('Place turbines first')

    const foundationMusd = foundationSummary?.total_cost_musd ?? 0
    const arrayCableKm = network?.array_cable_total_km ?? 0
    const exportCableKm = inputs.distanceToShoreKm
    const ossMusd = network ? (network.oss.total_cost_musd) : inputs.ossUsdMusd

    const params = {
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
    }

    try {
      setCalculating(true)
      const res = await calculateFinancial({ params, installed_mw: installedMW, aep_gwh: aepGwh, n_turbines: turbines.length })
      setResult(res)
      setTab('results')
      toast.success(`LCOE: ${fmtUSD_MWh(res.lcoe_usd_mwh)} | Equity IRR: ${fmtIRR(res.equity_irr)}`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setCalculating(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Financial Model</h2>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 rounded p-1">
        {(['inputs', 'results', 'cashflow'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
              tab === t ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'inputs' && (
        <div className="space-y-3">
          <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
            <span className="text-slate-300">Auto-filled: </span>
            {aepGwh > 0 ? `AEP=${fmtGWh(aepGwh)}` : '⚠ Run AEP first'}{' | '}
            {installedMW > 0 ? `${installedMW.toFixed(0)} MW` : '⚠ Place turbines'}
            {foundationSummary && ` | Foundation=${fmtMUSD(foundationSummary.total_cost_musd)}`}
          </div>

          <Section title="CAPEX">
            <FInput label="Turbine supply ($/MW)" value={inputs.turbineSupplyUsdMw}
              onChange={(v) => setInputs({ turbineSupplyUsdMw: v })} />
            <FInput label="Turbine install ($/MW)" value={inputs.turbineInstallUsdMw}
              onChange={(v) => setInputs({ turbineInstallUsdMw: v })} />
            <FInput label="Vessels & mobilization (MUSD)" value={inputs.installationVesselsMusd}
              onChange={(v) => setInputs({ installationVesselsMusd: v })} />
            <FInput label="Export cable distance (km)" value={inputs.distanceToShoreKm}
              onChange={(v) => setInputs({ distanceToShoreKm: v })} />
          </Section>

          <Section title="OPEX">
            <FInput label="Fixed O&M ($/MW/yr)" value={inputs.fixedOpexUsdMwYear}
              onChange={(v) => setInputs({ fixedOpexUsdMwYear: v })} />
            <FInput label="Variable O&M ($/MWh)" value={inputs.variableOpexUsdMwh}
              onChange={(v) => setInputs({ variableOpexUsdMwh: v })} step={0.5} />
          </Section>

          <Section title="Revenue & Finance">
            <FInput label="Energy price ($/MWh)" value={inputs.energyPriceUsdMwh}
              onChange={(v) => setInputs({ energyPriceUsdMwh: v })} />
            <FInput label="Price escalation (%/yr)" value={inputs.escalationRate * 100}
              onChange={(v) => setInputs({ escalationRate: v / 100 })} step={0.5} />
            <FInput label="WACC (%)" value={inputs.wacc * 100}
              onChange={(v) => setInputs({ wacc: v / 100 })} step={0.5} />
            <FInput label="Debt fraction (%)" value={inputs.debtFraction * 100}
              onChange={(v) => setInputs({ debtFraction: v / 100 })} />
            <FInput label="Interest rate (%)" value={inputs.interestRate * 100}
              onChange={(v) => setInputs({ interestRate: v / 100 })} step={0.25} />
            <FInput label="Tax rate (%)" value={inputs.taxRate * 100}
              onChange={(v) => setInputs({ taxRate: v / 100 })} />
            <FInput label="Project lifetime (yrs)" value={inputs.projectLifetime}
              onChange={(v) => setInputs({ projectLifetime: v })} min={10} max={40} step={1} />
          </Section>

          <button onClick={handleCalculate} disabled={isCalculating || !aepGwh}
            className="w-full py-2.5 bg-yellow-600 hover:bg-yellow-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded font-medium text-sm transition-colors">
            {isCalculating ? '⏳ Calculating...' : '💰 Run Financial Model'}
          </button>
        </div>
      )}

      {tab === 'results' && result && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <KPICard label="Equity IRR" value={fmtIRR(result.equity_irr)} color={result.equity_irr > 0.08 ? 'green' : 'orange'} />
            <KPICard label="LCOE" value={fmtUSD_MWh(result.lcoe_usd_mwh)} color="blue" />
            <KPICard label="NPV" value={fmtMUSD(result.npv_musd)} color={result.npv_musd > 0 ? 'green' : 'red'} />
            <KPICard label="Total CAPEX" value={fmtMUSD(result.total_capex_musd)} color="purple" />
            <KPICard label="Project IRR" value={fmtIRR(result.project_irr)} color="blue" />
            <KPICard label="Min DSCR" value={fmtDSCR(result.min_dscr)} color={result.min_dscr >= 1.2 ? 'green' : 'red'} />
            <KPICard label="Payback Year" value={result.payback_year.toString()} color="blue" />
          </div>

          {result.warnings.length > 0 && (
            <div className="bg-yellow-900/30 border border-yellow-600/50 rounded p-3 space-y-1">
              {result.warnings.map((w, i) => (
                <div key={i} className="text-xs text-yellow-300">⚠ {w}</div>
              ))}
            </div>
          )}

          {/* CAPEX pie */}
          <div className="bg-slate-800 rounded-lg p-3">
            <h3 className="text-xs font-semibold text-slate-300 mb-2">CAPEX Breakdown</h3>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={Object.entries(result.capex_breakdown_musd)
                    .filter(([k, v]) => k !== 'total' && (v as number) > 0)
                    .map(([k, v], i) => ({ name: k.replace(/_/g, ' '), value: +(v as number).toFixed(1), color: CAPEX_COLORS[i % CAPEX_COLORS.length] }))}
                  dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55}
                >
                  {Object.keys(result.capex_breakdown_musd)
                    .filter(k => k !== 'total')
                    .map((_, i) => <Cell key={i} fill={CAPEX_COLORS[i % CAPEX_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 11 }}
                  formatter={(v: number | undefined) => [`$${v ?? 0}M`, '']} />
                <Legend iconSize={8} formatter={(v) => <span style={{ fontSize: 10, color: '#94a3b8' }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === 'cashflow' && result && (
        <div className="space-y-3">
          <div className="bg-slate-800 rounded-lg p-3">
            <h3 className="text-xs font-semibold text-slate-300 mb-2">Annual Cash Flows (MUSD)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={result.annual_cash_flows.map(cf => ({
                  year: cf.year,
                  revenue: +cf.revenue_musd.toFixed(1),
                  opex: -cf.opex_musd.toFixed(1),
                  fcff: +cf.fcff_musd.toFixed(1),
                }))}
                margin={{ top: 4, right: 4, bottom: 4, left: 0 }}
              >
                <CartesianGrid strokeDasharray="2 2" stroke="#334155" />
                <XAxis dataKey="year" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} width={36} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 11 }}
                  formatter={(v: number | undefined) => [`$${v ?? 0}M`, '']} />
                <ReferenceLine y={0} stroke="#475569" />
                <Bar dataKey="revenue" name="Revenue" fill="#22c55e" radius={[2,2,0,0]} />
                <Bar dataKey="opex" name="OPEX" fill="#ef4444" radius={[2,2,0,0]} />
                <Bar dataKey="fcff" name="FCFF" fill="#3b82f6" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* DSCR timeline */}
          <div className="bg-slate-800 rounded-lg p-3">
            <h3 className="text-xs font-semibold text-slate-300 mb-2">DSCR by Year</h3>
            <div className="overflow-y-auto max-h-32">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-700">
                    <th className="text-left py-1">Yr</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">EBITDA</th>
                    <th className="text-right">DSCR</th>
                  </tr>
                </thead>
                <tbody>
                  {result.annual_cash_flows.filter(cf => cf.dscr != null).map(cf => (
                    <tr key={cf.year} className="border-b border-slate-700/30">
                      <td className="py-0.5 text-slate-400">{cf.year}</td>
                      <td className="text-right text-green-400">${cf.revenue_musd.toFixed(1)}M</td>
                      <td className="text-right">${cf.ebitda_musd.toFixed(1)}M</td>
                      <td className={`text-right font-medium ${(cf.dscr ?? 0) >= 1.2 ? 'text-green-400' : 'text-red-400'}`}>
                        {fmtDSCR(cf.dscr!)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'results' && !result && (
        <div className="text-xs text-slate-400 text-center py-8">
          Run the financial model to see results
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800 rounded-lg p-3 space-y-2">
      <h3 className="text-xs font-semibold text-slate-300">{title}</h3>
      {children}
    </div>
  )
}

function FInput({ label, value, onChange, step = 1000, min, max }: {
  label: string; value: number; onChange: (v: number) => void
  step?: number; min?: number; max?: number
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-slate-400 flex-1">{label}</label>
      <input type="number" value={value} step={step} min={min} max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 bg-slate-700 text-slate-200 text-xs text-right rounded px-2 py-1 border border-slate-600" />
    </div>
  )
}

function KPICard({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    green: 'text-green-400', blue: 'text-blue-400', orange: 'text-orange-400',
    red: 'text-red-400', purple: 'text-purple-400'
  }
  return (
    <div className="bg-slate-800 rounded-lg p-2.5">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className={`text-base font-bold ${colors[color] || 'text-slate-200'}`}>{value}</div>
    </div>
  )
}
