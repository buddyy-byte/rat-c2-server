import { useStore } from '@/stores/useStore'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import clsx from 'clsx'
import { useEffect } from 'react'

export function NotificationContainer() {
  const { notifications, removeNotification } = useStore()

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={clsx(
            'pointer-events-auto animate-slide-in-right px-4 py-3 rounded-lg shadow-xl border min-w-[300px] max-w-md',
            n.type === 'success' && 'bg-green-900/30 border-green-500/30 text-green-300',
            n.type === 'error' && 'bg-red-900/30 border-red-500/30 text-red-300',
            n.type === 'warning' && 'bg-yellow-900/30 border-yellow-500/30 text-yellow-300',
            n.type === 'info' && 'bg-blue-900/30 border-blue-500/30 text-blue-300'
          )}
        >
          <div className="flex items-start gap-3">
            <div className={clsx('w-5 h-5 flex-shrink-0 mt-0.5', n.type === 'success' && 'text-green-400', n.type === 'error' && 'text-red-400', n.type === 'warning' && 'text-yellow-400', n.type === 'info' && 'text-blue-400')}>
              {n.type === 'success' && <CheckCircle />}
              {n.type === 'error' && <AlertCircle />}
              {n.type === 'warning' && <AlertTriangle />}
              {n.type === 'info' && <Info />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{n.message}</p>
              <p className="text-xs opacity-70 mt-1">{new Date(n.timestamp).toLocaleTimeString()}</p>
            </div>
            <button onClick={() => removeNotification(n.id)} className="text-current opacity-50 hover:opacity-100 transition-opacity">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}