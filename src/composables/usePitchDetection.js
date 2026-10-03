import { reactive } from 'vue'
import { autoCorrelate } from '../audio/autocorrelate'
import PitchWorker from '../audio/pitchWorker?worker'
import { trimAudioBlob } from '../utils/trimAudio'

const workletUrl = new URL('../audio/noiseReducer.worklet.js', import.meta.url).href

const state = reactive({
  running: false,
  pitch: 0,
  level: 0,
  samples: [],
  audioUrl: '',
  recordingActive: false,
})

let _ctx = null
let _analyser = null
let _stream = null
let _recordStream = null
let _destination = null
let _raf = null
let _recorder = null
let _worker = null
let _chunks = []
let _starting = null
let _cancelStart = false

// ~15 s at 60 fps — long enough for the longest phrases without truncating the start.
const maxSamples = 900

// Forget the current take without revoking it: once a take is saved to the
// store, the store owns its blob URL (Analysis replays it later).
function clearAudio() {
  state.audioUrl = ''
  _chunks = []
}

// Forget *and* free the current take, for attempts that are thrown away.
function discardAudio() {
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl)
  clearAudio()
}

// Samples are raw fundamental frequency in Hz (0 = unvoiced); scoring and
// display normalise them relative to the speaker's own range.
function recordPitch(p, level) {
  if (!state.running) return
  state.pitch = p > 0 ? Math.round(p) : 0
  state.level = level
  state.samples.push(state.pitch)
  if (state.samples.length > maxSamples) state.samples.shift()
}

function loop() {
  if (!state.running || !_analyser) return
  const buffer = new Float32Array(_analyser.fftSize)
  _analyser.getFloatTimeDomainData(buffer)

  if (_worker) {
    _worker.postMessage({ buffer, sampleRate: _ctx.sampleRate }, [buffer.buffer])
  } else {
    recordPitch(autoCorrelate(buffer, _ctx.sampleRate), computeLevel(buffer))
  }

  _raf = requestAnimationFrame(loop)
}

function computeLevel(buffer) {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
  return Math.sqrt(sum / buffer.length)
}

function initWorker() {
  if (typeof Worker === 'undefined') return
  try {
    const w = new PitchWorker()
    w.onmessage = (e) => recordPitch(e.data.pitch, e.data.level)
    w.onerror = () => {
      w.terminate()
      if (_worker === w) _worker = null
    }
    _worker = w
  } catch (e) {
    _worker = null
  }
}

async function finalizeRecording() {
  if (_chunks.length) {
    const blob = new Blob(_chunks, { type: (_recorder && _recorder.mimeType) || 'audio/webm' })
    const trimmed = await trimAudioBlob(blob)
    state.audioUrl = URL.createObjectURL(trimmed)
  }
  _chunks = []
  _recorder = null
}

function startRecorder(stream) {
  if (typeof MediaRecorder === 'undefined' || !stream) return
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t))
  _chunks = []
  _recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  _recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) _chunks.push(e.data)
  }
  try {
    _recorder.start()
    state.recordingActive = true
  } catch (e) {
    _recorder = null
    _chunks = []
  }
}

async function buildGraph() {
  const source = _ctx.createMediaStreamSource(_stream)

  const highpass = _ctx.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = 75
  source.connect(highpass)

  const analyser = _ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.4

  // The take is recorded from the raw mic so playback sounds like your real
  // voice; noise reduction only cleans the signal fed to the pitch tracker.
  _recordStream = _stream
  _destination = null

  const hasWorklet = _ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined'
  if (hasWorklet) {
    try {
      await _ctx.audioWorklet.addModule(workletUrl)
      const noiseNode = new AudioWorkletNode(_ctx, 'noise-reducer')
      highpass.connect(noiseNode)
      noiseNode.connect(analyser)
      // Silent sink that keeps the worklet pulled; nothing records from it.
      _destination = _ctx.createMediaStreamDestination()
      noiseNode.connect(_destination)
      _analyser = analyser
      return
    } catch (e) {
      // fall through to the raw graph below
    }
  }

  highpass.connect(analyser)
  _analyser = analyser
}

export const micSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

async function doStart() {
  try {
    _stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false },
    })
    _ctx = new (window.AudioContext || window.webkitAudioContext)()
    initWorker()
    await buildGraph()
  } catch (e) {
    teardown()
    throw e
  }
  if (_cancelStart) {
    teardown()
    return
  }
  clearAudio()
  state.samples = []
  startRecorder(_recordStream)
  state.running = true
  loop()
}

// Concurrent calls (e.g. a double-click on the mic) share one start-up.
function start() {
  if (state.running) return Promise.resolve()
  if (!_starting) {
    _cancelStart = false
    _starting = doStart().finally(() => (_starting = null))
  }
  return _starting
}

function teardown() {
  if (_stream) {
    _stream.getTracks().forEach((t) => t.stop())
    _stream = null
  }
  _recordStream = null
  _destination = null
  if (_worker) {
    _worker.terminate()
    _worker = null
  }
  if (_ctx) {
    _ctx.close()
    _ctx = null
  }
  _analyser = null
}

// Resolves with the blob URL of the captured take ('' if none).
async function stop() {
  if (_starting) _cancelStart = true
  if (!state.running) return state.audioUrl
  state.running = false
  cancelAnimationFrame(_raf)

  if (_recorder && state.recordingActive) {
    state.recordingActive = false
    await new Promise((resolve) => {
      _recorder.addEventListener('stop', resolve, { once: true })
      try {
        _recorder.stop()
      } catch (e) {
        resolve()
      }
    })
    await finalizeRecording()
  }

  teardown()
  state.pitch = 0
  state.level = 0
  state.samples = []
  return state.audioUrl
}

export function usePitchDetection() {
  return Object.assign(state, { start, stop, clearAudio, discardAudio })
}
