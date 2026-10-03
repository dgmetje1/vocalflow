// Picks a speechSynthesis voice for a given language tag and desired gender.
// Browsers expose no gender property on voices, so gender is inferred from
// the voice name (e.g. "Google UK English Male", "Microsoft Zira").

const MALE_HINTS = [
  'male', 'david', 'daniel', 'mark', 'george', 'alex', 'ryan', 'eric', 'guy',
  'fred', 'kirk', 'arthur', 'james', 'john', 'miguel', 'jorge', 'jordi', 'toni',
]
const FEMALE_HINTS = [
  'female', 'zira', 'susan', 'samantha', 'hazel', 'tessa', 'karen', 'moira',
  'allison', 'ava', 'jenny', 'victoria', 'emma', 'aria', 'libby', 'sonia',
  'joana', 'maria', 'camila', 'nuria', 'ana', 'helena',
]

export function guessGender(name) {
  const n = (name || '').toLowerCase()
  if (MALE_HINTS.some((h) => n.includes(h))) return 'male'
  if (FEMALE_HINTS.some((h) => n.includes(h))) return 'female'
  return 'unknown'
}

export function pickVoice({ lang, gender }) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices()
  const tag = (lang || 'en-US').toLowerCase()
  const pool = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(tag.slice(0, 2)))
  if (pool.length) {
    if (gender) {
      const preferred = pool.find((v) => guessGender(v.name) === gender)
      if (preferred) return preferred
    }
    return pool.find((v) => v.default) || pool[0]
  }
  return voices.find((v) => v.default) || voices[0] || null
}
