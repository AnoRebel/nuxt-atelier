<script setup lang="ts">
import { computed, ref, useId } from "vue";
import type { TabsVariant, TabsSize, Material } from "../contract/index";
import { cn } from "./cn";

export interface TabItem {
  value: string;
  label: string;
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    material?: Material;
    items: TabItem[];
    variant?: TabsVariant;
    size?: TabsSize;
    label: string;
    class?: string;
  }>(),
  { variant: "line", size: "md" },
);

const model = defineModel<string>({ default: "" });
const baseId = useId();
const firstEnabled = computed(() => props.items.find((it) => !it.disabled)?.value ?? "");
// A value that names no enabled tab would leave no tab in the Tab order.
const active = computed(() =>
  props.items.some((it) => it.value === model.value && !it.disabled) ? model.value : firstEnabled.value,
);

const tabEls = ref<HTMLButtonElement[]>([]);
const classes = computed(() =>
  cn("cn-tabs", `cn-tabs--${props.variant}`, `cn-tabs--size-${props.size}`, props.class),
);

function onKeyDown(e: KeyboardEvent, index: number) {
  const enabled = props.items.map((it, i) => ({ it, i })).filter(({ it }) => !it.disabled);
  const pos = enabled.findIndex(({ i }) => i === index);
  // Arrow keys follow the visual order, which flips under dir=rtl.
  const rtl = getComputedStyle(e.currentTarget as Element).direction === "rtl";
  const forward = rtl ? "ArrowLeft" : "ArrowRight";
  const backward = rtl ? "ArrowRight" : "ArrowLeft";
  let nextPos = pos;
  if (e.key === forward) nextPos = (pos + 1) % enabled.length;
  else if (e.key === backward) nextPos = (pos - 1 + enabled.length) % enabled.length;
  else if (e.key === "Home") nextPos = 0;
  else if (e.key === "End") nextPos = enabled.length - 1;
  else return;
  e.preventDefault();
  const target = enabled[nextPos];
  if (!target) return;
  model.value = target.it.value;
  tabEls.value[target.i]?.focus();
}
</script>

<template>
  <div data-slot="tabs" :data-material="props.material" :class="classes">
    <div class="cn-tabs__list" role="tablist" :aria-label="label">
      <button
        v-for="(it, i) in items"
        :key="it.value"
        :ref="
          (el) => {
            if (el) tabEls[i] = el as HTMLButtonElement;
          }
        "
        role="tab"
        type="button"
        :id="`${baseId}-tab-${i}`"
        :aria-selected="it.value === active"
        :aria-controls="`${baseId}-panel-${i}`"
        :tabindex="it.value === active ? 0 : -1"
        :disabled="it.disabled"
        class="cn-tabs__tab"
        @click="model = it.value"
        @keydown="onKeyDown($event, i)"
      >
        {{ it.label }}
      </button>
    </div>
    <div
      v-for="(it, i) in items"
      :key="it.value"
      role="tabpanel"
      :id="`${baseId}-panel-${i}`"
      :aria-labelledby="`${baseId}-tab-${i}`"
      :hidden="it.value !== active"
      class="cn-tabs__panel"
    >
      <slot :name="it.value" />
    </div>
  </div>
</template>
