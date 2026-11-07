/** Turns Supabase / Postgres errors into short, human Spanish messages. */
const messages: Record<string, string> = {
  consent_required: 'Necesitamos que aceptes las condiciones para crear tu cuenta.',
  email_not_verified: 'Confirma tu email antes de continuar.',
  too_many_interests: 'Puedes elegir hasta 12 intereses.',
  activity_in_past: 'La fecha del plan tiene que ser en el futuro.',
  activity_full: 'Este plan ya está completo.',
  activity_not_open: 'Este plan ya no admite participantes.',
  activity_not_found: 'Este plan no está disponible.',
  connection_required: 'Para escribir a alguien, conectad primero o compartid un plan.',
  user_not_found: 'Este perfil no está disponible.',
  report_target_not_found: 'No hemos encontrado el contenido a reportar.',
  not_allowed: 'No tienes permiso para hacer esto.',
  'Invalid login credentials': 'Email o contraseña incorrectos.',
  'Email not confirmed': 'Todavía no has confirmado tu email. Revisa tu bandeja de entrada.',
  'User already registered': 'Ya existe una cuenta con este email.',
  profiles_username_key: 'Ese nombre de usuario ya está cogido.',
  reports_one_per_target: 'Ya habías reportado esto. Lo estamos revisando.',
  'policy for table "messages"': 'No puedes enviar mensajes en esta conversación.',
  rate_limited: 'Vas muy rápido. Espera un momento y vuelve a intentarlo.',
  activity_capacity_below_attendees: 'Ya hay más personas apuntadas que ese máximo.',
}

export function friendlyError(error: unknown): string {
  const raw =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : ''
  for (const [key, msg] of Object.entries(messages)) if (raw.includes(key)) return msg
  if (/rate limit/i.test(raw)) return 'Demasiados intentos. Espera un momento y vuelve a probar.'
  if (/fetch|network/i.test(raw)) return 'No hay conexión. Comprueba tu internet.'
  if (/password/i.test(raw) && /characters/i.test(raw)) return 'La contraseña debe tener al menos 8 caracteres.'
  return 'Algo ha salido mal. Inténtalo de nuevo.'
}
