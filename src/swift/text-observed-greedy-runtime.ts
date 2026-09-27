/** Opt-in counterpart; ordinary GREEDY_TEXT_RUNTIME is byte-identical. */
export const TEXT_OBSERVED_GREEDY_RUNTIME = `import SwiftUI
import UIKit

private struct MarkswiftObservedWord: Identifiable {
    var id: String
    var value: String
}

struct MarkswiftObservedGreedyText: View {
    let value: String
    let font: Font
    let color: Color
    let fontSize: CGFloat
    let lineGap: CGFloat
    let baselineStep: CGFloat?
    let nativeWeight: CGFloat?
    let fitContent: Bool
    let minWidth: CGFloat
    let maxWidth: CGFloat?
    let observationKey: String

    init(_ value: String, font: Font, color: Color, fontSize: CGFloat, lineGap: CGFloat, baselineStep: CGFloat? = nil, nativeWeight: CGFloat? = nil, fitContent: Bool = false, minWidth: CGFloat = 0, maxWidth: CGFloat? = nil, observationKey: String) {
        self.value = value; self.font = font; self.color = color; self.fontSize = fontSize; self.lineGap = lineGap
        self.baselineStep = baselineStep; self.nativeWeight = nativeWeight; self.fitContent = fitContent; self.minWidth = minWidth; self.maxWidth = maxWidth; self.observationKey = observationKey
    }
    var body: some View {
        let words = value.split(separator: " ").enumerated().map { index, word in
            MarkswiftObservedWord(id: observationKey + "/word/" + String(index), value: String(word))
        }
        let nativeFont = nativeWeight.map { UIFont.systemFont(ofSize: fontSize, weight: UIFont.Weight(rawValue: $0)) }
        let space = nativeFont.map { MarkswiftTextAdvance.width(" ", font: $0) } ?? fontSize * 0.25
        MarkswiftFlow(columnGap: space, rowGap: lineGap, baselineStep: baselineStep, fitContent: fitContent, minWidth: minWidth, maxWidth: maxWidth) {
            ForEach(words) { item in
                let word = item.value
                let key = item.id
                if let nativeFont {
                    Text(verbatim: word)
                        .font(Font(nativeFont))
                        .foregroundStyle(color)
                        .markswiftTextSource(key, word, fontBinding: "shared-supplied-ui-font:" + nativeFont.fontName)
                        .markswiftObserveText(key)
                        .fixedSize(horizontal: true, vertical: true)
                        .layoutValue(key: MarkswiftFlowItemAdvance.self, value: MarkswiftTextAdvance.width(word, font: nativeFont))
                } else {
                    Text(verbatim: word)
                        .font(font)
                        .foregroundStyle(color)
                        .markswiftTextSource(key, word, fontBinding: "emission-specified-swiftui-font; resolved-font-unavailable")
                        .markswiftObserveText(key)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(value)
    }
}
`;
