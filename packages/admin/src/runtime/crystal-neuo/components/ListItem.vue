<script setup lang="ts">
import type { Material } from "../contract/index";
import { computed } from "vue";
import { cn } from "./cn";

const props = defineProps<{ material?: Material; class?: string }>();
const classes = computed(() => cn("cn-list__item", props.class));
</script>

<template>
  <li data-slot="list-item" :data-material="props.material" :class="classes"><slot /></li>
</template>
