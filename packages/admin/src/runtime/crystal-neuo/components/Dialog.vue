<script setup lang="ts">
import { computed, ref, useId } from "vue";
import type { DialogVariant, DialogSize, Material } from "../contract/index";
import { cn } from "./cn";
import { useModalDialog } from "./useModalDialog";

const props = withDefaults(
  defineProps<{
    material?: Material;
    title: string;
    description?: string;
    variant?: DialogVariant;
    size?: DialogSize;
    confirmLabel?: string;
    cancelLabel?: string;
    class?: string;
  }>(),
  { variant: "default", size: "sm", confirmLabel: "Confirm", cancelLabel: "Cancel" },
);

const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ confirm: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const titleId = useId();
const descId = useId();
useModalDialog(dialog, open);

const classes = computed(() => cn("cn-dialog", `cn-dialog--size-${props.size}`, props.class));
const confirmClass = computed(() =>
  cn(
    "cn-button",
    props.variant === "destructive" ? "cn-button--danger" : "cn-button--primary",
    "cn-button--size-md",
  ),
);

function onScrim(e: MouseEvent) {
  if (e.target !== e.currentTarget) return;
  // Keep the press from moving focus to the closing dialog, so focus returns to the opener.
  e.preventDefault();
  open.value = false;
}
function confirm() {
  emit("confirm");
  open.value = false;
}
</script>

<template>
  <dialog
    ref="dialog"
    class="cn-scrim"
    data-slot="dialog-scrim"
    :data-material="props.material"
    role="alertdialog"
    :aria-labelledby="titleId"
    :aria-describedby="description ? descId : undefined"
    @mousedown="onScrim"
  >
    <div v-if="open" :class="classes">
      <h2 :id="titleId" class="cn-dialog__title">{{ title }}</h2>
      <p v-if="description" :id="descId">{{ description }}</p>
      <slot />
      <div class="cn-dialog__actions">
        <button type="button" class="cn-button cn-button--ghost cn-button--size-md" @click="open = false">
          {{ cancelLabel }}
        </button>
        <button type="button" :class="confirmClass" @click="confirm">{{ confirmLabel }}</button>
      </div>
    </div>
  </dialog>
</template>
