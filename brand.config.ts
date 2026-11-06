/**
 * Single source of truth for the brand. The final name has not been chosen yet:
 * set VITE_APP_NAME in .env (or edit the default here) and it changes everywhere —
 * UI, <title>, and the PWA manifest.
 */
const env = (typeof process !== 'undefined' ? process.env : {}) as Record<string, string | undefined>

export const brand = {
  name: env.VITE_APP_NAME || 'Tribu T1',
  shortName: env.VITE_APP_SHORT_NAME || 'Tribu T1',
  slogan: 'Encuentra a tu gente',
  sloganEn: 'Find your people',
  description:
    'La comunidad social para adultos con diabetes tipo 1. Conoce gente cerca de ti, comparte planes y haz amigos que te entienden.',
  colors: {
    primary: '#1268D5',
    electric: '#4B91ED',
    soft: '#DCEBFF',
    ice: '#F5F8FC',
    midnight: '#142238',
    mint: '#8ADCC3',
  },
} as const
