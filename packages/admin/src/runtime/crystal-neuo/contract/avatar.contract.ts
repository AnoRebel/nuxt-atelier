import { defineContract } from "./types";

export const avatarContract = defineContract({
  name: "avatar",
  description: "User/entity image with initials fallback. Circle or rounded-square.",
  variants: ["circle", "rounded"],
  defaultVariant: "circle",
  sizes: ["sm", "md", "lg"],
  defaultSize: "md",
  states: ["default"],
  aria: "none",
  ariaNotes: [
    "Image avatars require alt text naming the person/entity.",
    'Initials/fallback avatars use aria-label; decorative-only avatars use alt="".',
  ],
  keyboard: [],
  rtl: "logical-properties",
  touchTarget: false,
});

export type AvatarVariant = (typeof avatarContract.variants)[number];
export type AvatarSize = (typeof avatarContract.sizes)[number];
