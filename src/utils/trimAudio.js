// Trims leading/trailing silence off a captured audio blob by decoding it to
// PCM, locating the first/last voiced windows, then re-encoding the kept span.
// Returns the original blob unchanged if there is nothing to trim or if any
// step fails (decode/re-encode unsupported, etc.).

const SILENCE_THRESHOLD = 0.01
const WINDOW_MS = 20
const PAD_BEFORE_MS = 60
const PAD_AFTER_MS = 120
const MIN_KEPT_MS = 150

function windowRms(channel, from, to) {
  let sum = 0
  for (let i = from; i < to; i++) sum += channel[i] * channel[i]
  return Math.sqrt(sum / (to - from))
}

function findTrimRange(channel, sampleRate) {
  const windowSize = Math.max(1, Math.floor((sampleRate * WINDOW_MS) / 1000))
  let first = -1
  let last = -1
  for (let i = 0; i < channel.length; i += windowSize) {
    const to = Math.min(i + windowSize, channel.length)
    if (windowRms(channel, i, to) > SILENCE_THRESHOLD) {
      if (first < 0) first = i
      last = i
    }
  }
  if (first < 0 || last < 0) return null
  const start = Math.max(0, first - Math.floor((sampleRate * PAD_BEFORE_MS) / 1000))
  const end = Math.min(channel.length, last + windowSize + Math.floor((sampleRate * PAD_AFTER_MS) / 1000))
  const keptMs = ((end - start) / sampleRate) * 1000
  if (keptMs < MIN_KEPT_MS) return null
  return { start, end }
}

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

async function reencode(ctx, buffer) {
  const mime = pickMime()
  const dest = ctx.createMediaStreamDestination()
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(dest)
  const recorder = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : undefined)
  const chunks = []
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }
  const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve, { once: true }))
  recorder.start()
  source.start()
  await new Promise((resolve) => {
    source.onended = resolve
  })
  recorder.stop()
  await stopped
  return new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' })
}

export async function trimAudioBlob(blob) {
  if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return blob
  let ctx = null
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    await ctx.resume()
    const audioBuffer = await ctx.decodeAudioData(await blob.arrayBuffer())
    const range = findTrimRange(audioBuffer.getChannelData(0), audioBuffer.sampleRate)
    if (!range) return blob

    const { start, end } = range
    const length = end - start
    if (length <= 0) return blob

    const trimmed = ctx.createBuffer(audioBuffer.numberOfChannels, length, audioBuffer.sampleRate)
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
      trimmed.getChannelData(c).set(audioBuffer.getChannelData(c).subarray(start, end))
    }
    return await reencode(ctx, trimmed)
  } catch (e) {
    return blob
  } finally {
    if (ctx) {
      try {
        await ctx.close()
      } catch (e) {
        /* ignore */
      }
    }
  }
}
