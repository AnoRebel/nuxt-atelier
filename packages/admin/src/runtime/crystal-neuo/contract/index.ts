export * from "./types";

// Core
export * from "./button.contract";
export * from "./card.contract";
export * from "./input.contract";
export * from "./toggle.contract";
export * from "./nav.contract";
export * from "./modal.contract";
export * from "./tabs.contract";
export * from "./tooltip.contract";
export * from "./badge.contract";

// Form
export * from "./select.contract";
export * from "./checkbox.contract";
export * from "./radio.contract";
export * from "./slider.contract";
export * from "./date-picker.contract";
export * from "./textarea.contract";
export * from "./file-upload.contract";

// Data
export * from "./table.contract";
export * from "./list.contract";
export * from "./avatar.contract";
export * from "./progress.contract";
export * from "./skeleton.contract";
export * from "./breadcrumb.contract";
export * from "./pagination.contract";

// Feedback
export * from "./toast.contract";
export * from "./alert.contract";
export * from "./dialog.contract";
export * from "./drawer.contract";

// App shell
export * from "./segmented-control.contract";
export * from "./sheet.contract";
export * from "./tab-bar.contract";
export * from "./menu.contract";

import { buttonContract } from "./button.contract";
import { cardContract } from "./card.contract";
import { inputContract } from "./input.contract";
import { toggleContract } from "./toggle.contract";
import { navContract } from "./nav.contract";
import { modalContract } from "./modal.contract";
import { tabsContract } from "./tabs.contract";
import { tooltipContract } from "./tooltip.contract";
import { badgeContract } from "./badge.contract";
import { selectContract } from "./select.contract";
import { checkboxContract } from "./checkbox.contract";
import { radioContract } from "./radio.contract";
import { sliderContract } from "./slider.contract";
import { datePickerContract } from "./date-picker.contract";
import { textareaContract } from "./textarea.contract";
import { fileUploadContract } from "./file-upload.contract";
import { tableContract } from "./table.contract";
import { listContract } from "./list.contract";
import { avatarContract } from "./avatar.contract";
import { progressContract } from "./progress.contract";
import { skeletonContract } from "./skeleton.contract";
import { breadcrumbContract } from "./breadcrumb.contract";
import { paginationContract } from "./pagination.contract";
import { toastContract } from "./toast.contract";
import { alertContract } from "./alert.contract";
import { dialogContract } from "./dialog.contract";
import { drawerContract } from "./drawer.contract";
import { segmentedControlContract } from "./segmented-control.contract";
import { sheetContract } from "./sheet.contract";
import { tabBarContract } from "./tab-bar.contract";
import { menuContract } from "./menu.contract";

/** All contracts keyed by component name. Used by contract-parity tests. */
export const contracts = {
  button: buttonContract,
  card: cardContract,
  input: inputContract,
  toggle: toggleContract,
  nav: navContract,
  modal: modalContract,
  tabs: tabsContract,
  tooltip: tooltipContract,
  badge: badgeContract,
  select: selectContract,
  checkbox: checkboxContract,
  radio: radioContract,
  slider: sliderContract,
  "date-picker": datePickerContract,
  textarea: textareaContract,
  "file-upload": fileUploadContract,
  table: tableContract,
  list: listContract,
  avatar: avatarContract,
  progress: progressContract,
  skeleton: skeletonContract,
  breadcrumb: breadcrumbContract,
  pagination: paginationContract,
  toast: toastContract,
  alert: alertContract,
  dialog: dialogContract,
  drawer: drawerContract,
  "segmented-control": segmentedControlContract,
  sheet: sheetContract,
  "tab-bar": tabBarContract,
  menu: menuContract,
} as const;

export type ContractName = keyof typeof contracts;
