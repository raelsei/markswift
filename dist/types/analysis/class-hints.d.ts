/**
 * Colour names a design put in a class list — the utility-framework counterpart of
 * `var(--token)` in an inline style. Pure and input-agnostic: a page with no colour
 * utilities yields nothing, so the inference pass can always ask.
 *
 * Lives in `ir/` rather than in the Tailwind preparation because the inference pass must not
 * depend on an adapter; the adapter re-exports it for its own reporting.
 */
/**
 * Token-hint channel for the emit pass: the *semantic* part of a node's colour utilities, in
 * the same shape `Style.tokens` already carries CSS custom-property names (`bg-card` → `card`,
 * `text-muted-foreground` → `muted-foreground`, `bg-blue-500` → `blue-500`, which `tokens.ts`
 * camelizes into `Color.blue500`).
 *
 * `dark:` is kept because it paints the dark counterpart of the same slot; other variants
 * (`hover:`, `md:`, `focus:`) name states the static capture never sees. Arbitrary values
 * (`bg-[#0f172a]`) carry no name and are dropped.
 */
export declare function classColorHints(attrs: Record<string, string>): string[];
