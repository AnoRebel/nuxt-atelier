<script setup lang="ts">
import type { Material } from "../contract/index";
import { computed } from "vue";
import { cn } from "./cn";

const props = defineProps<{ material?: Material; current?: boolean; href?: string; class?: string }>();
const classes = computed(() => cn("cn-nav__link", props.class));
</script>

<template>
  <a
    data-slot="nav-link"
    :data-material="props.material"
    :class="classes"
    :href="href"
    :aria-current="current ? 'page' : undefined"
  >
    <slot />
  </a>
</template>
