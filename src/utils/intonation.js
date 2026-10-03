// Intonation scoring. Pitch is compared by *shape*, not absolute frequency:
// the user's voiced pitch track is converted to semitones relative to their own
// median, then centred on the target curve. A low and a high voice making the
// same melodic movement therefore score the same.

export const CONTOUR_POINTS = 60

// How many target-curve units one semitone spans. A typical question rise is
// ~8 semitones, which maps onto the 0.55-unit rise of the rising target.
const UNITS_PER_SEMITONE = 0.07

const MIN_HZ = 60
const MAX_HZ = 500
const MAX_GAP_FRAMES = 6

export function targetContour(pattern, n = CONTOUR_POINTS) {
  const out = []
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1)
    if (pattern === 'rising') out.push(0.35 + 0.55 * p)
    else if (pattern === 'falling') out.push(0.85 - 0.55 * p)
    else out.push(0.6 - 0.05 * p * p)
  }
  return out
}

export function resample(arr, n) {
  if (!arr.length) return []
  if (arr.length === 1) return new Array(n).fill(arr[0])
  const out = []
  for (let i = 0; i < n; i++) {
    const idx = (i / (n - 1)) * (arr.length - 1)
    const lo = Math.floor(idx)
    const hi = Math.min(arr.length - 1, lo + 1)
    out.push(arr[lo] + (arr[hi] - arr[lo]) * (idx - lo))
  }
  return out
}

function median(values) {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function isVoiced(hz) {
  return hz >= MIN_HZ && hz <= MAX_HZ
}

// 5-point median filter over voiced samples to knock out octave-jump spikes
// from the autocorrelation detector.
function despike(values) {
  return values.map((_, i) => median(values.slice(Math.max(0, i - 2), i + 3)))
}

function toSemitones(hzValues) {
  const ref = median(hzValues)
  return hzValues.map((hz) => 12 * Math.log2(hz / ref))
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v))
}

function centreOn(semitones, target) {
  const targetMean = target.reduce((a, v) => a + v, 0) / target.length
  const stMean = semitones.reduce((a, v) => a + v, 0) / semitones.length
  return semitones.map((st) => clamp01(targetMean + (st - stMean) * UNITS_PER_SEMITONE))
}

// Raw Hz track (0 = unvoiced) -> array of 0..1 values or null for unvoiced
// frames, aligned to the target. Used for the live/after-the-fact overlay.
export function displayContour(hzSamples, target) {
  const voicedIdx = []
  const voiced = []
  hzSamples.forEach((hz, i) => {
    if (isVoiced(hz)) {
      voicedIdx.push(i)
      voiced.push(hz)
    }
  })
  if (voiced.length < 2) return hzSamples.map(() => null)
  const aligned = centreOn(toSemitones(despike(voiced)), target)
  const out = hzSamples.map(() => null)
  voicedIdx.forEach((idx, k) => {
    out[idx] = aligned[k]
    // Bridge short detector dropouts (≤ ~100 ms) so a word reads as one line.
    const prev = voicedIdx[k - 1]
    if (prev !== undefined && idx - prev > 1 && idx - prev <= MAX_GAP_FRAMES) {
      for (let j = prev + 1; j < idx; j++) {
        out[j] = aligned[k - 1] + ((aligned[k] - aligned[k - 1]) * (j - prev)) / (idx - prev)
      }
    }
  })
  return out
}

// Raw Hz track -> fixed-length aligned contour of the voiced portion only, or
// null when there is not enough voiced speech to judge.
export function userContour(hzSamples, target, minVoiced = 6) {
  const voiced = hzSamples.filter(isVoiced)
  if (voiced.length < minVoiced) return null
  return centreOn(resample(toSemitones(despike(voiced)), target.length), target)
}

function meanAbsDiff(a, b, from = 0, to = a.length) {
  let diff = 0
  for (let i = from; i < to; i++) diff += Math.abs(a[i] - b[i])
  return diff / Math.max(1, to - from)
}

export function scoreContour(contour, target) {
  return Math.round(clamp01(1 - meanAbsDiff(contour, target) * 3) * 100)
}

// Splits the contour into one segment per word (weighted by word length) and
// grades each: perfect / slight / strong deviation.
export function wordScores(text, contour, target) {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length || !contour) return []
  const weights = words.map((w) => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, '').length))
  const total = weights.reduce((a, v) => a + v, 0)
  let cursor = 0
  return words.map((word, i) => {
    const from = Math.round((cursor / total) * contour.length)
    cursor += weights[i]
    const to = Math.max(from + 1, Math.round((cursor / total) * contour.length))
    const err = meanAbsDiff(contour, target, from, to)
    let bias = 0
    for (let k = from; k < to; k++) bias += contour[k] - target[k]
    const tone = err < 0.08 ? 'perfect' : err < 0.16 ? 'slight' : 'strong'
    // bias > 0: the voice sat above the target on this word; < 0: below it.
    return { word, tone, weight: weights[i], err, bias: bias / (to - from) }
  })
}

// Builds an SVG path for a 0..1 series, breaking the line at null gaps.
export function seriesToPath(values, width, height, pad = 30) {
  const n = values.length
  if (n < 2) return ''
  let d = ''
  let pen = false
  values.forEach((v, i) => {
    if (v === null || v === undefined) {
      pen = false
      return
    }
    const x = (i / (n - 1)) * width
    const y = height - pad - clamp01(v) * (height - pad * 2)
    d += `${pen ? ' L' : ' M'} ${x.toFixed(1)} ${y.toFixed(1)}`
    pen = true
  })
  return d.trim()
}
