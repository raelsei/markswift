/** ARIA widget roles a tap activates: an element carrying one is a Button in the generated view (see `activatableAction`). */
export const ACTIVATABLE_ROLES: Readonly<Record<string, true>> = {
  button: true,
  link: true,
  tab: true,
  menuitem: true,
  menuitemcheckbox: true,
  menuitemradio: true,
  option: true,
  checkbox: true,
  radio: true,
  switch: true,
};

/** `role` (as authored) names one of `ACTIVATABLE_ROLES`. */
export const isActivatableRole = (role: string | undefined): boolean =>
  Object.hasOwn(ACTIVATABLE_ROLES, role?.trim().toLowerCase() ?? "");

/** Roles whose element AT announces as a toggle; as a Button, the screen owns its checked state. */
const TOGGLE_ROLES: Readonly<Record<string, true>> = {
  checkbox: true,
  switch: true,
  radio: true,
  menuitemcheckbox: true,
  menuitemradio: true,
};

/** `role` (as authored) names one of `TOGGLE_ROLES`. */
export const isToggleRole = (role: string | undefined): boolean =>
  Object.hasOwn(TOGGLE_ROLES, role?.trim().toLowerCase() ?? "");

/** Elements whose `:hover`+`:active` paint is captured as the pressed look: what the emitter makes a Button. */
export const PRESSABLE_SELECTOR = [
  "button",
  "a[href]",
  "[onclick]",
  ...["submit", "reset", "button", "file"].map((t) => `input[type="${t}" i]`),
  ...Object.keys(ACTIVATABLE_ROLES).map((r) => `[role="${r}" i]`),
].join(", ");
/** Text-entry controls whose `:focus`+`:focus-visible` paint is captured as the focused look. */
export const TEXT_ENTRY_SELECTOR = [
  "textarea",
  "input:not([type])",
  ...["text", "email", "tel", "url", "number", "search", "password"].map((t) => `input[type="${t}" i]`),
].join(", ");
