<script setup lang="ts">
import { computed } from "vue";
import type { BreadcrumbSize, Material } from "../contract/index";
import { cn } from "./cn";

export interface Crumb {
  label: string;
  href?: string;
}

const props = withDefaults(
  defineProps<{ material?: Material; size?: BreadcrumbSize; items: Crumb[]; class?: string }>(),
  {
    size: "md",
  },
);

const classes = computed(() => cn("cn-breadcrumb", `cn-breadcrumb--size-${props.size}`, props.class));
</script>

<template>
  <nav data-slot="breadcrumb" :data-material="props.material" aria-label="Breadcrumb" :class="classes">
    <ol class="cn-breadcrumb__list">
      <li v-for="(c, i) in items" :key="i" class="cn-breadcrumb__item">
        <span v-if="i === items.length - 1" class="cn-breadcrumb__current" aria-current="page">
          {{ c.label }}
        </span>
        <span v-else-if="!c.href" class="cn-breadcrumb__text">{{ c.label }}</span>
        <a v-else class="cn-breadcrumb__link" :href="c.href">{{ c.label }}</a>
        <span v-if="i !== items.length - 1" class="cn-breadcrumb__sep" aria-hidden="true">/</span>
      </li>
    </ol>
  </nav>
</template>
