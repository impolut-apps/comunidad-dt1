// Community sticker pack. Rendered from code (no files to store); messages store only the code.
// Codes must match ^[a-z0-9_-]{1,24}$ (enforced in the database).
export interface Sticker {
  code: string
  emoji: string
  label: string
}

export const stickers: Sticker[] = [
  { code: 'hola', emoji: '👋', label: '¡Hola!' },
  { code: 'juice', emoji: '🧃', label: 'Hipo time' },
  { code: 'strong', emoji: '💪', label: '¡Tú puedes!' },
  { code: 'love', emoji: '💙', label: 'Te entiendo' },
  { code: 'hug', emoji: '🤗', label: 'Abrazo' },
  { code: 'team', emoji: '🫂', label: 'Equipo T1' },
  { code: 'party', emoji: '🎉', label: '¡Bien!' },
  { code: 'highfive', emoji: '🙌', label: '¡Choca!' },
  { code: 'rollercoaster', emoji: '🎢', label: 'Día montaña rusa' },
  { code: 'sleepy', emoji: '😴', label: 'Noche movidita' },
  { code: 'coffee', emoji: '☕', label: '¿Un café?' },
  { code: 'padel', emoji: '🎾', label: '¿Pádel?' },
  { code: 'pizza', emoji: '🍕', label: 'Pizza night' },
  { code: 'lol', emoji: '😂', label: 'Jajaja' },
  { code: 'thanks', emoji: '🙏', label: 'Gracias' },
  { code: 'ok', emoji: '👌', label: 'Todo bien' },
]

export const stickerByCode = new Map(stickers.map((s) => [s.code, s]))
