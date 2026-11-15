<script setup lang="ts">
const { data: settings } = await useAtelierSingleton('settings')
const icons = { github: resolveComponent('IconBrandGithub'), x: resolveComponent('IconBrandX'), discord: resolveComponent('IconBrandDiscord') }
</script>

<template>
  <SiteContainer>
    <footer class="flex items-center justify-between gap-6 ph:flex-col">
      <p class="text-sm">
        {{ settings?.data.copyrightText }}
      </p>
      <ul
        v-if="settings?.data.socialMedia?.length"
        class="flex flex-wrap gap-4"
      >
        <li
          v-for="{ icon, link, title } of settings.data.socialMedia"
          :key="link"
        >
          <a
            :href="link"
            :title="title ?? undefined"
            :aria-label="title ?? icon"
            rel="noopener noreferrer nofollow"
            target="_blank"
            class="flex size-5 rounded-full bg-copy text-white transition dark:bg-white dark:text-heading"
          >
            <component
              :is="icons[icon]"
              class="m-auto size-3"
            />
          </a>
        </li>
      </ul>
    </footer>
  </SiteContainer>
</template>
