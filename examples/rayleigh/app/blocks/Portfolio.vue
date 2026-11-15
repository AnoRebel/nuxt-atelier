<!-- A gallery: a click opens the image full screen, with arrows (and arrow keys) to the others and Escape to close -->
<script setup lang="ts">
import { defineBlock, media, repeater, text } from '#atelier'

defineBlock({ label: 'Portfolio', icon: 'images', description: 'A gallery of images that open full screen' })
const props = defineProps({
  title: text(),
  gallery: repeater({ fields: { image: media({ required: true }), caption: text() } }),
})
const { data } = useAtelierRouteEntry()
const items = computed(() => (props.gallery ?? []).flatMap(({ image, caption }) => {
  const item = image ? data.value?.media?.[image] : undefined
  return item ? [{ item, caption }] : []
}))
const dialog = ref<HTMLDialogElement | null>(null)
const active = ref(0)
function open(index: number) {
  active.value = index
  dialog.value?.showModal()
}
const step = (by: number) => active.value = (active.value + by + items.value.length) % items.value.length
function onKey(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    step(event.key === 'ArrowLeft' ? -1 : 1)
}
</script>

<template>
  <div>
    <SiteContainer class="space-y-6 ph:space-y-5">
      <h2
        v-if="title"
        class="relative before:absolute before:top-1/2 before:right-full before:mr-3 before:size-2 before:-translate-y-1/2 before:rounded-full before:bg-heading before:transition before:duration-300 ph:before:mr-2.5 ph:before:size-1 dark:before:bg-white"
      >
        <AtelierField name="title">
          {{ title }}
        </AtelierField>
      </h2>
      <div class="grid grid-cols-3 gap-5 tp:grid-cols-2 ph:grid-cols-1">
        <button
          v-for="({ item, caption }, i) of items"
          :key="item.id"
          type="button"
          :aria-label="`Open ${caption ?? 'the image'}`"
          class="group relative overflow-hidden rounded-md"
          @click="open(i)"
        >
          <AtelierPicture
            :media="item"
            ratio="1:1"
            sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 24rem"
            class="block [&_img]:h-auto [&_img]:w-full"
          />
          <span class="absolute inset-0 flex flex-col gap-4 bg-heading/70 p-8 text-white opacity-0 transition duration-300 group-hocus:opacity-100 ph:p-6">
            <span
              v-if="caption"
              class="-translate-y-3 text-left font-heading font-medium transition duration-300 group-hocus:translate-y-0"
            >{{ caption }}</span>
            <IconSearch class="mt-auto ml-auto size-6 translate-y-3 transition duration-300 group-hocus:translate-y-0" />
          </span>
        </button>
      </div>
    </SiteContainer>
    <dialog
      ref="dialog"
      :aria-label="title ?? 'Gallery'"
      class="m-0 h-screen max-h-none w-screen max-w-none bg-heading/80 p-0 text-white backdrop:bg-transparent"
      @keydown="onKey"
      @click.self="dialog?.close()"
    >
      <button
        type="button"
        aria-label="Close"
        class="fixed top-6 right-6 z-10 flex size-8 ph:top-4 ph:right-4"
        @click="dialog?.close()"
      >
        <IconX class="m-auto size-6" />
      </button>
      <figure
        v-if="items[active]"
        class="flex h-full flex-col items-center justify-center gap-6 px-20 py-8 ph:px-6 ph:pt-16"
        @click.self="dialog?.close()"
      >
        <AtelierPicture
          :media="items[active]!.item"
          sizes="100vw"
          loading="eager"
          class="min-h-0 [&_img]:h-auto [&_img]:max-h-[80vh] [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-md"
        />
        <figcaption
          v-if="items[active]!.caption"
          class="text-center"
        >
          {{ items[active]!.caption }}
        </figcaption>
      </figure>
      <template v-if="items.length > 1">
        <button
          type="button"
          aria-label="Previous image"
          class="fixed top-1/2 left-6 flex size-8 -translate-y-1/2 ph:hidden"
          @click="step(-1)"
        >
          <IconChevronLeft class="m-auto size-6" />
        </button>
        <button
          type="button"
          aria-label="Next image"
          class="fixed top-1/2 right-6 flex size-8 -translate-y-1/2 ph:hidden"
          @click="step(1)"
        >
          <IconChevronRight class="m-auto size-6" />
        </button>
      </template>
    </dialog>
  </div>
</template>
