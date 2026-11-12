import { defineContract } from "./types";

export const skeletonContract = defineContract({
  name: "skeleton",
  description: "Loading placeholder for text, blocks, or circles.",
  variants: ["text", "block", "circle"],
  defaultVariant: "block",
  sizes: ["sm", "md", "lg"],
  defaultSize: "md",
  states: ["loading"],
  aria: "none",
  ariaNotes: [
    'Decorative: aria-hidden="true". The loading state is announced by the parent region\'s aria-busy.',
    "Shimmer animation is non-essential and disabled under prefers-reduced-motion.",
  ],
  keyboard: [],
  rtl: "logical-properties",
  touchTarget: false,
});

export type SkeletonVariant = (typeof skeletonContract.variants)[number];
export type SkeletonSize = (typeof skeletonContract.sizes)[number];
