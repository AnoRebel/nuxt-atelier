<script setup lang="ts">
import type { Material } from "../contract/index";
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import { cn } from "./cn";

const props = defineProps<{ material?: Material; label: string; class?: string }>();

const open = ref(false);
const id = useId();
const classes = computed(() => cn("cn-tooltip", props.class));

function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  // Consume the key so an enclosing dialog stays open; a second Escape closes it.
  e.preventDefault();
  open.value = false;
}
watch(open, (isOpen) => {
  if (isOpen) document.addEventListener("keydown", onKey);
  else document.removeEventListener("keydown", onKey);
});
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <span
    :class="classes"
    data-slot="tooltip"
    :data-material="props.material"
    @mouseenter="open = true"
    @mouseleave="open = false"
    @focusin="open = true"
    @focusout="open = false"
  >
    <slot :describedby="id" />
    <!-- Always in the DOM so aria-describedby resolves when focus arrives. -->
    <span role="tooltip" :id="id" class="cn-tooltip__bubble" :hidden="!open">{{ label }}</span>
  </span>
</template>
