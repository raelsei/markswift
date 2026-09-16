export function validateName(name: string): void {
  const reserved = new Set("Self Any Type Protocol View Text Color Image Font Path Shape CGRect CGSize CGPoint CGFloat URL Data String Int Double Float Bool UUID Bundle State Binding Button Toggle Slider TextField SecureField TextEditor Picker ProgressView ScrollView VStack HStack ZStack Grid GridRow Spacer Divider Rectangle RoundedRectangle Ellipse Circle Capsule AngularGradient LinearGradient RadialGradient GeometryReader AnyView Edge UnitPoint Alignment HorizontalAlignment VerticalAlignment ContentMode BlendMode DesignSupport DesignTokens".split(" "));
  for (const type of "UIImage UIFont UIFontDescriptor UIColor UITraitCollection CGAffineTransform CGVector CGPath CGColor StrokeStyle AsyncImage Array Set ClosedRange Axis EdgeInsets EmptyView ForEach ColorPicker DatePicker DisclosureGroup Gauge Link Stepper UnevenRoundedRectangle UTType SwiftUI UIKit Foundation CoreText UniformTypeIdentifiers ViewBuilder ShapeStyle InsettableShape ProgressViewStyle GaugeStyle ToggleStyle ButtonStyle Date Optional Never Void Error".split(" ")) reserved.add(type);
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(name) || name.startsWith("Markswift") || reserved.has(name)) {
    throw new Error("name must be a Swift type identifier starting with an uppercase ASCII letter (e.g. ProfileCard)");
  }
}


/**
 * Swift type name for a screen: `home` → `HomeView`, `home` dark → `HomeDarkView`. Arbitrary
 * slugs (`display--grid`, `-webkit-line-clamp`) are split on non-alphanumerics and PascalCased;
 * a leading digit gets an `X` prefix so the result is always a valid identifier.
 */
export function viewNameFor(screen: string, theme: string): string {
  const pascal = screen
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
  const stem = /^\d/.test(pascal) ? `X${pascal}` : pascal;
  return `${stem}${theme === "dark" ? "Dark" : ""}View`;
}
