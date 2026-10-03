<script setup>
import { computed } from 'vue'
import ProgressRing from '../components/ProgressRing.vue'
import { languages, tonalPatterns } from '../data/phrases'
import { ensureDrill, findPhrase, phrasesFor, store } from '../store'
import { drillProgress, languageStats, streak, weekActivity } from '../utils/progress'
import { patternBadge, scoreColor } from '../utils/ui'

ensureDrill()

const streakInfo = computed(() => streak(store.recordings))
const week = computed(() => weekActivity(store.recordings))
const weekMax = computed(() => Math.max(1, ...week.value.map((d) => d.takes)))
const weekTotal = computed(() => week.value.reduce((a, d) => a + d.takes, 0))

const langCards = computed(() =>
  languages.map((lang) => ({ ...lang, ...languageStats(store.recordings, phrasesFor(lang.name), lang.name) })),
)

const drill = computed(() => drillProgress(store.drills[store.language], store.recordings))
const drillItems = computed(() =>
  drill.value.items.map((item) => ({ ...item, phrase: findPhrase(item.phraseId) })).filter((i) => i.phrase),
)
const nextDrillItem = computed(() => drillItems.value.find((i) => !i.done) || null)

const REASONS = {
  new: { label: 'New', cls: 'bg-primary/10 text-primary border-primary/20' },
  retry: { label: 'Retry', cls: 'bg-error/10 text-error border-error/20' },
  review: { label: 'Review due', cls: 'bg-secondary/10 text-secondary border-secondary/20' },
  weak: { label: 'Weak spot', cls: 'bg-tertiary/10 text-tertiary border-tertiary/20' },
  refresh: { label: 'Refresh', cls: 'bg-outline/10 text-outline border-outline/20' },
}

const streakMessage = computed(() => {
  const { days, practicedToday } = streakInfo.value
  if (!days) return 'Record a take today to start a streak.'
  if (!practicedToday) return `${days}-day streak — practice today to keep it going.`
  return `${days}-day streak! Keep the rhythm going.`
})

function setLanguage(name) {
  store.language = name
  ensureDrill(name)
}

function drillLink(item) {
  return { path: '/practice', query: { phrase: item.phraseId, drill: 1 } }
}
</script>

