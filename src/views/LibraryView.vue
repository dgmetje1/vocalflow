<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { phrases, categories } from '../data/phrases'
import { isFavorite, store, toggleFavorite } from '../store'
import { difficultyBadge, iconFill, lengthBadge, patternBadge, patternWaveform, scoreColor } from '../utils/ui'

const router = useRouter()

const tabs = ['All Phrases', 'Favorites', 'My Recordings']
const activeTab = ref('All Phrases')

const emptyFilters = () => ({ difficulty: null, category: null, length: null })
const filters = ref(emptyFilters())
const search = ref('')

const filterGroups = [
  { key: 'difficulty', label: 'Difficulty', options: ['Beginner', 'Intermediate', 'Advanced'] },
  { key: 'category', label: 'Category', options: categories },
  { key: 'length', label: 'Length', options: ['Short', 'Medium', 'Long'] },
]

const hasActiveFilters = computed(() => !!(search.value.trim() || Object.values(filters.value).some(Boolean)))

// Best score per phrase from the user's own history.
const bestScores = computed(() => {
  const best = {}
  for (const r of store.recordings) {
    const key = String(r.phraseId)
    best[key] = best[key] ? { match: Math.max(best[key].match, r.match), count: best[key].count + 1 } : { match: r.match, count: 1 }
  }
  return best
})

const filteredPhrases = computed(() => {
  const q = search.value.trim().toLowerCase()
  return [...phrases, ...store.suggestedPhrases].filter((p) => {
    if (p.language !== store.language) return false
    if (filters.value.difficulty && p.difficulty !== filters.value.difficulty) return false
    if (filters.value.category && p.category !== filters.value.category) return false
    if (filters.value.length && p.length !== filters.value.length) return false
    if (q && !(p.text.toLowerCase().includes(q) || p.desc?.toLowerCase().includes(q) || p.translation?.toLowerCase().includes(q)))
      return false
    if (activeTab.value === 'Favorites' && !isFavorite(p.id)) return false
    if (activeTab.value === 'My Recordings' && !bestScores.value[String(p.id)]) return false
    return true
  })
})

const emptyMessage = computed(() => {
  if (hasActiveFilters.value) return 'No phrases match your current filters.'
  if (activeTab.value === 'Favorites') return `You haven’t favorited any ${store.language} phrases yet. Tap the heart on a phrase to save it here.`
  if (activeTab.value === 'My Recordings') return `You haven’t recorded any ${store.language} phrases yet.`
  return `No ${store.language} phrases available.`
})

function toggleFilter(group, value) {
  filters.value[group] = filters.value[group] === value ? null : value
}

function clearFilters() {
  filters.value = emptyFilters()
  search.value = ''
}

function practice(phrase) {
  router.push({ path: '/practice', query: { phrase: phrase.id } })
}
</script>

