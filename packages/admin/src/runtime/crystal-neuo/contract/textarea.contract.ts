import { defineContract } from "./types";

export const textareaContract = defineContract({
  name: "textarea",
  description: "Multi-line text input with an always-visible border and label.",
  variants: ["default", "error"],
  defaultVariant: "default",
  sizes: ["sm", "md", "lg"],
  defaultSize: "md",
  states: ["default", "hover", "focus-visible", "disabled", "error"],
  aria: "none",
  ariaNotes: [
    "Native <textarea>; label associated via for/id.",
    "aria-invalid + aria-describedby wire the error message on error.",
  ],
  keyboard: [],
  rtl: "logical-properties",
  model: { prop: "value", type: "string" },
  touchTarget: true,
});

export type TextareaVariant = (typeof textareaContract.variants)[number];
export type TextareaSize = (typeof textareaContract.sizes)[number];
