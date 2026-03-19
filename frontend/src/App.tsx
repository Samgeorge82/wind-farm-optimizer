import { Suspense, lazy } from 'react'
import { Toaster } from 'react-hot-toast'
import Sidebar from './components/Sidebar'
import MapToolbar from './components/MapToolbar'
import WindFarmMap from './components/map/WindFarmMap'
import { useUIStore } from './store/uiStore'

// Lazy-load panels to keep initial bundle small
const SitePanel       = lazy(() => import('./components/panels/SitePanel'))
const WindPanel       = lazy(() => import('./components/panels/WindPanel'))
const TurbinePanel    = lazy(() => import('./components/panels/TurbinePanel'))
const LayoutPanel     = lazy(() => import('./components/panels/LayoutPanel'))
const AEPPanel        = lazy(() => import('./components/panels/AEPPanel'))
const ElectricalPanel = lazy(() => import('./components/panels/ElectricalPanel'))
const FoundationPanel = lazy(() => import('./components/panels/FoundationPanel'))
const MarinePanel     = lazy(() => import('./components/panels/MarinePanel'))
const FinancialPanel  = lazy(() => import('./components/panels/FinancialPanel'))
const SensitivityPanel= lazy(() => import('./components/panels/SensitivityPanel'))
const ReportPanel     = lazy(() => import('./components/panels/ReportPanel'))

function PanelFallback() {
  return (
    <div className="flex items-center justify-center h-full text-gray-500 text-sm">
      Loading...
    </div>
  )
}

function ActivePanel() {
  const { activeModule } = useUIStore()

  switch (activeModule) {
    case 'site':        return <SitePanel />
    case 'wind':        return <WindPanel />
    case 'turbine':     return <TurbinePanel />
    case 'layout':      return <LayoutPanel />
    case 'aep':         return <AEPPanel />
    case 'electrical':  return <ElectricalPanel />
    case 'foundation':  return <FoundationPanel />
    case 'marine':      return <MarinePanel />
    case 'financial':   return <FinancialPanel />
    case 'sensitivity': return <SensitivityPanel />
    case 'report':      return <ReportPanel />
    default:            return <SitePanel />
  }
}

export default function App() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-white">
      {/* Left icon sidebar */}
      <Sidebar />

      {/* Detail panel */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-slate-900 border-r border-slate-700 overflow-y-auto">
        <Suspense fallback={<PanelFallback />}>
          <ActivePanel />
        </Suspense>
      </div>

      {/* Map area */}
      <div className="flex-1 flex flex-col min-w-0">
        <MapToolbar />
        <div className="flex-1 relative">
          <WindFarmMap />
        </div>
      </div>

      {/* Toast notifications */}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid #334155',
            fontSize: '13px',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#1e293b' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: '#1e293b' } },
        }}
      />
    </div>
  )
}
