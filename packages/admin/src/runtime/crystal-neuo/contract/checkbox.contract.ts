import { defineContract } from "./types";

export const checkboxContract = defineContract({
  name: "checkbox",
  description: "Binary or indeterminate checkbox with a visible box and ≥40px hit area.",
  variants: ["default", "error"],
  defaultVariant: "default",
  sizes: ["sm", "md"],
  defaultSize: "md",
  states: ["default", "hover", "focus-visible", "checked", "disabled", "error"],
  aria: "checkbox",
  ariaNotes: [
    'Native <input type="checkbox">; supports indeterminate via the DOM property.',
    "Label is clickable and associated via for/id.",
  ],
  keyboard: [{ key: "Space", action: "Toggle" }],
  rtl: "mirrored",
  model: { prop: "checked", type: "boolean" },
  touchTarget: true,
});

export type CheckboxVariant = (typeof checkboxContract.variants)[number];
export type CheckboxSize = (typeof checkboxContract.sizes)[number];
