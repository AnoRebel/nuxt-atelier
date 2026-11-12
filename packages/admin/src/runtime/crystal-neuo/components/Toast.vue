<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watchEffect } from "vue";
import type { ToastVariant, Material } from "../contract/index";
import { cn } from "./cn";

const props = withDefaults(
  defineProps<{
    material?: Material;
    variant?: ToastVariant;
    /** Auto-dismiss delay in ms; paused while hovered or focused. `0` keeps the toast until dismissed. */
    duration?: number;
    dismissLabel?: string;
    class?: string;
  }>(),
  {
    variant: "neutral",
    duration: 6000,
    dismissLabel: "Dismiss",
  },
);

const emit = defineEmits<{ dismiss: [] }>();

const visible = ref(true);
const paused = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

function dismiss() {
  visible.value = false;
  emit("dismiss");
}

watchEffect((onCleanup) => {
  if (!visible.value || paused.value || props.duration <= 0) return;
  timer = setTimeout(dismiss, props.duration);
  onCleanup(() => clearTimeout(timer));
});
onBeforeUnmount(() => clearTimeout(timer));

function onFocusOut(e: FocusEvent) {
  const root = e.currentTarget as HTMLElement;
  if (!root.contains(e.relatedTarget as Node | null)) paused.value = false;
}
function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape" && !e.defaultPrevented) {
    e.preventDefault();
    dismiss();
  }
}

const assertive = computed(() => props.variant === "danger");
const classes = computed(() => cn("cn-toast", `cn-toast--${props.variant}`, props.class));
</script>

<template>
  <div
    v-if="visible"
    data-slot="toast"
    :data-material="props.material"
    :role="assertive ? 'alert' : 'status'"
    :aria-live="assertive ? 'assertive' : 'polite'"
    :class="classes"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
    @focusin="paused = true"
    @focusout="onFocusOut"
    @keydown="onKeyDown"
  >
    <svg class="cn-toast__icon" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M10 6v5M10 14h.01" stroke="currentColor" stroke-width="1.5" fill="none" />
    </svg>
    <div class="cn-toast__body"><slot /></div>
    <button
      type="button"
      class="cn-button cn-button--ghost cn-button--size-sm cn-toast__close"
      :aria-label="dismissLabel"
      @click="dismiss"
    >
      <span aria-hidden="true">×</span>
    </button>
  </div>
</template>
