import { defineContract } from "./types";

export const badgeContract = defineContract({
  name: "badge",
  description: "Small status/label chip. Neutral or semantic state colors.",
  variants: ["neutral", "primary", "success", "warning", "danger"],
  defaultVariant: "neutral",
  sizes: ["sm", "md"],
  defaultSize: "md",
  states: ["default"],
  aria: "none",
  ariaNotes: [
    "Decorative by default (renders a <span>).",
    'When conveying live status, the consumer wraps it in a role="status" region.',
  ],
  keyboard: [],
  rtl: "logical-properties",
  touchTarget: false,
});

export type BadgeVariant = (typeof badgeContract.variants)[number];
export type BadgeSize = (typeof badgeContract.sizes)[number];
