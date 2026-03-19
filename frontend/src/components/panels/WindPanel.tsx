import { useState } from 'react'
import toast from 'react-hot-toast'
import { useWindStore } from '../../store/windStore'
import { useLayoutStore } from '../../store/layoutStore'
import { WindRoseChart } from '../charts/WindRoseChart'
import { fetchWindData } from '../../api'
import type { WindFetchResponse } from '../../api'

const SECTOR_NAMES_12 = ['N','NNE','NE','E','SE','SSE','S','SSW','SW','W','NW','NNW']

export default function WindPanel() {
  const { windRose, updateSector, setWindRose } = useWindStore()
  const { boundary } = useLayoutStore()
  const totalFreq = windRose.sectors.reduce((s, x) => s + x.frequency, 0)

  const [fetching, setFetching] = useState(false)
  const [fetchResult, setFetchResult] = useState<WindFetchResponse | null>(null)
  const [years, setYears] = useState(5)

  // Compute site center from boundary
  const siteCenter = boundary ? {
    lat: boundary.coordinates.reduce((s, c) => s + c.lat, 0) / boundary.coordinates.length,
    lng: boundary.coordinates.reduce((s, c) => s + c.lng, 0) / boundary.coordinates.length,
  } : null

  const handleFetchWind = async () => {
    if (!siteCenter) {
      toast.error('Draw a site boundary first to fetch wind data')
      return
    }

    setFetching(true)
    try {
      const result = await fetchWindData({
        lat: siteCenter.lat,
        lng: siteCenter.lng,
        n_sectors: 12,
        years,
      })
      setWindRose(result.wind_rose)
      setFetchResult(result)
      toast.success(`Wind data loaded: ${result.mean_speed_ms} m/s mean at 100m`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch wind data')
    } finally {
      setFetching(false)
    }
  }

  // Compute weighted mean speed from Weibull: sum(freq * A * Gamma(1 + 1/k))
  const meanSpeed = windRose.sectors.reduce((sum, s) => {
    // Approximation: mean = A * 0.886 for k=2; general: A * Gamma(1+1/k)
    // Using Stirling-like approximation for Gamma
    const gamma1pk = Math.exp(lgamma(1 + 1 / s.k))
    return sum + s.frequency * s.A * gamma1pk
  }, 0)

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Wind Resource</h2>

      {/* Auto-fetch from ERA5 */}
      <div className="bg-gradient-to-r from-blue-900/40 to-cyan-900/40 rounded-lg p-3 border border-blue-700/50">
        <h3 className="text-xs font-semibold text-blue-300 mb-2 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
          </svg>
          ERA5 Reanalysis Data
        </h3>
        <p className="text-[10px] text-slate-400 mb-2">
          Fetch real wind data at 100m height from ECMWF ERA5 reanalysis for your site location.
          {siteCenter && (
            <span className="text-blue-400 ml-1">
              Site: {siteCenter.lat.toFixed(3)}N, {siteCenter.lng.toFixed(3)}E
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-slate-400">Years:</label>
          <select
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            className="bg-slate-700 text-slate-200 text-xs rounded px-1.5 py-0.5 border border-slate-600"
          >
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
          <button
            onClick={handleFetchWind}
            disabled={fetching || !siteCenter}
            className={`flex-1 text-xs font-medium py-1.5 rounded transition-colors ${
              fetching
                ? 'bg-blue-800 text-blue-300 cursor-wait'
                : siteCenter
                  ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            {fetching ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Fetching ERA5 data...
              </span>
            ) : siteCenter ? 'Fetch Wind Data' : 'Draw Boundary First'}
          </button>
        </div>

        {/* Fetch result summary */}
        {fetchResult && (
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <div className="bg-slate-800/60 rounded p-1.5 text-center">
              <div className="text-[10px] text-slate-400">Mean Speed</div>
              <div className="text-sm font-bold text-blue-300">{fetchResult.mean_speed_ms} m/s</div>
            </div>
            <div className="bg-slate-800/60 rounded p-1.5 text-center">
              <div className="text-[10px] text-slate-400">Data Period</div>
              <div className="text-sm font-bold text-blue-300">{fetchResult.data_years} years</div>
            </div>
            <div className="bg-slate-800/60 rounded p-1.5 text-center">
              <div className="text-[10px] text-slate-400">Source</div>
              <div className="text-[10px] font-medium text-blue-300">ERA5 100m</div>
            </div>
          </div>
        )}
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-800 rounded-lg p-2 text-center">
          <div className="text-[10px] text-slate-400">Mean Speed (100m)</div>
          <div className="text-lg font-bold text-emerald-400">{meanSpeed.toFixed(1)} m/s</div>
        </div>
        <div className="bg-slate-800 rounded-lg p-2 text-center">
          <div className="text-[10px] text-slate-400">Wind Power Density</div>
          <div className="text-lg font-bold text-emerald-400">{(0.5 * 1.225 * meanSpeed ** 3).toFixed(0)} W/m2</div>
        </div>
      </div>

      {/* Wind rose chart */}
      <WindRoseChart windRose={windRose} />

      {/* Sector editor */}
      <div className="bg-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold text-slate-300 mb-2">
          Weibull Parameters by Sector
          <span className={`ml-2 ${Math.abs(totalFreq - 1) < 0.01 ? 'text-green-400' : 'text-red-400'}`}>
            ({'\u03A3'}freq = {totalFreq.toFixed(2)})
          </span>
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="py-1 text-left">Dir</th>
                <th className="py-1 text-center">k</th>
                <th className="py-1 text-center">A (m/s)</th>
                <th className="py-1 text-center">Freq %</th>
              </tr>
            </thead>
            <tbody>
              {windRose.sectors.map((s, i) => (
                <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="py-1 text-slate-400 font-medium pr-2">
                    {windRose.n_sectors === 12 ? SECTOR_NAMES_12[i] : `S${i + 1}`}
                  </td>
                  <td className="py-0.5 px-1">
                    <input
                      type="number" step="0.1" min="1" max="5"
                      value={s.k.toFixed(1)}
                      onChange={(e) => updateSector(i, parseFloat(e.target.value), undefined, undefined)}
                      className="w-14 bg-slate-700 text-slate-200 text-center rounded px-1 py-0.5 border border-slate-600"
                    />
                  </td>
                  <td className="py-0.5 px-1">
                    <input
                      type="number" step="0.5" min="1" max="25"
                      value={s.A.toFixed(1)}
                      onChange={(e) => updateSector(i, undefined, parseFloat(e.target.value), undefined)}
                      className="w-14 bg-slate-700 text-slate-200 text-center rounded px-1 py-0.5 border border-slate-600"
                    />
                  </td>
                  <td className="py-0.5 px-1">
                    <input
                      type="number" step="0.5" min="0" max="50"
                      value={(s.frequency * 100).toFixed(1)}
                      onChange={(e) => updateSector(i, undefined, undefined, parseFloat(e.target.value) / 100)}
                      className="w-14 bg-slate-700 text-slate-200 text-center rounded px-1 py-0.5 border border-slate-600"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ref height */}
      <div className="bg-slate-800 rounded-lg p-3 space-y-2">
        <h3 className="text-xs font-semibold text-slate-300">Measurement Settings</h3>
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400 flex-1">Reference height (m)</label>
          <input
            type="number" value={windRose.reference_height_m} readOnly
            className="w-20 bg-slate-700 text-slate-200 text-center rounded px-2 py-1 text-xs border border-slate-600"
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Log-gamma function (Lanczos approximation) for computing Gamma(1 + 1/k)
 * Used to calculate mean wind speed from Weibull: mean = A * Gamma(1 + 1/k)
 */
function lgamma(x: number): number {
  const g = 7
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ]

  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x)
  }

  x -= 1
  let a = c[0]
  const t = x + g + 0.5
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i)
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}
