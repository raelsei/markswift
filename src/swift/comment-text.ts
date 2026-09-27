/** Untrusted design metadata must stay inside one Swift line comment. */
export function swiftCommentText(value: string): string {
  return value.replace(/[\r\n\u2028\u2029]/g, " ")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, control => `\\u{${control.charCodeAt(0).toString(16)}}`);
}
