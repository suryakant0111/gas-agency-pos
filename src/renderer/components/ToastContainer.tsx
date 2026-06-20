import React from 'react'
import { useAppStore } from '@/store/app'

const BorderColors: Record<string, string> = {
  success: 'border-emerald-500',
  error: 'border-red-500',
  warning: 'border-amber-500',
  info: 'border-blue-500',
}

const BgColors: Record<string, string> = {
  success: 'bg-emerald-50',
  error: 'bg-red-50',
  warning: 'bg-amber-50',
  info: 'bg-blue-50',
}

const TextColors: Record<string, string> = {
  success: 'text-emerald-800',
  error: 'text-red-800',
  warning: 'text-amber-800',
  info: 'text-blue-800',
}

const ToastContainer: React.FC = () => {
  const toasts = useAppStore(s => s.toasts)
  const removeToast = useAppStore(s => s.removeToast)

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`border-l-4 rounded-xl px-5 py-4 shadow-xl flex items-center gap-3 transition-all ${BorderColors[t.type]} ${BgColors[t.type]} ${TextColors[t.type]}`}
        >
          <span className="text-lg font-bold">{t.type === 'success' ? '✓' : t.type === 'error' ? '✗' : t.type === 'warning' ? '⚠' : 'ℹ'}</span>
          <span className="text-sm font-semibold">{t.message}</span>
          <button className="ml-2 text-gray-400 hover:text-gray-600 text-lg font-bold" onClick={() => removeToast(t.id)}>✕</button>
        </div>
      ))}
    </div>
  )
}

export default ToastContainer
