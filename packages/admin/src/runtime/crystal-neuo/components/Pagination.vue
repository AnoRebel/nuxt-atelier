<script setup lang="ts">
import { computed } from "vue";
import { paginationRange, type PaginationSize, type Material } from "../contract/index";
import { cn } from "./cn";

const props = withDefaults(
  defineProps<{
    material?: Material;
    size?: PaginationSize;
    pageCount: number;
    /** Pages shown either side of the current page before truncating. */
    siblings?: number;
    class?: string;
  }>(),
  {
    size: "md",
    siblings: 1,
  },
);

const page = defineModel<number>("page", { default: 1 });

const classes = computed(() => cn("cn-pagination", `cn-pagination--size-${props.size}`, props.class));
const slots = computed(() => paginationRange(page.value, props.pageCount, props.siblings));

function go(p: number) {
  if (p >= 1 && p <= props.pageCount && p !== page.value) page.value = p;
}
</script>

<template>
  <nav data-slot="pagination" :data-material="props.material" aria-label="Pagination" :class="classes">
    <button
      type="button"
      class="cn-pagination__btn"
      :disabled="page <= 1"
      aria-label="Previous page"
      @click="go(page - 1)"
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path d="M10 4L6 8l4 4" fill="none" stroke="currentColor" stroke-width="1.5" />
      </svg>
    </button>
    <template v-for="(p, i) in slots" :key="p === 'gap' ? `gap-${i}` : p">
      <span v-if="p === 'gap'" class="cn-pagination__gap" aria-hidden="true">…</span>
      <button
        v-else
        type="button"
        class="cn-pagination__btn"
        :aria-label="`Page ${p}`"
        :aria-current="p === page ? 'page' : undefined"
        @click="go(p)"
      >
        {{ p }}
      </button>
    </template>
    <button
      type="button"
      class="cn-pagination__btn"
      :disabled="page >= pageCount"
      aria-label="Next page"
      @click="go(page + 1)"
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" />
      </svg>
    </button>
  </nav>
</template>
