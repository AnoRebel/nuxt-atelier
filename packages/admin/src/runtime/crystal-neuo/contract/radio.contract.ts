import { defineContract } from "./types";

export const radioContract = defineContract({
  name: "radio",
  description: "Single-choice radio group following the WAI-ARIA radiogroup pattern.",
  variants: ["default", "error"],
  defaultVariant: "default",
  sizes: ["sm", "md"],
  defaultSize: "md",
  states: ["default", "hover", "focus-visible", "checked", "disabled", "error"],
  aria: "radiogroup",
  ariaNotes: [
    'Native <input type="radio"> inputs share a name; wrapped in role="radiogroup" with a group label.',
    "Only the checked radio is in the tab order; arrows move within the group.",
  ],
  keyboard: [
    { key: "ArrowDown", action: "Select next radio" },
    { key: "ArrowUp", action: "Select previous radio" },
    { key: "ArrowRight", action: "Select next radio" },
    { key: "ArrowLeft", action: "Select previous radio" },
  ],
  rtl: "mirrored",
  model: { prop: "value", type: "string" },
  touchTarget: true,
});

export type RadioVariant = (typeof radioContract.variants)[number];
export type RadioSize = (typeof radioContract.sizes)[number];
