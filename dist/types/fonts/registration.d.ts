import type { PackagedFace } from "./types.ts";
/** `UIAppFonts` array for `Info.plist` — the app-target half of loading a bundled font. */
export declare function plistFragment(files: string[]): string;
/**
 * `Font+Markswift.swift`: the runtime half. `UIAppFonts` only works for a real app bundle, so the
 * generated code registers the same files with CoreText — the mechanism the render harness
 * already uses (`MarkswiftFonts.register`), reused rather than duplicated, so a generated view renders
 * identically in the harness, in `#Preview` and in the app.
 */
export declare function registrationSwift(faces: PackagedFace[]): string;