<template>
  <div class="px-margin-mobile md:px-margin-desktop pb-xl pt-6">
    <div class="max-w-[1600px] mx-auto">
      <!-- Page Header & Tabs -->
      <div class="flex flex-col md:flex-row md:items-end justify-between mb-md gap-6">
        <div>
          <h2 class="text-headline-lg md:text-display-lg text-on-surface mb-2 font-bold">Phrase Library</h2>
          <p class="text-body-lg text-on-surface-variant max-w-2xl">Explore and master {{ store.language }} intonation patterns across contexts.</p>
        </div>
        <div class="flex items-center gap-1 bg-surface-container-low p-1 rounded-lg border border-outline-variant/10 self-start md:self-auto overflow-x-auto no-scrollbar" role="tablist">
          <button
            v-for="tab in tabs"
            :key="tab"
            @click="activeTab = tab"
            role="tab"
            :aria-selected="activeTab === tab"
            class="px-4 md:px-6 py-2 rounded-md text-label-md transition-colors whitespace-nowrap"
            :class="activeTab === tab ? 'bg-surface-variant text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'"
          >
            {{ tab }}
          </button>
        </div>
      </div>

      <!-- Search + Filters -->
      <div class="glass-panel rounded-xl p-6 mb-md flex flex-col gap-6">
        <div class="relative">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
          <input
            v-model="search"
            class="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl py-3 pl-10 pr-4 text-body-md text-on-surface focus:outline-none focus:border-primary transition-all"
            placeholder="Search phrases, meanings, or context…"
            type="search"
            aria-label="Search phrases"
          />
        </div>
        <div class="flex flex-wrap gap-x-8 gap-y-4 w-full">
          <div v-for="group in filterGroups" :key="group.key" class="flex flex-col gap-2" role="group" :aria-label="group.label">
            <span class="text-label-md text-on-surface-variant uppercase tracking-wider">{{ group.label }}</span>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="opt in group.options"
                :key="opt"
                @click="toggleFilter(group.key, opt)"
                :aria-pressed="filters[group.key] === opt"
                class="px-4 py-1.5 rounded-full border text-body-sm transition-colors"
                :class="
                  filters[group.key] === opt
                    ? 'bg-primary/20 text-primary border-primary/30'
                    : 'bg-surface-container border-outline-variant/20 text-on-surface hover:bg-surface-variant'
                "
              >
                {{ opt }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between mb-sm text-label-md text-on-surface-variant" aria-live="polite">
        <span>{{ filteredPhrases.length }} phrase{{ filteredPhrases.length === 1 ? '' : 's' }}</span>
        <button v-if="hasActiveFilters" @click="clearFilters" class="text-primary hover:underline flex items-center gap-1">
          <span class="material-symbols-outlined text-[16px]">close</span> Clear filters
        </button>
      </div>

      <!-- Phrase Cards -->
      <div v-if="filteredPhrases.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <article
          v-for="phrase in filteredPhrases"
          :key="phrase.id"
          @click="practice(phrase)"
          class="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden hover:border-primary/50 transition-all duration-300 group flex flex-col h-full relative cursor-pointer"
        >
          <div class="absolute top-4 right-4 z-10">
            <button
              @click.stop="toggleFavorite(phrase.id)"
              class="w-8 h-8 -m-1 rounded-full flex items-center justify-center transition-colors"
              :class="isFavorite(phrase.id) ? 'text-primary' : 'text-on-surface-variant hover:text-primary'"
              :aria-pressed="isFavorite(phrase.id)"
              :aria-label="isFavorite(phrase.id) ? 'Remove from favorites' : 'Add to favorites'"
            >
              <span class="material-symbols-outlined" :style="iconFill(isFavorite(phrase.id))">favorite</span>
            </button>
          </div>
          <div class="p-6 pb-4 flex-grow flex flex-col">
            <div class="flex items-center gap-2 mb-3 flex-wrap pr-8">
              <span v-if="phrase.source === 'ai'" class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/20 text-primary">AI</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border" :class="difficultyBadge[phrase.difficulty]">{{ phrase.difficulty }}</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border" :class="patternBadge[phrase.pattern]">{{ phrase.pattern }}</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border" :class="lengthBadge[phrase.length]">{{ phrase.length }}</span>
            </div>
            <h3 class="text-headline-sm text-on-surface mb-1">{{ phrase.text }}</h3>
            <p v-if="phrase.translation" class="text-body-sm text-on-surface-variant italic mb-1">{{ phrase.translation }}</p>
            <p class="text-body-sm text-on-surface-variant mb-4">{{ phrase.desc }}</p>
            <div class="mt-auto h-16 w-full bg-gradient-to-b from-surface-container-low to-background rounded-lg border border-outline-variant/5 relative overflow-hidden flex items-end px-2 pb-2">
              <svg class="w-full h-full" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
                <path
                  :d="phrase.waveform || patternWaveform[phrase.pattern]"
                  fill="none"
                  stroke="#d0bcff"
                  stroke-linecap="round"
                  stroke-width="2"
                  class="opacity-70 group-hover:opacity-100 transition-opacity"
                />
                <path :d="phrase.waveform || patternWaveform[phrase.pattern]" fill="none" stroke="#d0bcff" stroke-linecap="round" stroke-width="6" class="opacity-10 blur-sm" />
              </svg>
            </div>
          </div>
          <div class="px-6 py-3 border-t border-outline-variant/10 bg-surface-container-lowest flex items-center justify-between">
            <span v-if="bestScores[String(phrase.id)]" class="text-label-md flex items-center gap-1" :class="scoreColor(bestScores[String(phrase.id)].match)">
              <span class="material-symbols-outlined text-[16px]">military_tech</span>
              Best {{ bestScores[String(phrase.id)].match }}% · {{ bestScores[String(phrase.id)].count }} take{{ bestScores[String(phrase.id)].count === 1 ? '' : 's' }}
            </span>
            <span v-else-if="phrase.source === 'ai'" class="text-label-md text-on-surface-variant flex items-center gap-1">
              <span class="material-symbols-outlined text-[16px]">auto_awesome</span> Suggested for you
            </span>
            <span v-else class="text-label-md text-on-surface-variant flex items-center gap-1">
              <span class="material-symbols-outlined text-[16px]">headset_mic</span> {{ phrase.attempts }} attempts
            </span>
            <router-link
              :to="{ path: '/practice', query: { phrase: phrase.id } }"
              @click.stop
              class="text-primary text-label-md hover:underline flex items-center gap-1"
            >
              Practice <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
            </router-link>
          </div>
        </article>
      </div>

      <div v-else class="glass-panel rounded-xl p-lg text-center space-y-xs">
        <span class="material-symbols-outlined text-on-surface-variant text-[40px] block">
          {{ hasActiveFilters ? 'search_off' : activeTab === 'Favorites' ? 'favorite' : 'mic' }}
        </span>
        <p class="text-body-md text-on-surface-variant">{{ emptyMessage }}</p>
        <button v-if="hasActiveFilters" @click="clearFilters" class="text-primary text-label-md underline mt-sm">Clear all filters</button>
        <router-link v-else-if="activeTab === 'My Recordings'" to="/practice" class="inline-block text-primary text-label-md underline mt-sm">
          Start practicing
        </router-link>
      </div>
    </div>
  </div>
</template>
