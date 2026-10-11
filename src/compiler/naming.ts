export function validateName(name: string): void {
  const reserved = new Set(
    "Self Any Type Protocol View Text Color Image Font Path Shape CGRect CGSize CGPoint CGFloat URL Data String Int Double Float Bool UUID Bundle State Binding Button Toggle Slider TextField SecureField TextEditor Picker ProgressView ScrollView VStack HStack ZStack Grid GridRow Spacer Divider Rectangle RoundedRectangle Ellipse Circle Capsule AngularGradient LinearGradient RadialGradient GeometryReader AnyView Edge UnitPoint Alignment HorizontalAlignment VerticalAlignment ContentMode BlendMode".split(
      " ",
    ),
  );
  for (const type of "UIImage UIFont UIFontDescriptor UIColor UITraitCollection CGAffineTransform CGVector CGPath CGColor StrokeStyle AsyncImage Array Set ClosedRange Axis EdgeInsets EmptyView ForEach ColorPicker DatePicker DisclosureGroup Gauge Link Stepper UnevenRoundedRectangle UTType SwiftUI UIKit Foundation CoreText UniformTypeIdentifiers ViewBuilder ShapeStyle InsettableShape ProgressViewStyle GaugeStyle ToggleStyle ButtonStyle Date Optional Never Void Error Palette BundledFonts".split(
    " ",
  ))
    reserved.add(type);
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(name) || name.startsWith("Markswift") || reserved.has(name)) {
    throw new Error("name must be a Swift type identifier starting with an uppercase ASCII letter (e.g. ProfileCard)");
  }
}
