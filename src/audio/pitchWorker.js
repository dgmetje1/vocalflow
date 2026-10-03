// Pitch-detection worker. Offloads the O(n^2) autocorrelation loop (and the
// RMS level) off the main thread so the UI stays responsive while recording.
// Input buffers are transferred zero-copy via postMessage.

import { autoCorrelate } from './autocorrelate'

self.onmessage = (e) => {
  const { buffer, sampleRate } = e.data
  if (!buffer || !buffer.length) return

  let sum = 0
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]

  self.postMessage({
    pitch: autoCorrelate(buffer, sampleRate),
    level: Math.sqrt(sum / buffer.length),
  })
}
