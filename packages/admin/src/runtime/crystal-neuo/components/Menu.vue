<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from "vue";
import {
  menuNavigation,
  supportsAnchorPositioning,
  type ButtonVariant,
  type MenuEntry,
  type Material,
} from "../contract/index";
import { cn } from "./cn";

const props = withDefaults(
  defineProps<{
    material?: Material;
    /** Trigger button text; use the `trigger` slot for richer content. */
    label?: string;
    items: MenuEntry[];
    triggerVariant?: ButtonVariant;
    class?: string;
  }>(),
  { triggerVariant: "secondary" },
);

const id = useId();
const menuId = `${id}-menu`;
const anchor = `--cn-menu-${id.replace(/[^a-zA-Z0-9-]/g, "")}`;
const trigger = ref<HTMLButtonElement | null>(null);
const menu = ref<HTMLDivElement | null>(null);
const itemEls = ref<Array<HTMLButtonElement | null>>([]);
const open = ref(false);
const actionable = computed(() =>
  props.items.map((it, i) => ({ it, i })).filter(({ it }) => !("separator" in it) && !it.disabled),
);

function place() {
  const m = menu.value;
  const t = trigger.value;
  if (!m || !t || supportsAnchorPositioning()) return;
  // Fallback where CSS anchor positioning is unavailable.
  const r = t.getBoundingClientRect();
  m.style.position = "fixed";
  m.style.inset = "auto";
  m.style.top = `${r.bottom}px`;
  m.style.left = `${Math.min(r.left, window.innerWidth - m.offsetWidth - 8)}px`;
}
function show(focus: "first" | "last") {
  const m = menu.value;
  if (!m) return;
  if (!m.matches(":popover-open")) m.showPopover();
  place();
  const list = actionable.value;
  const target = focus === "first" ? list[0] : list[list.length - 1];
  if (target) itemEls.value[target.i]?.focus();
}
function hide(returnFocus = true) {
  menu.value?.hidePopover();
  if (returnFocus) trigger.value?.focus();
}
function onToggle(e: Event) {
  const isOpen = (e as ToggleEvent).newState === "open";
  open.value = isOpen;
  if (!isOpen && menu.value?.contains((document.activeElement?.shadowRoot?.activeElement ?? document.activeElement))) trigger.value?.focus();
}
onMounted(() => menu.value?.addEventListener("toggle", onToggle));
onBeforeUnmount(() => menu.value?.removeEventListener("toggle", onToggle));

function onTriggerKey(e: KeyboardEvent) {
  if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    show("first");
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    show("last");
  }
}
function onMenuKey(e: KeyboardEvent) {
  if (e.key === "Tab") return hide(false);
  const current = itemEls.value.findIndex((el) => el === (document.activeElement?.shadowRoot?.activeElement ?? document.activeElement));
  const next = menuNavigation(props.items, current, e.key);
  if (next !== null) {
    e.preventDefault();
    itemEls.value[next]?.focus();
  }
}
function activate(entry: MenuEntry) {
  if (!("separator" in entry)) entry.onSelect?.();
  hide();
}
</script>

<template>
  <div data-slot="menu" :data-material="props.material" :class="cn('cn-menu-root', props.class)">
    <button
      ref="trigger"
      type="button"
      :class="cn('cn-button', `cn-button--${triggerVariant}`, 'cn-button--size-md')"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="menuId"
      :style="{ anchorName: anchor }"
      @click="open ? hide() : show('first')"
      @keydown="onTriggerKey"
    >
      <slot name="trigger">{{ label }}</slot>
    </button>
    <div
      :id="menuId"
      ref="menu"
      popover="auto"
      role="menu"
      class="cn-menu"
      :style="{ positionAnchor: anchor }"
      @keydown="onMenuKey"
    >
      <template v-for="(it, i) in items" :key="i">
        <div v-if="'separator' in it" role="separator" class="cn-menu__separator" />
        <button
          v-else
          :ref="(el) => (itemEls[i] = el as HTMLButtonElement | null)"
          type="button"
          role="menuitem"
          tabindex="-1"
          :disabled="it.disabled"
          :class="cn('cn-menu__item', it.danger && 'cn-menu__item--danger')"
          @click="activate(it)"
        >
          {{ it.label }}
        </button>
      </template>
    </div>
  </div>
</template>
