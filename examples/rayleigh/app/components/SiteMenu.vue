<!-- The menu from the settings: a dot follows the pointer on wide screens; a full-screen overlay on small ones -->
<script setup lang="ts">
const { data: settings } = await useAtelierSingleton('settings')
const menu = computed(() => settings.value?.data.menu ?? [])
const visible = useMobileMenuVisible()
const route = useRoute()
const items = ref<HTMLElement[]>([])
const dot = ref<number | null>(null)
const active = computed(() => menu.value.findIndex(({ link }) => link === '/' ? route.path === '/' : route.path === link || route.path.startsWith(`${link}/`)))
function moveDot(index = active.value) {
  dot.value = index > -1 && items.value[index] ? items.value[index].offsetLeft : null
}
onMounted(() => {
  moveDot()
  document.fonts.ready.then(() => moveDot()) // the menu's width changes once its font has loaded
  addEventListener('resize', () => moveDot())
})
watch(active, () => moveDot())
</script>

<template>
  <nav
    v-if="menu.length"
    aria-label="Main"
    class="relative tp:fixed tp:inset-0 tp:z-20 tp:flex tp:overflow-y-auto tp:bg-white/75 tp:backdrop-blur tp:transition-all tp:duration-300 tp:dark:bg-heading/80"
    :class="{ 'tp:invisible tp:opacity-0': !visible }"
  >
    <ul
      class="flex gap-15 tp:m-auto tp:flex-col tp:p-6 tp:text-center"
      @mouseleave="moveDot()"
    >
      <li
        v-for="({ label, link }, i) of menu"
        :key="link"
        ref="items"
      >
        <NuxtLink
          :to="link"
          class="text-sm font-bold text-heading transition dark:text-white"
          :class="{ 'tp:underline tp:decoration-2 tp:underline-offset-4': i === active }"
          @click="visible = false"
          @mouseenter="moveDot(i)"
        >
          {{ label }}
        </NuxtLink>
      </li>
    </ul>
    <span
      v-if="dot !== null"
      class="absolute top-1/2 mt-px -ml-3.5 size-1.5 rounded-full bg-heading transition duration-300 tp:hidden dark:bg-white"
      :style="{ transform: `translate3d(${dot}px, -50%, 0)` }"
    />
  </nav>
</template>
