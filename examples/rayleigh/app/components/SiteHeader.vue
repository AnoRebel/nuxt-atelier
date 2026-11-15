<script setup lang="ts">
const visible = useMobileMenuVisible()
watch(visible, (open) => {
  window.scrollTo({ top: 0, behavior: 'smooth' })
  document.body.style.overflow = open ? 'hidden' : ''
})
</script>

<template>
  <SiteContainer>
    <header class="flex items-center gap-15 ph:gap-8">
      <NuxtLink
        to="/"
        aria-label="Home"
        class="text-heading transition duration-300 dark:text-white"
      >
        <SiteLogo />
      </NuxtLink>
      <SiteMenu class="ml-auto" />
      <DarkModeSwitch class="tp:ml-auto" />
      <button
        type="button"
        :title="visible ? 'Close menu' : 'Open menu'"
        :aria-expanded="visible"
        class="z-20 hidden size-8 tp:block"
        :class="visible ? 'sticky top-0' : 'relative'"
        @click="visible = !visible"
      >
        <span
          v-for="i in 2"
          :key="i"
          class="absolute top-1/2 left-1/2 h-[0.078125rem] w-5 -translate-1/2 bg-heading transition-all duration-300 dark:bg-white"
          :class="{ '-mt-1': i === 1 && !visible, 'mt-1': i === 2 && !visible, 'rotate-45': i === 1 && visible, '-rotate-45': i === 2 && visible }"
        />
      </button>
    </header>
  </SiteContainer>
</template>
