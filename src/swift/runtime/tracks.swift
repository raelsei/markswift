enum MarkswiftTrack: Sendable { case px(CGFloat), fr(CGFloat), auto }
enum MarkswiftAutoRepeat: Sendable { case fill(min: CGFloat), fit(min: CGFloat) }

/// CSS grid column tracks (px / fr / auto, or repeat(auto-fill|auto-fit, minmax(min, 1fr))), row-major cells.
struct MarkswiftTracks: Layout {
    var tracks: [MarkswiftTrack] = []
    var autoRepeat: MarkswiftAutoRepeat? = nil
    var hSpacing: CGFloat
    var vSpacing: CGFloat
    /// align-items stretch: every cell is proposed its row's height.
    var stretch: Bool = true

    /// Pure column solver; `MarkswiftTracks.columns` and `solveTracks` (src/analysis/grid-tracks.ts) must agree.
    static func columns(width: CGFloat, tracks: [MarkswiftTrack], autoRepeat: MarkswiftAutoRepeat?, count: Int,
                        spacing: CGFloat, autoWidths: [CGFloat]) -> [CGFloat] {
        if let autoRepeat {
            let (min, fit): (CGFloat, Bool) = switch autoRepeat {
            case .fill(let min): (min, false)
            case .fit(let min): (min, true)
            }
            var n = max(1, Int(((width + spacing) / (min + spacing)).rounded(.down)))
            if fit { n = Swift.min(n, max(1, count)) } // auto-fit collapses empty tracks
            return Array(repeating: max(0, (width - CGFloat(n - 1) * spacing) / CGFloat(n)), count: n)
        }
        var sizes = [CGFloat](repeating: 0, count: tracks.count)
        var frs: CGFloat = 0
        for (c, t) in tracks.enumerated() {
            switch t {
            case .px(let v): sizes[c] = v
            case .fr(let f): frs += f
            case .auto: sizes[c] = c < autoWidths.count ? autoWidths[c] : 0
            }
        }
        let free = max(0, width - sizes.reduce(0, +) - CGFloat(tracks.count - 1) * spacing)
        for (c, t) in tracks.enumerated() { if case .fr(let f) = t { sizes[c] = frs > 0 ? free * f / frs : 0 } }
        return sizes
    }

    private func columns(_ width: CGFloat, _ subviews: Subviews) -> [CGFloat] {
        let autoWidths = tracks.indices.map { c -> CGFloat in
            guard case .auto = tracks[c] else { return 0 }
            return stride(from: c, to: subviews.count, by: tracks.count).map { subviews[$0].sizeThatFits(.unspecified).width }.max() ?? 0
        }
        return Self.columns(width: width, tracks: tracks, autoRepeat: autoRepeat, count: subviews.count,
                            spacing: hSpacing, autoWidths: autoWidths)
    }

    /// Without a finite width every column takes its content's ideal width (fr and auto-repeat columns included).
    private func idealColumns(_ subviews: Subviews) -> [CGFloat] {
        let ideal = subviews.map { $0.sizeThatFits(.unspecified).width }
        if autoRepeat != nil { return Array(repeating: ideal.max() ?? 0, count: max(1, subviews.count)) }
        return tracks.indices.map { c in
            if case .px(let v) = tracks[c] { return v }
            return stride(from: c, to: ideal.count, by: tracks.count).map { ideal[$0] }.max() ?? 0
        }
    }

    private func rows(_ cols: [CGFloat], _ subviews: Subviews) -> [CGFloat] {
        stride(from: 0, to: subviews.count, by: cols.count).map { start in
            (start..<min(start + cols.count, subviews.count)).map {
                subviews[$0].sizeThatFits(ProposedViewSize(width: cols[$0 - start], height: nil)).height
            }.max() ?? 0
        }
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let finite = proposal.width.flatMap { $0.isFinite ? max(0, $0) : nil }
        let cols = finite.map { columns($0, subviews) } ?? idealColumns(subviews)
        let r = rows(cols, subviews)
        let width = finite ?? cols.reduce(0, +) + CGFloat(max(0, cols.count - 1)) * hSpacing
        return CGSize(width: width, height: r.reduce(0, +) + CGFloat(max(0, r.count - 1)) * vSpacing)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let cols = columns(bounds.width, subviews)
        let r = rows(cols, subviews)
        var y = bounds.minY
        for (ri, h) in r.enumerated() {
            var x = bounds.minX
            for (c, w) in cols.enumerated() {
                let i = ri * cols.count + c
                guard i < subviews.count else { break }
                subviews[i].place(at: CGPoint(x: x, y: y), anchor: .topLeading,
                                  proposal: ProposedViewSize(width: w, height: stretch ? h : nil))
                x += w + hSpacing
            }
            y += h + vSpacing
        }
    }
}

/// CSS percentage width: the child takes `fraction` of the proposed width, leading-aligned; the wrapper keeps the full width.
struct MarkswiftFraction: Layout {
    var fraction: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let width = proposal.width, width.isFinite else { return subviews.first?.sizeThatFits(.unspecified) ?? .zero }
        let h = subviews.first?.sizeThatFits(ProposedViewSize(width: width * fraction, height: proposal.height)).height ?? 0
        return CGSize(width: width, height: h)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(at: bounds.origin, anchor: .topLeading,
                              proposal: ProposedViewSize(width: bounds.width * fraction, height: bounds.height))
    }
}

extension View {
    /// CSS percentage width: the box takes `fraction` of its container's width, leading-aligned.
    func markswiftFraction(_ fraction: CGFloat) -> some View { MarkswiftFraction(fraction: fraction) { self } }
}
