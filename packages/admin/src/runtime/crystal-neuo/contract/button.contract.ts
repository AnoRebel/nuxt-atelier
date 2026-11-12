import { defineContract } from "./types";

export const buttonContract = defineContract({
  name: "button",
  description: "Primary action trigger. Raised primary, neutral secondary, border-only ghost.",
  variants: ["primary", "secondary", "ghost", "danger"],
  defaultVariant: "primary",
  sizes: ["sm", "md", "lg"],
  defaultSize: "md",
  states: ["default", "hover", "focus-visible", "active", "disabled", "loading"],
  aria: "button",
  ariaNotes: [
    "Renders a native <button> with type by default.",
    "aria-disabled reflects disabled; disabled buttons are not focusable.",
    'When loading, aria-busy="true" and the label is preserved for screen readers.',
  ],
  keyboard: [
    { key: "Enter", action: "Activate" },
    { key: "Space", action: "Activate" },
  ],
  rtl: "logical-properties",
  touchTarget: true,
});

export type ButtonVariant = (typeof buttonContract.variants)[number];
export type ButtonSize = (typeof buttonContract.sizes)[number];
