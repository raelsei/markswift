/** Uniform circular CSS corners normalize on the outer box before the inset is subtracted. */
export const PAINT_CLIP_RUNTIME = `
struct MarkswiftCSSInsetRoundClip: View {
    let radius: CGFloat
    let inset: CGFloat

    var body: some View {
        GeometryReader { geometry in
            let outer = min(radius, min(geometry.size.width, geometry.size.height) / 2)
            RoundedRectangle(cornerRadius: max(0, outer - inset), style: .circular)
                .fill(Color.white)
                .padding(inset)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
`;
