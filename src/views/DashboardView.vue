<script setup>
import { computed } from 'vue'
import ProgressRing from '../components/ProgressRing.vue'
import { languages, phrases, weeklyActivity, recommendedPhrases, tonalPatterns } from '../data/phrases'
import { store } from '../store'
import { patternBadge } from '../utils/ui'

const maxMinutes = computed(() => Math.max(...weeklyActivity.map((d) => d.minutes)))

const recommended = computed(() => {
  const pool = phrases.filter((p) => p.language === store.language)
  const byId = recommendedPhrases.map((r) => pool.find((p) => p.id === r.id)).filter(Boolean)
  if (byId.length >= 3) return byId.slice(0, 3)
  const seen = new Set(byId.map((p) => p.id))
  return [...byId, ...pool.filter((p) => !seen.has(p.id))].slice(0, 3)
})

const nextLesson = computed(() => {
  const pool = phrases.filter((p) => p.language === store.language)
  return pool.find((p) => p.pattern === 'rising') || pool[0]
})

// weeklyActivity runs Monday..Sunday; getDay() is 0 for Sunday.
const todayIndex = (new Date().getDay() + 6) % 7

function setLanguage(name) {
  store.language = name
}
</script>

<template>
  <div class="px-margin-mobile md:px-margin-desktop pb-xl pt-6">
    <div class="max-w-7xl mx-auto space-y-lg">
      <!-- Hero -->
      <section
        class="glass-panel rounded-xl p-lg flex flex-col md:flex-row justify-between items-start md:items-center relative overflow-hidden"
      >
        <div class="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-50 z-0"></div>
        <div class="relative z-10 space-y-sm">
          <h2 class="text-headline-lg md:text-display-lg text-on-surface font-bold">Welcome back, {{ store.name }}!</h2>
          <p class="text-body-lg text-on-surface-variant flex items-center gap-sm">
            <span class="material-symbols-outlined text-tertiary">local_fire_department</span>
            {{ store.streak }} Day Streak! Keep the rhythm going.
          </p>
        </div>
        <router-link
          v-if="nextLesson"
          :to="{ path: '/practice', query: { phrase: nextLesson.id } }"
          class="mt-md md:mt-0 relative z-10 bg-primary text-on-primary px-lg py-sm rounded-full text-label-md font-bold hover:bg-primary-fixed transition-colors flex items-center gap-sm card-elevation"
        >
          <span class="material-symbols-outlined">play_arrow</span>
          Next: {{ tonalPatterns[nextLesson.pattern].label }}
        </router-link>
      </section>

      <!-- Language Progress -->
      <section>
        <h3 class="text-headline-md mb-md">Language Progress</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-md">
          <button
            v-for="lang in languages"
            :key="lang.id"
            type="button"
            class="text-left bg-surface-container-high rounded-xl p-md border hover:border-primary/30 transition-colors"
            :class="[lang.dimmed ? 'opacity-80 grayscale-[30%]' : '', lang.name === store.language ? 'border-primary/60' : 'border-outline-variant/10']"
            :aria-pressed="lang.name === store.language"
            @click="setLanguage(lang.name)"
          >
            <div class="flex justify-between items-center mb-md">
              <span class="text-headline-sm flex items-center gap-xs">
                {{ lang.name }}
                <span v-if="lang.name === store.language" class="material-symbols-outlined text-primary text-[18px]">check_circle</span>
              </span>
              <span class="text-on-surface-variant text-label-md">{{ lang.level }}</span>
            </div>
            <div class="flex items-center gap-md">
              <ProgressRing :value="lang.score" :color-class="lang.ringColor" />
              <div class="flex-1 space-y-xs">
                <p class="text-body-sm text-on-surface-variant">{{ lang.focus }}</p>
                <div class="w-full bg-surface-variant h-1 rounded-full">
                  <div :class="`${lang.barColor} h-1 rounded-full`" :style="{ width: lang.score + '%' }"></div>
                </div>
              </div>
            </div>
          </button>
        </div>
      </section>

      <!-- Analytics & Lists -->
      <section class="grid grid-cols-1 lg:grid-cols-3 gap-md">
        <!-- Weekly Activity -->
        <div class="lg:col-span-2 glass-panel rounded-xl p-md flex flex-col">
          <div class="flex justify-between items-center mb-md">
            <h3 class="text-headline-sm">Weekly Activity</h3>
            <span class="text-label-md text-on-surface-variant">Minutes Practiced</span>
          </div>
          <div class="flex-1 flex items-end gap-sm justify-between pt-lg">
            <div
              v-for="(day, i) in weeklyActivity"
              :key="i"
              class="w-full rounded-t-sm transition-colors"
              :class="
                i === todayIndex
                  ? 'bg-primary hover:bg-primary-fixed relative'
                  : day.minutes > 15
                    ? 'bg-primary/20 hover:bg-primary/40'
                    : 'bg-surface-variant'
              "
              :style="{ height: Math.max(8, (day.minutes / maxMinutes) * 100) + '%' }"
              :title="`${day.day}: ${day.minutes}m`"
            >
              <span v-if="i === todayIndex" class="absolute -top-6 left-1/2 -translate-x-1/2 text-label-md text-primary">{{ day.minutes }}m</span>
            </div>
          </div>
          <div class="flex justify-between mt-sm text-on-surface-variant text-label-md">
            <span v-for="(day, i) in weeklyActivity" :key="'l' + i" :class="i === todayIndex ? 'text-primary' : ''">{{ day.day }}</span>
          </div>
        </div>

        <!-- Recommended Phrases -->
        <div class="bg-surface-container-high rounded-xl p-md border border-outline-variant/10">
          <h3 class="text-headline-sm mb-md">Recommended Phrases</h3>
          <div class="space-y-sm">
            <div
              v-for="phrase in recommended"
              :key="phrase.id"
              class="flex items-center justify-between gap-sm p-sm rounded-lg hover:bg-surface-variant/30 transition-colors"
            >
              <div class="min-w-0">
                <p class="text-body-md">"{{ phrase.text }}"</p>
                <p v-if="phrase.translation" class="text-body-sm text-on-surface-variant">{{ phrase.translation }}</p>
                <span
                  class="inline-block mt-1 px-xs py-0.5 rounded text-[10px] font-semibold border"
                  :class="patternBadge[phrase.pattern]"
                >
                  {{ tonalPatterns[phrase.pattern].short }} Intonation
                </span>
              </div>
              <router-link
                :to="{ path: '/practice', query: { phrase: phrase.id } }"
                :aria-label="`Practice: ${phrase.text}`"
                class="shrink-0 w-8 h-8 rounded-full bg-surface flex items-center justify-center text-primary hover:bg-primary/10 border border-outline-variant/20"
              >
                <span class="material-symbols-outlined text-[18px]">play_arrow</span>
              </router-link>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
