import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { NAV_ITEMS } from '@/utils/constants'

const Sidebar: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()

  const groups = NAV_ITEMS.reduce<Record<string, typeof NAV_ITEMS>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = []
    acc[item.group].push(item)
    return acc
  }, {})

  const groupLabels: Record<string, string> = { main: '', stock: 'Inventory', extra: 'More' }

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full shrink-0 shadow-sm">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
            <span className="text-white font-bold text-lg">HP</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">HP GAS</h1>
            <p className="text-[11px] text-gray-500 font-medium tracking-wider uppercase">Agency POS</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {Object.entries(groupLabels).map(([groupKey, label]) => {
          const items = groups[groupKey] || []
          if (items.length === 0) return null
          return (
            <div key={groupKey} className="mb-2">
              {label && (
                <div className="px-5 py-2 text-[11px] text-gray-400 font-semibold tracking-wider uppercase">
                  {label}
                </div>
              )}
              {items.map(item => {
                const path = item.id === 'dashboard' ? '/' : `/${item.id}`
                const isActive = location.pathname === path
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(path)}
                    className={`w-full text-left px-5 py-3 text-sm font-medium flex items-center justify-between gap-3 transition-all border-l-4 ${
                      isActive
                        ? 'bg-blue-50 text-blue-600 border-blue-600'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-transparent'
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="text-[10px] text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded">{item.shortcut}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-400">v1.0.0</span>
          <span className="text-xs text-gray-500 font-medium">HP Gas Agency</span>
        </div>
      </div>
    </div>
  )
}

export default Sidebar
