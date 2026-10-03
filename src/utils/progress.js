// Practice statistics and the daily drill scheduler. Pure functions over the
// recording history (newest first, as kept in the store), so everything the
// dashboard shows is derived from what the learner actually did.

const DAY = 86400000
const PATTERNS = ['rising', 'falling', 'neutral']
const DIFFICULTY_RANK = { Beginner: 0, Intermediate: 1, Advanced: 2 }

export const DRILL_SIZE = 5

function pad(n) {
  return String(n).padStart(2, '0')
}

// Local calendar day, so "today" matches the learner's clock, not UTC.
export function dayKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function avg(values) {
  return values.length ? values.reduce((a, v) => a + v, 0) / values.length : null
}

// Consecutive practice days ending today — or yesterday, so the streak isn't
// shown as broken before the learner has had a chance to practice today.
export function streak(recordings, now = Date.now()) {
  const days = new Set(recordings.map((r) => dayKey(r.createdAt)))
  const practicedToday = days.has(dayKey(now))
  const d = new Date(now)
  d.setHours(12, 0, 0, 0) // midday avoids DST edge cases when stepping back
  if (!practicedToday) d.setDate(d.getDate() - 1)
  let count = 0
  while (days.has(dayKey(d.getTime()))) {
    count++
    d.setDate(d.getDate() - 1)
  }
  return { days: count, practicedToday }
}

// Takes per day for the current Monday–Sunday week.
export function weekActivity(recordings, now = Date.now()) {
  const today = new Date(now)
  today.setHours(12, 0, 0, 0)
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const counts = {}
  for (const r of recordings) counts[dayKey(r.createdAt)] = (counts[dayKey(r.createdAt)] || 0) + 1
  return ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const key = dayKey(d.getTime())
    return { label, key, takes: counts[key] || 0, isToday: key === dayKey(now), isFuture: d > today }
  })
}

// Average intonation score per pattern over the most recent takes.
function patternAverages(takes) {
  const out = {}
  for (const pattern of PATTERNS) out[pattern] = avg(takes.filter((r) => r.pattern === pattern).slice(0, 10).map((r) => r.match))
  return out
}

// The pattern to focus on: one the learner hasn't tried yet (if the language
// has phrases for it), otherwise the lowest-scoring one.
export function weakestPattern(takes, pool) {
  const available = PATTERNS.filter((p) => pool.some((x) => x.pattern === p))
  if (!available.length) return null
  const averages = patternAverages(takes)
  const untried = available.find((p) => averages[p] === null)
  if (untried) return { pattern: untried, avg: null }
  const pattern = available.reduce((a, b) => (averages[b] < averages[a] ? b : a))
  return { pattern, avg: Math.round(averages[pattern]) }
}

export function languageStats(recordings, pool, language) {
  const takes = recordings.filter((r) => r.language === language)
  const inPool = new Set(pool.map((p) => String(p.id)))
  const practiced = new Set(takes.map((r) => String(r.phraseId)).filter((id) => inPool.has(id)))
  const recent = takes.slice(0, 10).map((r) => r.match)
  return {
    takes: takes.length,
    score: recent.length ? Math.round(avg(recent)) : null,
    practiced: practiced.size,
    total: pool.length,
    weakest: weakestPattern(takes, pool),
  }
}

// Spaced repetition per phrase: a poor take is due again straight away, an OK
// one tomorrow, and good ones back off 3 → 6 → 12… days (capped at 30) for
// each consecutive take scoring 80%+.
export function reviewState(takes) {
  const last = takes[0]
  let good = 0
  while (good < takes.length && takes[good].match >= 80) good++
  const intervalDays = last.match < 60 ? 0 : last.match < 80 ? 1 : Math.min(30, 3 * 2 ** (good - 1))
  return { last, intervalDays, due: last.createdAt + intervalDays * DAY }
}

// Picks today's drill for one language. Each item says why it was chosen.
export function buildDrill(recordings, pool, language, now = Date.now(), size = DRILL_SIZE) {
  const takes = recordings.filter((r) => r.language === language)
  const byPhrase = {}
  for (const r of takes) (byPhrase[String(r.phraseId)] ||= []).push(r)
  const weak = weakestPattern(takes, pool)
  const weakBonus = (p) => (weak && p.pattern === weak.pattern ? 1 : 0)

  const scored = pool.map((p) => {
    const history = byPhrase[String(p.id)]
    if (!history) {
      return {
        phraseId: p.id,
        reason: weak && p.pattern === weak.pattern && weak.avg !== null ? 'weak' : 'new',
        priority: 50 + 20 * weakBonus(p) - 5 * (DIFFICULTY_RANK[p.difficulty] ?? 1),
      }
    }
    const { last, due } = reviewState(history)
    const overdueDays = (now - due) / DAY
    if (overdueDays >= 0) {
      return {
        phraseId: p.id,
        reason: last.match < 60 ? 'retry' : 'review',
        lastScore: last.match,
        priority: 100 + 2 * Math.min(overdueDays, 10) + (100 - last.match) / 2 + 10 * weakBonus(p),
      }
    }
    // Not due yet: only used to fill the drill when little else is available.
    return {
      phraseId: p.id,
      reason: weakBonus(p) ? 'weak' : 'refresh',
      lastScore: last.match,
      priority: 30 * weakBonus(p) + (100 - last.match) / 4 + overdueDays,
    }
  })

  // Highest priority first, but keep a mix: optional picks (new/weak/refresh)
  // may not take more than MAX_SAME_PATTERN slots for one pattern. Due reviews
  // are never held back.
  const MAX_SAME_PATTERN = Math.ceil(size / 2)
  const patternOf = Object.fromEntries(pool.map((p) => [String(p.id), p.pattern]))
  const ranked = scored.sort((a, b) => b.priority - a.priority)
  const picked = []
  const perPattern = {}
  const deferred = []
  for (const item of ranked) {
    if (picked.length === size) break
    const pattern = patternOf[String(item.phraseId)]
    const due = item.reason === 'retry' || item.reason === 'review'
    if (!due && (perPattern[pattern] || 0) >= MAX_SAME_PATTERN) {
      deferred.push(item)
      continue
    }
    picked.push(item)
    perPattern[pattern] = (perPattern[pattern] || 0) + 1
  }
  // Too few other patterns to honour the cap: top up from what was held back.
  picked.push(...deferred.slice(0, size - picked.length))

  return {
    weakPattern: weak?.pattern || null,
    items: picked.map(({ priority, ...item }) => item),
  }
}

// Marks drill items done when the phrase was recorded on the drill's day.
export function drillProgress(drill, recordings) {
  if (!drill) return { items: [], done: 0, total: 0, complete: false, average: null }
  const items = drill.items.map((item) => {
    const takes = recordings.filter((r) => String(r.phraseId) === String(item.phraseId) && dayKey(r.createdAt) === drill.date)
    return { ...item, done: takes.length > 0, score: takes.length ? Math.max(...takes.map((r) => r.match)) : null }
  })
  const done = items.filter((i) => i.done)
  return {
    items,
    done: done.length,
    total: items.length,
    complete: items.length > 0 && done.length === items.length,
    average: done.length ? Math.round(avg(done.map((i) => i.score))) : null,
  }
}
