import { defineContract } from "./types";

export const cardContract = defineContract({
  name: "card",
  description: "Container surface. Glass (frosted), raised (opaque), or feature (primary emphasis).",
  variants: ["glass", "raised", "feature"],
  defaultVariant: "glass",
  sizes: ["sm", "md", "lg"],
  defaultSize: "md",
  states: ["default"],
  aria: "none",
  ariaNotes: [
    "Non-interactive by default; renders a <section> or <article> as appropriate.",
    "If made clickable, the consumer must add an interactive child (button/link), not a click handler on the card.",
  ],
  keyboard: [],
  rtl: "logical-properties",
  touchTarget: false,
});

export type CardVariant = (typeof cardContract.variants)[number];
export type CardSize = (typeof cardContract.sizes)[number];
