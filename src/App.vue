<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import SideNav from './components/SideNav.vue'
import TopBar from './components/TopBar.vue'
import { iconFill } from './utils/ui'

const route = useRoute()

const navItems = [
  { name: 'dashboard', icon: 'dashboard', label: 'Dashboard', to: '/' },
  { name: 'practice', icon: 'mic_external_on', label: 'Practice', to: '/practice' },
  { name: 'analysis', icon: 'analytics', label: 'Analysis', to: '/analysis' },
  { name: 'library', icon: 'library_music', label: 'Library', to: '/library' },
]

const active = computed(() => route.name || 'dashboard')
</script>

<template>
  <div class="min-h-screen bg-background text-on-surface overflow-x-hidden">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-primary focus:text-on-primary focus:px-md focus:py-xs focus:rounded-full"
      >Skip to content</a
    >
    <SideNav :items="navItems" :active="active" />
    <TopBar />

    <main id="main" class="md:ml-64 pt-16 min-h-screen pb-20 md:pb-0">
      <router-view />
    </main>

    <!-- Mobile bottom navigation -->
    <nav
      class="md:hidden fixed bottom-0 inset-x-0 z-50 bg-surface-container-low/90 backdrop-blur-xl border-t border-outline-variant/10 flex pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <router-link
        v-for="item in navItems"
        :key="item.name"
        :to="item.to"
        class="flex-1 flex flex-col items-center gap-0.5 py-2"
        :class="active === item.name ? 'text-primary' : 'text-on-surface-variant'"
      >
        <span class="material-symbols-outlined text-[22px]" :style="iconFill(active === item.name)">{{ item.icon }}</span>
        <span class="text-[10px]">{{ item.label }}</span>
      </router-link>
    </nav>
  </div>
</template>
