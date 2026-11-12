<script setup lang="ts">
import { computed, ref, useId, useTemplateRef } from "vue";
import { acceptedFiles, type FileUploadSize, type Material } from "../contract/index";
import { cn } from "./cn";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    material?: Material;
    size?: FileUploadSize;
    label: string;
    hint?: string;
    /** Error message; switches to the error variant. */
    error?: string;
    /** Announced while files are dragged over the zone. */
    dropLabel?: string;
    id?: string;
    name?: string;
    accept?: string;
    multiple?: boolean;
    required?: boolean;
    disabled?: boolean;
    class?: string;
  }>(),
  { size: "md", dropLabel: "Drop to upload" },
);

const files = defineModel<File[]>("files", { default: () => [] });

const autoId = useId();
const fileId = computed(() => props.id ?? autoId);
const hintId = computed(() => `${fileId.value}-hint`);
const msgId = computed(() => `${fileId.value}-msg`);
const describedBy = computed(
  () =>
    [props.hint ? hintId.value : null, props.error ? msgId.value : null].filter(Boolean).join(" ") ||
    undefined,
);
const dragover = ref(false);
const inputEl = useTemplateRef<HTMLInputElement>("inputEl");
const classes = computed(() =>
  cn(
    "cn-fileupload",
    `cn-fileupload--size-${props.size}`,
    props.error && "cn-fileupload--error",
    props.class,
  ),
);

function onDragOver() {
  if (!props.disabled) dragover.value = true;
}
function onDrop(e: DragEvent) {
  dragover.value = false;
  if (props.disabled || !e.dataTransfer) return;
  const picked = acceptedFiles(e.dataTransfer.files, props.accept, props.multiple);
  if (!picked.length) return;
  // The native input stays the source of truth, so a form post carries the drop.
  if (inputEl.value) {
    const transfer = new DataTransfer();
    picked.forEach((f) => transfer.items.add(f));
    inputEl.value.files = transfer.files;
  }
  files.value = picked;
}
function onChange(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files?.length) files.value = Array.from(target.files);
}
</script>

<template>
  <div :class="classes" data-slot="file-upload" :data-material="props.material">
    <button
      type="button"
      class="cn-fileupload__zone"
      :data-dragover="dragover || undefined"
      :disabled="disabled"
      :aria-describedby="describedBy"
      @click="inputEl?.click()"
      @dragover.prevent="onDragOver"
      @dragleave="dragover = false"
      @drop.prevent="onDrop"
    >
      <span>{{ label }}</span>
      <span v-if="hint" class="cn-field__hint" :id="hintId">{{ hint }}</span>
    </button>
    <input
      ref="inputEl"
      v-bind="$attrs"
      :id="fileId"
      type="file"
      class="cn-fileupload__input"
      tabindex="-1"
      aria-hidden="true"
      :name="name"
      :accept="accept"
      :multiple="multiple"
      :required="required"
      :disabled="disabled"
      @change="onChange"
    />
    <span class="cn-visually-hidden" aria-live="polite">{{ dragover ? dropLabel : "" }}</span>
    <span v-if="error" class="cn-field__message" :id="msgId">{{ error }}</span>
  </div>
</template>
