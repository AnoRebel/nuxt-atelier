<script setup lang="ts">
import { computed, ref, useId } from "vue";
import type { Material } from "../contract/index";
import { cn } from "./cn";
import { useModalDialog } from "./useModalDialog";

const props = defineProps<{ material?: Material; title: string; class?: string }>();

const open = defineModel<boolean>("open", { default: false });

const dialog = ref<HTMLDialogElement | null>(null);
const titleId = useId();
useModalDialog(dialog, open);

const classes = computed(() => cn("cn-sheet", props.class));

function onScrim(e: MouseEvent) {
  if (e.target !== e.currentTarget) return;
  // Keep the press from moving focus to the closing dialog, so focus returns to the opener.
  e.preventDefault();
  open.value = false;
}
</script>

<template>
  <dialog
    ref="dialog"
    class="cn-scrim cn-scrim--sheet"
    data-slot="sheet-scrim"
    :data-material="props.material"
    :aria-labelledby="titleId"
    @mousedown="onScrim"
  >
    <div v-if="open" :class="classes">
      <span class="cn-sheet__grabber" aria-hidden="true" />
      <h2 :id="titleId" class="cn-sheet__title">{{ title }}</h2>
      <slot />
    </div>
  </dialog>
</template>