<template>
  <div class="px-margin-mobile md:px-margin-desktop pb-xl pt-6">
    <div class="max-w-7xl mx-auto space-y-lg">
      <!-- Hero -->
      <section
        class="glass-panel rounded-xl p-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-md relative overflow-hidden"
      >
        <div class="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-50 z-0"></div>
        <div class="relative z-10 space-y-sm">
          <h2 class="text-headline-lg md:text-display-lg text-on-surface font-bold">Welcome back, {{ store.name }}!</h2>
          <p class="text-body-lg text-on-surface-variant flex items-center gap-sm">
            <span
              class="material-symbols-outlined"
              :class="streakInfo.practicedToday ? 'text-tertiary' : 'text-outline'"
              :style="streakInfo.practicedToday ? { fontVariationSettings: `'FILL' 1` } : {}"
              >local_fire_department</span
            >
            {{ streakMessage }}
          </p>
        </div>
        <router-link
          v-if="nextDrillItem"
          :to="drillLink(nextDrillItem)"
          class="relative z-10 bg-primary text-on-primary px-lg py-sm rounded-full text-label-md font-bold hover:bg-primary-fixed transition-colors flex items-center gap-sm card-elevation shrink-0"
        >
          <span class="material-symbols-outlined">play_arrow</span>
          {{ drill.done ? `Continue drill (${drill.done}/${drill.total})` : "Start today's drill" }}
        </router-link>
        <router-link
          v-else
          to="/practice"
          class="relative z-10 border border-secondary/40 text-secondary px-lg py-sm rounded-full text-label-md font-bold hover:bg-secondary/10 transition-colors flex items-center gap-sm shrink-0"
        >
          <span class="material-symbols-outlined">check_circle</span>
          Drill done · practice freely
        </router-link>
      </section>

      <!-- Language Progress -->
      <section>
        <h3 class="text-headline-md mb-md">Language Progress</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-md">
          <button
            v-for="lang in langCards"
            :key="lang.id"
            type="button"
            class="text-left bg-surface-container-high rounded-xl p-md border hover:border-primary/30 transition-colors"
            :class="[lang.takes ? '' : 'opacity-80', lang.name === store.language ? 'border-primary/60' : 'border-outline-variant/10']"
            :aria-pressed="lang.name === store.language"
            @click="setLanguage(lang.name)"
          >
            <div class="flex justify-between items-center mb-md">
              <span class="text-headline-sm flex items-center gap-xs">
                {{ lang.name }}
                <span v-if="lang.name === store.language" class="material-symbols-outlined text-primary text-[18px]">check_circle</span>
              </span>
              <span class="text-on-surface-variant text-label-md">{{ lang.takes }} take{{ lang.takes === 1 ? '' : 's' }}</span>
            </div>
            <div class="flex items-center gap-md">
              <ProgressRing :value="lang.score ?? 0" :empty="lang.score === null" :color-class="scoreColor(lang.score)" />
              <div class="flex-1 space-y-xs min-w-0">
                <p class="text-body-sm text-on-surface-variant truncate">
                  <template v-if="!lang.takes">No takes yet</template>
                  <template v-else-if="lang.weakest">
                    Focus: {{ tonalPatterns[lang.weakest.pattern].short.toLowerCase() }}
                    {{ lang.weakest.avg === null ? '(not tried yet)' : `(${lang.weakest.avg}%)` }}
                  </template>
                </p>
                <div class="w-full bg-surface-variant h-1 rounded-full" :title="`${lang.practiced} of ${lang.total} phrases practiced`">
                  <div class="bg-secondary h-1 rounded-full" :style="{ width: (lang.total ? (lang.practiced / lang.total) * 100 : 0) + '%' }"></div>
                </div>
                <p class="text-[10px] text-on-surface-variant">{{ lang.practiced }}/{{ lang.total }} phrases practiced · recent average</p>
              </div>
            </div>
          </button>
        </div>
      </section>

      <section class="grid grid-cols-1 lg:grid-cols-3 gap-md">
        <!-- Weekly Activity -->
        <div class="lg:col-span-2 glass-panel rounded-xl p-md flex flex-col">
          <div class="flex justify-between items-center mb-md">
            <h3 class="text-headline-sm">This Week</h3>
            <span class="text-label-md text-on-surface-variant">{{ weekTotal }} take{{ weekTotal === 1 ? '' : 's' }} recorded</span>
          </div>
          <div class="flex-1 min-h-40 flex items-end gap-sm justify-between pt-lg">
            <div v-for="day in week" :key="day.key" class="w-full h-full flex items-end">
              <div
                class="w-full rounded-t-sm transition-colors relative"
                :class="
                  day.isToday ? 'bg-primary' : day.isFuture ? 'bg-surface-variant/30' : day.takes ? 'bg-primary/30' : 'bg-surface-variant'
                "
                :style="{ height: Math.max(4, (day.takes / weekMax) * 100) + '%' }"
                :title="`${day.key}: ${day.takes} take${day.takes === 1 ? '' : 's'}`"
              >
                <span
                  v-if="day.takes"
                  class="absolute -top-6 left-1/2 -translate-x-1/2 text-label-md"
                  :class="day.isToday ? 'text-primary' : 'text-on-surface-variant'"
                  >{{ day.takes }}</span
                >
              </div>
            </div>
          </div>
          <div class="flex justify-between mt-sm text-on-surface-variant text-label-md">
            <span v-for="day in week" :key="'l' + day.key" class="w-full text-center" :class="day.isToday ? 'text-primary font-bold' : ''">{{ day.label }}</span>
          </div>
        </div>

        <!-- Today's Drill -->
        <div class="bg-surface-container-high rounded-xl p-md border border-outline-variant/10 flex flex-col">
          <div class="flex items-baseline justify-between mb-xs">
            <h3 class="text-headline-sm">Today's Drill</h3>
            <span class="text-label-md text-on-surface-variant">{{ drill.done }}/{{ drill.total }}</span>
          </div>
          <div class="w-full bg-surface-variant h-1 rounded-full mb-md" role="progressbar" :aria-valuenow="drill.done" :aria-valuemax="drill.total">
            <div class="bg-secondary h-1 rounded-full transition-all" :style="{ width: (drill.total ? (drill.done / drill.total) * 100 : 0) + '%' }"></div>
          </div>
          <p v-if="drill.complete" class="text-body-sm text-secondary mb-sm flex items-center gap-xs">
            <span class="material-symbols-outlined text-[18px]">celebration</span>
            Done for today — average {{ drill.average }}%. New drill tomorrow.
          </p>
          <ul class="space-y-xs">
            <li v-for="item in drillItems" :key="item.phraseId">
              <router-link
                :to="drillLink(item)"
                class="flex items-center justify-between gap-sm p-sm rounded-lg hover:bg-surface-variant/30 transition-colors"
              >
                <div class="min-w-0">
                  <p class="text-body-md truncate" :class="item.done ? 'text-on-surface-variant' : 'text-on-surface'">"{{ item.phrase.text }}"</p>
                  <div class="flex items-center gap-xs mt-1 flex-wrap">
                    <span class="px-xs py-0.5 rounded text-[10px] font-semibold border" :class="REASONS[item.reason].cls">
                      {{ REASONS[item.reason].label }}{{ item.lastScore != null && !item.done ? ` · last ${item.lastScore}%` : '' }}
                    </span>
                    <span class="px-xs py-0.5 rounded text-[10px] font-semibold border" :class="patternBadge[item.phrase.pattern]">
                      {{ tonalPatterns[item.phrase.pattern].short }}
                    </span>
                  </div>
                </div>
                <span v-if="item.done" class="shrink-0 text-label-md flex items-center gap-1" :class="scoreColor(item.score)">
                  <span class="material-symbols-outlined text-[18px]">check_circle</span>{{ item.score }}%
                </span>
                <span
                  v-else
                  class="shrink-0 w-8 h-8 rounded-full bg-surface flex items-center justify-center text-primary border border-outline-variant/20"
                  aria-hidden="true"
                >
                  <span class="material-symbols-outlined text-[18px]">play_arrow</span>
                </span>
              </router-link>
            </li>
          </ul>
        </div>
      </section>
    </div>
  </div>
</template>
