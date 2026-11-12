import { defineContract } from "./types";

export const sliderContract = defineContract({
  name: "slider",
  description: "Single-value range slider with a sculpted track and clear thumb.",
  variants: ["default"],
  defaultVariant: "default",
  sizes: ["sm", "md"],
  defaultSize: "md",
  states: ["default", "hover", "focus-visible", "disabled"],
  aria: "slider",
  ariaNotes: [
    'Native <input type="range">; exposes aria-valuemin/max/now and an accessible label.',
    "aria-valuetext used when the numeric value needs a human label (e.g. currency).",
  ],
  keyboard: [
    { key: "ArrowRight", action: "Increase by step" },
    { key: "ArrowLeft", action: "Decrease by step" },
    { key: "Home", action: "Set to minimum" },
    { key: "End", action: "Set to maximum" },
  ],
  rtl: "mirrored",
  model: { prop: "value", type: "number" },
  touchTarget: true,
});

export type SliderVariant = (typeof sliderContract.variants)[number];
export type SliderSize = (typeof sliderContract.sizes)[number];
