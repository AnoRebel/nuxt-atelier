import { defineContract } from "./types";

export const toggleContract = defineContract({
  name: "toggle",
  description: "On/off switch with a sculpted track and clear thumb. No hidden-state ambiguity.",
  variants: ["default"],
  defaultVariant: "default",
  sizes: ["sm", "md"],
  defaultSize: "md",
  states: ["default", "hover", "focus-visible", "checked", "disabled"],
  aria: "switch",
  ariaNotes: [
    'Renders role="switch" with aria-checked reflecting state.',
    "Associated label is clickable and toggles the switch.",
  ],
  keyboard: [
    { key: "Space", action: "Toggle" },
    { key: "Enter", action: "Toggle" },
  ],
  rtl: "mirrored",
  model: { prop: "checked", type: "boolean" },
  touchTarget: true,
});

export type ToggleVariant = (typeof toggleContract.variants)[number];
export type ToggleSize = (typeof toggleContract.sizes)[number];
