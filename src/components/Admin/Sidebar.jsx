import { LayoutDashboard, Users, CreditCard, BarChart3, Zap, Settings } from 'lucide-react'

const modules = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'members', label: 'Miembros', icon: Users },
  { id: 'payments', label: 'Pagos', icon: CreditCard },
  { id: 'reports', label: 'Reportes', icon: BarChart3 },
  { id: 'machines', label: 'Máquinas', icon: Zap },
  { id: 'settings', label: 'Configuración', icon: Settings },
]

export const Sidebar = ({ activeModule = 'dashboard', onModuleChange }) => {
  return (
    <aside className="w-64 bg-neutral-dark text-white p-6 flex flex-col">
      <h2 className="text-xl font-bold mb-8">Módulos</h2>
      <nav className="space-y-2 flex-1">
        {modules.map(mod => {
          const Icon = mod.icon
          const isActive = activeModule === mod.id
          return (
            <button
              key={mod.id}
              onClick={() => onModuleChange(mod.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-semibold transition-colors ${
                isActive ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Icon size={20} />
              <span>{mod.label}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
