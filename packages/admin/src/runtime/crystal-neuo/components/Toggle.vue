<script setup lang="ts">
import { computed, useId } from "vue";
import type { ToggleSize, Material } from "../contract/index";
import { cn } from "./cn";
import { useControlAttrs } from "./useControlAttrs";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{ material?: Material; size?: ToggleSize; label?: string; id?: string; disabled?: boolean }>(),
  { size: "md" },
);

const checked = defineModel<boolean>("checked", { default: false });

const autoId = useId();
const toggleId = computed(() => props.id ?? autoId);
const classes = computed(() => cn("cn-toggle", `cn-toggle--size-${props.size}`));
const { rootAttrs, controlAttrs } = useControlAttrs();
</script>

<template>
  <label
    v-bind="rootAttrs"
    :class="classes"
    :for="toggleId"
    data-slot="toggle"
    :data-material="props.material"
  >
    <span class="cn-toggle__track">
      <input
        v-bind="controlAttrs"
        :id="toggleId"
        v-model="checked"
        class="cn-toggle__input"
        type="checkbox"
        role="switch"
        :disabled="disabled"
        @keydown.enter.prevent="($event.currentTarget as HTMLInputElement).click()"
      />
      <span class="cn-toggle__thumb" aria-hidden="true" />
    </span>
    <span v-if="label" class="cn-toggle__label">{{ label }}</span>
  </label>
</template>
