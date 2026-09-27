/** CSS document whitespace is narrower than JavaScript's Unicode whitespace class.
 * HTML source newlines are already normalized by the browser; a DOM CR collapses as space.
 * https://www.w3.org/TR/css-text-3/#white-space-processing
 */
export declare const DOCUMENT_WHITESPACE: RegExp;
export declare const DOCUMENT_WHITESPACE_ONLY: RegExp;
export declare const DOCUMENT_WHITESPACE_END: RegExp;
export declare const DOCUMENT_WHITESPACE_LEADING: RegExp;
export declare const DOCUMENT_WHITESPACE_TRAILING: RegExp;
