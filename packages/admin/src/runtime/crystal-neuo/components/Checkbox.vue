<script setup lang="ts">
import { computed, onMounted, useId, useTemplateRef, watch } from "vue";
import type { CheckboxSize, Material } from "../contract/index";
import { cn } from "./cn";
import { useControlAttrs } from "./useControlAttrs";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    material?: Material;
    size?: CheckboxSize;
    label: string;
    error?: boolean;
    indeterminate?: boolean;
    id?: string;
    disabled?: boolean;
  }>(),
  { size: "md" },
);

const checked = defineModel<boolean>("checked", { default: false });

const autoId = useId();
const cbId = computed(() => props.id ?? autoId);
const inputEl = useTemplateRef<HTMLInputElement>("inputEl");
// `indeterminate` is a DOM property, not an attribute. Sync it once the input
// exists, whenever the prop changes, and after a click (which clears the flag):
// the prop stays the source of truth until the owner changes it.
function syncIndeterminate() {
  if (inputEl.value) inputEl.value.indeterminate = props.indeterminate ?? false;
}
onMounted(syncIndeterminate);
watch(() => props.indeterminate, syncIndeterminate, { flush: "post" });
const classes = computed(() =>
  cn("cn-choice", `cn-choice--size-${props.size}`, props.error && "cn-choice--error"),
);
const { rootAttrs, controlAttrs } = useControlAttrs();
</script>

<template>
  <label v-bind="rootAttrs" :class="classes" :for="cbId" data-slot="checkbox" :data-material="props.material">
    <input
      v-bind="controlAttrs"
      ref="inputEl"
      :id="cbId"
      v-model="checked"
      type="checkbox"
      class="cn-choice__input"
      :disabled="disabled"
      :aria-invalid="error ? true : undefined"
      @change="syncIndeterminate"
    />
    <span class="cn-choice__label">{{ label }}</span>
  </label>
</template>
