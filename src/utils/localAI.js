// On-device AI helpers for suggesting new practice phrases.
//
// Uses the browser's built-in local model when available (Chrome's Prompt API:
// `window.model` / `window.ai.languageModel` / `window.ai.createTextSession`).
// Everything runs on-device; nothing is sent to a server. When no local model
// is present, generation falls back to a curated per-language phrase bank.

export function hasLocalAI() {
  if (typeof window === 'undefined') return false
  const a = window.ai
  return !!(a?.languageModel?.create || a?.model?.create || window.model?.create || a?.createTextSession)
}

function getModelAPI() {
  if (typeof window === 'undefined') return null
  const a = window.ai
  if (a?.languageModel?.create) return { create: a.languageModel.create.bind(a.languageModel), kind: 'languageModel' }
  if (a?.model?.create) return { create: a.model.create.bind(a.model), kind: 'model' }
  if (window.model?.create) return { create: window.model.create.bind(window.model), kind: 'windowModel' }
  if (a?.createTextSession) return { createTextSession: a.createTextSession.bind(a), kind: 'textSession' }
  return null
}

export async function askLocalAI({ systemPrompt, prompt }) {
  const api = getModelAPI()
  if (!api) throw new Error('no-local-ai')
  if (api.kind === 'textSession') {
    const s = await api.createTextSession()
    try {
      return await s.prompt(prompt)
    } finally {
      if (s.destroy) s.destroy()
    }
  }
  const s = await api.create({ systemPrompt })
  try {
    return await s.prompt(prompt)
  } finally {
    if (s.destroy) s.destroy()
  }
}

const PATTERN_LABEL = {
  rising: 'Rising',
  falling: 'Falling',
  neutral: 'Neutral / polite',
}
const PATTERN_DESC = {
  rising: 'pitch increasing toward the end of the sentence, typical of yes/no questions',
  falling: 'pitch descending and stabilizing at the end, typical of statements and WH- questions',
  neutral: 'a flat, even contour with gentle terminal settling',
}

function extractJSON(text) {
  const t = String(text || '').trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = (fence ? fence[1] : t).trim()
  const start = candidate.indexOf('[')
  const end = candidate.lastIndexOf(']')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(candidate.slice(start, end + 1))
    } catch (e) {
      /* fall through */
    }
  }
  try {
    return JSON.parse(candidate)
  } catch (e) {
    return null
  }
}

function sanitize(item, pattern, language) {
  if (!item || typeof item !== 'object') return null
  const text = String(item.text || '').trim()
  if (!text) return null
  return {
    text,
    difficulty: ['Beginner', 'Intermediate', 'Advanced'].includes(item.difficulty) ? item.difficulty : 'Intermediate',
    category: ['Greetings', 'Business', 'Emotion', 'Questions'].includes(item.category) ? item.category : 'Business',
    length: ['Short', 'Medium', 'Long'].includes(item.length) ? item.length : 'Medium',
    pattern: ['rising', 'falling', 'neutral'].includes(item.pattern) ? item.pattern : pattern,
    language,
  }
}

export async function generatePhraseSuggestions({ language, pattern, count = 6 }) {
  if (hasLocalAI()) {
    try {
      const systemPrompt =
        'You are a pronunciation coach who writes natural everyday practice sentences. Respond with ONLY a valid JSON array. No markdown fences, no commentary, no explanations.'
      const prompt =
        `Generate exactly ${count} natural, everyday ${language} sentences for intonation training with ` +
        `${PATTERN_LABEL[pattern] || 'Rising'} intonation (${PATTERN_DESC[pattern] || PATTERN_DESC.rising}). ` +
        `Return a JSON array of objects with EXACTLY these keys: "text" (the sentence only, no surrounding quotes), ` +
        `"difficulty" ("Beginner", "Intermediate" or "Advanced"), "category" ("Greetings", "Business", "Emotion" or "Questions"), ` +
        `"length" ("Short", "Medium" or "Long"), "pattern" ("rising", "falling" or "neutral"). ` +
        `Vary the length across the set (mix Short, Medium and Long), use 4 to 12 words, and avoid translations, numbering, or extra text.`
      const raw = await askLocalAI({ systemPrompt, prompt })
      const arr = extractJSON(raw)
      if (Array.isArray(arr) && arr.length) {
        return arr.map((item) => sanitize(item, pattern, language)).filter(Boolean).slice(0, count)
      }
    } catch (e) {
      /* fall through to the built-in bank */
    }
  }
  return fallbackSuggestions({ language, pattern, count })
}

