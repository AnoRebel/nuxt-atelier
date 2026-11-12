import { defineContract } from "./types";

export const tabBarContract = defineContract({
  name: "tab-bar",
  description: "Primary navigation for a mobile app: three to five destinations along the bottom edge.",
  variants: ["default"],
  defaultVariant: "default",
  sizes: ["md"],
  defaultSize: "md",
  states: ["default", "hover", "focus-visible", "selected"],
  aria: "navigation",
  ariaNotes: [
    "<nav> with an aria-label; each destination is a link.",
    'The current destination carries aria-current="page" and a visible surface and border.',
    "Icons are decorative; every item has a visible text label.",
  ],
  keyboard: [{ key: "Tab", action: "Move between destinations" }],
  rtl: "logical-properties",
  touchTarget: true,
});

export type TabBarVariant = (typeof tabBarContract.variants)[number];
export type TabBarSize = (typeof tabBarContract.sizes)[number];
