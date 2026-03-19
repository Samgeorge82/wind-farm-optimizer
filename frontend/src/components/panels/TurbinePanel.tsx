import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTurbineStore } from '../../store/turbineStore'
import { useLayoutStore } from '../../store/layoutStore'
import { getTurbines } from '../../api'
import { PowerCurveChart } from '../charts/PowerCurveChart'

export default function TurbinePanel() {
  const { turbineLibrary, selectedTurbine, setLibrary, setSelectedTurbine } = useTurbineStore()
  const { setMapMode } = useLayoutStore()

  const { data, isLoading } = useQuery({
    queryKey: ['turbines'],
    queryFn: getTurbines,
  })

  useEffect(() => {
    if (data && !selectedTurbine) {
      setLibrary(data)
      setSelectedTurbine(data[0])
    }
  }, [data])

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Turbine Selection</h2>

      {isLoading && <div className="text-slate-400 text-xs">Loading turbines...</div>}

      <div className="space-y-2">
        {turbineLibrary.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedTurbine(t)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              selectedTurbine?.id === t.id
                ? 'bg-blue-900 border-blue-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            <div className="font-medium text-sm">{t.name}</div>
            <div className="text-xs text-slate-400 mt-0.5">{t.manufacturer}</div>
            <div className="flex gap-4 mt-1 text-xs">
              <span className="text-blue-400">{(t.rated_power_kw / 1000).toFixed(1)} MW</span>
              <span className="text-green-400">D={t.rotor_diameter_m}m</span>
              <span className="text-yellow-400">HH={t.hub_height_m}m</span>
              <span className="text-slate-500">{t.iec_class}</span>
            </div>
          </button>
        ))}
      </div>

      {selectedTurbine && (
        <>
          <PowerCurveChart turbine={selectedTurbine} />
          <button
            onClick={() => setMapMode('place')}
            className="w-full py-2 bg-green-700 hover:bg-green-600 text-white rounded text-sm font-medium transition-colors"
          >
            ⚡ Place on Map
          </button>
        </>
      )}
    </div>
  )
}
