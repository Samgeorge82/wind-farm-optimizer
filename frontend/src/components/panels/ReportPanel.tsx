import { useState } from 'react'
import { useLayoutStore } from '../../store/layoutStore'
import { useFinancialStore } from '../../store/financialStore'
import { useElectricalStore } from '../../store/electricalStore'
import { useFoundationStore } from '../../store/foundationStore'
import { api } from '../../api/client'

interface ExportStatus {
  pdf: 'idle' | 'loading' | 'done' | 'error'
  excel: 'idle' | 'loading' | 'done' | 'error'
  geojson: 'idle' | 'loading' | 'done' | 'error'
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function ReportPanel() {
  const [status, setStatus] = useState<ExportStatus>({
    pdf: 'idle', excel: 'idle', geojson: 'idle',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [projectName, setProjectName] = useState('Offshore Wind Project')
  const [includeCharts, setIncludeCharts] = useState(true)
  const [includeCableSchedule, setIncludeCableSchedule] = useState(true)
  const [includeCashFlows, setIncludeCashFlows] = useState(true)

  const { turbines, aepResult, boundary } = useLayoutStore()
  const { result: finResult } = useFinancialStore()
  const { network } = useElectricalStore()
  const { summary: foundSummary } = useFoundationStore()

  function buildReportPayload() {
    return {
      project_name: projectName,
      turbines,
      boundary: boundary ?? { coordinates: [] },
      aep_result: aepResult,
      financial_result: finResult,
      electrical_network: network,
      foundation_summary: foundSummary,
      include_charts: includeCharts,
      include_cable_schedule: includeCableSchedule,
      include_cash_flows: includeCashFlows,
    }
  }

  async function exportPDF() {
    setStatus(s => ({ ...s, pdf: 'loading' }))
    setErrors(e => ({ ...e, pdf: '' }))
    try {
      const res = await api.post('/api/reports/pdf', buildReportPayload(), {
        responseType: 'blob',
      })
      downloadBlob(res.data, `${projectName.replace(/\s+/g, '_')}_report.pdf`)
      setStatus(s => ({ ...s, pdf: 'done' }))
    } catch (e: any) {
      const msg = e.response?.status === 501
        ? 'PDF export not yet implemented on server'
        : e.message
      setErrors(prev => ({ ...prev, pdf: msg }))
      setStatus(s => ({ ...s, pdf: 'error' }))
    }
  }

  async function exportExcel() {
    setStatus(s => ({ ...s, excel: 'loading' }))
    setErrors(e => ({ ...e, excel: '' }))
    try {
      const res = await api.post('/api/reports/excel', buildReportPayload(), {
        responseType: 'blob',
      })
      downloadBlob(res.data, `${projectName.replace(/\s+/g, '_')}_cashflows.xlsx`)
      setStatus(s => ({ ...s, excel: 'done' }))
    } catch (e: any) {
      const msg = e.response?.status === 501
        ? 'Excel export not yet implemented on server'
        : e.message
      setErrors(prev => ({ ...prev, excel: msg }))
      setStatus(s => ({ ...s, excel: 'error' }))
    }
  }

  async function exportGeoJSON() {
    setStatus(s => ({ ...s, geojson: 'loading' }))
    setErrors(e => ({ ...e, geojson: '' }))
    try {
      // Build GeoJSON locally from current state (no server required)
      const features: any[] = []

      // Boundary
      if (boundary?.coordinates?.length) {
        features.push({
          type: 'Feature',
          properties: { type: 'boundary', name: projectName },
          geometry: {
            type: 'Polygon',
            coordinates: [boundary.coordinates.map((p: any) => [p.lng, p.lat])],
          },
        })
      }

      // Turbines
      turbines.forEach(t => {
        features.push({
          type: 'Feature',
          properties: {
            type: 'turbine',
            id: t.id,
            wake_loss_pct: aepResult?.per_turbine_aep
              ? null  // simplified
              : null,
          },
          geometry: { type: 'Point', coordinates: [t.lng, t.lat] },
        })
      })

      // Cables
      if (network?.strings) {
        network.strings.forEach(str => {
          str.segments.forEach(seg => {
            if (seg.route_coords?.length) {
              features.push({
                type: 'Feature',
                properties: {
                  type: 'array_cable',
                  string_id: str.string_id,
                  segment_id: seg.segment_id,
                  cross_section_mm2: seg.cable_spec.cross_section_mm2,
                  losses_kw: seg.losses_kw,
                },
                geometry: { type: 'LineString', coordinates: seg.route_coords },
              })
            }
          })
        })
      }

      // OSS
      if (network?.oss) {
        features.push({
          type: 'Feature',
          properties: {
            type: 'oss',
            id: network.oss.oss_id,
            transformer_mva: network.oss.transformer_mva,
          },
          geometry: { type: 'Point', coordinates: [network.oss.lng, network.oss.lat] },
        })
      }

      const geojson = { type: 'FeatureCollection', features }
      const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' })
      downloadBlob(blob, `${projectName.replace(/\s+/g, '_')}_layout.geojson`)
      setStatus(s => ({ ...s, geojson: 'done' }))
    } catch (e: any) {
      setErrors(prev => ({ ...prev, geojson: e.message }))
      setStatus(s => ({ ...s, geojson: 'error' }))
    }
  }

  const completionItems = [
    { label: 'Boundary defined', ok: (boundary?.coordinates?.length ?? 0) > 2 },
    { label: 'Turbines placed', ok: turbines.length > 0 },
    { label: 'AEP calculated', ok: !!aepResult },
    { label: 'Electrical built', ok: !!network },
    { label: 'Foundations assessed', ok: !!foundSummary },
    { label: 'Financial modelled', ok: !!finResult },
  ]
  const completedCount = completionItems.filter(i => i.ok).length

  function statusIcon(s: string) {
    if (s === 'loading') return '⏳'
    if (s === 'done') return '✓'
    if (s === 'error') return '✗'
    return ''
  }

  return (
    <div className="panel-container">
      <h2 className="panel-title">Reports & Export</h2>

      {/* Completion checklist */}
      <div className="section-header">Project Completion</div>
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 rounded-full transition-all"
              style={{ width: `${(completedCount / completionItems.length) * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-400">{completedCount}/{completionItems.length}</span>
        </div>
        <div className="space-y-1">
          {completionItems.map(item => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              <span className={item.ok ? 'text-green-400' : 'text-gray-500'}>
                {item.ok ? '✓' : '○'}
              </span>
              <span className={item.ok ? 'text-gray-300' : 'text-gray-500'}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Project name */}
      <div className="param-row mb-4">
        <label>Project Name</label>
        <input
          type="text"
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
          className="input-field"
          placeholder="My Offshore Wind Project"
        />
      </div>

      {/* Report options */}
      <div className="section-header">Report Options</div>
      <div className="space-y-2 mb-4">
        {[
          { key: 'includeCharts', label: 'Include charts (CAPEX pie, LCOE, waterfall)', value: includeCharts, set: setIncludeCharts },
          { key: 'includeCableSchedule', label: 'Include cable schedule table', value: includeCableSchedule, set: setIncludeCableSchedule },
          { key: 'includeCashFlows', label: 'Include annual cash flow table', value: includeCashFlows, set: setIncludeCashFlows },
        ].map(opt => (
          <label key={opt.key} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={opt.value}
              onChange={e => opt.set(e.target.checked)}
              className="accent-cyan-500"
            />
            {opt.label}
          </label>
        ))}
      </div>

      {/* Export buttons */}
      <div className="section-header">Export</div>
      <div className="space-y-2">

        {/* PDF */}
        <div>
          <button
            onClick={exportPDF}
            disabled={status.pdf === 'loading'}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <span>📄</span>
            <span>
              {status.pdf === 'loading' ? 'Generating PDF...' : 'Export PDF Report'}
            </span>
            {statusIcon(status.pdf) && (
              <span className={status.pdf === 'done' ? 'text-green-400' : 'text-red-400'}>
                {statusIcon(status.pdf)}
              </span>
            )}
          </button>
          {errors.pdf && <p className="text-red-400 text-xs mt-1">{errors.pdf}</p>}
          <p className="text-xs text-gray-500 mt-1">
            Executive summary, site overview, AEP, electrical, foundation, financials
          </p>
        </div>

        {/* Excel */}
        <div>
          <button
            onClick={exportExcel}
            disabled={status.excel === 'loading'}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <span>📊</span>
            <span>
              {status.excel === 'loading' ? 'Building Excel...' : 'Export Excel (Cash Flows + Cable Schedule)'}
            </span>
            {statusIcon(status.excel) && (
              <span className={status.excel === 'done' ? 'text-green-400' : 'text-red-400'}>
                {statusIcon(status.excel)}
              </span>
            )}
          </button>
          {errors.excel && <p className="text-red-400 text-xs mt-1">{errors.excel}</p>}
          <p className="text-xs text-gray-500 mt-1">
            Annual cash flow model, CAPEX breakdown, cable schedule, foundation costs
          </p>
        </div>

        {/* GeoJSON */}
        <div>
          <button
            onClick={exportGeoJSON}
            disabled={status.geojson === 'loading'}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <span>🗺️</span>
            <span>
              {status.geojson === 'loading' ? 'Building GeoJSON...' : 'Export GeoJSON Layout'}
            </span>
            {statusIcon(status.geojson) && (
              <span className={status.geojson === 'done' ? 'text-green-400' : 'text-red-400'}>
                {statusIcon(status.geojson)}
              </span>
            )}
          </button>
          {errors.geojson && <p className="text-red-400 text-xs mt-1">{errors.geojson}</p>}
          <p className="text-xs text-gray-500 mt-1">
            Boundary polygon, turbine positions, array cables, OSS location
          </p>
        </div>
      </div>

      {/* Quick summary */}
      {(turbines.length > 0 || finResult) && (
        <div className="mt-4">
          <div className="section-header">Quick Summary</div>
          <div className="kpi-grid">
            {turbines.length > 0 && (
              <div className="kpi-card">
                <div className="kpi-label">Turbines</div>
                <div className="kpi-value">{turbines.length}</div>
              </div>
            )}
            {aepResult && (
              <>
                <div className="kpi-card">
                  <div className="kpi-label">Net AEP</div>
                  <div className="kpi-value">{aepResult.aep_gwh.toFixed(1)} GWh</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">Wake Loss</div>
                  <div className="kpi-value">{(aepResult.wake_loss_pct * 100).toFixed(1)}%</div>
                </div>
              </>
            )}
            {finResult && (
              <>
                <div className="kpi-card">
                  <div className="kpi-label">Project IRR</div>
                  <div className="kpi-value text-cyan-400">
                    {(finResult.project_irr * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">LCOE</div>
                  <div className="kpi-value">${finResult.lcoe_usd_mwh.toFixed(1)}/MWh</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">NPV</div>
                  <div className="kpi-value">${finResult.npv_musd.toFixed(0)}M</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
