/**
 * Plan covers: one gradient family per kind of plan, so the list reads at a glance and feels
 * like lifestyle, not a calendar. Blue stays dominant; mint and a single warm accent add life.
 * All families keep white text above WCAG AA on their darkest stop.
 */
type Family = 'sport' | 'outdoor' | 'social' | 'culture' | 'screen' | 'default'

const families: Record<Family, { from: string; to: string; glow: string }> = {
  sport: { from: '#0E4FA3', to: '#4B91ED', glow: '#8ADCC3' },
  outdoor: { from: '#0D6B5C', to: '#2BA58A', glow: '#B8F0DE' },
  social: { from: '#B4462A', to: '#F08A4B', glow: '#FFD3A8' },
  culture: { from: '#3B2E8F', to: '#7A6BE0', glow: '#C9C1FF' },
  screen: { from: '#142238', to: '#1268D5', glow: '#4B91ED' },
  default: { from: '#1268D5', to: '#4B91ED', glow: '#DCEBFF' },
}

const bySlug: Record<string, Family> = {
  padel: 'sport', running: 'sport', fitness: 'sport', cycling: 'sport', football: 'sport',
  basketball: 'sport', swimming: 'sport', yoga: 'sport',
  hiking: 'outdoor', climbing: 'outdoor', snowboard: 'outdoor', surf: 'outdoor', travel: 'outdoor', pets: 'outdoor',
  food: 'social', coffee: 'social', concerts: 'social', music: 'social', volunteering: 'social', boardgames: 'social',
  reading: 'culture', cinema: 'culture', photography: 'culture', art: 'culture',
  technology: 'screen', gaming: 'screen', entrepreneur: 'screen',
}

export function coverFor(slug?: string | null) {
  const f = families[(slug && bySlug[slug]) || 'default']
  return {
    background: `radial-gradient(circle at 85% 15%, ${f.glow}66 0%, transparent 45%), linear-gradient(135deg, ${f.from} 0%, ${f.to} 100%)`,
  }
}
