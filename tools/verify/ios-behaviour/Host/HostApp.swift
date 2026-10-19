import SwiftUI

@main
struct HostApp: App {
    init() { BehaviourRegistry.registerFonts() }
    var body: some Scene {
        WindowGroup {
            if ProcessInfo.processInfo.environment["MARKSWIFT_GREEDY_PROBE"] == "1" { GreedyProbe() }
            else { HostRoot() }
        }
    }
}

/// The hosted view framed at `MARKSWIFT_WIDTHS[widthIndex]` (390 when unset); with two or more widths, the
/// `markswift.width` button next to the log cycles them (a breakpoint view switching bands in place). The log's value is
/// the view's height: the `markswift.root` container's own frame is only its children's union (no root padding).
/// `MARKSWIFT_SCREEN_HEIGHT` gives a screen-filling root the height a window would (the scroll view offers none).
struct HostRoot: View {
    let env = ProcessInfo.processInfo.environment
    @State private var widthIndex = 0
    @State private var height = 0.0
    var body: some View {
        let widths = (env["MARKSWIFT_WIDTHS"] ?? "").split(separator: ",").compactMap { Double($0) }
        VStack(spacing: 0) {
            ScrollView {
                BehaviourRegistry.view(named: env["MARKSWIFT_VIEW"] ?? "")
                    .frame(width: widths.isEmpty ? 390 : widths[widthIndex], alignment: .topLeading)
                    .frame(minHeight: env["MARKSWIFT_SCREEN_HEIGHT"].flatMap { Double($0) }.map { CGFloat($0) }, alignment: .topLeading)
                    .onGeometryChange(for: Double.self) { $0.size.height } action: { height = $0 }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("markswift.root")
            }
            HStack {
                Text(BehaviourLog.shared.hits.joined(separator: ",")).font(.caption)
                    .accessibilityValue(String(height))
                    .accessibilityIdentifier("markswift.log")
                if widths.count > 1 {
                    Button("Width") { widthIndex = (widthIndex + 1) % widths.count }
                        .accessibilityIdentifier("markswift.width")
                }
            }
        }
        .environment(\.layoutDirection, env["MARKSWIFT_RTL"] == "1" ? .rightToLeft : .leftToRight)
        // Animations rest at the settled look unless a motion launch asks for the live clock.
        .environment(\.markswiftMotionTime, env["MARKSWIFT_MOTION"] == "live" ? nil : Double.infinity)
        .environment(\.markswiftForcedStates, env["MARKSWIFT_REDUCE_MOTION"] == "1" ? .reduceMotion : [])
    }
}


private struct GreedyProbe: View {
    @ScaledMetric(relativeTo: .subheadline) private var size: CGFloat = 14
    @State private var narrow = false
    @State private var height: CGFloat = 0
    var body: some View {
        VStack {
            MarkswiftGreedyText(text: "Deploys, failures and mentions.", font: .system(size: size), color: .primary,
                size: 14, style: .subheadline, lineHeight: 20, ascent: 1, descent: 0.286, natural: 2444.0 / 2048)
                .frame(width: narrow ? 100 : 240)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
            Button("Resize") { narrow.toggle() }
            Text(String(Double(height))).accessibilityIdentifier("greedy-height")
        }
    }
}
