import { brand } from './brand'

/**
 * Invite someone to the community. The text deliberately does NOT say "I have T1D" or "I'm in it":
 * sharing a link must never reveal the sender's health condition.
 */
export async function shareInvite(toast: (message: string, tone?: 'success' | 'error' | 'info') => void) {
  const url = window.location.origin
  const text = `Te paso ${brand.name}: una comunidad para adultos con diabetes tipo 1 donde conocer gente cerca y hacer planes.`
  try {
    if (navigator.share) await navigator.share({ title: brand.name, text, url })
    else {
      await navigator.clipboard.writeText(`${text} ${url}`)
      toast('Enlace copiado')
    }
  } catch {
    /* share sheet dismissed */
  }
}
