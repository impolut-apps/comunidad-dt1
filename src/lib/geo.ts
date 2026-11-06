// Location is country + city text only. No coordinates are ever collected.
export const countries: Array<{ code: string; name: string }> = [
  { code: 'ES', name: 'España' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'MX', name: 'México' },
  { code: 'PE', name: 'Perú' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'VE', name: 'Venezuela' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'PT', name: 'Portugal' },
  { code: 'AD', name: 'Andorra' },
  { code: 'FR', name: 'Francia' },
  { code: 'IT', name: 'Italia' },
  { code: 'DE', name: 'Alemania' },
  { code: 'GB', name: 'Reino Unido' },
  { code: 'IE', name: 'Irlanda' },
  { code: 'US', name: 'Estados Unidos' },
]

export const countryName = (code?: string | null) => countries.find((c) => c.code === code)?.name ?? code ?? ''

// Suggestions keep city spelling consistent ("Málaga" vs "malaga") so "nearby" matching works.
export const spanishCities = [
  'A Coruña', 'Albacete', 'Alicante', 'Almería', 'Badajoz', 'Barcelona', 'Bilbao', 'Burgos', 'Cáceres', 'Cádiz',
  'Castellón', 'Córdoba', 'Gijón', 'Girona', 'Granada', 'Huelva', 'Jaén', 'Las Palmas de Gran Canaria', 'León',
  'Lleida', 'Logroño', 'Madrid', 'Málaga', 'Murcia', 'Oviedo', 'Palma', 'Pamplona', 'Salamanca',
  'San Sebastián', 'Santa Cruz de Tenerife', 'Santander', 'Santiago de Compostela', 'Sevilla', 'Tarragona',
  'Toledo', 'Valencia', 'Valladolid', 'Vigo', 'Vitoria-Gasteiz', 'Zaragoza',
]
