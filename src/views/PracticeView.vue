<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PitchCurve from '../components/PitchCurve.vue'
import { phrases, defaultPhraseId, tonalPatterns } from '../data/phrases'
import { useSpeechRecognition } from '../composables/useSpeechRecognition'
import { micSupported, usePitchDetection } from '../composables/usePitchDetection'
import { matchContent } from '../utils/contentMatch'
import { displayContour, scoreContour, userContour } from '../utils/intonation'
import { targetContour } from '../utils/prosody'
import { langTagFor, speak, stopSpeaking, ttsSupported } from '../utils/speech'
import { generatePhraseSuggestions, hasLocalAI } from '../utils/localAI'
import { lengthBadge, patternBadge, scoreColor } from '../utils/ui'
import { drillProgress } from '../utils/progress'
import { addRecording, findPhrase, store } from '../store'

const IDLE_STATUS = 'Tap the mic (or press Space) and say the phrase'

const route = useRoute()
const router = useRouter()

const phrasesInLanguage = computed(() =>
  [...phrases, ...store.suggestedPhrases].filter((p) => p.language === store.language),
)

const phrase = computed(
  () =>
    findPhrase(route.query.phrase) ||
    phrasesInLanguage.value.find((p) => p.id === defaultPhraseId) ||
    phrasesInLanguage.value[0] ||
    phrases[0],
)
const pattern = computed(() => tonalPatterns[phrase.value.pattern] || tonalPatterns.rising)
const target = computed(() => targetContour(phrase.value))

// Keep the app language in sync with the phrase being practiced, and jump to a
// phrase in the new language when the language is changed elsewhere.
watch(
  phrase,
  (p) => {
    if (p.language !== store.language) store.language = p.language
  },
  { immediate: true },
)
watch(
  () => store.language,
  (name) => {
    if (phrase.value.language === name) return
    const first = phrasesInLanguage.value[0]
    if (first) router.replace({ path: '/practice', query: { phrase: String(first.id) } })
  },
)

const voiceGender = ref('female')

const state = reactive({
  mode: 'idle', // idle | starting | recording | processing | done
  match: null,
  content: null,
  catalogOpen: false,
  status: IDLE_STATUS,
  error: false,
  lastRecordingId: null,
  nativePlaying: false,
})
const takeContour = ref([])

const speech = useSpeechRecognition({ lang: langTagFor(store.language), continuous: true })
const pitch = usePitchDetection()

watch(
  () => phrase.value.language,
  (language) => {
    if (speech.recognition) speech.recognition.lang = langTagFor(language)
  },
)

const missingFeatures = computed(() => {
  const out = []
  if (!micSupported) out.push('microphone access')
  if (!speech.supported) out.push('speech recognition (content score)')
  if (!ttsSupported) out.push('text-to-speech (native audio)')
  return out
})

const displayText = computed(() => {
  const hl = phrase.value.highlight
  const text = phrase.value.text
  if (!hl) return [{ text, hl: false }]
  const idx = text.toLowerCase().indexOf(hl.toLowerCase())
  if (idx < 0) return [{ text, hl: false }]
  return [
    { text: text.slice(0, idx), hl: false },
    { text: text.slice(idx, idx + hl.length), hl: true },
    { text: text.slice(idx + hl.length), hl: false },
  ]
})

const isRecording = computed(() => state.mode === 'recording')
const isBusy = computed(() => state.mode === 'starting' || state.mode === 'processing')

const displaySamples = computed(() => (isRecording.value ? displayContour(pitch.samples, target.value) : takeContour.value))
const hasSamples = computed(() => displaySamples.value.some((v) => v !== null))

const currentTranscript = computed(() => speech.fullTranscript.value)
const liveContentMatch = computed(() => (currentTranscript.value ? matchContent(currentTranscript.value, phrase.value.text) : null))

// Live fundamental frequency (F0) readout — what is actually being scored.
// Median of the recent voiced frames keeps the number readable at 60 fps;
// shows nothing between words rather than a stale value.
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const livePitch = computed(() => {
  if (!isRecording.value) return null
  const recent = pitch.samples.slice(-8).filter((hz) => hz >= 60 && hz <= 500)
  if (recent.length < 3) return null
  const hz = [...recent].sort((a, b) => a - b)[recent.length >> 1]
  const midi = Math.round(69 + 12 * Math.log2(hz / 440))
  return { hz: Math.round(hz), note: `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}` }
})

