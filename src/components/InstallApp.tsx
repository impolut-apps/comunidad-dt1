import { useState } from 'react'
import { Check, Download } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useInstall } from '@/lib/install'

/**
 * "Instala la app en tu móvil". Where the browser allows it (Chrome/Edge/Samsung on Android
 * and desktop) the button opens the native install dialog straight away — no guide.
 * iOS has no such dialog, so the card says where to tap instead.
 *
 * `always`: also show on browsers that can't install right now (Settings).
 */
export function InstallCard({
  className,
  hideWhenInstalled = false,
  always = false,
}: {
  className?: string
  hideWhenInstalled?: boolean
  always?: boolean
}) {
  const toast = useToast()
  const s = useInstall()
  const [busy, setBusy] = useState(false)

  async function install() {
    setBusy(true)
    const r = await s.install()
    setBusy(false)
    if (r === 'accepted') toast('¡App instalada! Ya la tienes en tu pantalla de inicio')
  }

  let text: string
  let button = false
  if (s.standalone) {
    if (!always) return null
    text = 'Estás usando la app instalada.'
  } else if (s.canPrompt) {
    text = 'Tendrás su icono en la pantalla de inicio.'
    button = true
  } else if (s.platform === 'ios') {
    if (hideWhenInstalled && s.installed) return null
    text = 'En iPhone: pulsa Compartir y luego «Añadir a pantalla de inicio».'
  } else if (s.platform === 'in-app') {
    text = 'Ábrela en Safari o Chrome (menú ··· → «Abrir en el navegador») para instalarla.'
  } else if (always) {
    text = s.installed ? 'Ya la tienes instalada en este dispositivo: ábrela desde su icono.' : 'Ábrela en Chrome o Safari desde tu móvil para instalarla.'
  } else {
    // Already installed, or a browser that can't install: nothing useful to offer here.
    return null
  }

  return (
    <div className={cn('flex items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-card', className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-text">
        {s.standalone ? <Check size={19} /> : <Download size={19} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-snug">Instala la app en tu móvil</p>
        <p className="text-sm text-muted">{text}</p>
      </div>
      {button && (
        <Button loading={busy} onClick={install}>
          Instalar
        </Button>
      )}
    </div>
  )
}
