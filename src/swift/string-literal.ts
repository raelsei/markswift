const escapes: Record<string, string> = { '"': '\\"', "\\": "\\\\", "\n": "\\n", "\r": "\\r", "\t": "\\t" };

/** Swift scalar escapes preserve valid strings and keep interpolation literal. */
export function swiftStringLiteral(value: string): string {
  let literal = '"';
  for (const scalar of value) {
    const code = scalar.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) throw new Error("Swift string cannot represent an unpaired UTF-16 surrogate");
    literal += escapes[scalar] ?? (code < 0x20 || code >= 0x7f && code <= 0x9f || code === 0x2028 || code === 0x2029
      ? `\\u{${code.toString(16)}}` : scalar);
  }
  return literal + '"';
}
