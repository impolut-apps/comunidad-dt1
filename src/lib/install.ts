import { useSyncExternalStore } from 'react'

/**
 * "Install the app" (PWA). Chrome/Edge/Samsung on Android and desktop fire `beforeinstallprompt`
 * once, early — so this module is imported from main.tsx to catch it before any screen mounts.
 * iOS never fires it: there we explain "Compartir → Añadir a pantalla de inicio".
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const INSTALLED_KEY = 'app-installed'
let deferred: BeforeInstallPromptEvent | null = null
let version = 0
const listeners = new Set<() => void>()
const notify = () => {
  version++
  listeners.forEach((l) => l())
}

function remember() {
  try {
    localStorage.setItem(INSTALLED_KEY, '1')
  } catch {
    /* storage unavailable */
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // we show our own button instead of the browser's mini-infobar
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    remember()
    notify()
  })
}

/** Running as the installed app (home-screen icon), not in a browser tab. */
export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'in-app'

export function detectPlatform(ua = navigator.userAgent): InstallPlatform {
  // Instagram, Facebook, TikTok… open links in their own browser, which cannot install apps.
  if (/Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Bytedance|LinkedInApp|Snapchat|Line\//i.test(ua)) return 'in-app'
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  if (/iPhone|iPad|iPod/i.test(ua) || iPadOS) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

function snapshot() {
  return version
}
function subscribe(l: () => void) {
  listeners.add(l)
  const mq = window.matchMedia?.('(display-mode: standalone)')
  mq?.addEventListener?.('change', l)
  return () => {
    listeners.delete(l)
    mq?.removeEventListener?.('change', l)
  }
}

export function useInstall() {
  useSyncExternalStore(subscribe, snapshot, snapshot)
  const standalone = isStandalone()
  if (standalone) remember()
  let installedHere = standalone
  try {
    installedHere ||= localStorage.getItem(INSTALLED_KEY) === '1'
  } catch {
    /* storage unavailable */
  }
  return {
    /** Already opened as the app, or installed from this browser. */
    installed: installedHere,
    standalone,
    platform: detectPlatform(),
    /** The browser can show its native install dialog right now. */
    canPrompt: deferred !== null,
    async install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
      if (!deferred) return 'unavailable'
      const e = deferred
      await e.prompt()
      const { outcome } = await e.userChoice
      deferred = null
      if (outcome === 'accepted') remember()
      notify()
      return outcome
    },
  }
}
