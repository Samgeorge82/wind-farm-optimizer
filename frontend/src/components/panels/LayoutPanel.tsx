import { useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useLayoutStore } from '../../store/layoutStore'
import { useTurbineStore } from '../../store/turbineStore'
import { useWindStore } from '../../store/windStore'
import { useUIStore } from '../../store/uiStore'
import { useFinancialStore } from '../../store/financialStore'
import { useElectricalStore } from '../../store/electricalStore'
import { startOptimization, buildElectrical } from '../../api'
import { useJobPolling } from '../../hooks/useJobPolling'
import { CoordinateTransformer } from '../../utils/geo'

type Objective = 'aep' | 'lcoe' | 'irr' | 'npv'

const OBJECTIVE_INFO: Record<Objective, { label: string; desc: string; color: string }> = {
  aep:  { label: 'Max AEP',  desc: 'Maximize annual energy production',                color: 'text-emerald-400' },
  lcoe: { label: 'Min LCOE', desc: 'Minimize levelized cost of energy (full-cost)',     color: 'text-amber-400' },
  irr:  { label: 'Max IRR',  desc: 'Maximize internal rate of return (full-cost)',      color: 'text-blue-400' },
  npv:  { label: 'Max NPV',  desc: 'Maximize net present value (full-cost)',            color: 'text-purple-400' },
}

interface SweepConfigResult {
  n_turbines: number
  voltage_kv: number
  string_size: number
  status: string
  objective_value?: number
  reason?: string
}

interface OptResult {
  aep_gwh: number
  gross_aep_gwh: number
  wake_loss_pct: number
  capacity_factor: number
  lcoe_usd_mwh?: number
  project_irr?: number
  npv_musd?: number
  total_capex_musd?: number
  equity_irr?: number
  payback_year?: number
  cost_breakdown?: Record<string, number>
  objective: string
  n_turbines: number
  chosen_config?: { n_turbines: number; array_voltage_kv: number; max_turbines_per_string: number }
  sweep_results?: SweepConfigResult[]
}

