import { defineContract } from "./types";

export const navContract = defineContract({
  name: "nav",
  description: "Glass navigation bar with controlled transparency; elevation indicates priority.",
  variants: ["glass", "solid"],
  defaultVariant: "glass",
  sizes: ["md"],
  defaultSize: "md",
  states: ["default"],
  aria: "navigation",
  ariaNotes: [
    "Renders a <nav> with an accessible name (aria-label).",
    'Current item carries aria-current="page".',
  ],
  keyboard: [{ key: "Tab", action: "Move between links in DOM order" }],
  rtl: "logical-properties",
  touchTarget: true,
});

export type NavVariant = (typeof navContract.variants)[number];
export type NavSize = (typeof navContract.sizes)[number];
