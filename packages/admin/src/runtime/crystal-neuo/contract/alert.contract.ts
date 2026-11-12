import { defineContract } from "./types";

export const alertContract = defineContract({
  name: "alert",
  description: "Inline, persistent message conveying status. Not a dialog.",
  variants: ["info", "success", "warning", "danger"],
  defaultVariant: "info",
  sizes: ["md"],
  defaultSize: "md",
  states: ["default"],
  aria: "alert",
  ariaNotes: [
    'Static informational alerts render as a region; dynamically-inserted ones use role="alert".',
    "The leading icon is decorative (aria-hidden); meaning is carried by text.",
  ],
  keyboard: [],
  rtl: "logical-properties",
  touchTarget: false,
});

export type AlertVariant = (typeof alertContract.variants)[number];
export type AlertSize = (typeof alertContract.sizes)[number];
