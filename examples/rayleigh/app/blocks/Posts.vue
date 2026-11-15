<!-- The blog: newest posts first, three a page (?page=2…) -->
<script setup lang="ts">
import { defineBlock } from '#atelier'

defineBlock({ label: 'Posts', icon: 'list', description: 'The blog\'s posts, newest first' })
const PER_PAGE = 3
const route = useRoute()
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const { data } = await useAtelierQuery('posts', computed(() => ({ sort: ['-publishedOn'], limit: PER_PAGE, offset: (page.value - 1) * PER_PAGE })))
const lastPage = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / PER_PAGE)))
if (page.value > lastPage.value)
  throw createError({ statusCode: 404, statusMessage: 'No such page of posts' })
</script>

<template>
  <SiteContainer class="space-y-23">
    <article
      v-for="post of data?.items"
      :key="post.id"
      class="flex items-center gap-8 tp:flex-col"
    >
      <AtelierPicture
        v-if="post.data.cover && post.media?.[post.data.cover]"
        :media="post.media[post.data.cover]!"
        ratio="16:9"
        sizes="(max-width: 1023px) 100vw, 23.75rem"
        class="w-95 shrink-0 tp:w-full [&_img]:h-auto [&_img]:w-full [&_img]:rounded-md"
      />
      <div class="flex-1">
        <h2>
          <NuxtLink :to="post.path!">
            {{ post.data.headline || post.data.title }}
          </NuxtLink>
        </h2>
        <WrittenOn
          :author="post.data.author"
          :date="post.data.publishedOn"
          class="mt-2 text-vs"
        />
        <div
          v-if="post.data.description"
          class="prose mt-4"
        >
          <p>{{ post.data.description }}</p>
        </div>
        <SiteButton
          :to="post.path!"
          class="mt-6"
        >
          Read more
        </SiteButton>
      </div>
    </article>
    <nav
      v-if="lastPage > 1"
      aria-label="Pages of posts"
      class="flex gap-8"
    >
      <SiteButton
        v-if="page > 1"
        :to="`${route.path}?page=${page - 1}`"
      >
        Previous page
      </SiteButton>
      <SiteButton
        v-if="page < lastPage"
        :to="`${route.path}?page=${page + 1}`"
        class="ml-auto"
      >
        Next page
      </SiteButton>
    </nav>
  </SiteContainer>
</template>
