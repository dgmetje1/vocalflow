<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PitchCurve from '../components/PitchCurve.vue'
import { tonalPatterns } from '../data/phrases'
import { targetContour, wordScores } from '../utils/intonation'
import { speak, stopSpeaking } from '../utils/speech'
import { relativeTime, scoreColor } from '../utils/ui'
import { deleteRecording, findPhrase, store } from '../store'

const route = useRoute()
const router = useRouter()

const recordings = computed(() => store.recordings)

const active = computed(
  () => recordings.value.find((r) => String(r.id) === String(route.query.rec)) || recordings.value[0] || null,
)
const activePhrase = computed(() => (active.value ? findPhrase(active.value.phraseId) : null))
const target = computed(() => (active.value ? targetContour(active.value.pattern) : []))

function select(rec) {
  router.replace({ query: { rec: rec.id } })
}

const toneClasses = {
  perfect: { bg: 'bg-secondary', text: 'text-secondary', label: 'On target' },
  slight: { bg: 'bg-tertiary', text: 'text-tertiary', label: 'Slightly off' },
  strong: { bg: 'bg-error', text: 'text-error', label: 'Off target' },
}

const heatmap = computed(() => (active.value ? wordScores(active.value.text, active.value.contour, target.value) : []))

const insight = computed(() => {
  const rec = active.value
  if (!rec) return ''
  const parts = []
  const shape = tonalPatterns[rec.pattern]?.short.toLowerCase() || 'target'
  if (rec.match >= 85) parts.push(`Your pitch tracked the ${shape} contour closely (${rec.match}%).`)
  else if (rec.match >= 60) parts.push(`Your contour followed the general ${shape} shape (${rec.match}%), with room to tighten it.`)
  else parts.push(`Your contour diverged from the ${shape} target (${rec.match}%). Listen to the native audio first and exaggerate the movement.`)

  const worst = [...heatmap.value].sort((a, b) => b.err - a.err)[0]
  if (worst && worst.tone !== 'perfect') {
    const dir = worst.bias > 0 ? 'your pitch sat too high there; bring it down' : 'your pitch sat too low there; raise it'
    parts.push(`The biggest gap was on “${worst.word}” — ${dir}.`)
  }

  if (rec.content != null) {
    if (rec.content < 60) parts.push(`Wording matched only ${rec.content}%; re-read the phrase closely before the next take.`)
    else if (rec.content < 90) parts.push(`Wording matched ${rec.content}% — nearly there.`)
  }
  if (rec.transcript) parts.push(`Heard: “${rec.transcript}”.`)
  return parts.join(' ')
})

const durationLabel = computed(() => (active.value?.durationMs ? `${(active.value.durationMs / 1000).toFixed(1)}s` : ''))

// ---- Playback ----
const audioEl = new Audio()
const playingId = ref(null)
audioEl.onended = audioEl.onerror = () => {
  playingId.value = null
}

function stopPlayback() {
  audioEl.pause()
  stopSpeaking()
  playingId.value = null
}

function play(rec) {
  if (!rec) return
  if (playingId.value === rec.id) return stopPlayback()
  stopPlayback()
  playingId.value = rec.id
  if (rec.audioUrl) {
    audioEl.src = rec.audioUrl
    audioEl.currentTime = 0
    audioEl.play().catch(() => (playingId.value = null))
  } else if (!speak(rec.text, rec.language, { onEnd: () => (playingId.value = null) })) {
    playingId.value = null
  }
}

function remove(rec) {
  if (playingId.value === rec.id) stopPlayback()
  const wasActive = active.value?.id === rec.id
  deleteRecording(rec.id)
  if (wasActive) router.replace({ query: {} })
}

onBeforeUnmount(stopPlayback)
</script>

