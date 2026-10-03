<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { languages } from '../data/phrases'
import { store } from '../store'

const logoUrl = `${import.meta.env.BASE_URL}favicon.svg`

defineProps({
  title: {
    type: String,
    default: 'VocalFlow',
  },
})

const langOpen = ref(false)

function setLanguage(name) {
  store.language = name
  langOpen.value = false
}

function onKeydown(e) {
  if (e.key === 'Escape') langOpen.value = false
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <header
    class="fixed top-0 right-0 left-0 md:left-64 h-16 z-40 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/10 shadow-sm flex items-center justify-between px-margin-mobile md:px-margin-desktop"
  >
    <div class="flex items-center md:hidden">
      <router-link to="/" class="flex items-center gap-xs text-headline-sm font-black text-on-surface">
        <img class="w-7 h-7" :src="logoUrl" alt="" />{{ title }}
      </router-link>
    </div>

    <div class="hidden md:flex items-center w-64">
      <slot name="search"></slot>
    </div>

    <div class="flex items-center gap-md">
      <slot name="actions"></slot>
      <div class="relative">
        <button
          @click="langOpen = !langOpen"
          class="text-on-surface-variant hover:text-primary transition-colors px-sm py-xs rounded-full hover:bg-surface-variant/50 flex items-center gap-xs border border-outline-variant/20"
          aria-haspopup="listbox"
          :aria-expanded="langOpen"
          aria-label="Practice language"
        >
          <span class="material-symbols-outlined text-[20px]">language</span>
          <span class="text-label-md">{{ store.language }}</span>
          <span class="material-symbols-outlined text-[18px]">expand_more</span>
        </button>
        <div v-if="langOpen" class="fixed inset-0 z-40" @click="langOpen = false"></div>
        <ul
          v-if="langOpen"
          role="listbox"
          aria-label="Practice language"
          class="absolute right-0 top-full mt-xs bg-surface-container-high border border-outline-variant/10 rounded-lg p-xs shadow-lg z-50 min-w-40"
        >
          <li v-for="opt in languages" :key="opt.id">
            <button
              role="option"
              :aria-selected="store.language === opt.name"
              @click="setLanguage(opt.name)"
              class="w-full flex items-center justify-between gap-md px-sm py-1.5 rounded-md text-body-sm transition-colors"
              :class="store.language === opt.name ? 'bg-primary/15 text-primary' : 'text-on-surface hover:bg-surface-variant/40'"
            >
              {{ opt.name }}
              <span v-if="store.language === opt.name" class="material-symbols-outlined text-[16px]">check</span>
            </button>
          </li>
        </ul>
      </div>
      <router-link
        to="/practice"
        class="hidden md:block border border-primary/20 bg-primary/5 text-primary px-md py-xs rounded-full text-label-md hover:bg-primary/10 transition-colors"
      >
        Practice
      </router-link>
      <div
        class="w-8 h-8 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center text-label-md font-bold"
        :title="store.name"
        aria-hidden="true"
      >
        {{ store.name.charAt(0) }}
      </div>
    </div>
  </header>
</template>
