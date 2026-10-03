import { reactive, watch } from 'vue'
import { phrases } from './data/phrases'
import { scoreContour } from './utils/intonation'
import { targetContour } from './utils/prosody'
import { buildDrill, dayKey } from './utils/progress'

const STORAGE_KEY = 'vocalflow:v1'
const MAX_RECORDINGS = 50

// Demo history shown on first launch so Analysis isn't empty. Contours are the
// target with a deterministic wobble; scores are derived from them so the
// numbers always agree with what is drawn.
function seedRecording(id, phraseId, hoursAgo, wobble, content) {
  const p = phrases.find((x) => x.id === phraseId)
  const target = targetContour(p)
  const contour = target.map((v, i) => {
    const t = i / (target.length - 1)
    return Math.min(1, Math.max(0, v + wobble.amp * Math.sin(t * Math.PI * wobble.freq) - wobble.tail * t * t))
  })
  return {
    id,
    phraseId,
    text: p.text,
    language: p.language,
    pattern: p.pattern,
    contour,
    match: scoreContour(contour, target),
    content,
    durationMs: 1400,
    createdAt: Date.now() - hoursAgo * 3600000,
  }
}

function seedRecordings() {
  return [
    seedRecording(1, 6, 2, { amp: 0.04, freq: 3, tail: 0.18 }, 100),
    seedRecording(2, 8, 26, { amp: 0.03, freq: 2, tail: 0.05 }, 75),
    seedRecording(3, 9, 28, { amp: 0.02, freq: 4, tail: 0 }, 100),
  ]
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

const saved = load()

export const store = reactive({
  name: 'Alex',
  language: saved?.language || 'English',
  favorites: saved?.favorites || phrases.filter((p) => p.favorite).map((p) => p.id),
  suggestedPhrases: saved?.suggestedPhrases || [],
  recordings: saved?.recordings || seedRecordings(),
  // Today's drill per language: { date, items: [{ phraseId, reason, lastScore? }] }
  drills: saved?.drills || {},
})

watch(
  store,
  () => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          language: store.language,
          favorites: store.favorites,
          suggestedPhrases: store.suggestedPhrases,
          drills: store.drills,
          // Blob URLs die with the page, so audio is never persisted.
          recordings: store.recordings.map(({ audioUrl, ...rest }) => rest),
        }),
      )
    } catch (e) {
      /* storage full or blocked: keep working in-memory */
    }
  },
  { deep: true },
)

export function addRecording(rec) {
  const entry = { id: Date.now(), createdAt: Date.now(), ...rec }
  store.recordings.unshift(entry)
  for (const old of store.recordings.splice(MAX_RECORDINGS)) {
    if (old.audioUrl) URL.revokeObjectURL(old.audioUrl)
  }
  return entry
}

export function deleteRecording(id) {
  const i = store.recordings.findIndex((r) => r.id === id)
  if (i < 0) return
  const [removed] = store.recordings.splice(i, 1)
  if (removed.audioUrl) URL.revokeObjectURL(removed.audioUrl)
}

export function isFavorite(id) {
  return store.favorites.includes(id)
}

export function toggleFavorite(id) {
  const i = store.favorites.indexOf(id)
  if (i >= 0) store.favorites.splice(i, 1)
  else store.favorites.push(id)
}

export function findPhrase(id) {
  const key = String(id)
  return phrases.find((p) => String(p.id) === key) || store.suggestedPhrases.find((p) => String(p.id) === key) || null
}

export function phrasesFor(language) {
  return [...phrases, ...store.suggestedPhrases].filter((p) => p.language === language)
}

// Builds the day's drill for a language the first time it is needed; it then
// stays fixed for the rest of the day so progress through it is stable.
export function ensureDrill(language = store.language, now = Date.now()) {
  const today = dayKey(now)
  const existing = store.drills[language]
  if (existing?.date === today) return existing
  const drill = { date: today, ...buildDrill(store.recordings, phrasesFor(language), language, now) }
  store.drills[language] = drill
  return drill
}

watch(() => store.language, (language) => ensureDrill(language), { immediate: true })
