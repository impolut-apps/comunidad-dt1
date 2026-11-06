import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/cn'

type Tone = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  tone: Tone
  message: string
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {})
const icons = { success: CheckCircle2, error: AlertCircle, info: Info }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((message: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random()
    setItems((xs) => [...xs.slice(-2), { id, tone, message }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3800)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))]"
        aria-live="polite"
      >
        {items.map((t) => {
          const Icon = icons[t.tone]
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg animate-pop',
                t.tone === 'error' ? 'bg-danger text-white' : 'bg-midnight text-white dark:bg-surface-muted',
              )}
            >
              <Icon size={18} className={t.tone === 'success' ? 'text-mint' : undefined} aria-hidden />
              {t.message}
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