const feedback = computed(() => {
  if (state.match === null && state.content === null) return phrase.value.desc
  const parts = []
  if (state.match !== null) {
    if (state.match >= 80)
      parts.push(`Your pitch contour matched the ${pattern.value.short.toLowerCase()} target at ${state.match}%.`)
    else if (state.match >= 60)
      parts.push(`Your intonation is a good start at ${state.match}%, but a few segments diverged — keep energy steady through the middle.`)
    else parts.push(`Only ${state.match}% intonation match. Listen to the native track and mirror the pitch movement across the whole phrase.`)
  }
  if (state.content !== null) {
    if (state.content >= 80) parts.push(`You nailed the wording at ${state.content}% content match.`)
    else if (state.content >= 50)
      parts.push(`Content match was ${state.content}% — you had most of the words, but check what you actually said against the target.`)
    else parts.push(`Content match was only ${state.content}%. Re-read the target phrase and repeat it word for word.`)
  }
  return parts.join(' ')
})

// ---- Phrase catalog ----
const catalogSearch = ref('')
const catalogInput = ref(null)
const catalogPhrases = computed(() => {
  const q = catalogSearch.value.trim().toLowerCase()
  if (!q) return phrasesInLanguage.value
  return phrasesInLanguage.value.filter(
    (p) => p.text.toLowerCase().includes(q) || p.desc?.toLowerCase().includes(q) || p.translation?.toLowerCase().includes(q),
  )
})

async function openCatalog() {
  state.catalogOpen = true
  catalogSearch.value = ''
  await nextTick()
  catalogInput.value?.focus()
}
function closeCatalog() {
  state.catalogOpen = false
}
function selectPhrase(id, { drill = false } = {}) {
  router.push({ path: '/practice', query: { phrase: String(id), ...(drill ? { drill: '1' } : {}) } })
  closeCatalog()
}

// ---- Daily drill mode (?drill=1) ----
const drill = computed(() => drillProgress(store.drills[phrase.value.language], store.recordings))
const drillIndex = computed(() => drill.value.items.findIndex((i) => String(i.phraseId) === String(phrase.value.id)))
const inDrill = computed(() => String(route.query.drill) === '1' && drillIndex.value >= 0)
// The next unfinished drill phrase after this one, wrapping round.
const nextDrillItem = computed(() => {
  const items = drill.value.items
  for (let k = 1; k <= items.length; k++) {
    const item = items[(drillIndex.value + k) % items.length]
    if (!item.done && String(item.phraseId) !== String(phrase.value.id)) return item
  }
  return null
})

function nextPhrase() {
  if (inDrill.value && nextDrillItem.value) return selectPhrase(nextDrillItem.value.phraseId, { drill: true })
  const list = phrasesInLanguage.value
  const i = list.findIndex((p) => p.id === phrase.value.id)
  const next = list[(i + 1) % list.length]
  if (next) selectPhrase(next.id)
}

// ---- Local-AI suggestions ----
const aiAvailable = hasLocalAI()
const suggesting = ref(false)
const suggestNote = ref('')

async function suggestPhrases() {
  if (suggesting.value) return
  suggesting.value = true
  suggestNote.value = ''
  try {
    const list = await generatePhraseSuggestions({
      language: store.language,
      pattern: phrase.value.pattern,
      count: 6,
    })
    const existing = new Set([...phrases, ...store.suggestedPhrases].map((p) => p.text.toLowerCase()))
    const stamp = Date.now()
    let added = 0
    list.forEach((p, i) => {
      const text = (p.text || '').trim()
      if (!text || existing.has(text.toLowerCase())) return
      existing.add(text.toLowerCase())
      store.suggestedPhrases.unshift({ id: `ai-${stamp}-${i}`, source: 'ai', attempts: 'AI', ...p, text })
      added++
    })
    suggestNote.value = added
      ? `Added ${added} suggested ${store.language} phrase${added > 1 ? 's' : ''} (${pattern.value.short} intonation).`
      : 'No new suggestions found — try a different tone or language.'
  } catch (e) {
    suggestNote.value = 'Could not generate suggestions.'
  } finally {
    suggesting.value = false
  }
}

