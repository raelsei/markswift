/** CSS document whitespace is narrower than JavaScript's Unicode whitespace class.
 * HTML source newlines are already normalized by the browser; a DOM CR collapses as space.
 * https://www.w3.org/TR/css-text-3/#white-space-processing
 */
export const DOCUMENT_WHITESPACE = /[ \t\r\n]/;
export const DOCUMENT_WHITESPACE_ONLY = /^[ \t\r\n]*$/;
export const DOCUMENT_WHITESPACE_END = /[ \t\r\n]$/;
export const DOCUMENT_WHITESPACE_LEADING = /^[ \t\r\n]+/;
export const DOCUMENT_WHITESPACE_TRAILING = /[ \t\r\n]+$/;