export default function LayoutPanel() {
  const { boundary, turbines, setTurbines, setJobId, optimizationJobId } = useLayoutStore()
  const { selectedTurbine } = useTurbineStore()
  const { windRose } = useWindStore()
  const { wakeModelType } = useUIStore()
  const { inputs: finInputs } = useFinancialStore()

  const [nTurbines, setNTurbines] = useState(20)
  const [spacingD, setSpacingD] = useState(4.0)
  const [method, setMethod] = useState('cobyla')
  const [maxIter, setMaxIter] = useState(150)
  const [objective, setObjective] = useState<Objective>('aep')
  const [jobProgress, setJobProgress] = useState(0)
  const [jobMsg, setJobMsg] = useState('')
  const [running, setRunning] = useState(false)

  // Site parameters for full-cost computation
  const [waterDepth, setWaterDepth] = useState(30)
  const [distanceToShore, setDistanceToShore] = useState(50)

  // ── Auto-optimization toggles ──
  const [autoTurbineCount, setAutoTurbineCount] = useState(false)
  const [turbineCountMin, setTurbineCountMin] = useState(10)
  const [turbineCountMax, setTurbineCountMax] = useState(30)
  const [turbineCountStep, setTurbineCountStep] = useState(5)

  const [autoStringSize, setAutoStringSize] = useState(false)
  const [stringSizeOptions, setStringSizeOptions] = useState([4, 6, 8])

  const [autoVoltage, setAutoVoltage] = useState(false)
  const [voltageFixed, setVoltageFixed] = useState(33)

  // Persistent results
  const [result, setResult] = useState<OptResult | null>(null)

  // Compute turbine count range for display
  const turbineCountRange = useMemo(() => {
    if (!autoTurbineCount) return [nTurbines]
    const vals: number[] = []
    for (let n = turbineCountMin; n <= turbineCountMax; n += turbineCountStep) {
      vals.push(n)
    }
    if (vals.length === 0) vals.push(turbineCountMin)
    return vals
  }, [autoTurbineCount, turbineCountMin, turbineCountMax, turbineCountStep, nTurbines])

  // Compute total sweep combos
  const sweepComboCount = useMemo(() => {
    const nt = autoTurbineCount ? turbineCountRange.length : 1
    const ss = autoStringSize ? stringSizeOptions.length : 1
    const vt = autoVoltage ? 2 : 1
    return nt * ss * vt
  }, [autoTurbineCount, turbineCountRange, autoStringSize, stringSizeOptions, autoVoltage])

  useJobPolling(
    optimizationJobId,
    (job) => {
      setRunning(false)
      setJobProgress(100)
      setJobMsg('Complete')
      if (job.result?.turbines) {
        setTurbines(job.result.turbines.map((t: any) => ({
          id: t.id, lat: t.lat, lng: t.lng, x: t.x, y: t.y,
          aep_gwh: t.aep_gwh, wake_loss: t.wake_loss,
        })))
        const { setAEPResult } = useLayoutStore.getState()
        if (job.result.aep_gwh != null) {
          setAEPResult({
            aep_gwh: job.result.aep_gwh,
            gross_aep_gwh: job.result.gross_aep_gwh ?? 0,
            wake_loss_pct: job.result.wake_loss_pct ?? 0,
            capacity_factor: job.result.capacity_factor ?? 0,
            per_turbine_aep: job.result.per_turbine_aep ?? [],
            per_turbine_wake_loss: job.result.per_turbine_wake_loss ?? [],
            energy_by_direction: job.result.energy_by_direction ?? [],
          })
        }

        // Store full results for persistent display
        setResult({
          aep_gwh: job.result.aep_gwh,
          gross_aep_gwh: job.result.gross_aep_gwh ?? 0,
          wake_loss_pct: job.result.wake_loss_pct ?? 0,
          capacity_factor: job.result.capacity_factor ?? 0,
          lcoe_usd_mwh: job.result.lcoe_usd_mwh,
          project_irr: job.result.project_irr,
          npv_musd: job.result.npv_musd,
          total_capex_musd: job.result.total_capex_musd,
          equity_irr: job.result.equity_irr,
          payback_year: job.result.payback_year,
          cost_breakdown: job.result.cost_breakdown,
          objective: job.result.objective || objective,
          n_turbines: job.result.turbines.length,
          chosen_config: job.result.chosen_config,
          sweep_results: job.result.sweep_results,
        })

        // Build completion toast with relevant metric
        const obj = job.result.objective || objective
        let summary = `${job.result.turbines.length} turbines placed`
        if (job.result.aep_gwh != null) summary += ` | AEP: ${job.result.aep_gwh.toFixed(1)} GWh`
        if (obj === 'lcoe' && job.result.lcoe_usd_mwh != null) {
          summary += ` | LCOE: $${job.result.lcoe_usd_mwh.toFixed(1)}/MWh`
        } else if (obj === 'irr' && job.result.project_irr != null) {
          summary += ` | IRR: ${(job.result.project_irr * 100).toFixed(1)}%`
        } else if (obj === 'npv' && job.result.npv_musd != null) {
          summary += ` | NPV: $${job.result.npv_musd.toFixed(1)}M`
        }
        if (job.result.chosen_config && job.result.sweep_results) {
          summary += ` (best of ${job.result.sweep_results.length} configs)`
        }
        toast.success(summary, { duration: 6000 })

        // Auto-rebuild electrical network with new turbine positions
        _rebuildElectrical(job.result.turbines)
      }
      setJobId(null)
    },
    (msg) => {
      setRunning(false)
      setJobMsg('')
      toast.error(`Optimization failed: ${msg}`, { duration: 8000 })
      setJobId(null)
    },
    (progress, message) => {
      setJobProgress(progress)
      setJobMsg(message)
    }
  )

  /** Build financial_params payload from the financial store inputs */
  const buildFinancialParams = () => ({
    project_lifetime_years: finInputs.projectLifetime,
    construction_years: 3,
    capex_draw_schedule: [0.20, 0.50, 0.30],
    wacc: finInputs.wacc,
    tax_rate: finInputs.taxRate,
    depreciation_years: 15,
    inflation_rate: 0.025,
    debt: {
      debt_fraction: finInputs.debtFraction,
      interest_rate: finInputs.interestRate,
      loan_tenor_years: finInputs.loanTenorYears,
      grace_period_years: 2,
      amortization: 'annuity',
    },
    energy_price: {
      base_price_usd_mwh: finInputs.energyPriceUsdMwh,
      escalation_rate: finInputs.escalationRate,
    },
    capex: {
      turbine_supply_usd_mw: finInputs.turbineSupplyUsdMw,
      turbine_installation_usd_mw: finInputs.turbineInstallUsdMw,
      oss_total_musd: finInputs.ossUsdMusd,
      export_cable_total_km: finInputs.exportCableLengthKm,
      installation_vessels_musd: finInputs.installationVesselsMusd,
    },
    opex: {
      fixed_usd_mw_year: finInputs.fixedOpexUsdMwYear,
      variable_usd_mwh: finInputs.variableOpexUsdMwh,
    },
  })

  /** Auto-rebuild electrical network after optimization */
  const _rebuildElectrical = async (newTurbines: any[]) => {
    if (!boundary || !selectedTurbine || newTurbines.length === 0) return
    try {
      const transformer = CoordinateTransformer.fromBoundary(boundary)
      const turbinesWithLocal = newTurbines.map((t: any) => {
        const { x, y } = transformer.geoToLocal(t.lat, t.lng)
        return { ...t, x, y }
      })
      const cen = boundary.coordinates.reduce(
        (a, c) => ({ lat: a.lat + c.lat / boundary.coordinates.length, lng: a.lng + c.lng / boundary.coordinates.length }),
        { lat: 0, lng: 0 }
      )
      const elecStore = useElectricalStore.getState()
      const elecResult = await buildElectrical({
        turbines: turbinesWithLocal,
        boundary,
        turbine_spec: selectedTurbine,
        array_voltage_kv: elecStore.arrayVoltageKv,
        max_turbines_per_string: elecStore.maxTurbinesPerString,
        shore_point: cen,
        distance_to_shore_km: elecStore.distanceToShoreKm,
      })
      elecStore.setNetwork(elecResult)
    } catch {
      // Silently fail — user can manually rebuild from Electrical panel
    }
  }

  const handleRun = async () => {
    if (!boundary) return toast.error('Draw a site boundary first')
    if (!selectedTurbine) return toast.error('Select a turbine first')

    try {
      setRunning(true)
      setJobProgress(0)
      setJobMsg('Starting...')
      setResult(null)
      // Clear stale electrical network while optimization runs
      useElectricalStore.getState().setNetwork(null)

      const elecStore = useElectricalStore.getState()

      const payload: any = {
        boundary,
        turbine_spec: selectedTurbine,
        wind_rose: windRose,
        n_turbines: autoTurbineCount ? turbineCountRange[0] : nTurbines,
        min_spacing_diameters: spacingD,
        wake_model: wakeModelType,
        method,
        max_iterations: maxIter,
        objective,
        water_depth_m: waterDepth,
        distance_to_shore_km: distanceToShore,
        array_voltage_kv: autoVoltage ? 33 : voltageFixed,
        max_turbines_per_string: autoStringSize ? stringSizeOptions[0] : elecStore.maxTurbinesPerString,
      }

      // ── Auto-optimization sweep ranges ──
      if (autoTurbineCount && turbineCountRange.length > 1) {
        payload.n_turbines_range = turbineCountRange
      }
      if (autoStringSize && stringSizeOptions.length > 1) {
        payload.string_size_range = stringSizeOptions
      }
      if (autoVoltage) {
        payload.voltage_options = [33, 66]
      }

      // Include financial params for LCOE/IRR/NPV objectives
      if (objective !== 'aep') {
        payload.financial_params = buildFinancialParams()
      }

      const resp = await startOptimization(payload)
      setJobId(resp.job_id)

      const sweepNote = sweepComboCount > 1 ? ` (sweeping ${sweepComboCount} configs)` : ''
      toast(`${OBJECTIVE_INFO[objective].label} optimization started...${sweepNote}`)
    } catch (e: any) {
      setRunning(false)
      toast.error(e.message)
    }
  }

  const toggleStringSizeOption = (val: number) => {
    setStringSizeOptions(prev => {
      if (prev.includes(val)) {
        const next = prev.filter(v => v !== val)
        return next.length > 0 ? next : [val] // keep at least one
      }
      return [...prev, val].sort((a, b) => a - b)
    })
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-120px)]">
      <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Layout Optimization</h2>

      {/* Objective selector */}
      <div className="bg-slate-800 rounded-lg p-3 space-y-2">
        <h3 className="text-xs font-semibold text-slate-300">Optimization Objective</h3>
        <div className="grid grid-cols-4 gap-1">
          {(Object.entries(OBJECTIVE_INFO) as [Objective, typeof OBJECTIVE_INFO.aep][]).map(([key, info]) => (
            <button
              key={key}
              onClick={() => setObjective(key)}
              className={`py-2 px-1 rounded text-center transition-all ${
                objective === key
                  ? 'bg-slate-600 ring-1 ring-blue-500'
                  : 'bg-slate-700 hover:bg-slate-650'
              }`}
            >
              <div className={`text-[11px] font-bold ${objective === key ? info.color : 'text-slate-300'}`}>
                {info.label}
              </div>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500">
          {OBJECTIVE_INFO[objective].desc}
          {objective !== 'aep' && (
            <span className="text-amber-500 block mt-0.5">
              Computes electrical, foundation &amp; all costs per layout
            </span>
          )}
        </p>
      </div>

      {/* ── Configuration ── */}
      <div className="bg-slate-800 rounded-lg p-3 space-y-3">
        <h3 className="text-xs font-semibold text-slate-300">Configuration</h3>

        {/* Turbine count: Fixed or Auto */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-400">Number of turbines</label>
            <ToggleSwitch label="Auto" checked={autoTurbineCount} onChange={setAutoTurbineCount} />
          </div>
          {autoTurbineCount ? (
            <div className="bg-slate-700/50 rounded p-2 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <NumberInput label="Min" value={turbineCountMin}
                  onChange={setTurbineCountMin} min={1} max={200} step={1} compact />
                <NumberInput label="Max" value={turbineCountMax}
                  onChange={setTurbineCountMax} min={1} max={200} step={1} compact />
                <NumberInput label="Step" value={turbineCountStep}
                  onChange={setTurbineCountStep} min={1} max={50} step={1} compact />
              </div>
              <div className="text-[10px] text-slate-500">
                Will try: {turbineCountRange.join(', ')} ({turbineCountRange.length} values)
              </div>
            </div>
          ) : (
            <NumberInput label="" value={nTurbines}
              onChange={setNTurbines} min={1} max={200} step={1} />
          )}
        </div>

        <NumberInput label="Min spacing (rotor diameters)" value={spacingD}
          onChange={setSpacingD} min={2} max={15} step={0.5} />

        <div>
          <label className="text-xs text-slate-400 block mb-1">Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}
            className="w-full bg-slate-700 text-slate-200 text-sm rounded px-2 py-1.5 border border-slate-600">
            <option value="staggered">Staggered Grid (fast baseline)</option>
            <option value="cobyla">COBYLA multi-start (local, fast)</option>
            <option value="differential_evolution">Differential Evolution (global, best quality)</option>
          </select>
        </div>

        {method !== 'staggered' && (
          <NumberInput label="Max iterations" value={maxIter}
            onChange={setMaxIter} min={50} max={1000} step={50} />
        )}
      </div>

      {/* ── Auto-Optimization: Electrical Parameters ── */}
      <div className="bg-slate-800 rounded-lg p-3 space-y-3">
        <h3 className="text-xs font-semibold text-slate-300">Electrical Configuration</h3>

        {/* Array Voltage */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-400">Array voltage</label>
            <ToggleSwitch label="Auto" checked={autoVoltage} onChange={setAutoVoltage} />
          </div>
          {autoVoltage ? (
            <div className="text-[10px] text-slate-500 bg-slate-700/50 rounded p-2">
              Will compare 33 kV vs 66 kV and pick the best
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setVoltageFixed(33)}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition-all ${
                  voltageFixed === 33
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-650'
                }`}
              >
                33 kV
              </button>
              <button
                onClick={() => setVoltageFixed(66)}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition-all ${
                  voltageFixed === 66
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-650'
                }`}
              >
                66 kV
              </button>
            </div>
          )}
        </div>

        {/* Turbines per string */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-400">Turbines per string</label>
            <ToggleSwitch label="Auto" checked={autoStringSize} onChange={setAutoStringSize} />
          </div>
          {autoStringSize ? (
            <div className="bg-slate-700/50 rounded p-2 space-y-1.5">
              <div className="flex flex-wrap gap-1.5">
                {[3, 4, 5, 6, 7, 8, 10, 12].map(v => (
                  <button
                    key={v}
                    onClick={() => toggleStringSizeOption(v)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                      stringSizeOptions.includes(v)
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-600 text-slate-400 hover:bg-slate-500'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-slate-500">
                Selected: {stringSizeOptions.join(', ')} ({stringSizeOptions.length} values)
              </div>
            </div>
          ) : (
            <NumberInput label="" value={useElectricalStore.getState().maxTurbinesPerString}
              onChange={(v) => useElectricalStore.getState().setMaxPerString(v)}
              min={2} max={20} step={1} />
          )}
        </div>
      </div>

      {/* Site Parameters */}
      <div className="bg-slate-800 rounded-lg p-3 space-y-3">
        <h3 className="text-xs font-semibold text-slate-300">Site Parameters</h3>
        <NumberInput label="Water depth (m)" value={waterDepth}
          onChange={setWaterDepth} min={5} max={300} step={5} />
        <NumberInput label="Distance to shore (km)" value={distanceToShore}
          onChange={setDistanceToShore} min={1} max={500} step={5} />
      </div>

      {/* Sweep summary */}
      {sweepComboCount > 1 && (
        <div className="bg-indigo-900/30 border border-indigo-700/50 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <span className="text-indigo-400 text-sm">&#x1F50D;</span>
            <div>
              <div className="text-xs font-semibold text-indigo-300">
                Parametric Sweep: {sweepComboCount} configurations
              </div>
              <div className="text-[10px] text-indigo-400/80">
                {autoTurbineCount && <span>Turbines: {turbineCountRange.join('/')}</span>}
                {autoTurbineCount && (autoStringSize || autoVoltage) && <span> &times; </span>}
                {autoVoltage && <span>Voltage: 33/66kV</span>}
                {autoVoltage && autoStringSize && <span> &times; </span>}
                {autoStringSize && <span>String: {stringSizeOptions.join('/')}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      {running && (
        <div className="bg-slate-800 rounded-lg p-3">
          <div className="flex justify-between text-xs text-slate-400 mb-1.5">
            <span className="truncate max-w-[200px]">{jobMsg || 'Running...'}</span>
            <span>{jobProgress.toFixed(0)}%</span>
          </div>
          <div className="h-2 bg-slate-700 rounded overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300 rounded"
              style={{ width: `${jobProgress}%` }}
            />
          </div>
        </div>
      )}

      <button
        onClick={handleRun}
        disabled={running || !boundary || !selectedTurbine}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded font-medium text-sm transition-colors"
      >
        {running ? 'Optimizing...' : `Run: ${OBJECTIVE_INFO[objective].label}`}
        {!running && sweepComboCount > 1 && ` (${sweepComboCount} configs)`}
      </button>

      <div className="text-xs text-slate-500">
        {!boundary && 'Draw boundary first'}
        {boundary && !selectedTurbine && 'Select turbine first'}
        {boundary && selectedTurbine && turbines.length > 0 && !result && (
          <span className="text-slate-400">{turbines.length} turbines on map (will be replaced)</span>
        )}
      </div>

      {/* ─── Results Panel ─── */}
      {result && (
        <div className="bg-slate-800 rounded-lg p-3 space-y-3 border border-slate-600">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
              Optimization Results
            </h3>
            <span className="text-[10px] bg-emerald-900/50 text-emerald-300 px-2 py-0.5 rounded">
              {OBJECTIVE_INFO[result.objective as Objective]?.label || result.objective.toUpperCase()}
            </span>
          </div>

          {/* Chosen config (if sweep) */}
          {result.chosen_config && result.sweep_results && (
            <div className="bg-blue-900/20 border border-blue-800/40 rounded p-2">
              <div className="text-[10px] font-semibold text-blue-300 mb-1">
                Best Configuration (of {result.sweep_results.length} tested)
              </div>
              <div className="grid grid-cols-3 gap-1 text-[10px]">
                <div className="text-slate-400">
                  Turbines: <span className="text-blue-200 font-semibold">{result.chosen_config.n_turbines}</span>
                </div>
                <div className="text-slate-400">
                  Voltage: <span className="text-blue-200 font-semibold">{result.chosen_config.array_voltage_kv}kV</span>
                </div>
                <div className="text-slate-400">
                  String: <span className="text-blue-200 font-semibold">{result.chosen_config.max_turbines_per_string}/str</span>
                </div>
              </div>
            </div>
          )}

          {/* Energy KPIs */}
          <div className="grid grid-cols-2 gap-2">
            <KPI label="Turbines" value={result.n_turbines.toString()} />
            <KPI label="AEP" value={`${result.aep_gwh.toFixed(1)} GWh`} />
            <KPI label="Gross AEP" value={`${result.gross_aep_gwh.toFixed(1)} GWh`} />
            <KPI label="Wake Loss" value={`${result.wake_loss_pct.toFixed(1)}%`} />
            <KPI label="Cap. Factor" value={`${(result.capacity_factor * 100).toFixed(1)}%`} />
          </div>

          {/* Financial KPIs (if available) */}
          {(result.lcoe_usd_mwh != null || result.npv_musd != null) && (
            <>
              <div className="border-t border-slate-700 pt-2">
                <h4 className="text-[10px] font-semibold text-slate-400 mb-2 uppercase">Financial</h4>
                <div className="grid grid-cols-2 gap-2">
                  {result.total_capex_musd != null && (
                    <KPI label="Total CAPEX" value={`$${result.total_capex_musd.toFixed(1)}M`} highlight />
                  )}
                  {result.lcoe_usd_mwh != null && (
                    <KPI label="LCOE" value={`$${result.lcoe_usd_mwh.toFixed(1)}/MWh`}
                      highlight={result.objective === 'lcoe'} />
                  )}
                  {result.project_irr != null && (
                    <KPI label="Project IRR" value={`${(result.project_irr * 100).toFixed(2)}%`}
                      highlight={result.objective === 'irr'} />
                  )}
                  {result.npv_musd != null && (
                    <KPI label="NPV" value={`$${result.npv_musd.toFixed(1)}M`}
                      highlight={result.objective === 'npv'} />
                  )}
                  {result.equity_irr != null && (
                    <KPI label="Equity IRR" value={`${(result.equity_irr * 100).toFixed(2)}%`} />
                  )}
                  {result.payback_year != null && (
                    <KPI label="Payback" value={`Year ${result.payback_year}`} />
                  )}
                </div>
              </div>
            </>
          )}

          {/* Cost Breakdown */}
          {result.cost_breakdown && !result.cost_breakdown.error && (
            <div className="border-t border-slate-700 pt-2">
              <h4 className="text-[10px] font-semibold text-slate-400 mb-2 uppercase">CAPEX Breakdown</h4>
              <div className="space-y-1">
                <CostRow label="Turbines" value={result.cost_breakdown.turbine_cost_musd} />
                <CostRow label="Foundations" value={result.cost_breakdown.foundation_cost_musd} />
                <CostRow label="Array Cables" value={result.cost_breakdown.array_cable_cost_musd}
                  sub={result.cost_breakdown.array_cable_total_km
                    ? `${result.cost_breakdown.array_cable_total_km.toFixed(1)} km` : undefined} />
                <CostRow label="OSS" value={result.cost_breakdown.oss_cost_musd} />
                <CostRow label="Export Cable" value={result.cost_breakdown.export_cable_cost_musd} />
                <CostRow label="Installation" value={result.cost_breakdown.installation_cost_musd} />
                <CostRow label="Onshore Sub." value={result.cost_breakdown.onshore_cost_musd} />
                <CostRow label="Soft Costs" value={result.cost_breakdown.soft_cost_musd} />
                <div className="flex justify-between text-xs font-bold text-slate-200 pt-1 border-t border-slate-600">
                  <span>Total CAPEX</span>
                  <span>${result.cost_breakdown.total_capex_musd?.toFixed(1)}M</span>
                </div>
              </div>
            </div>
          )}

          {/* Sweep Results Table */}
          {result.sweep_results && result.sweep_results.length > 1 && (
            <div className="border-t border-slate-700 pt-2">
              <h4 className="text-[10px] font-semibold text-slate-400 mb-2 uppercase">
                All Configurations Tested
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-700">
                      <th className="text-left py-1 pr-2">Turbines</th>
                      <th className="text-left py-1 pr-2">Voltage</th>
                      <th className="text-left py-1 pr-2">String</th>
                      <th className="text-right py-1">
                        {result.objective === 'aep' ? 'AEP (GWh)' :
                         result.objective === 'lcoe' ? 'LCOE ($/MWh)' :
                         result.objective === 'irr' ? 'IRR (%)' : 'NPV ($M)'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.sweep_results.map((sr, idx) => {
                      const isBest = result.chosen_config &&
                        sr.n_turbines === result.chosen_config.n_turbines &&
                        sr.voltage_kv === result.chosen_config.array_voltage_kv &&
                        sr.string_size === result.chosen_config.max_turbines_per_string
                      return (
                        <tr key={idx} className={`border-b border-slate-700/50 ${
                          isBest ? 'bg-blue-900/20' : ''
                        }`}>
                          <td className="py-1 pr-2 text-slate-300">{sr.n_turbines}</td>
                          <td className="py-1 pr-2 text-slate-300">{sr.voltage_kv}kV</td>
                          <td className="py-1 pr-2 text-slate-300">{sr.string_size}/str</td>
                          <td className="py-1 text-right">
                            {sr.status === 'ok' ? (
                              <span className={isBest ? 'text-blue-300 font-bold' : 'text-slate-300'}>
                                {result.objective === 'irr'
                                  ? `${((sr.objective_value || 0) * 100).toFixed(2)}%`
                                  : (sr.objective_value || 0).toFixed(1)}
                                {isBest && ' *'}
                              </span>
                            ) : (
                              <span className="text-red-400 italic">{sr.reason || 'skipped'}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Sub-components ─── */

function ToggleSwitch({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-1.5 group"
    >
      <span className={`text-[10px] font-medium ${checked ? 'text-blue-400' : 'text-slate-500'}`}>
        {label}
      </span>
      <div className={`relative w-7 h-4 rounded-full transition-colors ${
        checked ? 'bg-blue-600' : 'bg-slate-600'
      }`}>
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-3.5' : 'translate-x-0.5'
        }`} />
      </div>
    </button>
  )
}

function NumberInput({
  label, value, onChange, min, max, step, compact
}: {
  label: string; value: number; onChange: (v: number) => void
  min: number; max: number; step: number; compact?: boolean
}) {
  return (
    <div>
      {label && <label className={`text-xs text-slate-400 block ${compact ? 'mb-0.5' : 'mb-1'}`}>{label}</label>}
      <input
        type="number" value={value} min={min} max={max} step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`w-full bg-slate-700 text-slate-200 rounded border border-slate-600 focus:outline-none focus:border-blue-500 ${
          compact ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1.5'
        }`}
      />
    </div>
  )
}

function KPI({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded p-1.5 ${highlight ? 'bg-blue-900/30 ring-1 ring-blue-700' : 'bg-slate-700/50'}`}>
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className={`text-xs font-semibold ${highlight ? 'text-blue-300' : 'text-slate-200'}`}>{value}</div>
    </div>
  )
}

function CostRow({ label, value, sub }: { label: string; value?: number; sub?: string }) {
  if (value == null) return null
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-slate-400">
        {label}
        {sub && <span className="text-slate-500 ml-1">({sub})</span>}
      </span>
      <span className="text-slate-300">${value.toFixed(1)}M</span>
    </div>
  )
}
