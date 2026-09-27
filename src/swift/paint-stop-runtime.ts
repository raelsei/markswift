/** Shared length units and CSS stop fixup against the live gradient line. */
export const PAINT_STOP_RUNTIME = `
nonisolated enum MarkswiftCSSGradientLength {
    case points(CGFloat), fraction(CGFloat)
    func resolve(_ dimension: CGFloat) -> CGFloat {
        switch self {
        case .points(let value): return value
        case .fraction(let value): return value * dimension
        }
    }
}

nonisolated enum MarkswiftCSSGradientStops {
    static func resolve(_ stops: [Gradient.Stop], positions: [MarkswiftCSSGradientLength?]?, length: CGFloat) -> [Gradient.Stop] {
        guard let positions, positions.count == stops.count, stops.count >= 2, length.isFinite, length > 0 else { return stops }
        var values: [CGFloat?] = positions.map { $0.map { $0.resolve(length) / length } }
        guard values.allSatisfy({ $0?.isFinite ?? true }) else { return stops }
        if values[0] == nil { values[0] = 0 }
        if values[values.count - 1] == nil { values[values.count - 1] = 1 }
        var greatest = -CGFloat.infinity
        for index in values.indices {
            if let value = values[index] { greatest = max(greatest, value); values[index] = greatest }
        }
        var index = 1
        while index < values.count - 1 {
            if values[index] != nil { index += 1; continue }
            let first = index - 1
            var end = index
            while values[end] == nil { end += 1 }
            let left = values[first]!, right = values[end]!
            for at in index..<end { values[at] = left + (right - left) * CGFloat(at - first) / CGFloat(end - first) }
            index = end
        }
        return zip(stops, values).map { Gradient.Stop(color: $0.0.color, location: $0.1!) }
    }
    static func span(_ stops: [Gradient.Stop]) -> (lower: CGFloat, upper: CGFloat) {
        (min(0, stops.first?.location ?? 0), max(1, stops.last?.location ?? 1))
    }
    static func remap(_ stops: [Gradient.Stop], lower: CGFloat, upper: CGFloat) -> [Gradient.Stop] {
        let length = upper - lower
        guard length > 0 else { return stops }
        return stops.map { Gradient.Stop(color: $0.color, location: ($0.location - lower) / length) }
    }
}
`;
