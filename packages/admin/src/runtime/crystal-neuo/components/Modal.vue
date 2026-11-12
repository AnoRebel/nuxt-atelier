<script setup lang="ts">
import { computed, ref, useId } from "vue";
import type { ModalSize, Material } from "../contract/index";
import { cn } from "./cn";
import { useModalDialog } from "./useModalDialog";

const props = withDefaults(
  defineProps<{ material?: Material; title: string; size?: ModalSize; class?: string }>(),
  {
    size: "md",
  },
);

const open = defineModel<boolean>("open", { default: false });

const dialog = ref<HTMLDialogElement | null>(null);
const titleId = useId();
useModalDialog(dialog, open);

const classes = computed(() => cn("cn-modal", `cn-modal--size-${props.size}`, props.class));

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
    class="cn-scrim"
    data-slot="modal-scrim"
    :data-material="props.material"
    :aria-labelledby="titleId"
    @mousedown="onScrim"
  >
    <div v-if="open" :class="classes">
      <h2 :id="titleId" class="cn-modal__title">{{ title }}</h2>
      <slot />
    </div>
  </dialog>
</template>
