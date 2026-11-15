<!-- The sun and moon turn half a circle with each switch -->
<script setup lang="ts">
const { isDark, toggle } = useColorScheme()
const turns = ref(0)
const start = ref(0)
onMounted(() => start.value = isDark.value ? 180 : 0)
</script>

<template>
  <div class="relative size-5">
    <ClientOnly>
      <button
        type="button"
        class="absolute inset-0"
        :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="toggle(); turns++"
      >
        <span
          class="absolute bottom-0 left-0 size-9 transition duration-300"
          :style="{ transform: `rotate(${start + turns * 180}deg)` }"
        >
          <IconSun
            class="absolute bottom-0 left-0 text-heading transition duration-300 dark:text-white"
            :class="isDark ? 'size-4 opacity-25' : 'size-5'"
          />
          <IconMoon
            class="absolute top-0 right-0 text-heading transition duration-300 dark:text-white"
            :class="isDark ? 'size-5 -rotate-180' : 'size-4 opacity-25'"
          />
        </span>
      </button>
    </ClientOnly>
  </div>
</template>
