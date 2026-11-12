import { defineContract } from "./types";

export const tooltipContract = defineContract({
  name: "tooltip",
  description: "Transient label revealed on hover/focus of its trigger.",
  variants: ["default"],
  defaultVariant: "default",
  sizes: ["md"],
  defaultSize: "md",
  states: ["default"],
  aria: "tooltip",
  ariaNotes: [
    'role="tooltip" on the bubble; trigger references it via aria-describedby.',
    "Appears on hover AND keyboard focus; dismissible with Escape (WCAG 1.4.13).",
  ],
  keyboard: [{ key: "Escape", action: "Dismiss while trigger retains focus" }],
  rtl: "logical-properties",
  touchTarget: false,
});

export type TooltipVariant = (typeof tooltipContract.variants)[number];
export type TooltipSize = (typeof tooltipContract.sizes)[number];
