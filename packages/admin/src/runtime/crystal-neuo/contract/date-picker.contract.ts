import { defineContract } from "./types";

export const datePickerContract = defineContract({
  name: "date-picker",
  description: "Date entry built on the native date input for reliability and locale support.",
  variants: ["default", "error"],
  defaultVariant: "default",
  sizes: ["sm", "md", "lg"],
  defaultSize: "md",
  states: ["default", "hover", "focus-visible", "disabled", "error"],
  aria: "none",
  ariaNotes: [
    'Native <input type="date">; label associated via for/id.',
    "Min/max constrain selectable dates; aria-invalid on error.",
  ],
  keyboard: [
    { key: "ArrowUp", action: "Increment focused date segment" },
    { key: "ArrowDown", action: "Decrement focused date segment" },
  ],
  rtl: "logical-properties",
  model: { prop: "value", type: "string" },
  touchTarget: true,
});

export type DatePickerVariant = (typeof datePickerContract.variants)[number];
export type DatePickerSize = (typeof datePickerContract.sizes)[number];
