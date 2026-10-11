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