// ---- Attempt lifecycle ----
// Invariant: pitch.audioUrl is only non-empty for a take saved to the store,
// so it is never revoked here; discarded takes are revoked immediately.
const userAudio = new Audio()
const isUserPlaying = ref(false)
userAudio.onended = userAudio.onerror = () => {
  isUserPlaying.value = false
}

let attempt = 0
let startedAt = 0

function setStatus(text, error = false) {
  state.status = text
  state.error = error
}

function stopPlayback() {
  userAudio.pause()
  isUserPlaying.value = false
  stopSpeaking()
  state.nativePlaying = false
}

function resetAttempt() {
  attempt++
  const wasActive = state.mode === 'recording' || state.mode === 'starting'
  speech.abort()
  stopPlayback()
  if (wasActive) pitch.stop().then(() => pitch.discardAudio())
  else pitch.clearAudio()
  takeContour.value = []
  Object.assign(state, { mode: 'idle', match: null, content: null, lastRecordingId: null })
  setStatus(IDLE_STATUS)
}

watch(() => phrase.value.id, resetAttempt)

function micErrorMessage(e) {
  if (e?.name === 'NotAllowedError') return 'Microphone permission was denied. Allow mic access in your browser’s site settings, then try again.'
  if (e?.name === 'NotFoundError') return 'No microphone was found. Plug one in and try again.'
  if (e?.name === 'NotReadableError') return 'Your microphone is being used by another app.'
  return 'Microphone unavailable: ' + (e?.message || 'unknown error')
}

async function toggleMic() {
  if (isRecording.value) return stopRecording()
  if (isBusy.value) return
  if (!micSupported) return setStatus('This browser can’t access the microphone. Try Chrome on localhost or HTTPS.', true)

  const token = ++attempt
  stopPlayback()
  pitch.clearAudio()
  takeContour.value = []
  Object.assign(state, { mode: 'starting', match: null, content: null, lastRecordingId: null })
  setStatus('Requesting microphone…')
  try {
    await pitch.start()
  } catch (e) {
    if (token !== attempt) return
    state.mode = 'idle'
    return setStatus(micErrorMessage(e), true)
  }
  if (token !== attempt || !pitch.running) return
  speech.start()
  startedAt = performance.now()
  state.mode = 'recording'
  setStatus('Listening… say the phrase, then tap stop')
}

async function stopRecording() {
  const token = attempt
  const p = phrase.value
  const tgt = target.value
  const hz = [...pitch.samples]
  const durationMs = Math.round(performance.now() - startedAt)
  state.mode = 'processing'
  setStatus('Analyzing your take…')

  const [audioUrl] = await Promise.all([pitch.stop(), speech.stopAndFlush()])
  if (token !== attempt) {
    pitch.discardAudio()
    return
  }

  const transcript = currentTranscript.value
  const content = transcript ? matchContent(transcript, p.text) : speech.supported && !speech.error.value ? 0 : null
  const contour = userContour(hz, tgt)
  takeContour.value = displayContour(hz, tgt)
  state.mode = 'done'
  state.content = content

  if (!contour) {
    pitch.discardAudio()
    return setStatus('Not enough voiced speech detected — speak a little louder or closer to the mic and try again.', true)
  }

  const match = scoreContour(contour, tgt)
  state.match = match
  const rec = addRecording({
    phraseId: p.id,
    text: p.text,
    language: p.language,
    pattern: p.pattern,
    match,
    content,
    transcript,
    contour,
    durationMs,
    audioUrl,
  })
  state.lastRecordingId = rec.id
  const contentPart = content === null ? '' : ` · Content ${content}%`
  setStatus(`Saved — Intonation ${match}%${contentPart}${audioUrl ? '' : ' (audio capture unavailable)'}`)
}

watch(speech.errorMessage, (msg) => {
  if (msg && isRecording.value) setStatus(`${msg} Pitch is still being tracked.`, true)
})

function playUserAudio() {
  if (!pitch.audioUrl) return
  if (isUserPlaying.value) {
    userAudio.pause()
    isUserPlaying.value = false
    return
  }
  stopPlayback()
  userAudio.src = pitch.audioUrl
  userAudio.currentTime = 0
  userAudio.play().catch(() => (isUserPlaying.value = false))
  isUserPlaying.value = true
}

