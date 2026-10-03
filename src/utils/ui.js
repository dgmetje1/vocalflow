// Shared presentational helpers so badges and score colours stay consistent
// across views.

export const patternBadge = {
  rising: 'bg-secondary/10 text-secondary border-secondary/20',
  falling: 'bg-tertiary/10 text-tertiary border-tertiary/20',
  neutral: 'bg-outline/10 text-outline border-outline/20',
}

export const lengthBadge = {
  Short: 'bg-primary/10 text-primary border-primary/20',
  Medium: 'bg-on-surface/5 text-on-surface-variant border-outline-variant/20',
  Long: 'bg-tertiary/10 text-tertiary border-tertiary/20',
}

export const difficultyBadge = {
  Beginner: 'bg-tertiary/10 text-tertiary border-tertiary/20',
  Intermediate: 'bg-secondary/10 text-secondary border-secondary/20',
  Advanced: 'bg-error/10 text-error border-error/20',
}

export function scoreColor(score) {
  if (score === null || score === undefined) return 'text-on-surface-variant'
  if (score >= 80) return 'text-secondary'
  if (score >= 60) return 'text-primary'
  return 'text-tertiary'
}

export function iconFill(filled) {
  return filled ? { fontVariationSettings: "'FILL' 1" } : {}
}

export function relativeTime(ts, now = Date.now()) {
  const diff = now - ts
  const min = Math.round(diff / 60000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min} min ago`
  const d = new Date(ts)
  const today = new Date(now)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`
  const yesterday = new Date(now - 86400000)
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// Fallback thumbnail path for phrases without a hand-drawn waveform (e.g. AI
// suggestions), keyed by intonation pattern.
export const patternWaveform = {
  rising: 'M0,25 Q30,24 55,18 T85,8 L100,3',
  falling: 'M0,6 Q25,8 50,14 T85,24 L100,27',
  neutral: 'M0,15 Q25,14 50,16 T100,15',
}
