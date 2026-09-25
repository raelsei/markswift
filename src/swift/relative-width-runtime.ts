/** A narrow CSS percentage-width counterpart for plain in-flow block children. */
export const RELATIVE_WIDTH_RUNTIME = `
struct MarkswiftRelativeWidth: ViewModifier {
    let fraction: CGFloat
    let capturedWidth: CGFloat

    func body(content: Content) -> some View {
        MarkswiftRelativeWidthLayout(fraction: fraction, capturedWidth: capturedWidth) { content }
    }
}

private struct MarkswiftRelativeWidthLayout: Layout {
    let fraction: CGFloat
    let capturedWidth: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let child = subviews.first else { return .zero }
        let width: CGFloat
        if let available = proposal.width, available.isFinite {
            width = max(0, available * fraction)
        } else {
            width = max(0, capturedWidth)
        }
        let size = child.sizeThatFits(ProposedViewSize(width: width, height: proposal.height))
        return CGSize(width: width, height: size.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let child = subviews.first else { return }
        child.place(at: bounds.origin, anchor: .topLeading,
                    proposal: ProposedViewSize(width: bounds.width, height: bounds.height))
    }
}
`;
