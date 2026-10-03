<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: {
    type: Number,
    default: 0,
  },
  size: {
    type: Number,
    default: 64,
  },
  colorClass: {
    type: String,
    default: 'text-primary',
  },
})

const radius = 15.9155
const circumference = 100
const dash = computed(() => Math.max(0, Math.min(100, props.value)))
</script>

<template>
  <div
    class="rounded-full border-4 border-surface-variant flex items-center justify-center relative shrink-0"
    :style="{ width: size + 'px', height: size + 'px' }"
  >
    <svg class="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
      <path
        class="text-surface-variant"
        :d="`M18 ${2.0845} a ${radius} ${radius} 0 0 1 0 31.831 a ${radius} ${radius} 0 0 1 0 -31.831`"
        fill="none"
        stroke="currentColor"
        stroke-dasharray="100, 100"
        stroke-width="4"
      />
      <path
        :class="colorClass"
        :d="`M18 ${2.0845} a ${radius} ${radius} 0 0 1 0 31.831 a ${radius} ${radius} 0 0 1 0 -31.831`"
        fill="none"
        stroke="currentColor"
        :stroke-dasharray="`${dash}, 100`"
        stroke-width="4"
      />
    </svg>
    <span class="text-label-md font-bold">{{ value }}%</span>
  </div>
</template>
