export declare function validateName(name: string): void;
/**
 * Swift type name for a screen: `home` → `HomeView`, `home` dark → `HomeDarkView`. Arbitrary
 * slugs (`display--grid`, `-webkit-line-clamp`) are split on non-alphanumerics and PascalCased;
 * a leading digit gets an `X` prefix so the result is always a valid identifier.
 */
export declare function viewNameFor(screen: string, theme: string): string;
