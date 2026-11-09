<script setup lang="ts">
import type { RichTextDocument } from '#atelier'
import { defineBlock, richText } from '#atelier'

defineBlock({ label: 'Text' })
const props = defineProps({ body: richText({ required: true }) })

// a stand-in for the rich-text renderer: paragraphs of text, links to entries by their resolved href
interface Inline { type: string, text?: string, marks?: { type: string, attrs?: { href?: string | null } }[] }
const paragraphs = (props.body as RichTextDocument).content?.map(p => (p.content ?? []) as Inline[]) ?? []
const href = (node: Inline) => node.marks?.find(m => m.type === 'link')?.attrs?.href
</script>

<template>
  <div class="text">
    <p
      v-for="(inlines, i) in paragraphs"
      :key="i"
    >
      <template
        v-for="(node, j) in inlines"
        :key="j"
      >
        <a
          v-if="href(node)"
          :href="href(node)!"
        >{{ node.text }}</a>
        <template v-else>
          {{ node.text }}
        </template>
      </template>
    </p>
  </div>
</template>
