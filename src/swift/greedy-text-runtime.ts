/** Word-level layout for plain app paragraphs whose short final line SwiftUI would rebalance. */
import { TEXT_ADVANCE_RUNTIME } from "./text-advance-runtime.ts";
export const GREEDY_TEXT_RUNTIME = `
${TEXT_ADVANCE_RUNTIME}
struct MarkswiftGreedyText: View {
    let value: String
    let font: Font
    let color: Color
    let fontSize: CGFloat
    let lineGap: CGFloat
    let baselineStep: CGFloat?
    let nativeWeight: CGFloat?

    init(_ value: String, font: Font, color: Color, fontSize: CGFloat, lineGap: CGFloat, baselineStep: CGFloat? = nil, nativeWeight: CGFloat? = nil) {
        self.value = value
        self.font = font
        self.color = color
        self.fontSize = fontSize
        self.lineGap = lineGap
        self.baselineStep = baselineStep
        self.nativeWeight = nativeWeight
    }

    var body: some View {
        let words = value.split(separator: " ")
        let nativeFont = nativeWeight.map { UIFont.systemFont(ofSize: fontSize, weight: UIFont.Weight(rawValue: $0)) }
        let space = nativeFont.map { MarkswiftTextAdvance.width(" ", font: $0) } ?? fontSize * 0.25
        MarkswiftFlow(columnGap: space, rowGap: lineGap, baselineStep: baselineStep) {
            ForEach(words.indices, id: \\.self) { index in
                if let nativeFont {
                    let word = String(words[index])
                    Text(verbatim: word)
                        .font(Font(nativeFont))
                        .foregroundStyle(color)
                        .fixedSize(horizontal: true, vertical: true)
                        .layoutValue(key: MarkswiftFlowItemAdvance.self, value: MarkswiftTextAdvance.width(word, font: nativeFont))
                } else {
                    Text(verbatim: String(words[index]))
                        .font(font)
                        .foregroundStyle(color)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(value)
    }
}
`;
