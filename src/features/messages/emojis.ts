// Small built-in emoji set (no dependency). The phone keyboard still offers every emoji.
export const emojiCategories: Array<{ id: string; label: string; icon: string; emojis: string[] }> = [
  {
    id: 'faces',
    label: 'Caras',
    icon: '😊',
    emojis: '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 😊 😇 🙂 😉 😌 😍 🥰 😘 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🫡 🤐 😐 😑 😶 🫠 😏 😒 🙄 😬 😮‍💨 😴 🥱 😪 🤤 😷 🤒 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 🫤 😟 🙁 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 😤 😡 😠'.split(' '),
  },
  {
    id: 'hands',
    label: 'Gestos',
    icon: '👍',
    emojis: '👍 👎 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👋 🤚 🖐️ ✋ 🖖 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💪 🦾 🫂 🙋 🙆 🙅 🤷 🤦 💁 🙇'.split(' '),
  },
  {
    id: 'hearts',
    label: 'Corazones',
    icon: '💙',
    emojis: '💙 🩵 💜 🩷 ❤️ 🧡 💛 💚 🤍 🖤 🤎 ❤️‍🔥 💖 💗 💓 💞 💕 💘 💝 💟 ✨ ⭐ 🌟 💫 🔥 💯 🎉 🎊 🥂 🍾'.split(' '),
  },
  {
    id: 'activity',
    label: 'Planes',
    icon: '🎾',
    emojis: '🎾 🏃 🚴 🏊 🧗 🏂 ⛷️ 🏄 🧘 🏋️ ⚽ 🏀 🏐 🏓 🥾 ⛰️ 🏕️ 🏖️ ✈️ 🚆 🚗 🎮 🎲 🎬 🎵 🎤 🎧 📚 📷 🎨 💻 🐶 🐱 🌱 🌞 🌙 ☔ ❄️'.split(' '),
  },
  {
    id: 'food',
    label: 'Comida',
    icon: '☕',
    emojis: '☕ 🍵 🧃 🥤 🍺 🍷 🍹 🍕 🍔 🌮 🌯 🥗 🍝 🍣 🍱 🥘 🍳 🥐 🥖 🧀 🍎 🍌 🍓 🍉 🍇 🍊 🥑 🥕 🍫 🍪 🍩 🍦 🎂 🍰 🍬 🍯'.split(' '),
  },
]

const RECENT_KEY = 'recent-emojis'

export function getRecentEmojis(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.slice(0, 24) : []
  } catch {
    return []
  }
}

export function pushRecentEmoji(e: string) {
  try {
    const next = [e, ...getRecentEmojis().filter((x) => x !== e)].slice(0, 24)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* private mode: recents just won't persist */
  }
}
