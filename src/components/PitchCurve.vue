<script setup>
import { computed } from 'vue'
import { seriesToPath } from '../utils/intonation'
import { scoreColor } from '../utils/ui'

const props = defineProps({
  // 0..1 target contour
  target: {
    type: Array,
    default: () => [],
  },
  // 0..1 user contour; null entries are unvoiced gaps
  samples: {
    type: Array,
    default: () => [],
  },
  match: {
    type: Number,
    default: null,
  },
  live: {
    type: Boolean,
    default: false,
  },
})

const W = 1000
const H = 400

const targetPath = computed(() => seriesToPath(props.target, W, H))
const userPath = computed(() => seriesToPath(props.samples, W, H))

const COLORS = {
  'text-secondary': '#4edea3',
  'text-primary': '#d0bcff',
  'text-tertiary': '#ffb95f',
  'text-on-surface-variant': '#d0bcff',
}
const strokeColor = computed(() => (props.live ? '#4edea3' : COLORS[scoreColor(props.match)]))
</script>

<template>
  <svg class="w-full h-full" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" aria-label="Pitch contour: target versus your voice">
    <defs>
      <filter id="pitchGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    <g class="pointer-events-none">
      <template v-for="i in 7" :key="i">
        <line :x1="0" :x2="W" :y1="(H / 8) * i" :y2="(H / 8) * i" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
      </template>
      <template v-for="i in 9" :key="`v${i}`">
        <line :y1="0" :y2="H" :x1="(W / 10) * i" :x2="(W / 10) * i" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
      </template>
    </g>

    <path
      v-if="targetPath"
      :d="targetPath"
      fill="none"
      stroke="#958ea0"
      stroke-dasharray="10 8"
      stroke-linecap="round"
      stroke-width="4"
      opacity="0.7"
      vector-effect="non-scaling-stroke"
    />

    <path
      v-if="userPath"
      :d="userPath"
      fill="none"
      :stroke="strokeColor"
      stroke-width="4"
      stroke-linecap="round"
      stroke-linejoin="round"
      filter="url(#pitchGlow)"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
