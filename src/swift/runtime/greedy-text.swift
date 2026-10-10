struct MarkswiftGreedyText: View {
    let value: String
    let font: Font
    let color: Color
    let fontSize: CGFloat
    let lineGap: CGFloat

    init(_ value: String, font: Font, color: Color, fontSize: CGFloat, lineGap: CGFloat) {
        self.value = value
        self.font = font
        self.color = color
        self.fontSize = fontSize
        self.lineGap = lineGap
    }

    var body: some View {
        let words = value.split(separator: " ")
        MarkswiftFlow(columnGap: fontSize * 0.25, rowGap: lineGap) {
            ForEach(words.indices, id: \.self) { index in
                Text(verbatim: String(words[index]))
                    .font(font)
                    .foregroundStyle(color)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(value)
    }
}
