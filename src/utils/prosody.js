// Builds a phrase-specific target pitch contour from its text, using a small
// rule-based intonation model instead of a straight line:
//
//   declination      pitch drifts down slowly across the utterance
//   pitch accents    a bump on the stressed syllable of each content word
//   nuclear accent   the last content word (or the phrase's `highlight`)
//                    carries the main movement
//   boundary tone    rising: low nucleus, then a climb to the end
//                    falling: high nucleus, then a drop that stays low
//                    neutral: small accents, gentle final settle
//
// Values are computed in semitones, then mapped onto the same 0..1 scale the
// scorer uses (see UNITS_PER_SEMITONE in intonation.js).

export const CONTOUR_POINTS = 60

// How many contour units one semitone spans (shared with the scorer).
export const UNITS_PER_SEMITONE = 0.07
const CENTRE = 0.58

// Unaccented words (articles, pronouns, auxiliaries, prepositions…) in the
// app's three languages. Everything else is treated as a content word.
const FUNCTION_WORDS = new Set(
  (
    'a an the and or but of to in on at for with from by as is are was were be been am do does did ' +
    'i you he she it we they me him us them my your his her its our their this that these those ' +
    'there not no can could would will shall should may might must have has had if so just ' +
    'el la lo los las un una unos unas y e o u de del al en con por para que es son está están ' +
    'soy eres me te se le les nos mi mis tu tus su sus ' +
    'els les uns unes i amb per és són està estan sóc em et es li ho ens meu teu seu si us'
  ).split(' '),
)

const VOWEL_GROUP = /[aeiouyàáèéìíòóùúïü]+/gi
const STRESS_MARK = /[áéíóúàèòù]/i

function normalizeWord(word) {
  return word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '')
}

function syllableGroups(word, language) {
  const groups = [...word.matchAll(VOWEL_GROUP)].map((m) => ({ text: m[0], index: m.index }))
  // English silent final -e ("please", "like"), but keep "-le" ("little").
  if (language === 'English' && groups.length > 1 && /[^l]e$/.test(word)) {
    const last = groups.at(-1)
    if (last.text === 'e' && last.index === word.length - 1) groups.pop()
  }
  return groups.length ? groups : [{ text: word, index: 0 }]
}

// Index of the stressed syllable. Written accents win; otherwise the default
// Spanish/Catalan rule (penultimate if the word ends in a vowel, -n or -s,
// else final) or the common English first-syllable stress.
function stressedSyllable(word, groups, language) {
  const marked = groups.findIndex((g) => STRESS_MARK.test(g.text))
  if (marked >= 0) return marked
  if (groups.length === 1) return 0
  if (language === 'Spanish' || language === 'Catalan') {
    return /[aeiouns]$/.test(word) ? groups.length - 2 : groups.length - 1
  }
  return 0
}

// Phrase-final words are drawn out in real speech (final lengthening), which is
// also where the boundary rise/fall happens; give them this many extra beats.
const FINAL_LENGTHENING = 1.2

// Splits a phrase into words laid out on a 0..1 timeline, with time allotted
// in proportion to syllable count. Shared with the per-word heat map so both
// agree on where each word sits.
export function wordTimeline(text, language = 'English') {
  const words = (text || '')
    .split(/\s+/)
    .map((raw) => ({ raw, norm: normalizeWord(raw) }))
    .filter((w) => w.norm)
  const sized = words.map((w) => {
    const groups = syllableGroups(w.norm, language)
    return { ...w, syllables: groups.length, stressIdx: stressedSyllable(w.norm, groups, language) }
  })
  const beats = sized.map((w, i) => w.syllables + (i === sized.length - 1 ? FINAL_LENGTHENING : 0))
  const total = beats.reduce((a, v) => a + v, 0)
  let cursor = 0
  return sized.map((w, i) => {
    const start = cursor / total
    cursor += beats[i]
    const end = cursor / total
    return {
      word: w.raw,
      norm: w.norm,
      syllables: w.syllables,
      start,
      end,
      stress: start + ((w.stressIdx + 0.5) / w.syllables) * (end - start),
      isFunction: FUNCTION_WORDS.has(w.norm),
    }
  })
}

function bump(t, centre, width) {
  return Math.exp(-((t - centre) ** 2) / (2 * width * width))
}

function smoothstep(from, to, t) {
  if (t <= from) return 0
  if (t >= to) return 1
  const x = (t - from) / (to - from)
  return x * x * (3 - 2 * x)
}

function movingAverage(values, radius) {
  return values.map((_, i) => {
    let sum = 0
    let count = 0
    for (let k = Math.max(0, i - radius); k <= Math.min(values.length - 1, i + radius); k++) {
      sum += values[k]
      count++
    }
    return sum / count
  })
}

// phrase: { text, pattern, language?, highlight? }
export function targetContour(phrase, n = CONTOUR_POINTS) {
  const pattern = phrase?.pattern || 'rising'
  const words = wordTimeline(phrase?.text, phrase?.language)
  if (!words.length) return new Array(n).fill(CENTRE)

  const content = words.filter((w) => !w.isFunction)
  const accented = content.length ? content : words
  const hl = phrase.highlight ? normalizeWord(phrase.highlight) : ''
  const nucleus = (hl && words.find((w) => w.norm === hl)) || accented.at(-1)
  const prenuclear = accented.filter((w) => w !== nucleus && w.stress < nucleus.stress)
  const width = (w) => Math.max(0.035, 0.3 * (w.end - w.start))

  const st = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    let v = pattern === 'rising' ? 1 - 1.5 * t : 1.5 - 3 * t

    const accentSize = pattern === 'neutral' ? 1.2 : 2.5
    for (const w of prenuclear) v += accentSize * bump(t, w.stress, width(w))

    // The boundary movement starts on the nuclear syllable itself.
    const tail = smoothstep(nucleus.stress - width(nucleus), 1, t)
    if (pattern === 'rising') {
      v += -1.5 * bump(t, nucleus.stress - width(nucleus), width(nucleus)) + 8 * tail
    } else if (pattern === 'falling') {
      v += 4.5 * bump(t, nucleus.stress - 0.5 * width(nucleus), width(nucleus)) - 6 * tail
    } else {
      v += 1.5 * bump(t, nucleus.stress, width(nucleus)) - 1 * tail
    }
    st.push(v)
  }

  const smooth = movingAverage(st, 2)
  const mean = smooth.reduce((a, v) => a + v, 0) / smooth.length
  return smooth.map((v) => Math.min(0.96, Math.max(0.04, CENTRE + (v - mean) * UNITS_PER_SEMITONE)))
}
