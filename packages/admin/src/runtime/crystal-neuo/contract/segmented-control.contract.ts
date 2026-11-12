import { defineContract } from "./types";

export const segmentedControlContract = defineContract({
  name: "segmented-control",
  description: "Single choice among two to five short options, shown as one connected track.",
  variants: ["default", "block"],
  defaultVariant: "default",
  sizes: ["md", "sm"],
  defaultSize: "md",
  states: ["default", "hover", "focus-visible", "checked", "disabled"],
  aria: "radiogroup",
  ariaNotes: [
    "A <fieldset> with a visually hidden <legend> names the group; each segment is a native radio input.",
    "The selected segment is distinguished by surface, border, and weight, not colour alone.",
  ],
  keyboard: [
    { key: "Tab", action: "Move focus into the group (to the selected segment)" },
    { key: "ArrowRight / ArrowDown", action: "Select the next segment" },
    { key: "ArrowLeft / ArrowUp", action: "Select the previous segment" },
  ],
  rtl: "mirrored",
  model: { prop: "value", type: "string" },
  touchTarget: true,
});

export type SegmentedControlVariant = (typeof segmentedControlContract.variants)[number];
export type SegmentedControlSize = (typeof segmentedControlContract.sizes)[number];
