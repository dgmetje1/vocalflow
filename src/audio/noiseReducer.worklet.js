// Adaptive spectral-subtraction noise reducer AudioWorklet.
// Self-contained (no ESM imports) so it can be loaded via
// audioContext.audioWorklet.addModule(new URL(...).href).
//
// Pipeline per frame (Hann-windowed 50%-overlap STFT):
//   raw -> FFT -> per-bin noise-floor estimate + oversubtraction + spectral floor
//        -> per-bin magnitude smoothing -> IFFT -> overlap-add -> output
// A noise gate ducks low-energy frames to silence out pauses.

const FFT_SIZE = 2048
const HOP = FFT_SIZE / 2
const WIN = FFT_SIZE

// A periodic Hann window at 50% overlap sums to exactly 1, so overlap-add
// reconstructs the input at unity gain.
const GAIN = 1

const GATE_RMS = 0.005
const CALIB_FRAMES = 25
// Frames at least this loud are treated as speech and never used to learn the
// noise floor, so talking straight away doesn't get your voice subtracted.
const CALIB_MAX_RMS = 0.02
const ALPHA_SPEECH = 1.3
const ALPHA_NOISE = 2.2
const SPECTRAL_FLOOR = 0.02
const SMOOTH = 0.75

function fft(re, im, n, inverse) {
  let j = 0
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t
      t = im[i]; im[i] = im[j]; im[j] = t
    }
    let k = n >> 1
    while (k <= j) {
      j -= k
      k >>= 1
    }
    j += k
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1
    const ang = ((2 * Math.PI) / size) * (inverse ? 1 : -1)
    const wRe = Math.cos(ang)
    const wIm = Math.sin(ang)
    for (let i = 0; i < n; i += size) {
      let curRe = 1
      let curIm = 0
      for (let k = 0; k < half; k++) {
        const a = i + k
        const b = a + half
        const tr = re[b] * curRe - im[b] * curIm
        const ti = re[b] * curIm + im[b] * curRe
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
        const nr = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nr
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n
      im[i] /= n
    }
  }
}

class NoiseReducerProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.blockSize = 128
    this.inputBuf = new Float32Array(FFT_SIZE)
    this.inputLen = 0

    this.window = new Float32Array(WIN)
    for (let i = 0; i < WIN; i++) {
      this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / FFT_SIZE))
    }

    this.re = new Float32Array(FFT_SIZE)
    this.im = new Float32Array(FFT_SIZE)

    const half = FFT_SIZE / 2
    this.noiseFloor = new Float32Array(half + 1)
    this.smoothMag = new Float32Array(half + 1)

    this.calibFrames = 0
    this.calibrated = false
    this.gateGain = 1

    this.outBuf = new Float32Array(FFT_SIZE + HOP)
    this.outFill = 0
    this.outStart = 0
  }

  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0]
    const outChannels = outputs[0]
    if (!input || !outChannels || !outChannels[0]) return true

    // inputBuf is a sliding window: the previous hop stays in the first half
    // and new samples fill the second half.
    for (let i = 0; i < input.length; i++) {
      this.inputBuf[FFT_SIZE - HOP + this.inputLen++] = input[i]
      if (this.inputLen === HOP) {
        this.processFrame()
        this.inputLen = 0
      }
    }

    if (this.outStart >= this.outFill) {
      for (let i = 0; i < outChannels[0].length; i++) outChannels[0][i] = 0
    } else {
      for (let i = 0; i < outChannels[0].length; i++) {
        outChannels[0][i] = this.outBuf[this.outStart++]
      }
    }
    for (let c = 1; c < outChannels.length; c++) {
      outChannels[c].set(outChannels[0])
    }

    // Shift consumed samples out, keeping the tail of the last frame (which
    // the next frame still overlap-adds onto); only the vacated end is zeroed.
    if (this.outStart > 0) {
      this.outBuf.copyWithin(0, this.outStart)
      this.outBuf.fill(0, this.outBuf.length - this.outStart)
      this.outFill -= this.outStart
      this.outStart = 0
    }
    return true
  }

  processFrame() {
    let s = 0
    for (let i = 0; i < FFT_SIZE; i++) s += this.inputBuf[i] * this.inputBuf[i]
    const rms = Math.sqrt(s / FFT_SIZE)
    const silent = rms < GATE_RMS

    for (let i = 0; i < FFT_SIZE; i++) {
      this.re[i] = this.inputBuf[i] * this.window[i]
      this.im[i] = 0
    }

    fft(this.re, this.im, FFT_SIZE, false)

    const half = FFT_SIZE / 2

    if (!this.calibrated) {
      // Learn the noise floor from quiet frames only; until enough have been
      // seen, audio passes through untouched.
      if (rms < CALIB_MAX_RMS) {
        this.calibFrames++
        for (let b = 0; b <= half; b++) {
          const m = Math.hypot(this.re[b], this.im[b])
          this.noiseFloor[b] = 0.8 * this.noiseFloor[b] + 0.2 * m
        }
        if (this.calibFrames >= CALIB_FRAMES) this.calibrated = true
      }
    } else if (silent) {
      for (let b = 0; b <= half; b++) {
        const m = Math.hypot(this.re[b], this.im[b])
        this.noiseFloor[b] = 0.95 * this.noiseFloor[b] + 0.05 * m
      }
    }

    if (this.calibrated) {
      const alpha = silent ? ALPHA_NOISE : ALPHA_SPEECH
      for (let b = 0; b <= half; b++) {
        const mag = Math.hypot(this.re[b], this.im[b])
        const sub = mag - alpha * this.noiseFloor[b]
        const cleaned = Math.max(sub, SPECTRAL_FLOOR * Math.max(mag, 1e-6))
        this.smoothMag[b] = SMOOTH * this.smoothMag[b] + (1 - SMOOTH) * cleaned
      }
      const target = silent ? 0 : 1
      this.gateGain = 0.7 * this.gateGain + 0.3 * target
    } else {
      for (let b = 0; b <= half; b++) {
        this.smoothMag[b] = Math.hypot(this.re[b], this.im[b])
      }
      this.gateGain = 1
    }

    for (let b = 0; b <= half; b++) {
      const m = this.smoothMag[b] * this.gateGain
      const phase = Math.atan2(this.im[b], this.re[b])
      this.re[b] = m * Math.cos(phase)
      this.im[b] = m * Math.sin(phase)
    }
    for (let b = 1; b < half; b++) {
      this.re[FFT_SIZE - b] = this.re[b]
      this.im[FFT_SIZE - b] = -this.im[b]
    }

    fft(this.re, this.im, FFT_SIZE, true)

    const start = this.outFill
    for (let i = 0; i < FFT_SIZE; i++) {
      this.outBuf[start + i] += this.re[i] * GAIN
    }
    this.outFill += HOP

    this.inputBuf.copyWithin(0, HOP)
  }
}

registerProcessor('noise-reducer', NoiseReducerProcessor)