<template>
  <div class="px-margin-mobile md:px-margin-desktop pb-xl pt-6">
    <div class="max-w-7xl mx-auto space-y-lg">
      <!-- Header -->
      <div class="flex justify-between items-end flex-wrap gap-sm">
        <div>
          <h2 class="text-headline-lg md:text-display-lg text-on-surface mb-xs font-bold">Analysis &amp; Review</h2>
          <p class="text-on-surface-variant text-body-lg">Compare each take against the target contour, word by word.</p>
        </div>
        <div
          v-if="active"
          class="px-md py-xs rounded-full bg-surface-container-high border border-outline-variant/20 flex items-center gap-xs"
        >
          <span class="w-2 h-2 rounded-full bg-secondary"></span>
          <span class="text-label-md text-on-surface">{{ active.language }}</span>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="!active" class="glass-panel rounded-xl p-lg text-center space-y-sm">
        <span class="material-symbols-outlined text-on-surface-variant text-[48px] block">graphic_eq</span>
        <p class="text-headline-sm text-on-surface">No recordings yet</p>
        <p class="text-body-md text-on-surface-variant">Record a phrase on the Practice screen and your analysis will appear here.</p>
        <router-link
          to="/practice"
          class="inline-flex items-center gap-xs mt-sm bg-primary text-on-primary px-md py-sm rounded-full text-label-md font-bold hover:bg-primary-fixed transition-colors"
        >
          <span class="material-symbols-outlined text-[18px]">mic</span> Start practicing
        </router-link>
      </div>

      <div v-else class="grid grid-cols-1 lg:grid-cols-12 gap-md">
        <!-- Left: Detailed View -->
        <div class="lg:col-span-8 flex flex-col gap-md">
          <div class="glass-panel rounded-xl p-md relative overflow-hidden">
            <div class="flex justify-between items-start mb-md relative z-10 flex-wrap gap-sm">
              <div class="min-w-0">
                <span class="text-label-md text-primary tracking-widest uppercase mb-xs block">Target Phrase</span>
                <h3 class="text-headline-md md:text-headline-lg text-on-surface">"{{ active.text }}"</h3>
                <p v-if="activePhrase?.translation" class="text-on-surface-variant mt-1">{{ activePhrase.translation }}</p>
                <div class="flex flex-wrap gap-sm mt-sm text-label-md">
                  <span :class="scoreColor(active.match)">Intonation {{ active.match }}%</span>
                  <span v-if="active.content != null" :class="scoreColor(active.content)">Content {{ active.content }}%</span>
                  <span class="text-on-surface-variant">{{ relativeTime(active.createdAt) }}</span>
                </div>
              </div>
              <div class="flex gap-sm">
                <button
                  @click="play(active)"
                  class="w-10 h-10 rounded-full border flex items-center justify-center transition-colors"
                  :class="
                    playingId === active.id
                      ? 'border-secondary text-secondary bg-secondary/10'
                      : 'border-outline-variant/50 text-on-surface hover:bg-surface-variant/50 hover:text-primary'
                  "
                  :aria-label="playingId === active.id ? 'Stop playback' : active.audioUrl ? 'Play your recording' : 'Play native audio'"
                  :title="active.audioUrl ? 'Play your recording' : 'Audio isn’t kept after reload — plays native audio instead'"
                >
                  <span class="material-symbols-outlined">{{ playingId === active.id ? 'pause' : 'play_arrow' }}</span>
                </button>
                <router-link
                  :to="{ path: '/practice', query: { phrase: active.phraseId } }"
                  class="w-10 h-10 rounded-full border border-primary text-primary flex items-center justify-center hover:bg-primary/10 transition-colors"
                  aria-label="Record this phrase again"
                  title="Record again"
                >
                  <span class="material-symbols-outlined">mic</span>
                </router-link>
              </div>
            </div>

            <!-- Visualization -->
            <div class="h-48 md:h-56 w-full bg-background rounded-lg border border-outline-variant/20 relative mb-md overflow-hidden">
              <PitchCurve v-if="active.contour" :target="target" :samples="active.contour" :match="active.match" />
              <p v-else class="absolute inset-0 flex items-center justify-center text-body-sm text-on-surface-variant">
                No pitch data stored for this take.
              </p>
              <div class="absolute bottom-2 right-2 flex gap-sm bg-surface/80 px-xs py-1 rounded backdrop-blur">
                <div class="flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full" :class="scoreColor(active.match).replace('text-', 'bg-')"></span
                  ><span class="text-[10px] text-on-surface-variant">You</span>
                </div>
                <div class="flex items-center gap-1">
                  <span class="w-3 border-t-2 border-dashed border-outline"></span><span class="text-[10px] text-on-surface-variant">Target</span>
                </div>
              </div>
            </div>

            <!-- Word heatmap -->
            <div v-if="heatmap.length" class="space-y-xs">
              <div class="flex justify-between text-[10px] text-on-surface-variant">
                <span>0:00</span>
                <span>{{ durationLabel }}</span>
              </div>
              <div class="h-2 w-full rounded-full overflow-hidden flex gap-px">
                <div
                  v-for="(seg, i) in heatmap"
                  :key="i"
                  :class="[toneClasses[seg.tone].bg, 'h-full opacity-80']"
                  :style="{ flexGrow: seg.weight }"
                  :title="`${seg.word}: ${toneClasses[seg.tone].label}`"
                ></div>
              </div>
              <div class="flex text-[11px] pt-1 gap-px">
                <span
                  v-for="(seg, i) in heatmap"
                  :key="'l' + i"
                  class="truncate text-center"
                  :class="toneClasses[seg.tone].text"
                  :style="{ flexGrow: seg.weight, flexBasis: 0 }"
                  >{{ seg.word }}</span
                >
              </div>
              <div class="flex flex-wrap gap-md pt-sm text-[10px] text-on-surface-variant">
                <span v-for="(t, key) in toneClasses" :key="key" class="flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full" :class="t.bg"></span>{{ t.label }}
                </span>
              </div>
            </div>
          </div>

          <!-- Coach feedback -->
          <div class="bg-surface-container-high rounded-xl p-md border-l-4 border-primary">
            <div class="flex items-start gap-sm">
              <span class="material-symbols-outlined text-primary mt-1">robot_2</span>
              <div>
                <h4 class="text-headline-sm text-on-surface mb-xs">Coach Insight</h4>
                <p class="text-on-surface-variant leading-relaxed">{{ insight }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Recent Recordings -->
        <div class="lg:col-span-4 flex flex-col gap-sm">
          <h3 class="text-headline-sm text-on-surface mb-xs px-xs">Recent Recordings <span class="text-on-surface-variant text-body-sm">({{ recordings.length }})</span></h3>
          <ul class="flex flex-col gap-xs lg:max-h-[70vh] lg:overflow-y-auto">
            <li
              v-for="rec in recordings"
              :key="rec.id"
              class="p-sm rounded-lg flex justify-between items-center gap-xs group transition-colors border"
              :class="
                rec.id === active.id
                  ? 'bg-surface-container-high border-primary/30'
                  : 'bg-surface-container-low hover:bg-surface-container-high border-transparent'
              "
            >
              <button class="min-w-0 flex-1 text-left" @click="select(rec)" :aria-current="rec.id === active.id ? 'true' : undefined">
                <p
                  class="text-body-md font-semibold truncate"
                  :class="rec.id === active.id ? 'text-on-surface' : 'text-on-surface-variant group-hover:text-on-surface'"
                >
                  {{ rec.text }}
                </p>
                <div class="flex gap-2 items-center mt-1 flex-wrap">
                  <span class="text-[10px] text-on-surface-variant">{{ relativeTime(rec.createdAt) }}</span>
                  <span class="w-1 h-1 rounded-full bg-outline-variant"></span>
                  <span class="text-[10px]" :class="scoreColor(rec.match)">{{ rec.match }}% Intonation</span>
                  <template v-if="rec.content != null">
                    <span class="w-1 h-1 rounded-full bg-outline-variant"></span>
                    <span class="text-[10px]" :class="scoreColor(rec.content)">{{ rec.content }}% Content</span>
                  </template>
                </div>
              </button>
              <button
                @click="play(rec)"
                class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 hover:bg-surface-variant/40"
                :class="playingId === rec.id ? 'text-secondary' : rec.audioUrl ? 'text-primary' : 'text-on-surface-variant'"
                :aria-label="playingId === rec.id ? 'Stop playback' : rec.audioUrl ? 'Play your recording' : 'Play native audio'"
              >
                <span class="material-symbols-outlined">{{ playingId === rec.id ? 'pause' : rec.audioUrl ? 'play_arrow' : 'volume_up' }}</span>
              </button>
              <button
                @click="remove(rec)"
                class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-on-surface-variant opacity-60 hover:opacity-100 hover:text-error hover:bg-surface-variant/40 focus-visible:opacity-100"
                aria-label="Delete recording"
                title="Delete recording"
              >
                <span class="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
