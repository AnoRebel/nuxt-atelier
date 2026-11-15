<script setup lang="ts">
// The live demo, in the page: the Rayleigh example running Nuxt Atelier, where each reader edits a copy of
// the site of their own (demo mode). Nothing loads, and no copy is made, until they choose to start it:
// ::live-demo{path="/admin/edit?type=home" label="The visual editor, on Rayleigh's home page"}
const props = withDefaults(defineProps<{
  /** Where the demo opens: the site (`/`), the admin (`/admin`), the visual editor (`/admin/edit?type=home`). */
  path?: string
  /** What the reader will see, for the button and the frame. */
  label: string
  height?: number
}>(), { path: '/admin', height: 680 })

const base = (useAppConfig() as { atelierDemo?: { url?: string } }).atelierDemo?.url ?? ''
const started = ref(false)
const src = computed(() => `${base}/api/_atelier/demo/start?to=${encodeURIComponent(props.path)}`)
</script>

<template>
  <figure class="live-demo not-prose my-6 overflow-hidden rounded-lg border border-default">
    <iframe
      v-if="started"
      :src="src"
      :title="label"
      :style="{ height: `${height}px` }"
      class="block w-full bg-white"
      allow="clipboard-read; clipboard-write"
    />
    <div
      v-else
      class="flex flex-col items-center justify-center gap-3 p-8 text-center"
      :style="{ minHeight: `${Math.min(height, 320)}px` }"
    >
      <p class="font-medium">
        {{ label }}
      </p>
      <p class="max-w-md text-sm text-muted">
        A copy of a demo site, yours alone: change anything. It's deleted after 30 minutes without use.
      </p>
      <UButton
        icon="i-lucide-play"
        @click="started = true"
      >
        Try it live
      </UButton>
    </div>
    <figcaption class="flex justify-between gap-4 border-t border-default px-4 py-2 text-xs text-muted">
      <span>{{ label }}</span>
      <a
        :href="src"
        target="_blank"
        rel="noopener"
        class="underline"
      >Open in a new tab</a>
    </figcaption>
  </figure>
</template>
