import { useUIStore, type ActiveModule } from '../store/uiStore'

interface NavItem {
  id: ActiveModule
  label: string
  icon: string
  group?: string
}

const NAV_ITEMS: NavItem[] = [
  // 1. Site & Wind Resource
  { id: 'site',        label: 'Site',         icon: '🗺', group: '1. Setup' },
  { id: 'wind',        label: 'Wind',         icon: '💨', group: '1. Setup' },
  { id: 'turbine',     label: 'Turbines',     icon: '⚡', group: '1. Setup' },

  // 2. Engineering Design
  { id: 'electrical',  label: 'Electrical',   icon: '🔌', group: '2. Engineering' },
  { id: 'foundation',  label: 'Foundation',   icon: '⚓', group: '2. Engineering' },
  { id: 'marine',      label: 'Marine',       icon: '🌊', group: '2. Engineering' },

  // 3. Optimization
  { id: 'layout',      label: 'Layout',       icon: '📐', group: '3. Optimization' },
  { id: 'aep',         label: 'AEP',          icon: '📊', group: '3. Optimization' },

  // 4. Project Economics
  { id: 'financial',   label: 'Financial',    icon: '💰', group: '4. Economics' },
  { id: 'sensitivity', label: 'Risk',         icon: '📉', group: '4. Economics' },

  // 5. Output
  { id: 'report',      label: 'Reports',      icon: '📄', group: '5. Results' },
]

export default function Sidebar() {
  const { activeModule, setActiveModule } = useUIStore()

  return (
    <div className="flex flex-col bg-slate-900 border-r border-slate-700 w-16 min-h-screen">
      <div className="p-3 border-b border-slate-700">
        <div className="text-blue-400 text-xs font-bold text-center">⚡WF</div>
      </div>
      <nav className="flex-1 py-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveModule(item.id)}
            className={`
              w-full flex flex-col items-center py-2.5 px-1 text-center transition-colors
              ${activeModule === item.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
            `}
            title={item.label}
          >
            <span className="text-lg">{item.icon}</span>
            <span className="text-[9px] mt-0.5 leading-tight">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
