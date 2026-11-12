import { defineContract } from "./types";

export const progressContract = defineContract({
  name: "progress",
  description: "Determinate or indeterminate progress bar.",
  variants: ["bar", "indeterminate"],
  defaultVariant: "bar",
  sizes: ["sm", "md"],
  defaultSize: "md",
  states: ["default"],
  aria: "progressbar",
  ariaNotes: [
    'role="progressbar" with aria-valuemin/max/now for determinate progress.',
    "Indeterminate variant omits aria-valuenow and uses a non-essential animation (respects reduced-motion).",
  ],
  keyboard: [],
  rtl: "mirrored",
  model: { prop: "value", type: "number" },
  touchTarget: false,
});

export type ProgressVariant = (typeof progressContract.variants)[number];
export type ProgressSize = (typeof progressContract.sizes)[number];
