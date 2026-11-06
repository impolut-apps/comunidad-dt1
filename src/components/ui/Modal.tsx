import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** Accessible dialog built on <dialog>: bottom sheet on mobile, centred card on desktop. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 backdrop:bg-midnight/50 backdrop:backdrop-blur-[2px] sm:m-auto sm:max-w-md"
    >
      {open && (
        <div className="max-h-[90dvh] overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-text animate-fade-up sm:rounded-3xl">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold">{title}</h2>
            <button onClick={onClose} className="rounded-full p-2 text-muted hover:bg-surface-muted" aria-label="Cerrar">
              <X size={20} />
            </button>
          </div>
          {children}
          {footer && <div className="mt-5 flex gap-3">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}
