import SwiftUI

struct HelloCard: View {
    @ScaledMetric(relativeTo: .body) private var textSize18: CGFloat = 18.0

    init() {}

    var body: some View {
        Text(verbatim: "Hello Markswift").font(.system(size: textSize18, weight: .regular, design: .default)).foregroundStyle(Color.markswift(0.0, 0.0, 0.0))
        .fixedSize(horizontal: false, vertical: true)
        .frame(minWidth: 0.0, maxWidth: .infinity, minHeight: 80.0, maxHeight: .infinity, alignment: .topLeading)
    }
}
