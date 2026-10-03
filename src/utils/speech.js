// Language tags and text-to-speech helpers shared by every view.
import { pickVoice } from './voices'

const LANG_TAGS = { English: 'en-US', Spanish: 'es-ES', Catalan: 'ca-ES' }

export function langTagFor(language) {
  return LANG_TAGS[language] || 'en-US'
}

export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

export function stopSpeaking() {
  if (ttsSupported) window.speechSynthesis.cancel()
}

export function speak(text, language, { gender, rate = 0.9, onEnd } = {}) {
  if (!ttsSupported) return false
  const lang = langTagFor(language)
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang
  u.rate = rate
  const voice = pickVoice({ lang, gender })
  if (voice) u.voice = voice
  if (onEnd) {
    u.onend = onEnd
    u.onerror = onEnd
  }
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
  return true
}
