// Shared autocorrelation pitch detector, used by the main thread (fallback)
// and the pitch-detection worker.

export function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length
  const rms = Math.sqrt(buf.reduce((a, v) => a + v * v, 0) / SIZE)
  if (rms < 0.01) return -1

  let r1 = 0
  let r2 = SIZE - 1
  const thres = 0.2
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) {
      r1 = i
      break
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) {
      r2 = SIZE - i
      break
    }
  }

  const buf2 = buf.slice(r1, r2)
  const size = buf2.length
  if (size < 16) return -1
  const c = new Array(size).fill(0)
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size - i; j++) {
      c[i] = c[i] + buf2[j] * buf2[j + i]
    }
  }

  let d = 0
  while (d < size - 1 && c[d] > c[d + 1]) d++
  let maxval = -1
  let maxpos = -1
  for (let i = d; i < size; i++) {
    if (c[i] > maxval) {
      maxval = c[i]
      maxpos = i
    }
  }
  if (maxpos <= 0) return -1
  let T0 = maxpos
  if (c[maxpos] > 0.01 && maxpos < size - 1 && maxpos > 0) {
    const x1 = c[maxpos - 1]
    const x2 = c[maxpos]
    const x3 = c[maxpos + 1]
    const a = (x1 + x3 - 2 * x2) / 2
    const b = (x3 - x1) / 2
    if (a) T0 = maxpos - b / (2 * a)
  }
  return sampleRate / T0
}
