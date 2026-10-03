import { computed, ref } from 'vue'

const ERROR_MESSAGES = {
  'not-allowed': 'Microphone access for transcription was blocked.',
  'service-not-allowed': 'Speech recognition is disabled in this browser.',
  'audio-capture': 'No microphone was found for transcription.',
  network: 'Transcription needs a network connection in Chrome.',
  'language-not-supported': 'Transcription is not available for this language.',
}

export function useSpeechRecognition({ lang = 'en-US', continuous = false, interim = true } = {}) {
  const supported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  const recognition = supported
    ? new (window.SpeechRecognition || window.webkitSpeechRecognition)()
    : null

  const isListening = ref(false)
  const transcript = ref('')
  const interimTranscript = ref('')
  const error = ref(null)
  const errorMessage = computed(() => (error.value && ERROR_MESSAGES[error.value]) || '')
  // Finalised text plus whatever is still being recognised.
  const fullTranscript = computed(() => `${transcript.value} ${interimTranscript.value}`.replace(/\s+/g, ' ').trim())

  let endWaiters = []

  if (recognition) {
    recognition.lang = lang
    recognition.continuous = continuous
    recognition.interimResults = interim
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }
      if (final) transcript.value += final.trim() + ' '
      interimTranscript.value = interim
    }
    recognition.onerror = (event) => {
      error.value = event.error
      if (event.error !== 'no-speech') isListening.value = false
    }
    recognition.onend = () => {
      isListening.value = false
      endWaiters.forEach((resolve) => resolve())
      endWaiters = []
    }
  }

  function start() {
    if (!supported || !recognition) return
    transcript.value = ''
    interimTranscript.value = ''
    error.value = null
    isListening.value = true
    try {
      recognition.start()
    } catch (e) {
      error.value = e.message
      isListening.value = false
    }
  }

  function stop() {
    if (!supported || !recognition) return
    recognition.stop()
    isListening.value = false
  }

  // Stops and waits (briefly) for the engine to flush its final result, so the
  // transcript is complete before it is scored.
  function stopAndFlush(timeoutMs = 1200) {
    if (!supported || !recognition || !isListening.value) return Promise.resolve()
    const done = new Promise((resolve) => {
      endWaiters.push(resolve)
      setTimeout(resolve, timeoutMs)
    })
    stop()
    return done
  }

  function abort() {
    if (!supported || !recognition) return
    recognition.abort()
    isListening.value = false
  }

  return {
    supported,
    recognition,
    isListening,
    transcript,
    interimTranscript,
    fullTranscript,
    error,
    errorMessage,
    start,
    stop,
    stopAndFlush,
    abort,
  }
}
