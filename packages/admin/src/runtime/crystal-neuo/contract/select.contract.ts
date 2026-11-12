import { defineContract } from "./types";

export const selectContract = defineContract({
  name: "select",
  description: "Single-choice dropdown. Built on the native <select> for reliability.",
  variants: ["default", "error"],
  defaultVariant: "default",
  sizes: ["sm", "md", "lg"],
  defaultSize: "md",
  states: ["default", "hover", "focus-visible", "disabled", "error"],
  aria: "listbox",
  ariaNotes: [
    "Renders a native <select> wrapped for styling; label associated via for/id.",
    'When error, aria-invalid="true" and aria-describedby points to the message.',
  ],
  keyboard: [
    { key: "Space", action: "Open the option list" },
    { key: "ArrowUp", action: "Previous option" },
    { key: "ArrowDown", action: "Next option" },
    { key: "Enter", action: "Commit selection" },
  ],
  rtl: "logical-properties",
  model: { prop: "value", type: "string" },
  touchTarget: true,
});

export type SelectVariant = (typeof selectContract.variants)[number];
export type SelectSize = (typeof selectContract.sizes)[number];