function playNative() {
  if (state.nativePlaying) return stopPlayback()
  stopPlayback()
  const ok = speak(phrase.value.text, phrase.value.language, {
    gender: voiceGender.value,
    onEnd: () => (state.nativePlaying = false),
  })
  if (!ok) return setStatus('Text-to-speech isn’t available in this browser.', true)
  state.nativePlaying = true
}

// ---- Keyboard ----
function onKeydown(e) {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
  if (state.catalogOpen) {
    if (e.key === 'Escape') closeCatalog()
    return
  }
  const el = e.target
  if (el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(el?.tagName)) return
  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault()
    toggleMic()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  resetAttempt()
})
</script>

<template>
  <div class="px-margin-mobile md:px-margin-desktop pb-xl pt-6 flex flex-col">
    <div class="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-md max-w-[1600px] mx-auto w-full">
      <div
        v-if="missingFeatures.length"
        class="lg:col-span-12 flex items-start gap-sm rounded-xl border border-tertiary/30 bg-tertiary/10 p-sm text-body-sm text-on-surface"
        role="status"
      >
        <span class="material-symbols-outlined text-tertiary">info</span>
        <p>
          This browser doesn’t support {{ missingFeatures.join(', ') }}. VocalFlow works best in Chrome on
          <code>localhost</code> or HTTPS.
        </p>
      </div>

      <!-- Visualization Area -->
      <div class="lg:col-span-8 flex flex-col gap-md">
        <!-- Drill progress -->
        <div v-if="inDrill" class="glass-panel rounded-xl px-md py-sm flex items-center justify-between gap-sm flex-wrap">
          <div class="flex items-center gap-sm">
            <span class="material-symbols-outlined text-secondary">fitness_center</span>
            <span class="text-label-md text-on-surface">Today's drill · {{ drillIndex + 1 }} of {{ drill.total }}</span>
            <span class="text-label-md text-on-surface-variant">({{ drill.done }} done)</span>
          </div>
          <div class="flex items-center gap-sm">
            <nav class="flex gap-1.5" aria-label="Drill phrases">
              <router-link
                v-for="(item, i) in drill.items"
                :key="item.phraseId"
                :to="{ path: '/practice', query: { phrase: String(item.phraseId), drill: '1' } }"
                class="w-3 h-3 rounded-full transition-colors"
                :class="[
                  item.done ? 'bg-secondary' : 'bg-surface-variant hover:bg-outline',
                  i === drillIndex ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : '',
                ]"
                :aria-label="`Drill phrase ${i + 1}${item.done ? ', done' : ''}`"
                :aria-current="i === drillIndex ? 'step' : undefined"
              ></router-link>
            </nav>
            <router-link
              :to="{ path: '/practice', query: { phrase: String(phrase.id) } }"
              class="text-label-md text-on-surface-variant hover:text-on-surface"
              >Exit drill</router-link
            >
          </div>
        </div>

        <!-- Phrase Header -->
        <div class="glass-panel rounded-xl p-md flex flex-col gap-sm">
          <div class="flex items-start justify-between flex-wrap gap-sm">
            <div class="min-w-0">
              <span class="text-label-md text-primary uppercase tracking-wider mb-xs block">Current Phrase · {{ phrase.language }}</span>
              <h2 class="font-bold text-on-surface" style="font-size: clamp(1.5rem, 3vw, 2.5rem); line-height: 1.1">
                <template v-for="(seg, i) in displayText" :key="i"
                  ><span v-if="seg.hl" class="text-secondary-fixed">{{ seg.text }}</span
                  ><template v-else>{{ seg.text }}</template
                ></template>
              </h2>
              <p v-if="phrase.translation" class="text-body-md text-on-surface-variant mt-1">{{ phrase.translation }}</p>
              <div class="flex items-center gap-xs mt-xs flex-wrap">
                <span class="px-xs py-0.5 rounded text-[10px] font-semibold border" :class="patternBadge[phrase.pattern]">{{ pattern.short }}</span>
                <span class="px-xs py-0.5 rounded text-[10px] font-semibold border" :class="lengthBadge[phrase.length] || lengthBadge.Medium">{{ phrase.length }}</span>
                <span class="text-[10px] text-on-surface-variant">{{ phrase.difficulty }} · {{ phrase.category }}</span>
              </div>
            </div>
            <div class="flex gap-xs">
              <button
                @click="playNative"
                class="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center transition-colors border"
                :class="state.nativePlaying ? 'text-secondary border-secondary/40' : 'text-on-surface hover:text-primary border-outline-variant/20'"
                :aria-label="state.nativePlaying ? 'Stop native audio' : 'Play native audio'"
                :title="state.nativePlaying ? 'Stop native audio' : 'Play native audio'"
              >
                <span class="material-symbols-outlined text-[20px]">{{ state.nativePlaying ? 'stop' : 'volume_up' }}</span>
              </button>
              <button
                @click="nextPhrase"
                class="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface hover:text-primary transition-colors border border-outline-variant/20"
                aria-label="Next phrase"
                title="Next phrase"
              >
                <span class="material-symbols-outlined text-[20px]">skip_next</span>
              </button>
              <button
                @click="openCatalog"
                class="h-10 px-sm rounded-full bg-surface-container-high flex items-center gap-xs text-on-surface hover:text-primary transition-colors border border-outline-variant/20 text-label-md"
                aria-haspopup="dialog"
              >
                <span class="material-symbols-outlined text-[20px]">list</span>
                <span class="hidden sm:inline">Change phrase</span>
              </button>
            </div>
          </div>

          <!-- Voice Settings -->
          <div class="flex items-center gap-2 pt-sm border-t border-outline-variant/10" role="group" aria-label="Native voice">
            <span class="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden="true">record_voice_over</span>
            <span class="text-label-md text-on-surface-variant">Native voice</span>
            <div class="flex gap-1">
              <button
                v-for="g in ['female', 'male']"
                :key="g"
                @click="voiceGender = g"
                :aria-pressed="voiceGender === g"
                class="px-3 py-1 rounded-full text-label-md border capitalize transition-colors"
                :class="
                  voiceGender === g
                    ? 'bg-secondary/20 text-secondary border-secondary/30'
                    : 'bg-surface-container border-outline-variant/20 text-on-surface-variant hover:text-on-surface'
                "
              >
                {{ g }}
              </button>
            </div>
          </div>
        </div>

        <!-- Main Pitch Canvas -->
        <div
          class="flex-1 min-h-[320px] md:min-h-[400px] rounded-xl border border-outline-variant/10 relative overflow-hidden flex flex-col bg-gradient-to-b from-surface to-surface-container-lowest"
        >
          <div class="absolute top-sm left-sm right-sm flex justify-between items-start z-10 pointer-events-none flex-wrap gap-xs">
            <div class="flex gap-sm">
              <div class="flex items-center gap-xs bg-surface-container/80 backdrop-blur px-sm py-xs rounded-full border border-outline-variant/10">
                <div class="w-3 border-t-2 border-dashed border-outline"></div>
                <span class="text-label-md text-on-surface-variant">Target</span>
              </div>
              <div
                class="flex items-center gap-xs bg-surface-container/80 backdrop-blur px-sm py-xs rounded-full border"
                :class="isRecording ? 'border-secondary/40' : 'border-primary/30'"
              >
                <div class="w-2 h-2 rounded-full" :class="isRecording ? 'bg-secondary animate-pulse' : 'bg-primary'"></div>
                <span class="text-label-md text-primary">You</span>
              </div>
            </div>
            <div v-if="state.match !== null || state.content !== null" class="flex gap-sm">
              <div v-if="state.match !== null" class="bg-surface-container/80 backdrop-blur px-sm py-xs rounded-full border border-outline-variant/10">
                <span class="text-label-md" :class="scoreColor(state.match)">Intonation {{ state.match }}%</span>
              </div>
              <div v-if="state.content !== null" class="bg-surface-container/80 backdrop-blur px-sm py-xs rounded-full border border-outline-variant/10">
                <span class="text-label-md" :class="scoreColor(state.content)">Content {{ state.content }}%</span>
              </div>
            </div>
          </div>

          <div class="absolute inset-0">
            <PitchCurve :target="target" :samples="displaySamples" :match="state.match" :live="isRecording" />
          </div>

          <div v-if="!isRecording && !hasSamples" class="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div class="text-center space-y-xs bg-background/60 rounded-lg px-md py-sm border border-outline-variant/10">
              <template v-if="state.mode === 'processing'">
                <span class="material-symbols-outlined text-primary animate-spin block">progress_activity</span>
                <p class="text-body-md text-on-surface-variant">Analyzing…</p>
              </template>
              <template v-else>
                <p class="text-body-md text-on-surface-variant">The dashed line is the target pitch shape</p>
                <p class="text-label-md text-primary">Press the mic and match its movement</p>
              </template>
            </div>
          </div>

          <div
            v-if="currentTranscript"
            class="absolute bottom-2 left-1/2 -translate-x-1/2 max-w-[90%] bg-surface-container/90 backdrop-blur px-md py-xs rounded-full border border-outline-variant/10 z-10 flex items-center gap-sm"
          >
            <span class="text-body-sm text-secondary truncate">"{{ currentTranscript }}"</span>
            <span v-if="isRecording && liveContentMatch !== null" class="text-label-md shrink-0" :class="scoreColor(liveContentMatch)">
              {{ liveContentMatch }}%
            </span>
          </div>
        </div>

        <!-- Controls & live pitch -->
        <div class="glass-panel rounded-xl p-sm flex flex-col gap-sm">
          <div class="flex items-start justify-center gap-md sm:gap-lg">
            <div class="flex flex-col items-center gap-1 pt-4">
              <button
                @click="playNative"
                class="w-12 h-12 rounded-full border flex items-center justify-center transition-all"
                :class="state.nativePlaying ? 'border-secondary text-secondary bg-secondary/10' : 'border-outline-variant/30 text-on-surface hover:bg-surface-variant/30 hover:text-primary'"
                :aria-label="state.nativePlaying ? 'Stop native audio' : 'Play native audio'"
              >
                <span class="material-symbols-outlined text-[24px]">{{ state.nativePlaying ? 'stop' : 'volume_up' }}</span>
              </button>
              <span class="text-[10px] text-on-surface-variant">Native</span>
            </div>
            <div class="flex flex-col items-center gap-1">
              <button
                @click="toggleMic"
                :disabled="isBusy"
                class="w-20 h-20 rounded-full flex items-center justify-center transition-colors card-elevation relative z-20 disabled:cursor-wait disabled:opacity-70"
                :class="isRecording ? 'bg-error-container text-on-error-container mic-pulse' : 'bg-primary text-on-primary hover:bg-primary-fixed'"
                :aria-label="isRecording ? 'Stop recording' : 'Start recording'"
              >
                <span class="material-symbols-outlined text-[32px]" :class="isBusy ? 'animate-spin' : ''">{{
                  isBusy ? 'progress_activity' : isRecording ? 'stop' : 'mic'
                }}</span>
              </button>
              <span class="text-[10px] text-on-surface-variant">
                {{ isRecording ? 'Stop' : 'Record' }} <kbd class="hidden md:inline px-1 rounded border border-outline-variant/40 text-[9px]">Space</kbd>
              </span>
            </div>
            <div class="flex flex-col items-center gap-1 pt-4">
              <button
                @click="playUserAudio"
                :disabled="!pitch.audioUrl"
                class="w-12 h-12 rounded-full flex items-center justify-center transition-all border"
                :class="
                  pitch.audioUrl
                    ? isUserPlaying
                      ? 'border-secondary text-secondary bg-secondary/10'
                      : 'border-primary/40 text-primary hover:bg-primary/10'
                    : 'border-outline-variant/30 text-outline-variant cursor-not-allowed opacity-50'
                "
                :aria-label="pitch.audioUrl ? (isUserPlaying ? 'Pause your recording' : 'Play your recording') : 'No recording yet'"
              >
                <span class="material-symbols-outlined text-[24px]">{{ isUserPlaying ? 'pause' : 'play_arrow' }}</span>
              </button>
              <span class="text-[10px] text-on-surface-variant">Your take</span>
            </div>
          </div>
          <div class="flex items-center justify-center text-center min-h-5" aria-live="polite">
            <span class="text-label-md" :class="state.error ? 'text-tertiary' : isRecording ? 'text-secondary' : 'text-on-surface-variant'">{{ state.status }}</span>
          </div>
          <div
            v-if="state.mode === 'done' && inDrill && drill.complete"
            class="flex flex-col items-center gap-xs text-center"
            role="status"
          >
            <p class="text-body-md text-secondary flex items-center gap-xs">
              <span class="material-symbols-outlined">celebration</span>
              Drill complete — average {{ drill.average }}% across {{ drill.total }} phrases.
            </p>
            <div class="flex flex-wrap justify-center gap-sm">
              <button
                @click="toggleMic"
                class="flex items-center gap-1 px-md py-xs rounded-full border border-outline-variant/30 text-label-md text-on-surface hover:bg-surface-variant/30 transition-colors"
              >
                <span class="material-symbols-outlined text-[18px]">restart_alt</span> Try again
              </button>
              <router-link
                to="/"
                class="flex items-center gap-1 px-md py-xs rounded-full bg-secondary/15 border border-secondary/30 text-label-md text-secondary hover:bg-secondary/25 transition-colors"
              >
                Back to dashboard <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
              </router-link>
            </div>
          </div>
          <div v-else-if="state.mode === 'done'" class="flex flex-wrap items-center justify-center gap-sm">
            <button
              @click="toggleMic"
              class="flex items-center gap-1 px-md py-xs rounded-full border border-outline-variant/30 text-label-md text-on-surface hover:bg-surface-variant/30 transition-colors"
            >
              <span class="material-symbols-outlined text-[18px]">restart_alt</span> Try again
            </button>
            <button
              @click="nextPhrase"
              class="flex items-center gap-1 px-md py-xs rounded-full bg-primary/15 border border-primary/30 text-label-md text-primary hover:bg-primary/25 transition-colors"
            >
              {{ inDrill ? 'Next in drill' : 'Next phrase' }} <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>
          <!-- Live pitch (F0) readout -->
          <div v-if="isRecording" class="flex items-baseline justify-center gap-sm h-8" aria-hidden="true">
            <span class="text-label-md text-on-surface-variant uppercase tracking-wider">Pitch</span>
            <template v-if="livePitch">
              <span class="text-headline-sm text-secondary tabular-nums">{{ livePitch.hz }} Hz</span>
              <span class="text-label-md text-on-surface-variant tabular-nums">{{ livePitch.note }}</span>
            </template>
            <span v-else class="text-headline-sm text-outline-variant">—</span>
          </div>
        </div>
      </div>

      <!-- Sidebar -->
      <div class="lg:col-span-4 flex flex-col gap-md">
        <!-- Tonal Intent -->
        <div class="bg-surface-container-low border border-outline-variant/10 rounded-xl p-md">
          <div class="flex items-center gap-sm mb-md">
            <span class="material-symbols-outlined text-primary">psychology</span>
            <h3 class="text-headline-sm text-on-surface">Tonal Intent</h3>
          </div>
          <div class="bg-surface-container border border-primary/20 rounded-lg p-sm mb-sm relative overflow-hidden">
            <div class="absolute top-0 left-0 w-1 h-full bg-primary"></div>
            <p class="text-label-md text-primary mb-xs">TARGET</p>
            <p class="text-body-lg text-on-surface font-semibold">{{ pattern.label }}</p>
            <p class="text-body-sm text-on-surface-variant mt-xs">{{ pattern.desc }}</p>
          </div>
          <div class="space-y-xs mt-md">
            <span class="text-label-md text-on-surface-variant uppercase tracking-wider block mb-xs">Key Markers</span>
            <div v-for="(m, i) in pattern.markers" :key="i" class="flex items-center gap-sm p-xs rounded bg-surface-container-highest">
              <div class="w-3 h-3 rounded-full" :class="m.color"></div>
              <span class="text-body-sm text-on-surface">{{ m.text }}</span>
            </div>
          </div>
        </div>

        <!-- Analysis Feedback -->
        <div class="glass-panel border border-outline-variant/10 rounded-xl p-md flex-1">
          <h3 class="text-headline-sm text-on-surface mb-sm">Session Feedback</h3>
          <p class="text-body-md text-on-surface-variant mb-md">{{ feedback }}</p>
          <router-link
            :to="state.lastRecordingId ? { path: '/analysis', query: { rec: state.lastRecordingId } } : '/analysis'"
            class="block w-full py-sm border border-primary/30 text-primary rounded-lg text-label-md text-center hover:bg-primary/10 transition-colors"
          >
            {{ state.lastRecordingId ? 'Analyze this take' : 'View detailed analysis' }}
          </router-link>
        </div>
      </div>
    </div>

    <!-- Phrase Catalog Modal -->
    <Teleport to="body">
      <div
        v-if="state.catalogOpen"
        class="fixed inset-0 z-50 flex items-start justify-center p-md pt-[8vh]"
        @click.self="closeCatalog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-title"
      >
        <div class="absolute inset-0 bg-background/80 backdrop-blur-sm" @click="closeCatalog"></div>
        <div class="relative w-full max-w-3xl max-h-[80vh] glass-panel rounded-xl flex flex-col overflow-hidden card-elevation">
          <div class="flex items-start justify-between gap-sm p-md border-b border-outline-variant/10">
            <div class="flex-1">
              <h3 id="catalog-title" class="text-headline-md text-on-surface mb-xs">Choose a phrase</h3>
              <p class="text-label-md text-on-surface-variant mb-sm">{{ catalogPhrases.length }} {{ store.language }} phrases</p>
              <div class="relative">
                <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
                <input
                  ref="catalogInput"
                  v-model="catalogSearch"
                  class="w-full bg-surface-container-low border border-outline-variant/20 rounded-lg py-2 pl-9 pr-4 text-body-sm text-on-surface focus:outline-none focus:border-primary transition-all"
                  placeholder="Search by text, meaning, or context…"
                  type="search"
                  aria-label="Search phrases"
                />
              </div>
            </div>
            <button
              @click="closeCatalog"
              class="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/40 transition-colors"
              aria-label="Close"
            >
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="p-sm border-b border-outline-variant/10 flex flex-wrap items-center gap-sm justify-between">
            <button
              @click="suggestPhrases"
              :disabled="suggesting"
              class="flex items-center gap-2 px-md py-sm rounded-full text-label-md border transition-colors"
              :class="
                suggesting
                  ? 'border-outline-variant/30 text-on-surface-variant opacity-70 cursor-wait'
                  : 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/25'
              "
            >
              <span class="material-symbols-outlined text-[18px]" :class="suggesting ? 'animate-spin' : ''">auto_awesome</span>
              {{ suggesting ? 'Asking the on-device AI…' : aiAvailable ? 'Suggest phrases with local AI' : 'Suggest more phrases' }}
            </button>
            <span class="text-label-md text-on-surface-variant" aria-live="polite">{{ suggestNote }}</span>
          </div>
          <div class="overflow-y-auto p-sm flex flex-col gap-xs">
            <button
              v-for="p in catalogPhrases"
              :key="p.id"
              @click="selectPhrase(p.id)"
              class="flex items-center justify-between gap-sm p-sm rounded-lg border text-left transition-colors group"
              :class="
                p.id === phrase.id
                  ? 'bg-primary/10 border-primary/40'
                  : 'bg-surface-container-low border-transparent hover:bg-surface-container-high hover:border-outline-variant/30'
              "
              :aria-current="p.id === phrase.id ? 'true' : undefined"
            >
              <div class="min-w-0">
                <p class="text-body-md font-semibold text-on-surface truncate">"{{ p.text }}"</p>
                <p v-if="p.translation" class="text-body-sm text-on-surface-variant truncate">{{ p.translation }}</p>
                <div class="flex gap-xs mt-1 flex-wrap">
                  <span v-if="p.source === 'ai'" class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-primary/20 text-primary">AI</span>
                  <span class="px-xs py-0.5 rounded text-[10px] font-semibold border" :class="patternBadge[p.pattern]">{{ tonalPatterns[p.pattern]?.short }}</span>
                  <span class="px-xs py-0.5 rounded text-[10px] font-semibold border" :class="lengthBadge[p.length] || lengthBadge.Medium">{{ p.length }}</span>
                  <span class="text-[10px] text-on-surface-variant">{{ p.difficulty }} · {{ p.category }}</span>
                </div>
              </div>
              <span v-if="p.id === phrase.id" class="material-symbols-outlined text-primary text-[20px] shrink-0">check</span>
            </button>
            <p v-if="!catalogPhrases.length" class="text-body-sm text-on-surface-variant text-center p-md">No phrases match your search.</p>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.mic-pulse {
  animation: pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
}
@keyframes pulse-ring {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(208, 188, 255, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 20px rgba(208, 188, 255, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(208, 188, 255, 0);
  }
}
</style>
