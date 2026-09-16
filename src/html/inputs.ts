import type { ControlKind } from "../model/semantic.ts";

/** Attribute-specific native routing. The analyzer and capability policy share this table. */
export const INPUT_CONTROLS: Readonly<Record<string, ControlKind>> = Object.freeze({
  button: "button", checkbox: "toggle", color: "colorPicker", date: "datePicker",
  "datetime-local": "datePicker", email: "textField", file: "button", month: "datePicker",
  number: "textField", password: "secureField", radio: "radio", range: "slider", reset: "button",
  search: "textField", submit: "button", tel: "textField", text: "textField", time: "datePicker",
  url: "textField", week: "datePicker",
});

export const INPUT_PLACEHOLDERS: Readonly<Record<string, string>> = Object.freeze({
  hidden: "no box of its own; an unexpected captured box has no native control",
  image: "image submit buttons are not translated; placeholder box only",
});
