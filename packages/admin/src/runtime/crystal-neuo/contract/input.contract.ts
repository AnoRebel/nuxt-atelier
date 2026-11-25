import { defineContract } from "./types";

export const inputContract = defineContract({
  name: "input",
  description: "Single-line text input on a glass surface with an always-visible border and label.",
  variants: ["default", "error"],
  defaultVariant: "default",
  sizes: ["sm", "md", "lg"],
  defaultSize: "md",
  states: ["default", "hover", "focus-visible", "disabled", "error"],
  aria: "none",
  ariaNotes: [
    "Renders a native <input>; a <label> is always associated via for/id.",
    'When error, aria-invalid="true" and aria-describedby points to the message.',
    "`start` and `end` slots (Vue `#start`/`#end`, React `start`/`end`) place content inside the field's box, centred on the input; the input reserves room for one icon or icon button on each side in use.",
    "An icon-only button in a slot needs an aria-label; a toggle (show password) also sets aria-pressed. A decorative icon is aria-hidden.",
  ],
  keyboard: [],
  rtl: "logical-properties",
  model: { prop: "value", type: "string" },
  touchTarget: true,
});

export type InputVariant = (typeof inputContract.variants)[number];
export type InputSize = (typeof inputContract.sizes)[number];
