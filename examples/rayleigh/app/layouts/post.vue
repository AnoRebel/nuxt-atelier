<!-- A blog post: back to the blog, its heading and date, then its blocks -->
<script setup lang="ts">
const { data } = useAtelierRouteEntry<'posts'>()
const { data: settings } = await useAtelierSingleton('settings')
const post = computed(() => data.value?.entry.data)
</script>

<template>
  <div>
    <SiteHeader class="mt-12" />
    <main class="my-23 space-y-23 border-b border-border pb-23 dark:border-white/10">
      <SiteContainer>
        <div class="max-w-content">
          <BackButton :to="settings?.data.blogPath ?? '/'">
            Blog
          </BackButton>
          <AtelierField
            name="headline"
            as="h1"
            class="mt-3 text-post-title"
          >
            {{ post?.headline || post?.title }}
          </AtelierField>
          <WrittenOn
            :author="post?.author"
            :date="post?.publishedOn"
            class="mt-2 text-sm"
          />
        </div>
      </SiteContainer>
      <slot />
    </main>
    <SiteFooter class="mb-23" />
  </div>
</template>

<style scoped>
@reference "../assets/css/main.css";

:deep(.prose > h2) {
  @apply text-2xl;
}
:deep(.prose > h3) {
  @apply text-xl;
}
</style>