const FALLBACK_BANK = {
  English: [
    { text: 'Could you open the window, please?', difficulty: 'Beginner', category: 'Business', length: 'Medium', pattern: 'falling' },
    { text: 'What time does the train leave?', difficulty: 'Beginner', category: 'Questions', length: 'Medium', pattern: 'falling' },
    { text: 'Really?', difficulty: 'Beginner', category: 'Questions', length: 'Short', pattern: 'rising' },
    { text: 'Did you see the football match last night?', difficulty: 'Intermediate', category: 'Emotion', length: 'Long', pattern: 'rising' },
    { text: 'I completely understand what you mean.', difficulty: 'Intermediate', category: 'Business', length: 'Medium', pattern: 'falling' },
    { text: 'Thanks a lot!', difficulty: 'Beginner', category: 'Greetings', length: 'Short', pattern: 'neutral' },
    { text: 'Do you want to grab lunch together?', difficulty: 'Intermediate', category: 'Greetings', length: 'Medium', pattern: 'rising' },
    { text: 'That sounds perfect.', difficulty: 'Beginner', category: 'Business', length: 'Short', pattern: 'neutral' },
    { text: 'We are going to be a little late, sorry.', difficulty: 'Intermediate', category: 'Business', length: 'Long', pattern: 'falling' },
    { text: 'No way!', difficulty: 'Beginner', category: 'Emotion', length: 'Short', pattern: 'rising' },
  ],
  Spanish: [
    { text: '¿Puedes abrir la ventana, por favor?', difficulty: 'Beginner', category: 'Business', length: 'Medium', pattern: 'falling' },
    { text: '¿A qué hora sale el tren?', difficulty: 'Beginner', category: 'Questions', length: 'Medium', pattern: 'falling' },
    { text: '¿De verdad?', difficulty: 'Beginner', category: 'Questions', length: 'Short', pattern: 'rising' },
    { text: '¿Viste el partido anoche?', difficulty: 'Intermediate', category: 'Emotion', length: 'Medium', pattern: 'rising' },
    { text: 'Entiendo perfectamente lo que quieres decir.', difficulty: 'Intermediate', category: 'Business', length: 'Long', pattern: 'falling' },
    { text: '¡Muchas gracias!', difficulty: 'Beginner', category: 'Greetings', length: 'Short', pattern: 'neutral' },
    { text: '¿Quieres comer juntos?', difficulty: 'Intermediate', category: 'Greetings', length: 'Medium', pattern: 'rising' },
    { text: 'Eso suena perfecto.', difficulty: 'Beginner', category: 'Business', length: 'Short', pattern: 'neutral' },
  ],
  Catalan: [
    { text: 'Pots obrir la finestra, si us plau?', difficulty: 'Beginner', category: 'Business', length: 'Medium', pattern: 'falling' },
    { text: 'A quina hora surt el tren?', difficulty: 'Beginner', category: 'Questions', length: 'Medium', pattern: 'falling' },
    { text: 'De veritat?', difficulty: 'Beginner', category: 'Questions', length: 'Short', pattern: 'rising' },
    { text: 'Has vist el partit ahir a la nit?', difficulty: 'Intermediate', category: 'Emotion', length: 'Long', pattern: 'rising' },
    { text: 'Entenc perfectament què vols dir.', difficulty: 'Intermediate', category: 'Business', length: 'Medium', pattern: 'falling' },
    { text: 'Moltes gràcies!', difficulty: 'Beginner', category: 'Greetings', length: 'Short', pattern: 'neutral' },
    { text: 'Vols dinar junts?', difficulty: 'Intermediate', category: 'Greetings', length: 'Medium', pattern: 'rising' },
    { text: 'Això sona perfecte.', difficulty: 'Beginner', category: 'Business', length: 'Short', pattern: 'neutral' },
  ],
}

function fallbackSuggestions({ language, pattern, count }) {
  const bank = FALLBACK_BANK[language] || FALLBACK_BANK.English
  const wanted = bank.filter((p) => p.pattern === pattern)
  const rest = bank.filter((p) => p.pattern !== pattern)
  const ordered = [...wanted, ...rest]
  const out = []
  for (let i = 0; i < count && ordered.length; i++) {
    out.push({ ...ordered[i % ordered.length], language })
  }
  return out
}
