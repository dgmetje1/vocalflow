// Word-level content matching between a recognized transcript and the target
// phrase. Score is 100 - normalized Word Error Rate (100 * (1 - WER)).

export function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019\u2018\u02BC`]/g, "'")
    .replace(/[^a-z0-9']\s*|[''](?![a-z])/g, (m) => (m.includes("'") ? '' : ' '))
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function wordLevenshtein(a, b) {
  const m = a.length
  const n = b.length
  const dp = new Array(m + 1)
  for (let i = 0; i <= m; i++) {
    dp[i] = new Array(n + 1)
    dp[i][0] = i
  }
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return dp[m][n]
}

export function matchContent(transcript, target) {
  const a = normalize(transcript)
  const b = normalize(target)
  if (!a.length || !b.length) return 0
  const dist = wordLevenshtein(a, b)
  return Math.round(Math.max(0, 1 - dist / b.length) * 100)
}
