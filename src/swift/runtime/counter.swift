/// CSS counter styles a list marker is regenerated in; `counterText` (src/css/counter.ts) is the TS mirror.
nonisolated enum MarkswiftCounterStyle: Sendable { case decimal, decimalLeadingZero, lowerAlpha, upperAlpha, lowerRoman, upperRoman }

/// A counter value as Chrome prints it (alphabetic below 1 and roman outside 1…3999 fall back to decimal).
nonisolated func markswiftCounter(_ value: Int, _ style: MarkswiftCounterStyle) -> String {
    switch style {
    case .decimalLeadingZero:
        return value >= 0 && value < 10 ? "0\(value)" : String(value)
    case .lowerAlpha where value >= 1, .upperAlpha where value >= 1:
        var s = ""
        var k = value
        while k > 0 {
            s = String(UnicodeScalar(UInt8(97 + (k - 1) % 26))) + s
            k = (k - 1) / 26
        }
        return style == .upperAlpha ? s.uppercased() : s
    case .lowerRoman where (1...3999).contains(value), .upperRoman where (1...3999).contains(value):
        let pairs: [(Int, String)] = [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]
        var s = ""
        var k = value
        for (n, r) in pairs {
            while k >= n { s += r; k -= n }
        }
        return style == .lowerRoman ? s.lowercased() : s
    default:
        return String(value)
    }
}
