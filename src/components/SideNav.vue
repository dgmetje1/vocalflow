<script setup>
import { iconFill } from '../utils/ui'

const logoUrl = `${import.meta.env.BASE_URL}favicon.svg`

defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  active: {
    type: String,
    default: '',
  },
})
</script>

<template>
  <nav
    class="hidden md:flex h-screen w-64 fixed left-0 top-0 z-50 flex-col bg-surface-container-low px-sm py-md border-r border-outline-variant/10"
    aria-label="Primary"
  >
    <router-link to="/" class="flex items-center gap-sm mb-lg px-sm">
      <img class="w-10 h-10" :src="logoUrl" alt="" />
      <div>
        <h1 class="font-semibold text-headline-md text-primary">VocalFlow</h1>
        <p class="text-label-md text-on-surface-variant">Intonation Pro</p>
      </div>
    </router-link>

    <ul class="flex-1 flex flex-col gap-xs">
      <li v-for="item in items" :key="item.name">
        <router-link
          :to="item.to"
          class="flex items-center gap-md px-sm py-sm rounded-lg transition-colors"
          :class="
            active === item.name
              ? 'bg-surface-variant/10 text-primary font-bold border-r-2 border-primary'
              : 'text-on-surface-variant hover:bg-surface-variant/20'
          "
        >
          <span class="material-symbols-outlined" :style="iconFill(active === item.name)">{{ item.icon }}</span>
          <span class="text-body-md">{{ item.label }}</span>
        </router-link>
      </li>
    </ul>

    <router-link
      to="/practice"
      class="w-full bg-primary text-on-primary py-sm rounded-full text-label-md font-bold text-center hover:bg-primary-fixed transition-colors flex items-center justify-center gap-xs"
    >
      <span class="material-symbols-outlined text-[18px]">mic</span>
      Start Training
    </router-link>
  </nav>
</template>
