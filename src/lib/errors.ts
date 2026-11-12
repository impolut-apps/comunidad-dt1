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
  invalid_invite: 'Ese código no es válido, ha caducado o ya se ha usado. Revísalo o déjalo en blanco.',
  code_taken: 'Ese código ya existe. Elige otro.',
  invalid_code: 'El código debe tener entre 3 y 24 letras, números o guiones, y al menos 1 uso.',
  max_below_uses: 'Ya se ha usado más veces que ese máximo.',
  invite_not_found: 'Ese código ya no existe.',
  community_not_found: 'Esta comunidad ya no existe.',
  invalid_community: 'Revisa el nombre (3-60 caracteres) y el enlace (3-30 letras, números o guiones).',
  slug_taken: 'Ya hay una comunidad con ese enlace. Elige otro.',
  host_not_found: 'No encontramos a nadie con ese usuario. Comprueba que tenga cuenta.',
  host_cannot_leave: 'Eres quien anima esta comunidad: no puedes salir de ella.',
  signups_closed: 'El registro está cerrado de momento. Vuelve a intentarlo más tarde.',
  // Supabase hides sign-up trigger errors behind this generic text.
  'Database error saving new user':
    'No hemos podido crear tu cuenta. Si usas una invitación, comprueba el código; si no, inténtalo de nuevo en unos minutos.',
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
